# RIFE v4.6-lite ONNX model

The optical flow interpolation feature (`src/workers/opticalFlowWorker.ts`) requires
a RIFE model file at this location:

```
public/models/rife_v4_lite.onnx
```

## Download instructions

1. Go to the RIFE GitHub releases page:
   https://github.com/hzwer/ECCV2022-RIFE/releases

2. Download the `rife_v4_lite.onnx` file from the latest release that provides it.

   Alternatively, the RIFE-App project ships pre-exported ONNX variants:
   https://github.com/TNTwise/REAL-Video-Enhancer/releases

3. Place the downloaded file here:
   `public/models/rife_v4_lite.onnx`

## Expected tensor shapes

| Tensor   | Shape              | dtype   | Notes                        |
|----------|--------------------|---------|------------------------------|
| `img0`   | `[1, 3, H, W]`     | float32 | Input frame A, normalised 0–1 |
| `img1`   | `[1, 3, H, W]`     | float32 | Input frame B, normalised 0–1 |
| `timestep` | `[1]`            | float32 | Midpoint = 0.5 (optional)    |
| `output` | `[1, 3, H, W]`     | float32 | Interpolated frame, 0–1      |

Height and width must be multiples of 32.  The worker does **not** pad/crop
automatically — pre-scale the input frames to a compatible resolution before
passing them.

## Model caching

The first time the worker runs it downloads the model from `/models/rife_v4_lite.onnx`
and stores it in **IndexedDB** (`rampify-models / models / rife-v4-lite-onnx`).
Subsequent page loads use the cached copy with no network request.

To force a fresh download, clear the IndexedDB in DevTools:
`Application → Storage → IndexedDB → rampify-models`.
