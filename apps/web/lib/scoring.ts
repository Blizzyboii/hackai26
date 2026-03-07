export type Keypoint = [number, number, number];

const JOINT_WEIGHTS = [
  0.6, 0.3, 0.3, 0.2, 0.2, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 0.9, 0.9, 0.8, 0.8,
];

export function normalizePose(points: Keypoint[]): Keypoint[] {
  if (points.length !== 17) {
    return points;
  }
  const clone = points.map((item) => [...item] as Keypoint);
  const leftHip = clone[11];
  const rightHip = clone[12];
  const leftShoulder = clone[5];
  const rightShoulder = clone[6];

  const hipX = (leftHip[0] + rightHip[0]) / 2;
  const hipY = (leftHip[1] + rightHip[1]) / 2;
  const shoulderX = (leftShoulder[0] + rightShoulder[0]) / 2;
  const shoulderY = (leftShoulder[1] + rightShoulder[1]) / 2;
  const torso = Math.hypot(shoulderX - hipX, shoulderY - hipY) || 1;

  for (const item of clone) {
    item[0] = (item[0] - hipX) / torso;
    item[1] = (item[1] - hipY) / torso;
    item[2] = Math.max(0, Math.min(1, item[2]));
  }
  return clone;
}

export function weightedPoseSimilarity(player: Keypoint[], reference: Keypoint[]): number {
  if (player.length !== 17 || reference.length !== 17) {
    return 0;
  }
  let dot = 0;
  let pNorm = 0;
  let rNorm = 0;
  for (let i = 0; i < 17; i += 1) {
    const w = JOINT_WEIGHTS[i];
    const [px, py] = player[i];
    const [rx, ry] = reference[i];
    dot += w * (px * rx + py * ry);
    pNorm += w * (px * px + py * py);
    rNorm += w * (rx * rx + ry * ry);
  }
  if (pNorm < 1e-6 || rNorm < 1e-6) {
    return 0;
  }
  const cos = dot / Math.sqrt(pNorm * rNorm);
  const normalized = (cos + 1) / 2;
  return Math.max(0, Math.min(1, normalized));
}

export function mirrorPoseX(points: Keypoint[]): Keypoint[] {
  return points.map(([x, y, v]) => [-x, y, v]);
}

export function bestPoseSimilarity(player: Keypoint[], reference: Keypoint[]): number {
  const direct = weightedPoseSimilarity(player, reference);
  const mirrored = weightedPoseSimilarity(mirrorPoseX(player), reference);
  return Math.max(direct, mirrored);
}

export function panelScore(poseSim: number, offsetMs: number, windowMs: number): number {
  const timeSim = Math.max(0, 1 - Math.abs(offsetMs) / Math.max(1, windowMs));
  return Math.round(100 * (0.7 * poseSim + 0.3 * timeSim));
}
