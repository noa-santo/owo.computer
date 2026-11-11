"use client";
import type React from "react";
import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import defaultState from "@/data/defaultState.json";
import type variants from "@/data/variants.json";

interface State {
	crt: boolean;
	setCrt: React.Dispatch<React.SetStateAction<boolean>>;
	toggleCrt: () => void;
	sound: boolean;
	setSound: React.Dispatch<React.SetStateAction<boolean>>;
	toggleSound: () => void;
	music: boolean;
	setMusic: React.Dispatch<React.SetStateAction<boolean>>;
	variantSet: keyof typeof variants;
	setVariantSet: React.Dispatch<React.SetStateAction<keyof typeof variants>>;
}

export const StateContext = createContext<State>(defaultState as State);

export const StateProvider = ({ children }: { children: React.ReactNode }) => {
	const [crt, setCrt] = useState<boolean>(defaultState.crt);
	const [sound, setSound] = useState<boolean>(defaultState.sound);
	const [music, setMusic] = useState<boolean>(defaultState.music);
	const [variantSet, setVariantSet] = useState<keyof typeof variants>(
		defaultState.variantSet as keyof typeof variants,
	);
    const [hasHydrated, setHasHydrated] = useState<boolean>(false);

	useEffect(() => {
		const storedState = localStorage.getItem("appState");
		if (storedState) {
			const parsedState = JSON.parse(storedState);
			setCrt(parsedState.crt);
			setSound(parsedState.sound);
			setMusic(parsedState.music);
			setVariantSet(parsedState.variantSet);
		}
        setHasHydrated(true);
	}, []);

	useEffect(() => {
        if (!hasHydrated) return;

		localStorage.setItem(
			"appState",
			JSON.stringify({ crt, sound, music, variantSet }),
		);
    }, [crt, sound, music, variantSet, hasHydrated]);

	const toggleCrt = useCallback(() => {
		setCrt((prev) => !prev);
	}, []);

	const toggleSound = useCallback(() => {
		setSound((prev) => !prev);
	}, []);

	const value = useMemo(
		() => ({
			crt,
			setCrt,
			sound,
			setSound,
			music,
			setMusic,
			variantSet,
			setVariantSet,
			toggleCrt,
			toggleSound,
		}),
		[crt, sound, music, variantSet, toggleCrt, toggleSound],
	);

	return <StateContext value={value}>{children}</StateContext>;
};
