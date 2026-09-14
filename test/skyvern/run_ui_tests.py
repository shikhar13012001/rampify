"""Local Rampcut UI smoke tests powered by Skyvern and Ollama.

The default suite is intentionally non-destructive: it never signs in, starts a
checkout, submits a payment, calls a production API, or performs an export.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Awaitable, Callable
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"


@dataclass
class Result:
    name: str
    status: str
    duration_seconds: float
    detail: str = ""


def configure_local_skyvern() -> None:
    # Keep developer-specific overrides out of git while making the documented
    # `.env.skyvern.local` workflow useful to the runner.
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env.skyvern.local")
    defaults = {
        "ENV": "local",
        "ENABLE_OLLAMA": "true",
        "LLM_KEY": "OLLAMA",
        "OLLAMA_MODEL": "rampcut-skyvern:latest",
        "OLLAMA_SERVER_URL": "http://127.0.0.1:11434",
        "OLLAMA_SUPPORTS_VISION": "true",
        "SKYVERN_TELEMETRY": "false",
        "ALLOWED_HOSTS": '["127.0.0.1"]',
        "LLM_CONFIG_MAX_TOKENS": "1024",
        "FORCE_ENABLE_LEAN_ELEMENT_TREE": "true",
        "TEMP_PATH": str(ARTIFACTS / "skyvern-temp"),
        "ARTIFACT_STORAGE_PATH": str(ARTIFACTS / "skyvern-artifacts"),
    }
    for key, value in defaults.items():
        os.environ.setdefault(key, value)


def verify_ollama() -> None:
    with urlopen("http://127.0.0.1:11434/api/tags", timeout=5) as response:
        payload = json.load(response)
    installed = {model["name"] for model in payload.get("models", [])}
    requested = os.environ["OLLAMA_MODEL"]
    if requested not in installed and f"{requested}:latest" not in installed:
        raise RuntimeError(
            f"Ollama model {requested!r} is not installed. Run npm run test:ui:setup."
        )


async def run_case(
    name: str,
    check: Callable[[], Awaitable[None]],
    results: list[Result],
) -> None:
    started = time.perf_counter()
    try:
        await check()
    except Exception as exc:  # The report should retain all smoke-test failures.
        results.append(Result(name, "failed", time.perf_counter() - started, repr(exc)))
        print(f"FAIL  {name}: {exc}", flush=True)
    else:
        results.append(Result(name, "passed", time.perf_counter() - started))
        print(f"PASS  {name}", flush=True)


async def main() -> int:
    configure_local_skyvern()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        default=os.environ.get("RAMPCUT_BASE_URL", "http://127.0.0.1:5173"),
    )
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--skip-ai", action="store_true")
    parser.add_argument(
        "--slow-mo",
        type=int,
        default=int(os.environ.get("RAMPCUT_UI_SLOWMO", "0")),
        help="Milliseconds to pause after each UI action, so a --headed run stays watchable.",
    )
    args = parser.parse_args()

    verify_ollama()
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    # Import only after environment configuration; Skyvern reads provider
    # settings while initializing its embedded server.
    from skyvern import Skyvern

    # Skyvern blocks loopback navigation by default as an SSRF safeguard. This
    # allowlist exists only inside the ephemeral test process and only permits
    # the IPv4 loopback host used by the local Vite server.
    skyvern = Skyvern.local(
        use_in_memory_db=True,
        settings={"ALLOWED_HOSTS": ["127.0.0.1"]},
    )
    browser = await skyvern.launch_local_browser(
        headless=not args.headed,
        args=["--disable-dev-shm-usage"],
    )
    page = await browser.get_working_page()
    page.set_default_timeout(30_000)
    results: list[Result] = []

    async def beat(ms: int | None = None) -> None:
        # A visible pause after an action, so --headed --slow-mo runs are
        # actually watchable instead of finishing before you can look.
        wait_ms = args.slow_mo if ms is None else ms
        if wait_ms > 0:
            await page.wait_for_timeout(wait_ms)

    async def landing_structure() -> None:
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.goto(args.base_url, wait_until="domcontentloaded")
        await beat()
        heading = page.get_by_role("heading", level=1)
        heading_text = await heading.inner_text()
        assert "Make a clip" in heading_text, f"unexpected H1: {heading_text!r}"
        choose_link = page.get_by_role("link", name="Choose your video").first
        demo_link = page.get_by_role("link", name="Try a demo clip").first
        await choose_link.wait_for(state="visible")
        await demo_link.wait_for(state="visible")
        choose_count = await choose_link.count()
        demo_count = await demo_link.count()
        assert choose_count >= 1, "Choose your video CTA is missing"
        assert demo_count >= 1, "Try a demo clip CTA is missing"
        await beat()

    async def mobile_layout() -> None:
        await page.set_viewport_size({"width": 375, "height": 812})
        await page.goto(args.base_url, wait_until="domcontentloaded")
        await beat()
        overflow = await page.evaluate(
            "document.documentElement.scrollWidth - window.innerWidth"
        )
        assert overflow <= 1, f"homepage overflows horizontally by {overflow}px"
        await page.screenshot(path=str(ARTIFACTS / "homepage-mobile.png"), full_page=True)

    async def focus_states_visible() -> None:
        # HOMEPAGE.md: both hero CTAs must be keyboard-focusable with a
        # visible focus ring (globals.css's :focus-visible rule).
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.goto(args.base_url, wait_until="domcontentloaded")
        for label in ("Choose your video", "Try a demo clip"):
            link = page.get_by_role("link", name=label).first
            await link.focus()
            await beat()
            assert await link.evaluate("el => el === document.activeElement"), (
                f"{label!r} did not receive keyboard focus"
            )
            has_ring = await link.evaluate(
                "el => { const s = getComputedStyle(el); "
                "return s.outlineStyle !== 'none' && s.outlineWidth !== '0px'; }"
            )
            assert has_ring, f"{label!r} has no visible focus ring"

    async def reduced_motion_disables_reveal() -> None:
        # HOMEPAGE.md: OS-level reduce-motion must disable .clay-reveal.
        await page.emulate_media(reduced_motion="reduce")
        try:
            await page.set_viewport_size({"width": 1440, "height": 900})
            await page.goto(args.base_url, wait_until="domcontentloaded")
            await beat()
            reveal = page.locator(".clay-reveal").first
            await reveal.wait_for(state="visible")
            animation_name = await reveal.evaluate("el => getComputedStyle(el).animationName")
            assert animation_name in ("none", ""), (
                f".clay-reveal animation not disabled under reduce-motion: {animation_name!r}"
            )
        finally:
            await page.emulate_media(reduced_motion="no-preference")

    async def keyboard_demo_journey() -> None:
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.goto(args.base_url, wait_until="domcontentloaded")
        demo_link = page.get_by_role("link", name="Try a demo clip").first
        await demo_link.focus()
        assert await demo_link.evaluate("el => el === document.activeElement")
        await beat()
        await page.keyboard.press("Enter")
        await page.wait_for_url("**/editor")
        await page.wait_for_timeout(3_000)
        assert await page.get_by_text("rampcut-demo-clip.mp4", exact=False).count() >= 1, (
            "the demo CTA reached /editor but the bundled demo did not load; "
            "the mount-only timer is cancelled by React StrictMode after the "
            "effect removes ?demo=1"
        )
        assert "demo=" not in page.url
        hero_preset = page.get_by_role("button", name="Hero Moment")
        assert await hero_preset.count() == 1
        await beat()
        await page.screenshot(path=str(ARTIFACTS / "demo-editor.png"), full_page=True)

    async def choose_video_is_empty() -> None:
        await page.goto(args.base_url, wait_until="domcontentloaded")
        await beat()
        await page.get_by_role("link", name="Choose your video").first.click()
        await page.wait_for_url("**/editor")
        await page.get_by_text("Drop your video here", exact=False).wait_for(state="visible")
        # A prior session's demo clip may legitimately show a "restore your
        # last session" banner naming the same file, so check for no loaded
        # project (no Hero Moment preset rendered) rather than for absent text.
        assert await page.get_by_role("button", name="Hero Moment").count() == 0
        await beat()

    async def direct_feature_navigation() -> None:
        await page.goto(f"{args.base_url}/features/speed-ramp", wait_until="domcontentloaded")
        await beat()
        assert "/features/speed-ramp" in page.url
        assert await page.get_by_role("heading", level=1).count() == 1
        for label in ("Home", "Pricing", "Docs"):
            assert await page.get_by_role("link", name=label).count() >= 1

    async def speed_ramp_cross_links() -> None:
        # SPEED_RAMP_EXAMPLE.md: Home, Pricing, and Docs links must each land
        # correctly when clicked from the example page.
        for label, expect_path in (("Home", "/"), ("Pricing", "/pricing"), ("Docs", "/docs")):
            await page.goto(f"{args.base_url}/features/speed-ramp", wait_until="domcontentloaded")
            await beat()
            await page.get_by_role("link", name=label).first.click()
            await page.wait_for_load_state("domcontentloaded")
            await beat()
            landed = page.url.rstrip("/") or f"{args.base_url}"
            expected = f"{args.base_url.rstrip('/')}{expect_path}".rstrip("/") or args.base_url.rstrip("/")
            assert landed == expected, f"{label!r} link landed on {page.url!r}, expected {expect_path!r}"

    async def speed_ramp_reproduce_in_editor() -> None:
        # SPEED_RAMP_EXAMPLE.md: "Reproduce this in the editor" must reach the
        # same demo-clip journey as the homepage CTA, with Hero Moment
        # already highlighted — same /editor?demo=1 code path, different origin.
        # Desktop width: below 768px the sidebar becomes a hidden drawer, and
        # the previous case leaves the viewport at 700px.
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.goto(f"{args.base_url}/features/speed-ramp", wait_until="domcontentloaded")
        await beat()
        await page.get_by_role("link", name="Reproduce this in the editor").first.click()
        await page.wait_for_url("**/editor")
        await page.wait_for_timeout(5_000)
        assert await page.get_by_text("rampcut-demo-clip.mp4", exact=False).count() >= 1, (
            "'Reproduce this in the editor' reached /editor but the bundled demo did not load"
        )
        assert "demo=" not in page.url
        hero_preset = page.get_by_role("button", name="Hero Moment")
        assert await hero_preset.count() == 1, "Hero Moment preset was not highlighted after the demo load"
        await beat()

    async def speed_ramp_media_and_curve_render() -> None:
        # SPEED_RAMP_EXAMPLE.md: the embedded clip plays inline, and the
        # curve SVG renders sensibly at more than one screen width.
        await page.goto(f"{args.base_url}/features/speed-ramp", wait_until="domcontentloaded")
        video = page.locator("video").first
        await video.wait_for(state="visible")
        await video.evaluate("el => el.play()")
        await beat(500)
        is_playing = await video.evaluate("el => !el.paused && el.currentTime > 0")
        assert is_playing, "example clip <video> did not start playing inline"

        curve = page.get_by_role("img", name="Hero Moment speed curve", exact=False)
        for width in (1440, 700):
            await page.set_viewport_size({"width": width, "height": 900})
            await beat()
            box = await curve.bounding_box()
            assert box is not None and box["width"] > 0 and box["height"] > 0, (
                f"curve SVG has no visible bounding box at {width}px"
            )

    async def rejects_invalid_file_with_clear_error() -> None:
        # Pre-launch checklist: "Upload not-a-video.mp4 ... confirm a clear
        # error, not a blank screen." The fixture has a .mp4 extension (so it
        # passes the extension check in isAcceptedVideoFile) but is 25 bytes
        # of garbage, so it fails the real browser decode in
        # readVideoMetadata() and must surface DropZone's catch-block error.
        fixture = ROOT / "test" / "fixtures" / "not-a-video.mp4"
        assert fixture.exists(), f"missing fixture: {fixture}"
        await page.goto(args.base_url, wait_until="domcontentloaded")
        await beat()
        await page.get_by_role("link", name="Choose your video").first.click()
        await page.wait_for_url("**/editor")
        file_input = page.locator('input[type="file"]')
        await file_input.set_input_files(str(fixture))
        # readVideoMetadata() (videoMetadata.ts) rejects with one of two exact
        # messages depending on whether the browser's <video> fires an error
        # event or the 8s no-metadata timeout wins; DropZone shows err.message
        # verbatim, so match either real string rather than a guessed one.
        await page.get_by_text(
            re.compile(r"Failed to read video metadata|No video track could be decoded")
        ).wait_for(state="visible", timeout=15_000)
        # Not a blank screen: the drop zone chrome must still be present.
        assert await page.get_by_text("Drop your video here", exact=False).count() >= 1
        await beat()

    async def rejects_corrupt_video_with_clear_error() -> None:
        # Pre-launch checklist: "Upload corrupt-truncated.mp4 ... confirm a
        # clear error, not a blank screen." Same code path as above (extension
        # accepted, decode fails) exercised against a differently-shaped
        # fixture (a truncated real MP4 header rather than 25 bytes of noise).
        fixture = ROOT / "test" / "fixtures" / "corrupt-truncated.mp4"
        assert fixture.exists(), f"missing fixture: {fixture}"
        await page.goto(args.base_url, wait_until="domcontentloaded")
        await beat()
        await page.get_by_role("link", name="Choose your video").first.click()
        await page.wait_for_url("**/editor")
        file_input = page.locator('input[type="file"]')
        await file_input.set_input_files(str(fixture))
        await page.get_by_text(
            re.compile(r"Failed to read video metadata|No video track could be decoded")
        ).wait_for(state="visible", timeout=15_000)
        assert await page.get_by_text("Drop your video here", exact=False).count() >= 1
        await beat()

    async def ai_visual_smoke() -> None:
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.goto(args.base_url, wait_until="domcontentloaded")
        await beat()
        await page.act("Click the visible 'Choose your video' call-to-action link.")
        await page.wait_for_url("**/editor")
        await page.get_by_text("Drop your video here", exact=False).wait_for(state="visible")
        await beat()

    try:
        await run_case("landing structure", landing_structure, results)
        await run_case("375px layout has no horizontal overflow", mobile_layout, results)
        await run_case("hero CTAs have visible keyboard focus", focus_states_visible, results)
        await run_case("reduce-motion disables clay-reveal", reduced_motion_disables_reveal, results)
        await run_case("keyboard demo journey", keyboard_demo_journey, results)
        await run_case("choose-video journey stays empty", choose_video_is_empty, results)
        await run_case("direct feature navigation", direct_feature_navigation, results)
        await run_case("speed-ramp page cross-links", speed_ramp_cross_links, results)
        await run_case("speed-ramp media and curve render", speed_ramp_media_and_curve_render, results)
        await run_case("speed-ramp reproduce in editor", speed_ramp_reproduce_in_editor, results)
        await run_case(
            "rejects not-a-video.mp4 with a clear error",
            rejects_invalid_file_with_clear_error,
            results,
        )
        await run_case(
            "rejects corrupt-truncated.mp4 with a clear error",
            rejects_corrupt_video_with_clear_error,
            results,
        )
        if args.skip_ai:
            results.append(Result("Skyvern AI action smoke", "skipped", 0, "--skip-ai"))
            print("SKIP  Skyvern AI action smoke", flush=True)
        else:
            await run_case("Skyvern AI action smoke", ai_visual_smoke, results)
    finally:
        await browser.close()
        await skyvern.aclose()

    report = {
        "base_url": args.base_url,
        "model": os.environ["OLLAMA_MODEL"],
        "results": [asdict(result) for result in results],
    }
    (ARTIFACTS / "results.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )

    failed = [result for result in results if result.status == "failed"]
    print(
        f"\n{len(results) - len(failed)} of {len(results)} checks passed or skipped.",
        flush=True,
    )
    return 1 if failed else 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        raise SystemExit(130) from None
