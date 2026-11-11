"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import CRTEffect from "@/app/_components/CRTEffect";
import { Terminal } from "@/lib/terminal/Terminal";
import styles from "./page.module.css";

interface OutputLine {
	id: string;
	prompt?: string;
	text: string;
}

export default function TerminalPage() {
	const inputRef = useRef<HTMLInputElement>(null);
	const outputEndRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<Terminal | null>(null);
	const isInitializedRef = useRef(false);

	const [isReady, setIsReady] = useState(false);
	const [history, setHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState<number>(-1);
	const [output, setOutput] = useState<OutputLine[]>([]);

	useEffect(() => {
		if (isInitializedRef.current) return;
		isInitializedRef.current = true;

		const term = new Terminal();
		terminalRef.current = term;

		setOutput([
			{
				id: crypto.randomUUID(),
				text: "OwO computer - System Initializing...",
			},
		]);

		term.init().then(() => {
			setIsReady(true);
			setOutput((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					text: "Terminal ready. Type 'help' for commands.",
				},
			]);
		});
	}, []);

	useEffect(() => {
		if (isReady) {
			inputRef.current?.focus();
		}
	}, [isReady]);

	useEffect(() => {
		const handleGlobalKeyDown = () => {
			if (document.activeElement !== inputRef.current) {
				inputRef.current?.focus();
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: needed here
	useEffect(() => {
		outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [output]);

	const handleCommand = (rawInput: string) => {
		const trimmed = rawInput.trim();
		if (!trimmed || !terminalRef.current) return;

		setHistory((prev) => [...prev, trimmed]);
		setHistoryIndex(-1);

		const currentPrompt = `${terminalRef.current.currentDir.getAbsolutePath()} >`;
		const result = terminalRef.current.executeCommand(trimmed);

		setOutput((prev) => [
			...prev,
			{ id: crypto.randomUUID(), prompt: currentPrompt, text: trimmed },
			...(result ? [{ id: crypto.randomUUID(), text: result }] : []),
		]);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			handleCommand(event.currentTarget.value);
			event.currentTarget.value = "";
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			if (history.length === 0) return;

			const nextIndex =
				historyIndex === -1
					? history.length - 1
					: Math.max(0, historyIndex - 1);
			setHistoryIndex(nextIndex);
			event.currentTarget.value = history[nextIndex] ?? "";
		} else if (event.key === "ArrowDown") {
			event.preventDefault();
			if (historyIndex === -1) return;

			const nextIndex = historyIndex + 1;
			if (nextIndex >= history.length) {
				setHistoryIndex(-1);
				event.currentTarget.value = "";
			} else {
				setHistoryIndex(nextIndex);
				event.currentTarget.value = history[nextIndex] ?? "";
			}
		}
	};

	return (
		<div className={styles.container}>
			<main>
				<h1>OwO computer</h1>
				<p>hewwo UwU</p>
				<br />
				<div className={styles.terminal}>
					<div className={styles.outputContainer}>
						{output.map((line) => (
							<div key={line.id} className={styles.line}>
								{line.prompt && (
									<span className={styles.prompt}>{line.prompt} </span>
								)}
								<span style={{ whiteSpace: "pre-wrap" }}>{line.text}</span>
							</div>
						))}
						<div ref={outputEndRef} />
					</div>

					<div className={styles.inputContainer}>
						<span>&gt;</span>
						<input
							type="text"
							className={styles.input}
							ref={inputRef}
							onKeyDown={handleKeyDown}
							disabled={!isReady}
							placeholder={!isReady ? "Initializing WebAssembly..." : ""}
						/>
					</div>
				</div>
			</main>
		</div>
	);
}
