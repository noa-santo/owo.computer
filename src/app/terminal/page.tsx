"use client";

import type React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import CRTEffect from "@/app/_components/CRTEffect";
import { StateContext } from "@/app/_components/StateContext";
import { Command } from "@/lib/terminal/Command";
import { Terminal } from "@/lib/terminal/Terminal";
import styles from "./page.module.css";

interface OutputLine {
	id: string;
	prompt?: string;
	text: string;
}

async function getHistory(terminal: Terminal | null) {
	if (!terminal) return [];
	const result = await terminal.executeCommand("history", true);
	return result.split("\n");
}

export default function TerminalPage() {
	const { crt, toggleCrt } = useContext(StateContext);
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
			getHistory(term).then(setHistory);
		});
	}, []);

	useEffect(() => {
		if (isReady) inputRef.current?.focus();
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

	const handleCommand = async (rawInput: string) => {
		const trimmed = rawInput.trim();
		if (!trimmed || !terminalRef.current) return;

		const currentPrompt = `>`;
		let result = await terminalRef.current.executeCommand(trimmed);
		if (
			(result as unknown as { prototype: any }).prototype instanceof Command
		) {
			result = String(result);
		}

		if (result === "\x1bcrt") {
			toggleCrt();
			result = "";
		}
		if (result === "\x1bc") {
			setOutput([]);
			return;
		}

		getHistory(terminalRef.current).then(setHistory);
		setHistoryIndex(-1);

		setOutput((prev) => [
			...prev,
			{ id: crypto.randomUUID(), prompt: currentPrompt, text: trimmed },
			...(result ? [{ id: crypto.randomUUID(), text: result }] : []),
		]);
	};

	const handleAutocomplete = (inputValue: string) => {
		if (!terminalRef.current) return inputValue;
		const term = terminalRef.current;

		const tokens = inputValue.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
		const endsWithSpace = inputValue.endsWith(" ");
		const currentToken = endsWithSpace ? "" : tokens[tokens.length - 1] || "";

		if (tokens.length <= 1 && !endsWithSpace) {
			const cmds = Array.from(term.commandRegistry.keys());
			const matches = cmds.filter((c) => c.startsWith(currentToken));
			if (matches.length === 1) return `${matches[0]} `;
			return inputValue;
		}

		const lastSlash = currentToken.lastIndexOf("/");
		const dirPath = lastSlash !== -1 ? currentToken.slice(0, lastSlash) : ".";
		const prefix =
			lastSlash !== -1 ? currentToken.slice(lastSlash + 1) : currentToken;

		const dirNode = term.fs.getChildByPath(dirPath, term.currentDir);

		if (dirNode && dirNode.type === "directory") {
			const matches = dirNode.children.filter((c) => c.name.startsWith(prefix));
			if (matches.length === 1) {
				const match = matches[0];
				const replacementPath =
					(lastSlash !== -1 ? currentToken.slice(0, lastSlash + 1) : "") +
					match.name +
					(match.type === "directory" ? "/" : " ");

				if (endsWithSpace) {
					return inputValue + replacementPath;
				} else {
					return (
						inputValue.slice(0, inputValue.length - currentToken.length) +
						replacementPath
					);
				}
			}
		}

		return inputValue;
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Tab") {
			event.preventDefault();
			event.currentTarget.value = handleAutocomplete(event.currentTarget.value);
		} else if (event.key === "Enter") {
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
			{crt && <CRTEffect />}
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
		</>
	);
}
