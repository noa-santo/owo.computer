"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const VIDEO_ID = process.env.NEXT_PUBLIC_LOFI_VIDEO_ID ?? "rFZHOHl-L8A";
const VOLUME = 20;
const FADE_IN_MS = 2500;
const FADE_OUT_MS = 2000;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function fadeVolume(player: YT.Player, to: number, ms: number, onDone?: () => void) {
  const from = player.getVolume();
  const start = performance.now();
  const id = setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / ms);
    player.setVolume(Math.round(from + (to - from) * smoothstep(t)));
    if (t >= 1) {
      clearInterval(id);
      onDone?.();
    }
  }, 50);
  return () => clearInterval(id);
}

type Fade = { current: (() => void) | null };

function setPlaying(player: YT.Player, on: boolean, fade: Fade) {
  fade.current?.(); // cancels a running fade, including its pending pauseVideo
  if (on) {
    player.unMute();
    player.playVideo();
    fade.current = fadeVolume(player, VOLUME, FADE_IN_MS);
  } else {
    fade.current = fadeVolume(player, 0, FADE_OUT_MS, () => player.pauseVideo());
  }
}

let apiPromise: Promise<typeof YT> | null = null;

function loadYouTubeApi(): Promise<typeof YT> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<typeof YT>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady; // stay polite to other users of the global
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT!);
    };

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      script.remove();
      reject(new Error("Failed to load the YouTube IFrame API"));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

export default function Lofi({ enabled }: { enabled: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const readyRef = useRef(false);
  const enabledRef = useRef(enabled);
  const fadeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    const mount = document.createElement("div");
    container.appendChild(mount);

    loadYouTubeApi()
      .then((yt) => {
        if (cancelled) return;
        playerRef.current = new yt.Player(mount, {
          videoId: VIDEO_ID,
          host: "https://www.youtube-nocookie.com",
          width: 200,
          height: 200,
          playerVars: {
            autoplay: 1,
            mute: 1, // muted start is always allowed; we unmute right after
            controls: 0,
            disablekb: 1,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e: YT.PlayerEvent) => {
              if (cancelled) return;
              readyRef.current = true;
              e.target.setVolume(0);
              setPlaying(e.target, enabledRef.current, fadeRef);
            },
          onError: (e: YT.OnErrorEvent) => console.error("[lofi] error", e.data),
          },
        });
      })
      .catch((err) => console.error(err));

    return () => {
      cancelled = true;
      readyRef.current = false;
      fadeRef.current?.();
      try {
        playerRef.current?.destroy();
    } catch {}
      playerRef.current = null;
      container.replaceChildren();
    };
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
    if (playerRef.current && readyRef.current) {
      setPlaying(playerRef.current, enabled, fadeRef);
    }
  }, [enabled]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{ position: "fixed", left: -9999, width: 200, height: 200, pointerEvents: "none" }}
    />
  );
}