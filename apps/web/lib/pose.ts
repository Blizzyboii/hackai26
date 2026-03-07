import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Keypoint } from "./scoring";

const INDEX_MAP = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.15/wasm"
  );

  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    numPoses: 1,
    runningMode: "VIDEO",
  });
}

export function extractCoco17(result: ReturnType<PoseLandmarker["detectForVideo"]>): Keypoint[] | null {
  if (!result.landmarks || result.landmarks.length === 0) {
    return null;
  }
  const landmarks = result.landmarks[0];
  if (!landmarks || landmarks.length < 29) {
    return null;
  }
  return INDEX_MAP.map((idx) => {
    const l = landmarks[idx];
    return [l.x, l.y, l.visibility ?? 1] as Keypoint;
  });
}

