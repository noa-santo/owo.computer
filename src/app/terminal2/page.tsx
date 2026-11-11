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

	const [isReady, setIsReady] = useState(false);
	const [history, setHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState<number>(-1);
	const [output, setOutput] = useState<OutputLine[]>([
		{ id: "welcome", text: "OwO computer - System Initializing..." },
	]);

	useEffect(() => {
		const term = new Terminal();
		terminalRef.current = term;

		term.init().then(() => {
			setIsReady(true);
			setOutput((prev) => [
				...prev,
				{ id: "ready", text: "Terminal ready. Type 'help' for commands." },
			]);
		});
	}, []);

	useEffect(() => {
		if (isReady) {
			inputRef.current?.focus();
		}
	}, [isReady]);

	useEffect(() => {
		const handleGlobalKeyDown = (_: KeyboardEvent) => {
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

	const handleCommand = async (rawInput: string) => {
		const trimmed = rawInput.trim();
		if (!trimmed) return;

		setHistory((prev) => [...prev, trimmed]);
		setHistoryIndex(-1);

		const currentPrompt = `${terminalRef.current?.currentDir.name ?? "/"} >`;

		setOutput((prev) => [
			...prev,
			{ id: crypto.randomUUID(), prompt: currentPrompt, text: trimmed },
		]);

		if (!terminalRef.current) return;

		const parts = trimmed.split(/\s+/);
		const cmdName = parts[0];
		const rawArgs = parts.slice(1);

		const command = terminalRef.current.commandRegistry.get(cmdName);

		if (!command) {
			setOutput((prev) => [
				...prev,
				{ id: crypto.randomUUID(), text: `command not found: ${cmdName}` },
			]);
			return;
		}

		const argsMap = new Map<string | number, string>();
		rawArgs.forEach((arg, index) => {
			argsMap.set(index, arg);
		});

		try {
			const result = command.method(
				terminalRef.current.fs,
				argsMap,
				terminalRef.current.env,
				"",
			);

			if (result) {
				setOutput((prev) => [
					...prev,
					{ id: crypto.randomUUID(), text: result },
				]);
			}
		} catch (err) {
			setOutput((prev) => [
				...prev,
				{
					id: crypto.randomUUID(),
					text: `Error executing command: ${err instanceof Error ? err.message : String(err)}`,
				},
			]);
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			handleCommand(event.currentTarget.value).then();
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
		<>
			<CRTEffect />
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
									<span>{line.text}</span>
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
		</>
	);
}
