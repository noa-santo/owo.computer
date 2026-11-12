import { Html, useGLTF } from "@react-three/drei";
import Sound from "@/app/_components/Sound";
import styles from "./page.module.css";

export default function CRTMonitor({
	position,
}: Readonly<{ position: number[] }>) {
	const { scene } = useGLTF("/crt_monitor.glb");

	return (
		<primitive object={scene} position={position} rotation={[0, Math.PI, 0]}>
			<Html
				transform
				distanceFactor={1.5}
				position={[0, 1.9, -2.41]}
				scale={[0.7, 0.7, 1]}
				rotation={[0, Math.PI, 0]}
				occlude
			>
				<div className={styles.crtScreen}>
					<iframe src="https://owo.computer" title="OwO" />
					<Sound text="OwO" />
				</div>
			</Html>
		</primitive>
	);
}
