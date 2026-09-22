import { FaceDetector, FilesetResolver, type BoundingBox, type Detection } from '@mediapipe/tasks-vision';

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
