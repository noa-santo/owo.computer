"use client";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useContext, useEffect, useState } from "react";
import { StateContext } from "@/app/_components/StateContext";
import variants from "@/data/variants.json";
import CRTEffect from "./_components/CRTEffect";
import MobileControls from "./_components/MobileControls";
import Sound from "./_components/Sound";
import styles from "./page.module.css";

export default function Home() {
	const {
		crt: crtEffect,
		toggleCrt,
		sound,
		toggleSound,
		variantSet,
		setVariantSet,
	} = useContext(StateContext);
	const [text, setText] = useState("OwO");
	const [intervalId, setIntervalId] = useState<NodeJS.Timeout>();
	const router = useRouter();

	const handleMouseOver = () => {
		setIntervalId(
			setInterval(() => {
				const randomVariation =
					variants[variantSet][
						Math.floor(Math.random() * variants[variantSet].length)
					];
				setText(randomVariation);
			}, 50),
		);
	};

	const handleMouseOut = () => clearInterval(intervalId);

	const switchVariation = useCallback(() => {
		const keys = Object.keys(variants) as Array<keyof typeof variants>;
		const currentIndex = keys.indexOf(variantSet);
		const nextIndex = (currentIndex + 1) % keys.length;
		setVariantSet(keys[nextIndex]);
		const randomVariation =
			variants[keys[nextIndex]][
				Math.floor(Math.random() * variants[keys[nextIndex]].length)
			];
		setText(randomVariation);
	}, [variantSet, setVariantSet]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "v") switchVariation();
			if (event.key.toLowerCase() === "c") toggleCrt();
			if (event.key.toLowerCase() === "s") toggleSound();
			if (event.key.toLowerCase() === "r") {
				const randomVariation =
					variants[variantSet][
						Math.floor(Math.random() * variants[variantSet].length)
					];
				setText(randomVariation);
			}
			if (event.key === "3") router.push("/3d");
			if (event.key.toLowerCase() === "t") router.push("/terminal");
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [switchVariation, toggleCrt, toggleSound, router, variantSet]);

	return (
		<>
			{crtEffect && <CRTEffect />}
			<main className={styles.page}>
				<span
					className={styles.owo}
					onMouseOver={handleMouseOver}
					onMouseOut={handleMouseOut}
					onFocus={handleMouseOver}
					onBlur={handleMouseOut}
				>
					{text}
				</span>
				<Suspense>
					<MobileControls onSwitchVariation={switchVariation} />
				</Suspense>
			</main>
			{sound && <Sound text={text} />}
		</>
	);
}
