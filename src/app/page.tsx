"use client";
import React, {useState, useEffect, useMemo, useCallback, Suspense} from "react";
import styles from "./page.module.css";
import CRTEffect from "./_components/CRTEffect";
import MobileControls from "./_components/MobileControls";
import {useRouter} from "next/navigation";
import Sound from "./_components/Sound";

export default function Home() {
  const [crtEffect, setCrtEffect] = useState(true);
  const [sound, setSound] = useState(true);
  const [text, setText] = useState("OwO");
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout>();
  const [currentSet, setCurrentSet] = useState<keyof typeof variants>("happy");
  const router = useRouter();

  const variants = useMemo(() => ({
    happy: ["OwO", "UwU", "owo", "uwu", ">w<", "^w^"],
    sad: ["TwT", "QwQ", "QnQ", "TnT"],
    colon3: [":3", ":0", ":D", ":P", ":c", ":v", ":o", ":O", ">:3", ":3c", ">:3c"],
  }), []);

  const handleMouseOver = () => {
    setIntervalId(setInterval(() => {
      const randomVariation = variants[currentSet][Math.floor(Math.random() * variants[currentSet].length)];
      setText(randomVariation);
    }, 50));
  };

  const handleMouseOut = () => {
    clearInterval(intervalId);
  };

  const switchVariation = useCallback(() => {
    const keys = Object.keys(variants) as Array<keyof typeof variants>;
    const currentIndex = keys.indexOf(currentSet);
    const nextIndex = (currentIndex + 1) % keys.length;
    setCurrentSet(keys[nextIndex]);
    const randomVariation = variants[keys[nextIndex]][Math.floor(Math.random() * variants[keys[nextIndex]].length)];
    setText(randomVariation);
  }, [currentSet, variants]);

  const toggleCrtEffect = useCallback(() => {
    setCrtEffect(!crtEffect);
  }, [crtEffect]);

  const toggleSound = useCallback(() => {
    setSound(!sound)
  }, [sound])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "v") {
        switchVariation();
      }
      if (event.key.toLowerCase() === "c") {
        toggleCrtEffect();
      }
      if (event.key.toLowerCase() === "r") {
        const randomVariation = variants[currentSet][Math.floor(Math.random() * variants[currentSet].length)];
        setText(randomVariation);
      }
      if (event.key === "3") {
        router.push("/3d");
      }
      if (event.key === "t") {
        router.push("/terminal");
      }

      if (event.key.toLowerCase() === "s") {
        toggleSound()
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [switchVariation, toggleCrtEffect, toggleSound, router, variants, currentSet]);


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
          <MobileControls onSwitchVariation={switchVariation} onToggleCrtEffect={toggleCrtEffect} onToggleSound={toggleSound} />
        </Suspense>
      </main>
      {sound && <Sound crtEffect={crtEffect} text={text} />}
    </>
  );
}
