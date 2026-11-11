"use client";
import dynamic from "next/dynamic";
import { useContext, useEffect, useRef, useState } from "react";
import { StateContext } from "@/app/_components/StateContext";

const Lofi = dynamic(() => import("./Lofi"), { ssr: false });

const WORKLET_URL = "/pink-noise-processor.js"; // prefix with your basePath if you use one

const workletLoaded = new WeakMap<BaseAudioContext, Promise<void>>();

async function createPinkNoise(ctx: AudioContext) {
	let loaded = workletLoaded.get(ctx);
	if (!loaded) {
		loaded = ctx.audioWorklet.addModule(WORKLET_URL);
		workletLoaded.set(ctx, loaded);
		loaded.catch(() => workletLoaded.delete(ctx)); // allow retry after a failure
	}
	await loaded;
	return new AudioWorkletNode(ctx, "pink-noise", {
		numberOfInputs: 0,
		outputChannelCount: [1],
	});
}

function playPlopSound(ctx: AudioContext) {
	const now = ctx.currentTime;
	const osc = new OscillatorNode(ctx, { type: "sine", frequency: 200 });
	const gain = new GainNode(ctx, { gain: 1 });

	osc.frequency.setValueAtTime(200, now);
	osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
	gain.gain.setValueAtTime(1, now);
	gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

	osc.connect(gain).connect(ctx.destination);
	osc.start(now);
	osc.stop(now + 0.2);
	osc.onended = () => {
		osc.disconnect();
		gain.disconnect();
	};
}

function createTone(
	ctx: AudioContext,
	type: OscillatorType,
	frequency: number,
	level: number,
) {
	const osc = new OscillatorNode(ctx, { type, frequency });
	const gain = new GainNode(ctx, { gain: level });
	osc.connect(gain);
	osc.start();
	return { osc, gain };
}

export default function Sound({ text }: { text: string }) {
	const { crt: crtEffect } = useContext(StateContext);
	const [ctx, setCtx] = useState<AudioContext | null>(null);
	const [audioWorking, setAudioWorking] = useState(false);
	const prevText = useRef(text);

	// Context lifecycle + autoplay-policy handling
	useEffect(() => {
		const audioContext = new AudioContext();
		setCtx(audioContext);

		const sync = () => setAudioWorking(audioContext.state === "running");
		audioContext.addEventListener("statechange", sync);

		const resume = () => {
			if (audioContext.state === "suspended")
				audioContext.resume().catch(() => {});
		};
		resume(); // works if the page already has user activation
		window.addEventListener("pointerdown", resume);
		window.addEventListener("keydown", resume);
		sync();

		return () => {
			window.removeEventListener("pointerdown", resume);
			window.removeEventListener("keydown", resume);
			audioContext.removeEventListener("statechange", sync);
			setCtx(null);
			setAudioWorking(false);
			audioContext.close().catch(() => {});
		};
	}, []);

	// Plop on text change (skips the initial render)
	useEffect(() => {
		if (!ctx) return;
		if (prevText.current === text) return;
		prevText.current = text;
		if (ctx.state === "running") playPlopSound(ctx);
	}, [text, ctx]);

	// CRT ambience
	useEffect(() => {
		if (!ctx || !crtEffect) return;

		let cancelled = false;
		const disposables: (() => void)[] = [];

		(async () => {
			const master = new GainNode(ctx, { gain: 0.0001 });
			master.connect(ctx.destination);
			// Exponential ramps can't start at 0, so start near-silent
			master.gain.setValueAtTime(0.0001, ctx.currentTime);
			master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2);
			disposables.push(() => master.disconnect());

			const beep = createTone(ctx, "sine", 400, 0.005);
			const hum = createTone(ctx, "triangle", 60, 0.05);
			for (const { osc, gain } of [beep, hum]) {
				gain.connect(master);
				disposables.push(() => {
					osc.stop();
					osc.disconnect();
					gain.disconnect();
				});
			}

			try {
				const noise = await createPinkNoise(ctx);
				if (cancelled) return noise.disconnect();
				const noiseGain = new GainNode(ctx, { gain: 0.12 });
				noise.connect(noiseGain).connect(master);
				disposables.push(() => {
					noise.disconnect();
					noiseGain.disconnect();
				});
			} catch (err) {
				console.error("Failed to load pink noise worklet", err);
			}
		})();

		return () => {
			cancelled = true;
			disposables.forEach((dispose) => {
				try {
					dispose();
				} catch {}
			});
		};
	}, [ctx, crtEffect]);

	const { setMusic } = useContext(StateContext);
	const [lofiMounted, setLofiMounted] = useState(false);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (
				e.key.toLowerCase() !== "m" ||
				e.repeat ||
				e.ctrlKey ||
				e.metaKey ||
				e.altKey
			)
				return;
			const el = e.target as HTMLElement | null;
			if (
				el &&
				(el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
			)
				return;
			setLofiMounted(true);
			setMusic((on) => !on);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [setMusic]);

	return audioWorking && lofiMounted ? <Lofi /> : null;
}
