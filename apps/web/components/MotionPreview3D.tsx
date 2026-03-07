"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const EDGES: Array<[number, number]> = [
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 10],
  [5, 6],
  [5, 11],
  [6, 12],
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
];

type MotionPayload = {
  fps: number;
  frames: number[][][];
};

function normalizeFrame3d(frame: number[][]): number[][] {
  if (frame.length !== 17) {
    return frame;
  }
  const out = frame.map((joint) => joint.slice(0, 3));
  const hip = [
    (out[11][0] + out[12][0]) / 2,
    (out[11][1] + out[12][1]) / 2,
    (out[11][2] + out[12][2]) / 2,
  ];
  const shoulder = [
    (out[5][0] + out[6][0]) / 2,
    (out[5][1] + out[6][1]) / 2,
    (out[5][2] + out[6][2]) / 2,
  ];
  const torso = Math.hypot(shoulder[0] - hip[0], shoulder[1] - hip[1], shoulder[2] - hip[2]) || 1;
  for (const joint of out) {
    joint[0] = (joint[0] - hip[0]) / torso;
    joint[1] = (joint[1] - hip[1]) / torso;
    joint[2] = (joint[2] - hip[2]) / torso;
  }
  return out;
}

export function MotionPreview3D({
  motion,
  currentMs,
}: {
  motion: MotionPayload | null;
  currentMs: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const motionRef = useRef<MotionPayload | null>(motion);
  const currentMsRef = useRef<number>(currentMs);

  useEffect(() => {
    motionRef.current = motion;
  }, [motion]);

  useEffect(() => {
    currentMsRef.current = currentMs;
  }, [currentMs]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#071425");

    const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 100);
    let yaw = 0.8;
    let pitch = 0.3;
    const radius = 3.2;
    const updateCamera = () => {
      camera.position.set(
        radius * Math.sin(yaw) * Math.cos(pitch),
        radius * Math.sin(pitch),
        radius * Math.cos(yaw) * Math.cos(pitch)
      );
      camera.lookAt(0, 0, 0);
    };
    updateCamera();

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1.5, 2.0, 2.0);
    scene.add(dir);

    const linePositions = new Float32Array(EDGES.length * 2 * 3);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    const lineMaterial = new THREE.LineBasicMaterial({ color: "#43e6b2" });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    const pointPositions = new Float32Array(17 * 3);
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute("position", new THREE.BufferAttribute(pointPositions, 3));
    const points = new THREE.Points(
      pointGeometry,
      new THREE.PointsMaterial({ color: "#ffe16b", size: 0.08, sizeAttenuation: true })
    );
    scene.add(points);

    const floor = new THREE.GridHelper(6, 12, "#254467", "#123150");
    floor.position.y = -1.45;
    scene.add(floor);

    const resize = () => {
      const width = host.clientWidth || 320;
      const height = host.clientHeight || 260;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    resize();
    window.addEventListener("resize", resize);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      yaw += dx * 0.01;
      pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.01));
      updateCamera();
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    const drawFrame = () => {
      const payload = motionRef.current;
      if (payload && payload.frames.length > 0) {
        const frameIndex = Math.max(
          0,
          Math.min(payload.frames.length - 1, Math.floor((currentMsRef.current / 1000) * payload.fps))
        );
        const frame = normalizeFrame3d(payload.frames[frameIndex]);

        let i = 0;
        for (const [a, b] of EDGES) {
          linePositions[i++] = frame[a]?.[0] ?? 0;
          linePositions[i++] = frame[a]?.[1] ?? 0;
          linePositions[i++] = frame[a]?.[2] ?? 0;
          linePositions[i++] = frame[b]?.[0] ?? 0;
          linePositions[i++] = frame[b]?.[1] ?? 0;
          linePositions[i++] = frame[b]?.[2] ?? 0;
        }
        (lineGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

        for (let p = 0; p < 17; p += 1) {
          pointPositions[p * 3] = frame[p]?.[0] ?? 0;
          pointPositions[p * 3 + 1] = frame[p]?.[1] ?? 0;
          pointPositions[p * 3 + 2] = frame[p]?.[2] ?? 0;
        }
        (pointGeometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(drawFrame);
    };
    raf = requestAnimationFrame(drawFrame);

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      lineGeometry.dispose();
      lineMaterial.dispose();
      pointGeometry.dispose();
      (points.material as THREE.PointsMaterial).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={hostRef} className="target-3d" />;
}

