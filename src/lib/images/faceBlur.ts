import { FaceDetector, FilesetResolver, type BoundingBox, type Detection } from '@mediapipe/tasks-vision';

const SUPPRESSED_CONSOLE_ERROR_SUBSTRINGS = ['Created TensorFlow Lite XNNPACK delegate for CPU'];

export function isSuppressedConsoleMessage(args: unknown[]): boolean {
  const message = args.map(String).join(' ');
  return SUPPRESSED_CONSOLE_ERROR_SUBSTRINGS.some((substring) => message.includes(substring));
}

// TFLite's XNNPACK delegate creation always logs via emscripten's stderr, which the WASM
// build (fetched from a CDN by FilesetResolver below) surfaces as a real `console.error`
// call — an upstream INFO-level log using the wrong console method, not a thrown error
// (verified: face-blur completes normally when this fires). Next.js's dev overlay treats
// any `console.error` as a blocking full-screen error, which made routine photo
// attachment look broken (confirmed via screenshot: a "1 Issue" overlay badge appeared
// on every photo pick).
//
// The WASM glue binds a reference to `console.error` once, when it first loads — not a
// live lookup at call time — so patching `console.error` around the `detect()` call
// itself does nothing (verified directly: a patch installed there is never invoked).
// The patch has to be in place here, at module import time, before that glue script
// ever loads (triggered lazily by `getFaceDetector()` below, on first use).
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (isSuppressedConsoleMessage(args)) return;
    originalConsoleError(...args);
  };
}

const WASM_BASE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detectorPromise: Promise<FaceDetector> | null = null;

async function getFaceDetector(): Promise<FaceDetector> {
  if (!detectorPromise) {
    detectorPromise = FilesetResolver.forVisionTasks(WASM_BASE_URL).then((vision) =>
      FaceDetector.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSET_PATH },
        runningMode: 'IMAGE',
      })
    );
  }
  return detectorPromise;
}

export interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

function hasBoundingBox(
  detection: Detection
): detection is Detection & { boundingBox: BoundingBox } {
  return detection.boundingBox != null;
}

export async function detectFaceRegions(image: ImageBitmap): Promise<BlurRegion[]> {
  const detector = await getFaceDetector();
  const result = detector.detect(image);
  return result.detections.filter(hasBoundingBox).map((detection) => ({
    x: detection.boundingBox.originX,
    y: detection.boundingBox.originY,
    width: detection.boundingBox.width,
    height: detection.boundingBox.height,
  }));
}
