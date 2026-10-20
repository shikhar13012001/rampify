# RIFE v4.6-lite ONNX model

The optical flow interpolation feature (`src/workers/opticalFlowWorker.ts`) requires
a RIFE model file at this location:

```
public/models/rife_v4_lite.onnx
```

## Asset provenance needs confirmation

The existing checked-in binary is preserved. Its original download URL and
redistribution/commercial license have not been verified in this audit. Do not
replace it using a guessed filename from an unrelated upstream release. Confirm
the original acquired asset, license and SHA-256 before a commercial AI release.

## Expected tensor shapes

| Tensor   | Shape              | dtype   | Notes                        |
|----------|--------------------|---------|------------------------------|
| `img0`   | `[1, 3, H, W]`     | float32 | Input frame A, normalised 0–1 |
| `img1`   | `[1, 3, H, W]`     | float32 | Input frame B, normalised 0–1 |
| `timestep` | `[1]`            | float32 | Required fractional time; midpoint = 0.5    |
| `output` | `[1, 3, H, W]`     | float32 | Interpolated frame, 0–1      |

Height and width must be multiples of 32.  The worker pads inputs and crops the result back automatically.

## Model caching

The first time the worker runs it downloads the model from `/models/rife_v4_lite.onnx`
and stores it in **IndexedDB** (`rampify-models / models / rife-v4-lite-onnx`).
Subsequent page loads use the cached copy with no network request.

To force a fresh download, clear the IndexedDB in DevTools:
`Application → Storage → IndexedDB → rampify-models`.

## Verified local contract (2026-10-18)

The checked-in model was inspected with the already installed onnxruntime-node:
inputs img0/img1 float32 [1,3,height,width], timestep float32 [1]; output [1,3,height,width].
The export worker now pads to multiples of32, supplies the requested fractional
source time, crops back to the source dimensions, and disposes inference tensors.
Runtime JS/WASM is emitted from the installed dependency as same-origin assets.
The active export path samples every retained span on output time at30fps and
awaits an encoder acknowledgement per30-frame chunk. The old bisection helper
remains for compatibility tests and is no longer the shipping export path.
Sources above1280x720 pixels or10s and AI+blur / AI+4K remain explicitly blocked
pending capacity measurements. This is not a verified model-license provenance:
the original acquired asset and its license must be confirmed before commercial release.
