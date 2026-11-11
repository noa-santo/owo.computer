"use client";
import { KeyboardControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import CRTMonitor from "@/app/3d/CRTMonitor";
import FirstPersonControls from "@/app/3d/FirstPersonControls";
import styles from "./page.module.css";

export default function Scene() {
	return (
		<KeyboardControls
			map={[
				{ name: "forward", keys: ["ArrowUp", "KeyW"] },
				{ name: "backward", keys: ["ArrowDown", "KeyS"] },
				{ name: "left", keys: ["ArrowLeft", "KeyA"] },
				{ name: "right", keys: ["ArrowRight", "KeyD"] },
				{ name: "up", keys: ["Space"] },
				{ name: "down", keys: ["ShiftLeft"] },
			]}
		>
			<Canvas
				className={styles.fullscreenCanvas}
				camera={{ position: [0, 2, 10] }}
			>
				<ambientLight intensity={0.5} />
				<pointLight position={[10, 10, 10]} />

				<CRTMonitor position={[0, 1, 0]} />

				<FirstPersonControls />

				<gridHelper args={[20, 20, "black", "black"]} position={[0, -0.5, 0]} />

				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
					<planeGeometry args={[20, 20]} />
					<meshStandardMaterial color="#808080" />
				</mesh>
			</Canvas>
		</KeyboardControls>
	);
}
