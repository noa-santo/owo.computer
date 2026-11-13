import localFont from "next/font/local";
import type React from "react";
import {
	memo,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { StateContext } from "@/app/_components/StateContext";
import { Command, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode, writeFile } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";
import {
	HELP_LINES,
	type Mode,
	normalizeKey,
	VimEngine,
} from "@/lib/terminal/vim/engine";

const ICON = {
	vim: "\ue62b",
	file: "\uf15b",
	lock: "\uf023",
	modified: "\uf040",
	line: "\ue0a1",
};

const vimIcons = localFont({
	src: "../../../fonts/vim-icons.woff2",
	display: "block",
	preload: false,
});

const FONT = `${vimIcons.style.fontFamily}, monospace`;
const BG = "#1e1e1e";
const FG = "#d4d4d4";
const LINE_HEIGHT = 1.4;

const MODE_COLORS: Record<Mode, string> = {
	NORMAL: "#569cd6",
	INSERT: "#89d185",
	VISUAL: "#c586c0",
	"V-LINE": "#c586c0",
	"V-BLOCK": "#c586c0",
	COMMAND: "#dcdcaa",
	SEARCH: "#dcdcaa",
};

const TOKEN_RE =
	/("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\/\/.*|\/\*.*?(?:\*\/|$))|\b(const|let|var|function|import|export|default|from|if|else|return|class|interface|type|public|private|protected|readonly|switch|case|break|continue|for|while|do|try|catch|finally|throw|extends|implements|static|abstract|enum|async|await|new|this|of|in|as|typeof|instanceof|void|super)\b|\b(string|number|boolean|any|unknown|never|null|undefined|true|false)\b|\b(\d+(?:\.\d+)?)\b/g;

const COLORS = ["#ce9178", "#6a9955", "#569cd6", "#4ec9b0", "#b5cea8"];

function colorLine(line: string): (string | undefined)[] {
	const out: (string | undefined)[] = new Array(line.length);
	for (const m of line.matchAll(TOKEN_RE)) {
		const group = m.slice(1).findIndex((g) => g !== undefined);
		const color = COLORS[group];
		const start = m.index ?? 0;
		out.fill(color, start, start + m[0].length);
	}
	return out;
}

/* ---------------- one buffer row ---------------- */

interface RowProps {
	text: string;
	gutter: string;
	gutterWidth: number;
	currentRow: boolean;
	/** -1 when the cursor is not on this row */
	cursor: number;
	bar: boolean;
	selFrom: number;
	selTo: number;
	matchKey: string;
	highlight: boolean;
}

const Row = memo(function Row(p: RowProps) {
	const { text, cursor, selFrom, selTo } = p;
	const colors = useMemo(
		() => (p.highlight ? colorLine(text) : null),
		[p.highlight, text],
	);
	const matches = useMemo(
		() =>
			p.matchKey
				? p.matchKey.split(",").map((s) => s.split("-").map(Number))
				: [],
		[p.matchKey],
	);

	const len = text.length;
	const total = cursor === len || selTo > len ? len + 1 : len;

	const keyAt = (j: number) => {
		if (j === cursor) return "C";
		const sel = selFrom <= j && j < selTo ? "s" : "";
		const hit = matches.some(([a, b]) => a <= j && j < b) ? "m" : "";
		return `${j < len ? (colors?.[j] ?? "") : ""}|${sel}${hit}`;
	};

	const cells: React.ReactNode[] = [];
	let j = 0;
	while (j < total) {
		const key = keyAt(j);
		if (key === "C") {
			cells.push(
				<span
					key={j}
					data-cursor=""
					style={{
						scrollMarginBlock: "2.5em",
						...(p.bar
							? { boxShadow: `inset 2px 0 0 ${FG}` }
							: { background: FG, color: BG }),
					}}
				>
					{j < len ? text[j] : " "}
				</span>,
			);
			j++;
			continue;
		}
		let k = j + 1;
		while (k < total && keyAt(k) === key) k++;
		const [color, flags] = key.split("|");
		cells.push(
			<span
				key={j}
				style={{
					color: color || undefined,
					background: flags.includes("s")
						? "#264f78"
						: flags.includes("m")
							? "#5c4a14"
							: undefined,
				}}
			>
				{k > len ? `${text.slice(j, len)} `.slice(0, k - j) : text.slice(j, k)}
			</span>,
		);
		j = k;
	}

	return (
		<div data-row="" style={{ display: "flex", minHeight: `${LINE_HEIGHT}em` }}>
			<span
				style={{
					position: "sticky",
					left: 0,
					flex: "none",
					width: `${p.gutterWidth}ch`,
					paddingRight: "1ch",
					textAlign: "right",
					background: BG,
					color: p.currentRow ? "#c6c6c6" : "#6e7681",
					userSelect: "none",
				}}
			>
				{p.gutter}
			</span>
			<span style={{ whiteSpace: "pre" }}>{cells}</span>
		</div>
	);
});

/* ---------------- the editor ---------------- */

const VimUI = ({
	terminal,
	filePath,
	initialContent,
	readonly,
	isNew,
}: {
	terminal: Terminal;
	filePath: string;
	initialContent: string;
	readonly: boolean;
	isNew: boolean;
}) => {
	const { crt } = useContext(StateContext);
	const [closed, setClosed] = useState(false);
	const [, rerender] = useReducer((n: number) => n + 1, 0);
	const [size, setSize] = useState({ rows: 30, rowH: 24 });
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const [engine] = useState(
		() =>
			new VimEngine(initialContent, {
				filePath,
				readonly,
				isNew,
				exists: (p) => resolveNode(terminal, p) !== null,
				write: (p, text) => {
					writeFile(terminal, p, text, false);
					terminal.saveState();
				},
				quit: () => setClosed(true),
				yank: (text) => {
					navigator.clipboard?.writeText(text).catch(() => {});
				},
			}),
	);

	useEffect(() => {
		const onResize = () => rerender();
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	// Measure the viewport and keep the cursor visible after every render.
	useLayoutEffect(() => {
		const sc = scrollRef.current;
		if (!sc) return;
		const rowEl = sc.querySelector<HTMLElement>("[data-row]");
		const rowH = rowEl?.getBoundingClientRect().height || size.rowH;
		const rows = Math.max(1, Math.floor(sc.clientHeight / rowH));
		if (rows !== size.rows || Math.abs(rowH - size.rowH) > 0.5) {
			setSize({ rows, rowH });
		}
		engine.viewRows = rows;

		const cur = sc.querySelector<HTMLElement>("[data-cursor]");
		if (engine.scrollRequest) {
			const block =
				engine.scrollRequest === "top"
					? "start"
					: engine.scrollRequest === "bottom"
						? "end"
						: "center";
			cur?.scrollIntoView({ block });
			engine.scrollRequest = null;
		} else {
			if (engine.scrollDelta) {
				sc.scrollTop += engine.scrollDelta * rowH;
				engine.scrollDelta = 0;
			}
			cur?.scrollIntoView({ block: "nearest", inline: "nearest" });
		}
		engine.viewTop = Math.round(sc.scrollTop / rowH);
	});

	const feed = (keys: string[]) => {
		let any = false;
		for (const k of keys) if (engine.handleKey(k)) any = true;
		if (any) rerender();
		return any;
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.nativeEvent.isComposing) return;
		const key = normalizeKey(e);
		if (key === null) return;
		if (!feed([key])) return;
		e.preventDefault();
	};

	const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		e.preventDefault();
		if (engine.pasteText(e.clipboardData.getData("text"))) rerender();
	};

	// Dead keys (^ on German layouts) and mobile keyboards arrive as input/composition events.
	const onCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
		const data = e.data;
		e.currentTarget.value = "";
		if (data) feed([...data]);
	};

	const onInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
		const ne = e.nativeEvent as InputEvent;
		const value = e.currentTarget.value;
		e.currentTarget.value = "";
		if (ne.isComposing || ne.inputType === "insertCompositionText") return;
		if (ne.inputType === "deleteContentBackward") feed(["<BS>"]);
		else if (
			ne.inputType === "insertLineBreak" ||
			ne.inputType === "insertParagraph"
		)
			feed(["<CR>"]);
		else if (ne.inputType === "insertText" && value) feed([...value]);
	};

	if (closed) {
		return <div>[Vim: Exited "{filePath}"]</div>;
	}

	const paddingX = crt ? "60px" : "20px";
	const paddingY = crt ? "40px" : "20px";
	const { options, lines } = engine;
	const highlight = /\.(tsx?|jsx?|mjs|cjs)$/.test(filePath);
	const gutterWidth =
		options.number || options.relativenumber
			? Math.max(3, String(lines.length).length + 1)
			: 0;
	const mode = engine.mode;
	const inCmdline = mode === "COMMAND" || mode === "SEARCH";

	const gutterFor = (i: number) => {
		if (!gutterWidth) return "";
		if (options.relativenumber) {
			return i === engine.row
				? options.number
					? String(i + 1)
					: "0"
				: String(Math.abs(i - engine.row));
		}
		return String(i + 1);
	};

	const showmode =
		mode === "INSERT"
			? "-- INSERT --"
			: mode === "VISUAL"
				? "-- VISUAL --"
				: mode === "V-LINE"
					? "-- VISUAL LINE --"
					: mode === "V-BLOCK"
						? "-- VISUAL BLOCK --"
						: "";

	const bottom = inCmdline ? (
		<>
			{engine.cmdType}
			{engine.cmdline}
			<span style={{ background: FG, color: BG }}> </span>
		</>
	) : engine.message ? (
		<span style={{ color: engine.error ? "#f48771" : undefined }}>
			{engine.message}
		</span>
	) : (
		showmode
	);

	return (
		<div
			onMouseDown={(e) => {
				e.preventDefault();
				inputRef.current?.focus();
			}}
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				zIndex: 100,
				display: "flex",
				flexDirection: "column",
				backgroundColor: BG,
				color: FG,
				fontFamily: FONT,
				fontSize: "1.5rem",
				lineHeight: LINE_HEIGHT,
				tabSize: options.tabstop,
				whiteSpace: "normal",
				wordBreak: "normal",
				paddingTop: paddingY,
			}}
		>
			<textarea
				ref={inputRef}
				autoFocus
				aria-label="vim input"
				spellCheck={false}
				autoCapitalize="off"
				autoCorrect="off"
				onKeyDown={onKeyDown}
				onPaste={onPaste}
				onInput={onInput}
				onCompositionEnd={onCompositionEnd}
				onBlur={() => requestAnimationFrame(() => inputRef.current?.focus())}
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: 1,
					height: 1,
					opacity: 0,
					border: "none",
					padding: 0,
					resize: "none",
					pointerEvents: "none",
				}}
			/>

			<div
				ref={scrollRef}
				onScroll={(e) => {
					engine.viewTop = Math.round(e.currentTarget.scrollTop / size.rowH);
				}}
				style={{
					flex: 1,
					minHeight: 0,
					overflow: "auto",
					padding: `0 ${paddingX}`,
					scrollPaddingLeft: `${gutterWidth}ch`,
				}}
			>
				{lines.map((text, i) => {
					const sel = engine.selectedCols(i);
					const isCur = i === engine.row;
					return (
						<Row
							key={i}
							text={text}
							gutter={gutterFor(i)}
							gutterWidth={gutterWidth}
							currentRow={isCur}
							cursor={isCur ? engine.col : -1}
							bar={mode === "INSERT"}
							selFrom={sel ? sel[0] : 0}
							selTo={sel ? sel[1] : 0}
							matchKey={engine
								.matchesInLine(i)
								.map(([a, b]) => `${a}-${b}`)
								.join(",")}
							highlight={highlight}
						/>
					);
				})}
				{Array.from(
					{ length: Math.max(0, size.rows - lines.length) },
					(_, i) => (
						<div
							key={`f${i}`}
							style={{ color: "#569cd6", minHeight: `${LINE_HEIGHT}em` }}
						>
							~
						</div>
					),
				)}
			</div>

			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					backgroundColor: "#333",
					color: "#fff",
					padding: `0 ${paddingX}`,
					fontSize: "0.9em",
				}}
			>
				<span style={{ whiteSpace: "pre" }}>
					<span
						style={{
							background: MODE_COLORS[mode],
							color: BG,
							padding: "0 1ch",
							fontWeight: "bold",
						}}
					>
						{ICON.vim} {mode}
					</span>
					{`  ${ICON.file} ${filePath || "[No Name]"}`}
					{readonly ? ` ${ICON.lock}` : ""}
					{engine.modified ? ` ${ICON.modified}` : ""}
				</span>
				<span style={{ whiteSpace: "pre" }}>
					{`${ICON.line} ${engine.row + 1}:${engine.col + 1}  ${engine.percent}`}
				</span>
			</div>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					padding: `0 ${paddingX} ${crt ? "40px" : "4px"}`,
					minHeight: `${LINE_HEIGHT}em`,
					whiteSpace: "pre",
				}}
			>
				<span>{bottom}</span>
				<span style={{ opacity: 0.7 }}>
					{engine.recording ? `recording @${engine.recording}  ` : ""}
					{engine.pending}
				</span>
			</div>

			{engine.showHelp && (
				<pre
					style={{
						position: "absolute",
						top: paddingY,
						left: paddingX,
						right: paddingX,
						margin: 0,
						padding: "1ch 2ch",
						background: "#252526",
						border: "1px solid #569cd6",
						fontFamily: "inherit",
						fontSize: "0.7em",
						overflow: "auto",
						maxHeight: "80%",
					}}
				>
					{HELP_LINES.join("\n")}
				</pre>
			)}
		</div>
	);
};

export default class Vim extends Command {
	metadata = {
		command: "vim",
		description: "Vi IMproved, a programmer's text editor.",
		arguments: [
			{ flag: 0, description: "File to edit (omit for an empty buffer)" },
		],
	};

	public method(terminal: Terminal, args: ParsedArgs, _: string): any {
		const raw = args.get(0);
		const filePath = typeof raw === "string" ? raw : "";

		const node = filePath ? resolveNode(terminal, filePath) : null;
		if (node && node.type === "directory") {
			return `vim: ${filePath}: Is a directory`;
		}

		return (
			<VimUI
				terminal={terminal}
				filePath={filePath}
				initialContent={node?.type === "file" ? node.content : ""}
				readonly={node?.type === "file" && node.bundled === true}
				isNew={filePath !== "" && node === null}
			/>
		);
	}
}
