"use client";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import CRTEffect from "@/app/_components/CRTEffect";
import styles from "./page.module.css";

type Command = {
	description: string;
	execute: (args: string[]) => string | void;
};

type FileSystemNode = {
	type: "file" | "directory";
	name: string;
	content?: string;
	children?: { [key: string]: FileSystemNode };
};

const commandRegistry: { [key: string]: Command } = {};

const registerCommand = (
	name: string,
	description: string,
	execute: (args: string[]) => string | void,
) => {
	commandRegistry[name] = { description, execute };
};

const root: FileSystemNode = {
	type: "directory",
	name: "",
	children: {},
};

let currentDirectory = root;

registerCommand("ls", "Lists directory contents", () => {
	if (currentDirectory.children) {
		return Object.keys(currentDirectory.children).join("\n");
	}
	return "";
});
registerCommand("cd", "Changes directory", (args: string[]) => {
	if (args.length === 0) return "No directory specified";
	const dirName = args[0];
	if (dirName === "..") {
		if (currentDirectory.name !== "") {
			currentDirectory = root; // Simplified for this example
		}
	} else if (
		currentDirectory.children?.[dirName] &&
		currentDirectory.children[dirName].type === "directory"
	) {
		currentDirectory = currentDirectory.children[dirName];
	} else {
		return `Directory not found: ${dirName}`;
	}
	return "";
});
registerCommand("mkdir", "Creates a new directory", (args: string[]) => {
	if (args.length === 0) return "No directory name specified";
	const dirName = args[0];
	if (currentDirectory.children && !currentDirectory.children[dirName]) {
		currentDirectory.children[dirName] = {
			type: "directory",
			name: dirName,
			children: {},
		};
	} else {
		return `Directory already exists: ${dirName}`;
	}
	return "";
});
registerCommand("touch", "Creates a new file", (args: string[]) => {
	if (args.length === 0) return "No file name specified";
	const fileName = args[0];
	if (currentDirectory.children && !currentDirectory.children[fileName]) {
		currentDirectory.children[fileName] = {
			type: "file",
			name: fileName,
			content: "",
		};
	} else {
		return `File already exists: ${fileName}`;
	}
	return "";
});
registerCommand("cat", "Prints file content", (args) => {
	if (args.length === 0) return "No file name specified";
	const fileName = args[0];
	if (
		currentDirectory.children?.[fileName] &&
		currentDirectory.children[fileName].type === "file"
	) {
		return currentDirectory.children[fileName].content;
	}
	return `File not found: ${fileName}`;
});
registerCommand("rm", "Removes a file", (args: string[]) => {
	if (args.length === 0) return "No file name specified";
	const fileName = args[0];
	if (
		currentDirectory.children?.[fileName] &&
		currentDirectory.children[fileName].type === "file"
	) {
		delete currentDirectory.children[fileName];
		return `File removed: ${fileName}`;
	}
	return `File not found: ${fileName}`;
});
registerCommand("rmdir", "Removes a directory", (args: string[]) => {
	if (args.length === 0) return "No directory name specified";
	const dirName = args[0];
	if (
		currentDirectory.children?.[dirName] &&
		currentDirectory.children[dirName].type === "directory"
	) {
		delete currentDirectory.children[dirName];
		return `Directory removed: ${dirName}`;
	}
	return `Directory not found: ${dirName}`;
});
registerCommand("pwd", "Prints the current directory path", () => {
	let path = "";
	let node: FileSystemNode | undefined = currentDirectory;
	while (node && node.name !== "") {
		path = `/${node.name}${path}`;
		node = root;
	}
	return path || "/";
});

export default function TerminalPage() {
	const [messages, setMessages] = useState<string[]>([]);
	const [history, setHistory] = useState<string[]>([]);
	const [historyIndex, setHistoryIndex] = useState<number>(-1);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: needed here to trigger on new message
	useEffect(() => {
		inputRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	useEffect(() => {
		window.addEventListener("keydown", () => inputRef.current?.focus());
		return () =>
			window.removeEventListener("keydown", () => inputRef.current?.focus());
	}, []);

	registerCommand("echo", "Echoes the input text", (args) => args.join(" "));
	registerCommand("clear", "Clears the terminal", () => {
		setMessages([]);
	});
	registerCommand("help", "Displays this help message", () => {
		return Object.keys(commandRegistry)
			.map((cmd) => `${cmd}: ${commandRegistry[cmd].description}\n`)
			.join("\n");
	});

	const handleCommand = (command: string) => {
		const args = command.split(" ");
		const cmd = args[0].toLowerCase();

		if (cmd === "clear") {
			commandRegistry[cmd].execute(args.slice(1));
		} else if (commandRegistry[cmd]) {
			const output = commandRegistry[cmd].execute(args.slice(1));
			if (output !== undefined) {
				const outputLines = output.split("\n");
				setMessages((prevMessages) => [
					...prevMessages,
					`> ${command}`,
					...outputLines,
				]);
			} else {
				setMessages((prevMessages) => [...prevMessages, `> ${command}`]);
			}
		} else {
			setMessages((prevMessages) => [
				...prevMessages,
				`> ${command}`,
				`Command not found: "${cmd}"`,
			]);
		}

		setHistory((prevHistory) => [...prevHistory, command]);
		setHistoryIndex(-1);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			handleCommand(event.currentTarget.value);
			event.currentTarget.value = "";
		} else if (event.key === "ArrowUp") {
			if (historyIndex < history.length - 1) {
				const newIndex = historyIndex + 1;
				setHistoryIndex(newIndex);
				event.currentTarget.value = history[history.length - 1 - newIndex];
			}
		} else if (event.key === "ArrowDown") {
			if (historyIndex > 0) {
				const newIndex = historyIndex - 1;
				setHistoryIndex(newIndex);
				event.currentTarget.value = history[history.length - 1 - newIndex];
			} else {
				setHistoryIndex(-1);
				event.currentTarget.value = "";
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
						<div>
							{messages.map((message, index) => (
								<p key={index}>{message}</p>
							))}
						</div>
						<div className={styles.inputContainer}>
							<span>&gt;</span>
							<input
								type="text"
								className={styles.input}
								ref={inputRef}
								onKeyDown={handleKeyDown}
							/>
						</div>
					</div>
				</main>
			</div>
		</>
	);
}
