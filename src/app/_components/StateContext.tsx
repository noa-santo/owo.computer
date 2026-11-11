"use client"
import React, {createContext, useCallback, useEffect, useMemo, useState} from "react";
import variants from "@/data/variants.json"
import defaultState from "@/data/defaultState.json"

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

export const StateProvider = ({children}: {children: React.ReactNode}) => {
  const [crt, setCrt] = useState<boolean>(defaultState.crt);
  const [sound, setSound] = useState<boolean>(defaultState.sound);
  const [music, setMusic] = useState<boolean>(defaultState.music);
  const [variantSet, setVariantSet] = useState<keyof typeof variants>(
    defaultState.variantSet as keyof typeof variants
  );

  const toggleCrt = useCallback(() => {
    setCrt(!crt);
  }, [crt]);

  const toggleSound = useCallback(() => {
    setSound(!sound)
  }, [sound])

  const value = useMemo(
    () => ({ crt, setCrt, sound, setSound, music, setMusic, variantSet, setVariantSet, toggleCrt,  toggleSound}),
    [crt, sound, music, variantSet, toggleCrt, toggleSound]
  );

  return <StateContext value={value}>{children}</StateContext>
}
