"""Real, signed-in export pipeline test — powered by Skyvern/Playwright and a
LOCAL Firebase Auth + Firestore emulator, never a real Google account or
production data.

This is intentionally separate from run_ui_tests.py, whose own docstring
promises the default suite never signs in or performs an export. This script
is the one deliberate exception, and it only ever runs against:
  - the Firebase Auth Emulator (127.0.0.1:9099) — a fake test user, created
    on first use via signInEmulatorTestUser() in src/lib/auth.tsx, never a
    real Google account or credential;
  - the Firestore Emulator (127.0.0.1:8085) — empty/local data, never
    production Firestore;
  - `vercel dev`, so the real /api/check-subscription and /api/record-export
    handlers run against the emulators above (FIRESTORE_EMULATOR_HOST /
    FIREBASE_AUTH_EMULATOR_HOST make the Admin SDK talk to them instead of
    production — see api/_adminInit.ts).

See test/skyvern/run_export_test.ps1 for the orchestration (starts the
emulators + vercel dev, runs this script, tears everything down).
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = Path(__file__).resolve().parent / "artifacts"
TEST_EMAIL = "skyvern-test@rampcut.local"
TEST_PASSWORD = "Sk9v3rn-Test-Only!"


def configure_local_skyvern() -> None:
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


def probe_export(path: Path) -> None:
    """Mirrors test/fixtures/validate-output.sh's checks natively, so this
    script has no bash/WSL dependency on Windows: real duration + a full
    decode (not just a byte-size or container-header check)."""
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration:stream=codec_type,codec_name,width,height",
            "-of", "json", str(path),
        ],
        capture_output=True, text=True, timeout=30,
    )
    if probe.returncode != 0:
        raise RuntimeError(f"ffprobe could not read the exported file: {probe.stderr}")
    data = json.loads(probe.stdout)
    duration = float(data.get("format", {}).get("duration", 0))
    if not (duration > 0):
        raise RuntimeError(f"exported file has no valid duration (ffprobe reported {duration!r})")
    streams = data.get("streams", [])
    if not any(s.get("codec_type") == "video" for s in streams):
        raise RuntimeError("exported file has no video stream")

    decode = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"],
        capture_output=True, text=True, timeout=120,
    )
    if decode.returncode != 0:
        raise RuntimeError(f"exported file did not fully decode: {decode.stderr}")
    print(f"  ffprobe: duration={duration:.2f}s, streams={[s.get('codec_type') for s in streams]}")
    print("  ffmpeg full decode: OK (no errors start to end)")


async def main() -> int:
    configure_local_skyvern()
    base_url = os.environ.get("RAMPCUT_BASE_URL", "http://127.0.0.1:3000")
    headed = "--headed" in sys.argv

    with urlopen("http://127.0.0.1:11434/api/tags", timeout=5) as response:
        json.load(response)  # just confirms Ollama is reachable; model isn't needed for this script

    from skyvern import Skyvern

    skyvern = Skyvern.local(use_in_memory_db=True, settings={"ALLOWED_HOSTS": ["127.0.0.1"]})
    browser = await skyvern.launch_local_browser(headless=not headed, args=["--disable-dev-shm-usage"])
    page = await browser.get_working_page()
    page.set_default_timeout(30_000)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)

    try:
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.goto(base_url, wait_until="domcontentloaded")

        print("Signing in via the Firebase Auth Emulator (fake test user, no real Google account)...")
        await page.evaluate(
            "([email, password]) => window.__rampcutTestSignIn(email, password)",
            [TEST_EMAIL, TEST_PASSWORD],
        )
        # onAuthStateChanged is async; give the store a moment to pick up the
        # signed-in user before navigating (the editor route reads it on mount).
        await page.wait_for_timeout(1500)

        print("Loading the demo clip...")
        await page.goto(f"{base_url}/editor?demo=1", wait_until="domcontentloaded")
        await page.get_by_text("rampcut-demo-clip.mp4", exact=False).wait_for(state="visible", timeout=20_000)

        print("Opening the export modal and starting a real export...")
        await page.get_by_title("Export video (Ctrl+E)").click()
        await page.get_by_role("heading", name="Export video").wait_for(state="visible", timeout=10_000)

        start_btn = page.get_by_role("button", name="Start export")
        await start_btn.wait_for(state="visible", timeout=10_000)
        # If this ever reads "Sign in to export" / "Upgrade to export" instead,
        # the emulator sign-in or the /api/check-subscription quota check
        # didn't actually take — fail loudly rather than silently no-op.
        label = await start_btn.inner_text()
        if "start export" not in label.lower():
            raise RuntimeError(f"export is blocked — button reads {label!r}, expected 'Start export'")

        t0 = time.perf_counter()
        async with page.expect_download(timeout=180_000) as download_info:
            await start_btn.click()
            await page.get_by_text("Download started automatically", exact=False).wait_for(
                state="visible", timeout=180_000
            )
        download = await download_info.value
        elapsed = time.perf_counter() - t0
        print(f"Export completed and download fired in {elapsed:.1f}s")

        save_path = ARTIFACTS / "real-signed-in-export.mp4"
        await download.save_as(str(save_path))
        print(f"Saved to {save_path} ({save_path.stat().st_size} bytes)")

        print("Validating the output with ffprobe/ffmpeg (real decode, not just a byte check)...")
        probe_export(save_path)

        print("\nPASS  real signed-in export produces a playable file")
        return 0
    except Exception as exc:
        print(f"\nFAIL  real signed-in export: {exc!r}")
        await page.screenshot(path=str(ARTIFACTS / "export-test-failure.png"), full_page=True)
        return 1
    finally:
        await browser.close()
        await skyvern.aclose()


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        raise SystemExit(130) from None
