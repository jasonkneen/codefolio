export const ARTIFACT_TEMPLATES = {
  connected: {
    name: "Connected image & caption",
    source: `import React from "react";

// Add inputs named photo (an image cell) and caption (a note cell).
export default function ConnectedCard({ photo, caption }) {
  if (!photo) return <p>Add a photo input below the toolbar, then press Run.</p>;
  return <figure style={{ margin: 0 }}>
    <img src={photo.src} alt={photo.alt || ""} style={{ width: "100%", borderRadius: 12 }} />
    <figcaption style={{ marginTop: 12 }}>{caption || photo.caption}</figcaption>
  </figure>;
}`,
  },
  react: {
    name: "React component",
    source: `import React, { useState } from "react";
import { Minus, Plus } from "lucide-react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return <main style={{ padding: 24, textAlign: "center" }}>
    <h2>A small interactive artifact</h2>
    <p>Edit this component, then press Run.</p>
    <div style={{ display: "flex", gap: 20, alignItems: "center", justifyContent: "center" }}>
      <button aria-label="Decrease" onClick={() => setCount(count - 1)}><Minus size={20} /></button>
      <output style={{ fontSize: 40, minWidth: 60 }}>{count}</output>
      <button aria-label="Increase" onClick={() => setCount(count + 1)}><Plus size={20} /></button>
    </div>
  </main>;
}`,
  },
  three: {
    name: "Three.js scene",
    source: `import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(3, 2, 4);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
mount.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const geometry = new THREE.TorusKnotGeometry(0.8, 0.24, 128, 24);
const material = new THREE.MeshStandardMaterial({ color: "#81b3a0", metalness: 0.35, roughness: 0.3 });
const sculpture = new THREE.Mesh(geometry, material);
scene.add(sculpture, new THREE.HemisphereLight(0xffffff, 0x304030, 3));
const light = new THREE.DirectionalLight(0xffffff, 4);
light.position.set(3, 4, 2);
scene.add(light);
const resize = () => {
  const width = Math.max(1, mount.clientWidth);
  renderer.setSize(width, 340);
  camera.aspect = width / 340;
  camera.updateProjectionMatrix();
};
const observer = new ResizeObserver(resize);
observer.observe(mount);
resize();
let previous = 0;
renderer.setAnimationLoop(time => {
  const delta = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
  previous = time;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) sculpture.rotation.y += delta * 0.25;
  controls.update();
  renderer.render(scene, camera);
});
onCleanup(() => {
  renderer.setAnimationLoop(null);
  observer.disconnect(); controls.dispose(); geometry.dispose(); material.dispose(); renderer.dispose(); renderer.forceContextLoss();
});`,
  },
  fiber: {
    name: "React Three Fiber",
    source: `import React, { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

function Sculpture() {
  const mesh = useRef();
  useFrame((_, delta) => { if (mesh.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) mesh.current.rotation.y += Math.min(delta, 0.1) * 0.3; });
  return <mesh ref={mesh}>
    <torusKnotGeometry args={[0.8, 0.24, 128, 24]} />
    <meshStandardMaterial color="#b0a3d4" metalness={0.35} roughness={0.3} />
  </mesh>;
}
export default function Scene() {
  return <div style={{ height: 340 }}>
    <Canvas camera={{ position: [3, 2, 4] }} dpr={[1, 2]}>
      <ambientLight intensity={2} />
      <directionalLight position={[3, 4, 2]} intensity={4} />
      <Sculpture /><OrbitControls />
    </Canvas>
  </div>;
}`,
  },
  chart: {
    name: "Recharts chart",
    source: `import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
const data = [{ day: "Mon", visits: 24 }, { day: "Tue", visits: 38 }, { day: "Wed", visits: 31 }, { day: "Thu", visits: 52 }, { day: "Fri", visits: 46 }];
export default function Chart() {
  return <div><h2>Visits this week</h2><ResponsiveContainer width="100%" height={300}>
    <BarChart data={data}><XAxis dataKey="day" /><YAxis /><Tooltip /><Bar dataKey="visits" fill="var(--color-forest)" radius={[4, 4, 0, 0]} /></BarChart>
  </ResponsiveContainer></div>;
}`,
  },
} as const;
