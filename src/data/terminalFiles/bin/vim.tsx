import type React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { StateContext } from "@/app/_components/StateContext";
import { Command, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode, writeFile } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

const highlightTypeScript = (code: string) => {
	const html = code
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	const regex =
		/("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[\s\S]*?`)|(\/\/.*)|\b(const|let|var|function|import|export|default|from|if|else|return|class|interface|type|public|private|protected|switch|case|break|async|await|new|this)\b|\b(string|number|boolean|any|void|null|undefined)\b|\b(\d+)\b/g;

	return html.replace(regex, (match, str, comment, keyword, type, num) => {
		if (str) return `<span style="color:#ce9178">${str}</span>`;
		if (comment) return `<span style="color:#6a9955">${comment}</span>`;
		if (keyword) return `<span style="color:#569cd6">${keyword}</span>`;
		if (type) return `<span style="color:#4ec9b0">${type}</span>`;
		if (num) return `<span style="color:#b5cea8">${num}</span>`;
		return match;
	});
};

const VimUI = ({
	terminal,
	filePath,
	initialContent,
}: {
	terminal: Terminal;
	filePath: string;
	initialContent: string;
}) => {
	const { crt } = useContext(StateContext);
	const [content, setContent] = useState(initialContent);
	const [history, setHistory] = useState<string[]>([initialContent]);
	const [mode, setMode] = useState<"NORMAL" | "INSERT" | "COMMAND">("NORMAL");
	const [cmd, setCmd] = useState("");
	const [closed, setClosed] = useState(false);
	const [pendingAction, setPendingAction] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const isTypeScript = filePath.endsWith(".ts") || filePath.endsWith(".tsx");

	// biome-ignore lint/correctness/useExhaustiveDependencies: needed here
	useEffect(() => {
		if (!closed) textareaRef.current?.focus();
	}, [mode, closed]);

	const pushHistory = (newContent: string) => {
		setHistory((prev) => [...prev, newContent]);
	};

	const moveCursor = (direction: "h" | "j" | "k" | "l") => {
		const el = textareaRef.current;
		if (!el) return;

		const pos = el.selectionStart;
		const text = el.value;
		const lines = text.split("\n");

		let currentLineIdx = 0;
		let charCount = 0;

		for (let i = 0; i < lines.length; i++) {
			if (charCount + lines[i].length + 1 > pos) {
				currentLineIdx = i;
				break;
			}
			charCount += lines[i].length + 1;
		}

		const col = pos - charCount;
		let newPos = pos;

		if (direction === "h") {
			newPos = Math.max(0, pos - 1);
		} else if (direction === "l") {
			newPos = Math.min(text.length, pos + 1);
		} else if (direction === "k" && currentLineIdx > 0) {
			const prevLine = lines[currentLineIdx - 1];
			const prevLineStart = charCount - prevLine.length - 1;
			newPos = prevLineStart + Math.min(col, prevLine.length);
		} else if (direction === "j" && currentLineIdx < lines.length - 1) {
			const nextLine = lines[currentLineIdx + 1];
			const nextLineStart = charCount + lines[currentLineIdx].length + 1;
			newPos = nextLineStart + Math.min(col, nextLine.length);
		}

		el.setSelectionRange(newPos, newPos);
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (mode === "NORMAL") {
			e.preventDefault();

			if (e.key === "i") {
				setMode("INSERT");
				setPendingAction("");
			} else if (e.key === ":") {
				setMode("COMMAND");
				setCmd(":");
				setPendingAction("");
			} else if (e.key === "h") moveCursor("h");
			else if (e.key === "j") moveCursor("j");
			else if (e.key === "k") moveCursor("k");
			else if (e.key === "l") moveCursor("l");
			else if (e.key === "x") {
				const pos = textareaRef.current?.selectionStart || 0;
				if (pos < content.length) {
					const newContent = content.slice(0, pos) + content.slice(pos + 1);
					setContent(newContent);
					pushHistory(newContent);
					setTimeout(() => textareaRef.current?.setSelectionRange(pos, pos), 0);
				}
			} else if (e.key === "u") {
				if (history.length > 1) {
					const newHistory = [...history];
					newHistory.pop();
					const prevContent = newHistory[newHistory.length - 1];
					setContent(prevContent);
					setHistory(newHistory);
				}
			} else if (e.key === "d") {
				if (pendingAction === "d") {
					const pos = textareaRef.current?.selectionStart || 0;
					const lines = content.split("\n");
					let currentLineIdx = 0;
					let charCount = 0;

					for (let i = 0; i < lines.length; i++) {
						if (charCount + lines[i].length + 1 > pos) {
							currentLineIdx = i;
							break;
						}
						charCount += lines[i].length + 1;
					}

					lines.splice(currentLineIdx, 1);
					const newContent = lines.join("\n");
					setContent(newContent);
					pushHistory(newContent);
					setPendingAction("");
					setTimeout(
						() => textareaRef.current?.setSelectionRange(charCount, charCount),
						0,
					);
				} else {
					setPendingAction("d");
				}
			} else {
				setPendingAction("");
			}
		} else if (mode === "INSERT") {
			if (e.key === "Escape") {
				e.preventDefault();
				setMode("NORMAL");
				pushHistory(content);
			}
		} else if (mode === "COMMAND") {
			if (e.key === "Escape" || (e.key === "Backspace" && cmd === ":")) {
				e.preventDefault();
				setMode("NORMAL");
				setCmd("");
			} else if (e.key === "Enter") {
				e.preventDefault();
				if (cmd === ":w") {
					writeFile(terminal, filePath, content, false);
					setMode("NORMAL");
					setCmd("");
				} else if (cmd === ":q") {
					setClosed(true);
				} else if (cmd === ":wq" || cmd === ":x") {
					writeFile(terminal, filePath, content, false);
					setClosed(true);
				} else {
					setMode("NORMAL");
					setCmd("");
				}
			} else if (e.key.length === 1) {
				setCmd((prev) => prev + e.key);
			} else if (e.key === "Backspace") {
				setCmd((prev) => prev.slice(0, -1));
			}
		}
	};

	if (closed) {
		return <div>[Vim: Exited "{filePath}"]</div>;
	}

	const paddingX = crt ? "60px" : "20px";
	const paddingY = crt ? "40px" : "20px";

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 100,
				display: "flex",
				flexDirection: "column",
				backgroundColor: "#1e1e1e",
				fontSize: "1.5rem",
			}}
		>
			<div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
				<div
					// biome-ignore lint/security/noDangerouslySetInnerHtml: needed here and data should be trustable
					dangerouslySetInnerHTML={{
						__html: isTypeScript
							? highlightTypeScript(content)
							: content
									.replace(/&/g, "&amp;")
									.replace(/</g, "&lt;")
									.replace(/>/g, "&gt;"),
					}}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						padding: `${paddingY} ${paddingX} 20px ${paddingX}`,
						color: "#d4d4d4",
						fontFamily: "monospace",
						fontSize: "inherit",
						whiteSpace: "pre-wrap",
						wordWrap: "break-word",
						pointerEvents: "none",
					}}
				/>
				<textarea
					ref={textareaRef}
					value={content}
					onChange={(e) => {
						if (mode === "INSERT") setContent(e.target.value);
					}}
					onKeyDown={handleKeyDown}
					readOnly={mode !== "INSERT"}
					spellCheck={false}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: "transparent",
						color: "transparent",
						caretColor: "#d4d4d4",
						fontFamily: "monospace",
						fontSize: "inherit",
						border: "none",
						outline: "none",
						padding: `${paddingY} ${paddingX} 20px ${paddingX}`,
						resize: "none",
						whiteSpace: "pre-wrap",
						wordWrap: "break-word",
					}}
				/>
			</div>
			<div
				style={{
					backgroundColor: "#333",
					color: "#fff",
					padding: `4px ${paddingX} ${crt ? "40px" : "4px"} ${paddingX}`,
					display: "flex",
					justifyContent: "space-between",
					fontSize: "0.9em",
				}}
			>
				<span>
					{mode === "COMMAND"
						? cmd
						: mode === "INSERT"
							? "-- INSERT --"
							: `"${filePath}"`}
				</span>
				<span>Vim</span>
			</div>
		</div>
	);
};

export default class Vim extends Command {
	metadata = {
		command: "vim",
		description: "Vi IMproved, a programmer's text editor.",
		arguments: [{ flag: 0, description: "File to edit" }],
	};

	public method(terminal: Terminal, args: ParsedArgs, _: string): any {
		const filePath = args.get(0) as string;
		if (!filePath) return "vim: missing file operand";

		const node = resolveNode(terminal, filePath);
		if (node && node.type === "directory") {
			return `vim: ${filePath}: Is a directory`;
		}

		const initialContent = node?.type === "file" ? node.content : "";
		return (
			<VimUI
				terminal={terminal}
				filePath={filePath}
				initialContent={initialContent}
			/>
		);
	}
}
