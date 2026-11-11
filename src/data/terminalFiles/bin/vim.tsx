import type React from "react";
import { useContext, useEffect, useRef, useState } from "react";
import { StateContext } from "@/app/_components/StateContext";
import { Command, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode, writeFile } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

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
	const [mode, setMode] = useState<"NORMAL" | "INSERT" | "COMMAND">("NORMAL");
	const [cmd, setCmd] = useState("");
	const [closed, setClosed] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: needed here
	useEffect(() => {
		if (!closed) textareaRef.current?.focus();
	}, [mode, closed]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (mode === "NORMAL") {
			e.preventDefault();
			if (e.key === "i") setMode("INSERT");
			else if (e.key === ":") {
				setMode("COMMAND");
				setCmd(":");
			}
		} else if (mode === "INSERT") {
			if (e.key === "Escape") {
				e.preventDefault();
				setMode("NORMAL");
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
			<textarea
				ref={textareaRef}
				value={content}
				onChange={(e) => mode === "INSERT" && setContent(e.target.value)}
				onKeyDown={handleKeyDown}
				readOnly={mode !== "INSERT"}
				spellCheck={false}
				style={{
					flex: 1,
					backgroundColor: "transparent",
					color: "#d4d4d4",
					fontFamily: "monospace",
					fontSize: "inherit",
					border: "none",
					outline: "none",
					padding: `${crt ? "40px" : "20px"} ${paddingX} 20px ${paddingX}`,
					resize: "none",
				}}
			/>
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
