/**
 * Vim state machine for the OwO terminal.
 *
 * Pure TypeScript, no DOM / React: the UI (bin/vim.tsx) feeds it normalized
 * key names and renders its state. That keeps the editing logic testable.
 */

export type Mode =
	| "NORMAL"
	| "INSERT"
	| "VISUAL"
	| "V-LINE"
	| "V-BLOCK"
	| "COMMAND"
	| "SEARCH";

export interface Pos {
	row: number;
	col: number;
}

export interface VimOptions {
	number: boolean;
	relativenumber: boolean;
	ignorecase: boolean;
	smartcase: boolean;
	hlsearch: boolean;
	expandtab: boolean;
	autoindent: boolean;
	wrapscan: boolean;
	shiftwidth: number;
	tabstop: number;
}

export interface VimHost {
	filePath: string;
	readonly: boolean;
	isNew: boolean;
	exists(path: string): boolean;
	write(path: string, content: string): void;
	quit(): void;
	yank?(text: string): void;
}

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

export interface KeyLike {
	key: string;
	ctrlKey: boolean;
	altKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	getModifierState?(key: any): boolean;
}

const NAMED_KEYS: Record<string, string> = {
	Escape: "<Esc>",
	Enter: "<CR>",
	Backspace: "<BS>",
	Tab: "<Tab>",
	Delete: "<Del>",
	ArrowLeft: "<Left>",
	ArrowRight: "<Right>",
	ArrowUp: "<Up>",
	ArrowDown: "<Down>",
	Home: "<Home>",
	End: "<End>",
	PageUp: "<PageUp>",
	PageDown: "<PageDown>",
};

const IGNORED_KEYS = new Set([
	"Dead",
	"Process",
	"Unidentified",
	"Shift",
	"Control",
	"Alt",
	"Meta",
	"AltGraph",
	"CapsLock",
]);

/**
 * KeyboardEvent -> vim key name ("a", "<Esc>", "<C-r>", ...).
 * Returns null for events we leave to the browser.
 * AltGr is treated as plain typing (needed for { [ ] } | \ @ ~ on German layouts).
 */
export function normalizeKey(e: KeyLike): string | null {
	if (e.metaKey) return null;
	const k = e.key;
	if (IGNORED_KEYS.has(k) || /^F\d+$/.test(k)) return null;

	const named = NAMED_KEYS[k];
	if (named) return named;

	if ([...k].length !== 1) return null;

	const altGr =
		e.getModifierState?.("AltGraph") === true || (e.ctrlKey && e.altKey);
	if (altGr) return k;
	if (e.altKey) return null;
	if (e.ctrlKey) {
		if (k === "[") return "<Esc>";
		return /^[a-zA-Z]$/.test(k) ? `<C-${k.toLowerCase()}>` : null;
	}
	return k;
}

/** Ctrl combos the engine owns; any other Ctrl+key falls through to the browser. */
const CTRL_OK = new Set([
	"<C-r>",
	"<C-d>",
	"<C-u>",
	"<C-f>",
	"<C-b>",
	"<C-c>",
	"<C-w>",
	"<C-h>",
	"<C-v>",
]);

export const HELP_LINES = [
	"vim (OwO edition): what is supported",
	"",
	"Modes     i a I A o O  insert      v V <C-v>  visual / line / block",
	"          :  ex command line       / ?  search       <Esc>  back to normal",
	"Motions   h j k l  w W b B e E  0 ^ $  gg G  { }  %  f F t T ; ,",
	"          n N * #  H M L   <C-d> <C-u> <C-f> <C-b>   zz zt zb",
	"Operators d c y > <   with motion, text object or doubled (dd cc yy >> <<)",
	"          counts work everywhere: 3dd  d2w  5j  2yy",
	"Objects   iw aw iW aW  ip ap  i\" a\" i' a' i` a`  i( a( i[ a[ i{ a{ i< a<",
	"Editing   x X D C s S Y  r<c>  ~  J  p P  u  <C-r>  .  (dot repeat)",
	"Insert    <C-w> delete word   <C-u> delete line start   <Tab> indent",
	"Macros    qa ... q  record      @a  play      @@  play again",
	"Visual    d y c > < ~ u U J r p  o  :  (V = whole lines, i/a objects)",
	"Block     <C-v> then  I A insert on every line   $ extend to line ends",
	"          d y c ~ u U r p  o O (swap corners)",
	"Ex        :w [file]  :q  :q!  :wq  :x  :e!  :<line>  :set  :noh  :help",
	"          :[range]s/pat/repl/[gi]   :%s/a/b/g   :[range]d  :y  :>  :<",
	"          ranges: N  .  $  %  N,M  '<,'>  .+1",
	"Options   :set nu rnu ic scs hls et ai sw=N ts=N   (prefix no / inv)",
	"",
	"Patterns use JavaScript regex syntax.  Press any key to close.",
];

interface Snapshot {
	lines: string[];
	row: number;
	col: number;
}

interface Register {
	text: string;
	linewise: boolean;
	block?: boolean;
}

interface Range {
	start: Pos;
	end: Pos;
	linewise: boolean;
}

interface MotionResult {
	pos: Pos;
	linewise?: boolean;
	inclusive?: boolean;
	vertical?: boolean;
	want?: number;
}

interface MotionSpec {
	motion: string;
	arg?: string;
}
type CmdParsed = { type: "cmd"; name: string; count?: number; arg?: string };
type OpParsed = {
	type: "op";
	op: string;
	count?: number;
	target:
		| { kind: "line" }
		| { kind: "obj"; which: string; obj: string }
		| { kind: "motion"; spec: MotionSpec };
};
type MotionParsed = { type: "motion"; count?: number; spec: MotionSpec };
type VObjParsed = { type: "vobj"; which: string; obj: string };
type Parsed = CmdParsed | OpParsed | MotionParsed | VObjParsed;

const isSpecial = (k: string) => k.length > 1 && k.startsWith("<");
const cmp = (a: Pos, b: Pos) => a.row - b.row || a.col - b.col;
const clamp = (n: number, lo: number, hi: number) =>
	Math.min(hi, Math.max(lo, n));
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const leadingWs = (s: string) => /^[ \t]*/.exec(s)?.[0] ?? "";
const mul = (a?: number, b?: number) =>
	a === undefined && b === undefined ? undefined : (a ?? 1) * (b ?? 1);
const mk = (
	sr: number,
	sc: number,
	er: number,
	ec: number,
	linewise = false,
): Range => ({
	start: { row: sr, col: sc },
	end: { row: er, col: ec },
	linewise,
});
const WORD_CHAR = /[\p{L}\p{N}_]/u;
/** 0 = blank, 1 = word (or any non-blank when big), 2 = punctuation */
const cls = (c: string | undefined, big: boolean): 0 | 1 | 2 =>
	!c || /\s/.test(c) ? 0 : big ? 1 : WORD_CHAR.test(c) ? 1 : 2;
const byteLength = (s: string) => new TextEncoder().encode(s).length;

const OPS = new Set(["d", "c", "y", ">", "<"]);
const ALIASES = new Map<string, string[]>([
	["x", ["d", "l"]],
	["<Del>", ["d", "l"]],
	["X", ["d", "h"]],
	["D", ["d", "$"]],
	["C", ["c", "$"]],
	["s", ["c", "l"]],
	["S", ["c", "c"]],
	["Y", ["y", "y"]],
]);
const MOTIONS = new Set([
	"h",
	"j",
	"k",
	"l",
	"w",
	"W",
	"b",
	"B",
	"e",
	"E",
	"0",
	"^",
	"$",
	"G",
	"{",
	"}",
	"%",
	"n",
	"N",
	"*",
	"#",
	"H",
	"M",
	"L",
	";",
	",",
	" ",
	"<Left>",
	"<Right>",
	"<Up>",
	"<Down>",
	"<Home>",
	"<End>",
	"<BS>",
]);
const CMD_SIMPLE = new Set([
	"i",
	"a",
	"I",
	"A",
	"o",
	"O",
	"p",
	"P",
	"u",
	"U",
	"<C-r>",
	".",
	"J",
	"~",
	"v",
	"V",
	":",
	"/",
	"?",
	"<Esc>",
	"<C-c>",
	"<C-d>",
	"<C-u>",
	"<C-f>",
	"<C-b>",
	"q",
	"d",
	"c",
	"y",
	">",
	"<",
	"x",
	"X",
	"D",
	"C",
	"s",
	"S",
	"Y",
	"R",
	"<Del>",
	"<C-v>",
]);

const OPT_NAMES: Record<string, keyof VimOptions> = {
	number: "number",
	nu: "number",
	relativenumber: "relativenumber",
	rnu: "relativenumber",
	ignorecase: "ignorecase",
	ic: "ignorecase",
	smartcase: "smartcase",
	scs: "smartcase",
	hlsearch: "hlsearch",
	hls: "hlsearch",
	expandtab: "expandtab",
	et: "expandtab",
	autoindent: "autoindent",
	ai: "autoindent",
	wrapscan: "wrapscan",
	ws: "wrapscan",
	shiftwidth: "shiftwidth",
	sw: "shiftwidth",
	tabstop: "tabstop",
	ts: "tabstop",
};

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export class VimEngine {
	lines: string[];
	row = 0;
	col = 0;
	mode: Mode = "NORMAL";
	anchor: Pos = { row: 0, col: 0 };
	cmdType: ":" | "/" | "?" = ":";
	cmdline = "";
	message = "";
	error = false;
	showHelp = false;
	recording: string | null = null;
	version = 0;
	options: VimOptions = {
		number: true,
		relativenumber: false,
		ignorecase: false,
		smartcase: false,
		hlsearch: true,
		expandtab: true,
		autoindent: true,
		wrapscan: true,
		shiftwidth: 2,
		tabstop: 4,
	};

	/** Viewport hints, written by the UI. */
	viewTop = 0;
	viewRows = 30;
	/** Scroll requests, consumed by the UI. */
	scrollRequest: "center" | "top" | "bottom" | null = null;
	scrollDelta = 0;

	private host: VimHost;
	private readonly eol: boolean;
	private savedText: string;
	private want = 0;
	private keepWant = false;
	private keys: string[] = [];
	private cmdKeys: string[] = [];
	private cmdCursor: Pos = { row: 0, col: 0 };
	private cmdVisual = false;
	private snap: Snapshot | null = null;
	private changed = false;
	private undoStack: Snapshot[] = [];
	private redoStack: Snapshot[] = [];
	private lastChange: string[] | null = null;
	private register: Register = { text: "", linewise: false };
	private lastFind: { kind: string; ch: string } | null = null;
	private search: { pattern: string; forward: boolean } | null = null;
	private hlActive = true;
	private lastVisual: { start: number; end: number } | null = null;
	private returnMode: Mode = "NORMAL";
	private insertCount = 1;
	private insertBuf = "";
	private insertStart: Pos = { row: 0, col: 0 };
	private autoIndented = false;
	private blockIns: {
		r0: number;
		r1: number;
		col: number;
		toEnd: boolean;
		pad: boolean;
	} | null = null;
	private macros = new Map<string, string[]>();
	private macroKeys: string[] = [];
	private lastMacro: string | undefined;
	private depth = 0;
	private replayingDot = false;
	private cmdHistory: Record<string, string[]> = { ":": [], "/": [] };
	private histIdx = -1;
	private reKey = "";
	private reVal: RegExp | null = null;

	constructor(text: string, host: VimHost) {
		this.host = host;
		this.eol = text.endsWith("\n");
		this.lines = (this.eol ? text.slice(0, -1) : text).split("\n");
		this.savedText = this.serialize();
		if (host.filePath) {
			this.message = host.isNew
				? `"${host.filePath}" [New]`
				: `"${host.filePath}"${host.readonly ? " [readonly]" : ""} ${this.lines.length}L, ${byteLength(text)}B`;
		}
	}

	/* ---------------- public API used by the UI ---------------- */

	get modified(): boolean {
		return this.serialize() !== this.savedText;
	}

	/** Pending keys of an unfinished command (showcmd). */
	get pending(): string {
		return this.keys.map((k) => (k === " " ? "␣" : k)).join("");
	}

	get percent(): string {
		const last = this.lines.length - 1;
		if (last <= 0) return "All";
		if (this.row === 0) return "Top";
		if (this.row === last) return "Bot";
		return `${Math.round((this.row / last) * 100)}%`;
	}

	/** Returns false when the key should be left to the browser. */
	handleKey(key: string): boolean {
		if (this.showHelp) {
			this.showHelp = false;
			this.version++;
			return true;
		}
		if (
			key === "<C-v>" &&
			(this.mode === "INSERT" ||
				this.mode === "COMMAND" ||
				this.mode === "SEARCH")
		)
			return false;
		if (/^<C-.>$/.test(key) && !CTRL_OK.has(key)) return false;
		try {
			this.feed(key);
		} catch (e) {
			this.keys = [];
			this.cmdKeys = [];
			this.snap = null;
			this.changed = false;
			this.mode = "NORMAL";
			this.err(`E000: ${e instanceof Error ? e.message : String(e)}`);
			this.fixCursor();
			this.version++;
		}
		return true;
	}

	/** Clipboard paste from the browser. */
	pasteText(text: string): boolean {
		const clean = text.replace(/\r\n?/g, "\n");
		if (this.mode === "INSERT") {
			this.beforeEdit();
			this.autoIndented = false;
			this.spliceText(clean);
			this.insertBuf = "";
			this.version++;
			return true;
		}
		if (this.mode === "COMMAND" || this.mode === "SEARCH") {
			this.cmdline += clean.split("\n")[0];
			this.version++;
			return true;
		}
		return false;
	}

	/** Selected column range [from, to) for a row, or null. `to` may be len+1 to include the line break. */
	selectedCols(row: number): [number, number] | null {
		if (!this.isVisual()) return null;
		if (this.mode === "V-BLOCK") {
			const r = this.blockRect();
			if (row < r.r0 || row > r.r1) return null;
			const len = this.lines[row].length;
			if (r.c0 > len) return null;
			return [r.c0, r.toEnd ? len + 1 : Math.min(r.c1 + 1, len + 1)];
		}
		let a = this.anchor;
		let b: Pos = { row: this.row, col: this.col };
		if (cmp(a, b) > 0) [a, b] = [b, a];
		if (row < a.row || row > b.row) return null;
		const len = this.lines[row].length;
		if (this.mode === "V-LINE") return [0, len + 1];
		const from = row === a.row ? a.col : 0;
		const to = row === b.row ? b.col + 1 : len + 1;
		return [from, to];
	}

	matchesInLine(row: number): [number, number][] {
		if (!this.hlActive || !this.options.hlsearch || !this.search) return [];
		const re = this.compile(this.search.pattern);
		if (!re) return [];
		const out: [number, number][] = [];
		const line = this.lines[row];
		re.lastIndex = 0;
		let m: RegExpExecArray | null = re.exec(line);
		while (m) {
			if (m[0].length === 0) re.lastIndex++;
			else out.push([m.index, m.index + m[0].length]);
			m = re.exec(line);
		}
		return out;
	}

	/** Full text as it would be written to disk. */
	serialize(): string {
		return this.lines.join("\n") + (this.eol ? "\n" : "");
	}

	/* ---------------- key pipeline ---------------- */

	private isVisual() {
		return (
			this.mode === "VISUAL" ||
			this.mode === "V-LINE" ||
			this.mode === "V-BLOCK"
		);
	}

	private info(msg: string) {
		this.message = msg;
		this.error = false;
	}

	private err(msg: string) {
		this.message = msg;
		this.error = true;
	}

	private feed(key: string) {
		if (this.recording !== null && this.depth === 0) this.macroKeys.push(key);
		this.cmdKeys.push(key);
		if (this.cmdKeys.length === 1) {
			this.cmdCursor = { row: this.row, col: this.col };
			this.cmdVisual = this.isVisual();
			if (this.mode === "NORMAL" || this.isVisual()) {
				this.message = "";
				this.error = false;
			}
		}
		this.keepWant = false;

		switch (this.mode) {
			case "INSERT":
				this.insertKey(key);
				break;
			case "COMMAND":
			case "SEARCH":
				this.cmdlineKey(key);
				break;
			default:
				this.normalKey(key);
		}

		this.fixCursor();
		if (!this.keepWant) this.want = this.col;
		this.finishCommand();
		this.version++;
	}

	private finishCommand() {
		if (
			this.mode === "INSERT" ||
			this.mode === "COMMAND" ||
			this.mode === "SEARCH" ||
			this.keys.length > 0
		) {
			return;
		}
		if (this.snap) {
			this.undoStack.push(this.snap);
			if (this.undoStack.length > 500) this.undoStack.shift();
			this.redoStack = [];
			this.snap = null;
		}
		if (
			this.changed &&
			!this.replayingDot &&
			!this.cmdVisual &&
			this.cmdKeys[0] !== ":"
		) {
			this.lastChange = this.cmdKeys;
		}
		this.cmdKeys = [];
		this.changed = false;
	}

	private maxCol(row: number) {
		const len = this.lines[row].length;
		return this.mode === "INSERT" ? len : Math.max(0, len - 1);
	}

	private fixCursor() {
		this.row = clamp(this.row, 0, this.lines.length - 1);
		this.col = clamp(this.col, 0, this.maxCol(this.row));
	}

	private firstNonBlank(row: number) {
		const line = this.lines[row];
		const m = line.search(/\S/);
		return m < 0 ? Math.max(0, line.length - 1) : m;
	}

	/** Call before every buffer mutation: records the undo snapshot once per command. */
	private beforeEdit() {
		if (!this.snap) {
			this.snap = {
				lines: this.lines.slice(),
				row: this.cmdCursor.row,
				col: this.cmdCursor.col,
			};
		}
		this.changed = true;
	}

	/* ---------------- normal / visual parsing ---------------- */

	private normalKey(key: string) {
		this.keys.push(key);
		const res = this.parse(this.keys);
		if (res === "incomplete") {
			this.keepWant = true;
			return;
		}
		this.keys = [];
		if (res === "invalid") return;
		switch (res.type) {
			case "motion":
				this.doMotion(res);
				break;
			case "op":
				this.doOperator(res);
				break;
			case "cmd":
				this.doCommand(res);
				break;
			case "vobj":
				this.doVisualObject(res);
				break;
		}
	}

	private parse(buf: string[]): Parsed | "incomplete" | "invalid" {
		const visual = this.isVisual();
		let i = 0;
		const readCount = () => {
			let s = "";
			while (
				i < buf.length &&
				/^[0-9]$/.test(buf[i]) &&
				(s !== "" || buf[i] !== "0")
			) {
				s += buf[i++];
			}
			return s ? Number.parseInt(s, 10) : undefined;
		};
		const count = readCount();
		if (i >= buf.length) return "incomplete";
		const k = buf[i++];

		const alias = ALIASES.get(k);
		if (!visual && alias) {
			return this.parse([...buf.slice(0, i - 1), ...alias, ...buf.slice(i)]);
		}

		const motionAt = (m: string): MotionSpec | "incomplete" | "invalid" => {
			if (m === "g") {
				if (i >= buf.length) return "incomplete";
				return buf[i++] === "g" ? { motion: "gg" } : "invalid";
			}
			if (m === "f" || m === "F" || m === "t" || m === "T") {
				if (i >= buf.length) return "incomplete";
				return { motion: m, arg: buf[i++] };
			}
			return MOTIONS.has(m) ? { motion: m } : "invalid";
		};

		if (!visual && OPS.has(k)) {
			const count2 = readCount();
			if (i >= buf.length) return "incomplete";
			const m = buf[i++];
			const total = mul(count, count2);
			if (m === k) {
				return { type: "op", op: k, count: total, target: { kind: "line" } };
			}
			if (m === "i" || m === "a") {
				if (i >= buf.length) return "incomplete";
				return {
					type: "op",
					op: k,
					count: total,
					target: { kind: "obj", which: m, obj: buf[i++] },
				};
			}
			const spec = motionAt(m);
			if (typeof spec === "string") return spec;
			return {
				type: "op",
				op: k,
				count: total,
				target: { kind: "motion", spec },
			};
		}

		if (visual && (k === "i" || k === "a")) {
			if (i >= buf.length) return "incomplete";
			return { type: "vobj", which: k, obj: buf[i++] };
		}

		if (k === "g" || "fFtT".includes(k) || MOTIONS.has(k)) {
			if (
				k.length === 1 &&
				!"fFtT".includes(k) &&
				k !== "g" &&
				!MOTIONS.has(k)
			) {
				return "invalid";
			}
			const spec = motionAt(k);
			if (typeof spec === "string") return spec;
			return { type: "motion", count, spec };
		}

		if (
			k === "r" ||
			k === "z" ||
			k === "Z" ||
			k === "@" ||
			(k === "q" && this.recording === null)
		) {
			if (i >= buf.length) return "incomplete";
			return { type: "cmd", name: k, count, arg: buf[i++] };
		}
		if (CMD_SIMPLE.has(k)) return { type: "cmd", name: k, count };
		return "invalid";
	}

	private doMotion(p: MotionParsed) {
		const r = this.runMotion(p.spec, p.count, false);
		if (!r) return;
		this.row = r.pos.row;
		this.col = r.pos.col;
		if (r.want !== undefined) {
			this.want = r.want;
			this.keepWant = true;
		}
		if (r.vertical) this.keepWant = true;
	}

	/* ---------------- motions ---------------- */

	private runMotion(
		spec: MotionSpec,
		count: number | undefined,
		forOp: boolean,
		stay = false,
	): MotionResult | null {
		const n = count ?? 1;
		const { row, col } = this;
		const line = this.lines[row];
		const last = this.lines.length - 1;
		const at = (r: number, c: number): MotionResult => ({
			pos: { row: r, col: c },
		});

		switch (spec.motion) {
			case "h":
			case "<Left>":
			case "<BS>":
				return col === 0 ? null : at(row, Math.max(0, col - n));
			case "l":
			case "<Right>":
			case " ": {
				const lim = forOp ? line.length : Math.max(0, line.length - 1);
				return col >= lim ? null : at(row, Math.min(lim, col + n));
			}
			case "j":
			case "<Down>":
				if (row >= last) return null;
				return {
					pos: { row: Math.min(last, row + n), col: this.want },
					linewise: true,
					vertical: true,
				};
			case "k":
			case "<Up>":
				if (row <= 0) return null;
				return {
					pos: { row: Math.max(0, row - n), col: this.want },
					linewise: true,
					vertical: true,
				};
			case "0":
			case "<Home>":
				return at(row, 0);
			case "^":
				return at(row, this.firstNonBlank(row));
			case "$":
			case "<End>": {
				const r = Math.min(last, row + n - 1);
				return {
					pos: { row: r, col: Math.max(0, this.lines[r].length - 1) },
					inclusive: true,
					want: Number.POSITIVE_INFINITY,
				};
			}
			case "w":
			case "W":
				return { pos: this.wordForward(n, spec.motion === "W", forOp) };
			case "e":
			case "E": {
				const p = this.wordEnd(n, spec.motion === "E", stay);
				return p ? { pos: p, inclusive: true } : null;
			}
			case "b":
			case "B": {
				const p = this.wordBack(n, spec.motion === "B");
				return p ? { pos: p } : null;
			}
			case "gg":
			case "G": {
				const def = spec.motion === "gg" ? 0 : last;
				const r = count === undefined ? def : clamp(count - 1, 0, last);
				return {
					pos: { row: r, col: this.firstNonBlank(r) },
					linewise: true,
				};
			}
			case "{":
			case "}": {
				const p = this.paragraph(n, spec.motion === "}");
				return p ? { pos: p } : null;
			}
			case "f":
			case "F":
			case "t":
			case "T": {
				const p = this.findChar(spec.motion, spec.arg ?? "", n, false);
				if (!p) return null;
				this.lastFind = { kind: spec.motion, ch: spec.arg ?? "" };
				return {
					pos: p,
					inclusive: spec.motion === "f" || spec.motion === "t",
				};
			}
			case ";":
			case ",": {
				if (!this.lastFind) return null;
				let kind = this.lastFind.kind;
				if (spec.motion === ",") {
					const flip: Record<string, string> = {
						f: "F",
						F: "f",
						t: "T",
						T: "t",
					};
					kind = flip[kind] ?? kind;
				}
				const p = this.findChar(kind, this.lastFind.ch, n, true);
				return p ? { pos: p, inclusive: kind === "f" || kind === "t" } : null;
			}
			case "%": {
				const p = this.matchBracket();
				return p ? { pos: p, inclusive: true } : null;
			}
			case "n":
			case "N": {
				const p = this.searchMotion(spec.motion === "n", n);
				return p ? { pos: p } : null;
			}
			case "*":
			case "#": {
				const p = this.starSearch(spec.motion === "*", n);
				return p ? { pos: p } : null;
			}
			case "H":
			case "M":
			case "L": {
				const top = clamp(this.viewTop, 0, last);
				const bottom = Math.min(last, top + this.viewRows - 1);
				const r =
					spec.motion === "H"
						? Math.min(bottom, top + n - 1)
						: spec.motion === "L"
							? Math.max(top, bottom - n + 1)
							: Math.floor((top + bottom) / 2);
				return {
					pos: { row: r, col: this.firstNonBlank(r) },
					linewise: true,
				};
			}
		}
		return null;
	}

	private wordForward(n: number, big: boolean, forOp: boolean): Pos {
		let { row, col } = this;
		const last = this.lines.length - 1;
		for (let i = 0; i < n; i++) {
			const line = this.lines[row];
			if (col < line.length) {
				const c0 = cls(line[col], big);
				if (c0 !== 0) {
					while (col < line.length && cls(line[col], big) === c0) col++;
				}
			}
			const endRow = row;
			for (;;) {
				const l = this.lines[row];
				if (col >= l.length) {
					if (row === last) return { row, col: l.length };
					row++;
					col = 0;
					if (this.lines[row].length === 0) break;
					continue;
				}
				if (cls(l[col], big) === 0) {
					col++;
					continue;
				}
				break;
			}
			// `dw` on the last word of a line stops at the end of that line
			if (forOp && i === n - 1 && row > endRow) {
				return { row: endRow, col: this.lines[endRow].length };
			}
		}
		return { row, col };
	}

	private wordEnd(n: number, big: boolean, stay: boolean): Pos | null {
		const start: Pos = { row: this.row, col: this.col };
		let p = { ...start };
		const ch = (q: Pos) => this.lines[q.row][q.col];
		const next = (q: Pos): Pos | null => {
			if (q.col + 1 < this.lines[q.row].length)
				return { row: q.row, col: q.col + 1 };
			if (q.row < this.lines.length - 1) return { row: q.row + 1, col: 0 };
			return null;
		};
		const runEnd = (q: Pos): Pos => {
			const c0 = cls(ch(q), big);
			const len = this.lines[q.row].length;
			let c = q.col;
			while (c + 1 < len && cls(this.lines[q.row][c + 1], big) === c0) c++;
			return { row: q.row, col: c };
		};
		for (let i = 0; i < n; i++) {
			if (i === 0 && stay && cls(ch(p), big) !== 0) {
				p = runEnd(p);
				continue;
			}
			let q = next(p);
			while (q && (this.lines[q.row].length === 0 || cls(ch(q), big) === 0)) {
				q = next(q);
			}
			if (!q) return cmp(p, start) === 0 ? null : p;
			p = runEnd(q);
		}
		return p;
	}

	private wordBack(n: number, big: boolean): Pos | null {
		let p: Pos = { row: this.row, col: this.col };
		const prev = (q: Pos): Pos | null => {
			if (q.col > 0) return { row: q.row, col: q.col - 1 };
			if (q.row > 0) {
				return {
					row: q.row - 1,
					col: Math.max(0, this.lines[q.row - 1].length - 1),
				};
			}
			return null;
		};
		for (let i = 0; i < n; i++) {
			let q = prev(p);
			if (!q) return i === 0 ? null : p;
			while (
				this.lines[q.row].length > 0 &&
				cls(this.lines[q.row][q.col], big) === 0
			) {
				const pq = prev(q);
				if (!pq) return { row: 0, col: 0 };
				q = pq;
			}
			if (this.lines[q.row].length > 0) {
				const c0 = cls(this.lines[q.row][q.col], big);
				while (q.col > 0 && cls(this.lines[q.row][q.col - 1], big) === c0)
					q.col--;
			}
			p = q;
		}
		return p;
	}

	private paragraph(n: number, forward: boolean): Pos | null {
		const last = this.lines.length - 1;
		const d = forward ? 1 : -1;
		let r = this.row;
		for (let i = 0; i < n; i++) {
			while (r >= 0 && r <= last && this.lines[r].length === 0) r += d;
			while (r >= 0 && r <= last && this.lines[r].length !== 0) r += d;
			if (r < 0) return { row: 0, col: 0 };
			if (r > last) return { row: last, col: this.lines[last].length };
		}
		return { row: r, col: 0 };
	}

	private findChar(
		kind: string,
		ch: string,
		n: number,
		repeat: boolean,
	): Pos | null {
		const line = this.lines[this.row];
		const fwd = kind === "f" || kind === "t";
		const till = kind === "t" || kind === "T";
		let from = this.col;
		for (let i = 0; i < n; i++) {
			const skip =
				i === 0 && repeat && till && line[from + (fwd ? 1 : -1)] === ch ? 1 : 0;
			const startAt = fwd ? from + 1 + skip : from - 1 - skip;
			const idx = fwd
				? line.indexOf(ch, startAt)
				: startAt < 0
					? -1
					: line.lastIndexOf(ch, startAt);
			if (idx < 0) return null;
			from = idx;
		}
		const target = kind === "t" ? from - 1 : kind === "T" ? from + 1 : from;
		return { row: this.row, col: target };
	}

	private matchBracket(): Pos | null {
		const pairs = "()[]{}";
		const line = this.lines[this.row];
		let c = this.col;
		while (c < line.length && !pairs.includes(line[c])) c++;
		if (c >= line.length) return null;
		const ch = line[c];
		const idx = pairs.indexOf(ch);
		const open = idx % 2 === 0;
		const other = pairs[open ? idx + 1 : idx - 1];
		const dir = open ? 1 : -1;
		let depth = 0;
		let r = this.row;
		for (;;) {
			const l = this.lines[r];
			if (c >= 0 && c < l.length) {
				const x = l[c];
				if (x === ch) depth++;
				else if (x === other && --depth === 0) return { row: r, col: c };
			}
			c += dir;
			if (c < 0 || c >= l.length) {
				r += dir;
				if (r < 0 || r >= this.lines.length) return null;
				c = dir > 0 ? 0 : this.lines[r].length - 1;
			}
		}
	}

	/* ---------------- search ---------------- */

	private compile(pattern: string): RegExp | null {
		if (!pattern) return null;
		const key = `${pattern}\u0000${this.options.ignorecase}${this.options.smartcase}`;
		if (this.reKey === key) return this.reVal;
		const ic =
			this.options.ignorecase &&
			!(this.options.smartcase && /[A-Z]/.test(pattern));
		let re: RegExp;
		try {
			re = new RegExp(pattern, ic ? "gi" : "g");
		} catch {
			re = new RegExp(escapeRe(pattern), ic ? "gi" : "g");
		}
		this.reKey = key;
		this.reVal = re;
		return re;
	}

	private findMatch(
		pattern: string,
		from: Pos,
		forward: boolean,
	): { pos: Pos; wrapped: boolean } | null {
		const re = this.compile(pattern);
		if (!re) return null;
		const n = this.lines.length;
		const starts = (row: number): number[] => {
			const out: number[] = [];
			const line = this.lines[row];
			re.lastIndex = 0;
			let m: RegExpExecArray | null = re.exec(line);
			while (m) {
				out.push(m.index);
				if (m[0].length === 0) re.lastIndex++;
				m = re.exec(line);
			}
			return out;
		};
		for (let k = 0; k <= n; k++) {
			const raw = from.row + (forward ? k : -k);
			const wrapped = raw < 0 || raw >= n;
			if (wrapped && !this.options.wrapscan) return null;
			const row = ((raw % n) + n) % n;
			const cols = starts(row);
			let c: number | undefined;
			if (forward) {
				c =
					k === 0
						? cols.find((x) => x > from.col)
						: k === n
							? cols.find((x) => x <= from.col)
							: cols[0];
			} else {
				const rev = [...cols].reverse();
				c =
					k === 0
						? rev.find((x) => x < from.col)
						: k === n
							? rev.find((x) => x >= from.col)
							: rev[0];
			}
			if (c !== undefined) return { pos: { row, col: c }, wrapped };
		}
		return null;
	}

	private searchMotion(sameDir: boolean, n: number, from?: Pos): Pos | null {
		if (!this.search) {
			this.err("E35: No previous regular expression");
			return null;
		}
		const dir = sameDir ? this.search.forward : !this.search.forward;
		let cur: Pos = from ?? { row: this.row, col: this.col };
		let found: Pos | null = null;
		let wrapped = false;
		for (let i = 0; i < n; i++) {
			const r = this.findMatch(this.search.pattern, cur, dir);
			if (!r) {
				this.err(`E486: Pattern not found: ${this.search.pattern}`);
				return null;
			}
			found = r.pos;
			cur = r.pos;
			wrapped = wrapped || r.wrapped;
		}
		this.hlActive = true;
		this.info(
			wrapped
				? dir
					? "search hit BOTTOM, continuing at TOP"
					: "search hit TOP, continuing at BOTTOM"
				: `${dir ? "/" : "?"}${this.search.pattern}`,
		);
		return found;
	}

	private starSearch(forward: boolean, n: number): Pos | null {
		const line = this.lines[this.row];
		const re = /[\p{L}\p{N}_]+/gu;
		let word: RegExpExecArray | null = null;
		let m: RegExpExecArray | null = re.exec(line);
		while (m) {
			if (m.index + m[0].length > this.col) {
				word = m;
				break;
			}
			m = re.exec(line);
		}
		if (!word) {
			this.err("E348: No string under cursor");
			return null;
		}
		this.search = { pattern: `\\b${escapeRe(word[0])}\\b`, forward };
		return this.searchMotion(true, n, { row: this.row, col: word.index });
	}

	/* ---------------- operators ---------------- */

	private doOperator(p: OpParsed) {
		let range: Range | null = null;
		const last = this.lines.length - 1;
		if (p.target.kind === "line") {
			const n = p.count ?? 1;
			range = mk(this.row, 0, Math.min(last, this.row + n - 1), 0, true);
		} else if (p.target.kind === "obj") {
			range = this.textObject(p.target.which, p.target.obj);
		} else {
			let motion = p.target.spec.motion;
			let stay = false;
			if (p.op === "c" && (motion === "w" || motion === "W")) {
				const ch = this.lines[this.row][this.col];
				if (ch !== undefined && !/\s/.test(ch)) {
					motion = motion === "w" ? "e" : "E";
					stay = true;
				}
			}
			const r = this.runMotion(
				{ motion, arg: p.target.spec.arg },
				p.count,
				true,
				stay,
			);
			if (r) range = this.motionToRange(r);
		}
		if (range) this.applyOp(p.op, range, 1);
	}

	private motionToRange(r: MotionResult): Range {
		let a: Pos = { row: this.row, col: this.col };
		let b = r.pos;
		if (cmp(b, a) < 0) [a, b] = [b, a];
		if (r.linewise) return mk(a.row, 0, b.row, 0, true);
		let end: Pos = { ...b };
		if (r.inclusive) {
			end.col = Math.min(this.lines[b.row].length, b.col + 1);
		} else if (end.col === 0 && end.row > a.row) {
			if (a.col <= Math.max(0, this.lines[a.row].search(/\S|$/))) {
				return mk(a.row, 0, end.row - 1, 0, true);
			}
			end = { row: end.row - 1, col: this.lines[end.row - 1].length };
		}
		return { start: a, end, linewise: false };
	}

	private rangeText(r: Range): string {
		if (r.linewise)
			return this.lines.slice(r.start.row, r.end.row + 1).join("\n");
		if (r.start.row === r.end.row) {
			return this.lines[r.start.row].slice(r.start.col, r.end.col);
		}
		const parts = [this.lines[r.start.row].slice(r.start.col)];
		for (let i = r.start.row + 1; i < r.end.row; i++) parts.push(this.lines[i]);
		parts.push((this.lines[r.end.row] ?? "").slice(0, r.end.col));
		return parts.join("\n");
	}

	private yankRange(r: Range) {
		const text = this.rangeText(r);
		if (!r.linewise && text === "") return;
		this.register = { text, linewise: r.linewise };
		this.host.yank?.(r.linewise ? `${text}\n` : text);
		const n = r.end.row - r.start.row + 1;
		if (r.linewise && n > 2) this.info(`${n} lines yanked`);
	}

	private deleteRange(r: Range) {
		this.beforeEdit();
		if (r.linewise) {
			const n = r.end.row - r.start.row + 1;
			this.lines.splice(r.start.row, n);
			if (this.lines.length === 0) this.lines.push("");
			this.row = Math.min(r.start.row, this.lines.length - 1);
			this.col = this.firstNonBlank(this.row);
			if (n > 2) this.info(`${n} fewer lines`);
		} else {
			const head = this.lines[r.start.row].slice(0, r.start.col);
			const tail = (this.lines[r.end.row] ?? "").slice(r.end.col);
			this.lines.splice(r.start.row, r.end.row - r.start.row + 1, head + tail);
			this.row = r.start.row;
			this.col = r.start.col;
		}
	}

	private applyOp(op: string, r: Range, times: number) {
		switch (op) {
			case "y":
				this.yankRange(r);
				if (r.linewise) this.row = Math.min(this.row, r.start.row);
				else {
					this.row = r.start.row;
					this.col = r.start.col;
				}
				break;
			case "d":
				this.yankRange(r);
				this.deleteRange(r);
				break;
			case "c":
				this.yankRange(r);
				if (r.linewise) {
					this.beforeEdit();
					const indent = this.options.autoindent
						? leadingWs(this.lines[r.start.row])
						: "";
					this.lines.splice(r.start.row, r.end.row - r.start.row + 1, indent);
					this.row = r.start.row;
					this.col = indent.length;
					this.startInsert(1, indent.length > 0);
				} else {
					this.deleteRange(r);
					this.startInsert(1);
				}
				break;
			case ">":
			case "<":
				this.shiftRows(r.start.row, r.end.row, op === ">" ? 1 : -1, times);
				this.row = r.start.row;
				this.col = this.firstNonBlank(this.row);
				break;
		}
	}

	private shiftRows(from: number, to: number, dir: 1 | -1, times: number) {
		this.beforeEdit();
		const sw = this.options.shiftwidth;
		for (let r = from; r <= to; r++) {
			const line = this.lines[r];
			if (dir > 0) {
				if (line.length === 0) continue;
				const unit = this.options.expandtab
					? " ".repeat(sw * times)
					: "\t".repeat(times);
				this.lines[r] = unit + line;
			} else {
				let remove = sw * times;
				let i = 0;
				while (
					i < line.length &&
					remove > 0 &&
					(line[i] === " " || line[i] === "\t")
				) {
					remove -= line[i] === "\t" ? this.options.tabstop : 1;
					i++;
				}
				this.lines[r] = line.slice(i);
			}
		}
	}

	private transformRange(r: Range, fn: (s: string) => string) {
		this.beforeEdit();
		for (let row = r.start.row; row <= r.end.row; row++) {
			const line = this.lines[row];
			const from = r.linewise || row > r.start.row ? 0 : r.start.col;
			const to = r.linewise || row < r.end.row ? line.length : r.end.col;
			this.lines[row] =
				line.slice(0, from) + fn(line.slice(from, to)) + line.slice(to);
		}
		this.row = r.start.row;
		this.col = r.linewise ? this.col : r.start.col;
	}

	/* ---------------- text objects ---------------- */

	private textObject(which: string, obj: string): Range | null {
		const inner = which === "i";
		const { row, col } = this;
		const line = this.lines[row];
		switch (obj) {
			case "w":
			case "W": {
				const big = obj === "W";
				if (line.length === 0) return mk(row, 0, row, 0);
				const c = Math.min(col, line.length - 1);
				const c0 = cls(line[c], big);
				let s = c;
				let e = c + 1;
				while (s > 0 && cls(line[s - 1], big) === c0) s--;
				while (e < line.length && cls(line[e], big) === c0) e++;
				if (inner) return mk(row, s, row, e);
				if (c0 === 0) {
					let e2 = e;
					if (e2 < line.length) {
						const c1 = cls(line[e2], big);
						while (e2 < line.length && cls(line[e2], big) === c1) e2++;
					}
					return mk(row, s, row, e2);
				}
				let e2 = e;
				while (e2 < line.length && cls(line[e2], big) === 0) e2++;
				if (e2 > e) return mk(row, s, row, e2);
				let s2 = s;
				while (s2 > 0 && cls(line[s2 - 1], big) === 0) s2--;
				return mk(row, s2, row, e);
			}
			case '"':
			case "'":
			case "`":
				return this.quoteObject(obj, inner);
			case "(":
			case ")":
			case "b":
				return this.bracketObject("(", ")", inner);
			case "[":
			case "]":
				return this.bracketObject("[", "]", inner);
			case "{":
			case "}":
			case "B":
				return this.bracketObject("{", "}", inner);
			case "<":
			case ">":
				return this.bracketObject("<", ">", inner);
			case "p":
				return this.paragraphObject(inner);
		}
		return null;
	}

	private quoteObject(q: string, inner: boolean): Range | null {
		const line = this.lines[this.row];
		const idx: number[] = [];
		for (let i = 0; i < line.length; i++) {
			if (line[i] === "\\") {
				i++;
				continue;
			}
			if (line[i] === q) idx.push(i);
		}
		let pair: [number, number] | null = null;
		for (let i = 0; i + 1 < idx.length; i += 2) {
			if (this.col <= idx[i + 1]) {
				pair = [idx[i], idx[i + 1]];
				break;
			}
		}
		if (!pair) return null;
		const [a, b] = pair;
		const r = this.row;
		if (inner) return mk(r, a + 1, r, b);
		let e = b + 1;
		while (e < line.length && /\s/.test(line[e])) e++;
		if (e > b + 1) return mk(r, a, r, e);
		let s = a;
		while (s > 0 && /\s/.test(line[s - 1])) s--;
		return mk(r, s, r, b + 1);
	}

	private bracketObject(
		open: string,
		close: string,
		inner: boolean,
	): Range | null {
		let r = this.row;
		let c = Math.min(this.col, this.lines[r].length - 1);
		let depth = 0;
		let start: Pos | null = null;
		search: for (;;) {
			const l = this.lines[r];
			for (; c >= 0; c--) {
				const ch = l[c];
				if (ch === close && !(r === this.row && c === this.col)) depth++;
				else if (ch === open) {
					if (depth === 0) {
						start = { row: r, col: c };
						break search;
					}
					depth--;
				}
			}
			r--;
			if (r < 0) break;
			c = this.lines[r].length - 1;
		}
		if (!start) return null;

		let end: Pos | null = null;
		depth = 0;
		r = start.row;
		c = start.col + 1;
		find: for (;;) {
			const l = this.lines[r];
			for (; c < l.length; c++) {
				const ch = l[c];
				if (ch === open) depth++;
				else if (ch === close) {
					if (depth === 0) {
						end = { row: r, col: c };
						break find;
					}
					depth--;
				}
			}
			r++;
			if (r >= this.lines.length) break;
			c = 0;
		}
		if (!end) return null;
		if (!inner) return mk(start.row, start.col, end.row, end.col + 1);

		let s: Pos = { row: start.row, col: start.col + 1 };
		let e: Pos = { ...end };
		if (s.col >= this.lines[s.row].length && s.row < e.row) {
			s = { row: s.row + 1, col: 0 };
		}
		if (
			e.row > s.row - (s.col === 0 ? 0 : 1) &&
			e.row > start.row &&
			/^\s*$/.test(this.lines[e.row].slice(0, e.col))
		) {
			if (s.col === 0) {
				if (e.row - 1 < s.row) return mk(s.row, 0, s.row, 0);
				return mk(s.row, 0, e.row - 1, 0, true);
			}
			e = { row: e.row - 1, col: this.lines[e.row - 1].length };
		}
		return { start: s, end: e, linewise: false };
	}

	private paragraphObject(inner: boolean): Range {
		const blank = (r: number) => this.lines[r].trim() === "";
		const last = this.lines.length - 1;
		const b0 = blank(this.row);
		let s = this.row;
		let e = this.row;
		while (s > 0 && blank(s - 1) === b0) s--;
		while (e < last && blank(e + 1) === b0) e++;
		if (!inner) {
			if (e < last) {
				const b1 = blank(e + 1);
				e++;
				while (e < last && blank(e + 1) === b1) e++;
			} else if (!b0) {
				while (s > 0 && blank(s - 1)) s--;
			}
		}
		return mk(s, 0, e, 0, true);
	}

	private doVisualObject(p: VObjParsed) {
		const r = this.textObject(p.which, p.obj);
		if (!r) return;
		if (r.linewise) {
			this.anchor = { row: r.start.row, col: 0 };
			this.row = r.end.row;
			this.mode = "V-LINE";
		} else {
			this.anchor = { ...r.start };
			this.row = r.end.row;
			this.col = Math.max(0, r.end.col - 1);
		}
	}

	/* ---------------- commands ---------------- */

	private startInsert(count = 1, autoIndented = false) {
		this.mode = "INSERT";
		this.insertCount = count;
		this.insertBuf = "";
		this.insertStart = { row: this.row, col: this.col };
		this.autoIndented = autoIndented;
	}

	private doCommand(p: CmdParsed) {
		const n = p.count ?? 1;
		switch (p.name) {
			case "<C-d>":
			case "<C-u>":
			case "<C-f>":
			case "<C-b>":
				this.scroll(p.name);
				return;
		}
		if (this.isVisual()) {
			this.doVisual(p);
			return;
		}
		const last = this.lines.length - 1;
		switch (p.name) {
			case "i":
				this.startInsert(n);
				return;
			case "a":
				if (this.lines[this.row].length > 0) this.col++;
				this.startInsert(n);
				return;
			case "I": {
				const m = this.lines[this.row].search(/\S/);
				this.col = m < 0 ? this.lines[this.row].length : m;
				this.startInsert(n);
				return;
			}
			case "A":
				this.col = this.lines[this.row].length;
				this.startInsert(n);
				return;
			case "o":
			case "O": {
				this.beforeEdit();
				const indent = this.options.autoindent
					? leadingWs(this.lines[this.row])
					: "";
				const at = p.name === "o" ? this.row + 1 : this.row;
				this.lines.splice(at, 0, indent);
				this.row = at;
				this.col = indent.length;
				this.startInsert(1, indent.length > 0);
				return;
			}
			case "p":
			case "P":
				if (!this.register.text && !this.register.linewise) {
					this.err('E353: Nothing in register "');
					return;
				}
				this.pasteReg(this.register, p.name === "P", n);
				return;
			case "u":
				for (let i = 0; i < n; i++) if (!this.undo()) break;
				return;
			case "<C-r>":
				for (let i = 0; i < n; i++) if (!this.redo()) break;
				return;
			case ".": {
				const ks = this.lastChange;
				if (!ks) return;
				this.replayingDot = true;
				this.depth++;
				try {
					for (const k of ks) this.feed(k);
				} finally {
					this.depth--;
					this.replayingDot = false;
				}
				return;
			}
			case "J":
				this.joinLines(this.row, Math.max(2, n));
				return;
			case "~": {
				const line = this.lines[this.row];
				if (line.length === 0) return;
				this.beforeEdit();
				const seg = line.slice(this.col, this.col + n);
				this.lines[this.row] =
					line.slice(0, this.col) + swapCase(seg) + line.slice(this.col + n);
				this.col = Math.min(this.col + n, line.length - 1);
				return;
			}
			case "r": {
				const ch = p.arg ?? "";
				if (isSpecial(ch) && ch !== "<CR>") return;
				const line = this.lines[this.row];
				if (this.col + n > line.length) return;
				this.beforeEdit();
				if (ch === "<CR>") {
					this.lines.splice(
						this.row,
						1,
						line.slice(0, this.col),
						line.slice(this.col + n),
					);
					this.row++;
					this.col = 0;
					return;
				}
				this.lines[this.row] =
					line.slice(0, this.col) + ch.repeat(n) + line.slice(this.col + n);
				this.col += n - 1;
				return;
			}
			case "v":
			case "V":
			case "<C-v>":
				this.anchor = { row: this.row, col: this.col };
				this.mode =
					p.name === "v" ? "VISUAL" : p.name === "V" ? "V-LINE" : "V-BLOCK";
				return;
			case ":":
				this.openCmdline(":");
				return;
			case "/":
			case "?":
				this.openCmdline(p.name);
				return;
			case "Z":
				if (p.arg === "Z") this.runEx("x");
				else if (p.arg === "Q") this.runEx("q!");
				return;
			case "z":
				if (p.arg === "z" || p.arg === ".") this.scrollRequest = "center";
				else if (p.arg === "t" || p.arg === "<CR>") this.scrollRequest = "top";
				else if (p.arg === "b" || p.arg === "-") this.scrollRequest = "bottom";
				return;
			case "q":
				if (this.recording !== null) {
					this.macros.set(this.recording, this.macroKeys.slice(0, -1));
					this.info("");
					this.recording = null;
				} else if (p.arg && /^[a-z]$/.test(p.arg)) {
					this.recording = p.arg;
					this.macroKeys = [];
				}
				return;
			case "@": {
				let reg = p.arg;
				if (reg === "@") reg = this.lastMacro;
				const ks = reg ? this.macros.get(reg) : undefined;
				if (!reg || !ks) {
					this.err("E748: No previously used register");
					return;
				}
				this.lastMacro = reg;
				if (this.depth > 20) return;
				this.depth++;
				try {
					for (let i = 0; i < n; i++) for (const k of ks) this.feed(k);
				} finally {
					this.depth--;
				}
				return;
			}
		}
		void last;
	}

	private scroll(name: string) {
		const half = Math.max(1, Math.floor(this.viewRows / 2));
		const page = Math.max(1, this.viewRows - 2);
		const amt = name === "<C-d>" || name === "<C-u>" ? half : page;
		const dir = name === "<C-d>" || name === "<C-f>" ? 1 : -1;
		const target = clamp(this.row + dir * amt, 0, this.lines.length - 1);
		this.scrollDelta += target - this.row;
		this.row = target;
		this.col = this.want;
		this.keepWant = true;
	}

	private pasteReg(reg: Register, before: boolean, n: number) {
		this.beforeEdit();
		if (reg.block) {
			this.pasteBlock(reg, before, n);
			return;
		}
		if (reg.linewise) {
			const ls = reg.text.split("\n");
			const all: string[] = [];
			for (let i = 0; i < n; i++) all.push(...ls);
			const at = before ? this.row : this.row + 1;
			this.lines.splice(at, 0, ...all);
			this.row = at;
			this.col = this.firstNonBlank(at);
			return;
		}
		const text = reg.text.repeat(n);
		const line = this.lines[this.row];
		const startRow = this.row;
		const at =
			before || line.length === 0
				? this.col
				: Math.min(line.length, this.col + 1);
		this.col = at;
		this.spliceText(text);
		if (text.includes("\n")) {
			this.row = startRow;
			this.col = at;
		} else {
			this.col = Math.max(at, this.col - 1);
		}
	}

	private joinLines(startRow: number, count: number) {
		const end = Math.min(this.lines.length - 1, startRow + count - 1);
		if (end <= startRow) return;
		this.beforeEdit();
		let cur = this.lines[startRow];
		let col = 0;
		for (let r = startRow + 1; r <= end; r++) {
			const next = this.lines[r].replace(/^\s+/, "");
			col = cur.length;
			const space =
				next.length > 0 &&
				cur.length > 0 &&
				!/\s$/.test(cur) &&
				!next.startsWith(")");
			cur += (space ? " " : "") + next;
		}
		this.lines.splice(startRow, end - startRow + 1, cur);
		this.row = startRow;
		this.col = col;
	}

	private undo(): boolean {
		const s = this.undoStack.pop();
		if (!s) {
			this.info("Already at oldest change");
			return false;
		}
		this.redoStack.push({ lines: this.lines.slice(), row: s.row, col: s.col });
		this.lines = s.lines.slice();
		this.row = s.row;
		this.col = s.col;
		return true;
	}

	private redo(): boolean {
		const s = this.redoStack.pop();
		if (!s) {
			this.info("Already at newest change");
			return false;
		}
		this.undoStack.push({ lines: this.lines.slice(), row: s.row, col: s.col });
		this.lines = s.lines.slice();
		this.row = s.row;
		this.col = s.col;
		return true;
	}

	/* ---------------- visual mode ---------------- */

	private selection(forceLine = false): Range {
		let a = this.anchor;
		let b: Pos = { row: this.row, col: this.col };
		if (cmp(a, b) > 0) [a, b] = [b, a];
		if (forceLine || this.mode === "V-LINE" || this.mode === "V-BLOCK") {
			return mk(a.row, 0, b.row, 0, true);
		}
		const lastRow = this.lines.length - 1;
		const len = this.lines[b.row].length;
		const end: Pos =
			b.col >= len && b.row < lastRow
				? { row: b.row + 1, col: 0 }
				: { row: b.row, col: Math.min(len, b.col + 1) };
		return { start: a, end, linewise: false };
	}

	private exitVisual() {
		const lo = Math.min(this.anchor.row, this.row);
		const hi = Math.max(this.anchor.row, this.row);
		this.lastVisual = { start: lo, end: hi };
		this.mode = "NORMAL";
	}

	private visualOp(op: string, forceLine = false, times = 1) {
		const sel = this.selection(forceLine);
		this.exitVisual();
		this.applyOp(op, sel, times);
	}

	private doVisual(p: CmdParsed) {
		const n = p.count ?? 1;
		if (this.mode === "V-BLOCK" && this.blockCommand(p, n)) return;
		switch (p.name) {
			case "<Esc>":
			case "<C-c>":
				this.exitVisual();
				return;
			case "v":
			case "V":
			case "<C-v>": {
				const target: Mode =
					p.name === "v" ? "VISUAL" : p.name === "V" ? "V-LINE" : "V-BLOCK";
				if (target === this.mode) this.exitVisual();
				else this.mode = target;
				return;
			}
			case "o":
			case "O": {
				const a = this.anchor;
				this.anchor = { row: this.row, col: this.col };
				this.row = a.row;
				this.col = a.col;
				return;
			}
			case ":":
				this.exitVisual();
				this.openCmdline(":", "'<,'>");
				return;
			case "/":
			case "?":
				this.openCmdline(p.name);
				return;
			case "d":
			case "x":
			case "<Del>":
				this.visualOp("d");
				return;
			case "y":
				this.visualOp("y");
				return;
			case "c":
			case "s":
				this.visualOp("c");
				return;
			case "X":
			case "D":
				this.visualOp("d", true);
				return;
			case "Y":
				this.visualOp("y", true);
				return;
			case "C":
			case "S":
			case "R":
				this.visualOp("c", true);
				return;
			case ">":
			case "<":
				this.visualOp(p.name, false, n);
				return;
			case "~":
			case "u":
			case "U": {
				const sel = this.selection();
				this.exitVisual();
				const fn =
					p.name === "~"
						? swapCase
						: p.name === "u"
							? (s: string) => s.toLowerCase()
							: (s: string) => s.toUpperCase();
				this.transformRange(sel, fn);
				return;
			}
			case "J": {
				const sel = this.selection();
				this.exitVisual();
				this.joinLines(
					sel.start.row,
					Math.max(2, sel.end.row - sel.start.row + 1),
				);
				return;
			}
			case "r": {
				const ch = p.arg ?? "";
				if (isSpecial(ch)) return;
				const sel = this.selection();
				this.exitVisual();
				this.transformRange(sel, (s) => s.replace(/./gsu, ch));
				return;
			}
			case "p":
			case "P":
				this.visualPaste(p.name === "p", n);
				return;
		}
	}

	private visualPaste(replaceRegister: boolean, n: number) {
		const reg = { ...this.register };
		if (!reg.text && !reg.linewise) {
			this.err('E353: Nothing in register "');
			return;
		}
		const sel = this.selection();
		this.exitVisual();
		const total = this.lines.length;
		if (replaceRegister) this.yankRange(sel);
		this.deleteRange(sel);
		if (sel.linewise) {
			const wholeBuffer = sel.end.row - sel.start.row + 1 === total;
			const atEnd = sel.end.row === total - 1;
			this.pasteReg({ text: reg.text, linewise: true }, !atEnd, n);
			if (wholeBuffer) {
				this.lines.pop();
				this.row = 0;
				this.col = this.firstNonBlank(0);
			}
			return;
		}
		if (reg.block) {
			this.row = sel.start.row;
			this.col = sel.start.col;
			this.pasteReg(reg, true, n);
			return;
		}
		if (reg.linewise) {
			const line = this.lines[this.row];
			const c = sel.start.col;
			const ls = reg.text.split("\n");
			this.lines.splice(this.row, 1, line.slice(0, c), ...ls, line.slice(c));
			this.row++;
			this.col = this.firstNonBlank(this.row);
			return;
		}
		this.row = sel.start.row;
		this.col = sel.start.col;
		const startRow = this.row;
		const startCol = this.col;
		const text = reg.text.repeat(n);
		this.spliceText(text);
		if (text.includes("\n")) {
			this.row = startRow;
			this.col = startCol;
		} else {
			this.col = Math.max(startCol, this.col - 1);
		}
	}

	/* ---------------- visual block ---------------- */

	private blockRect() {
		const a = this.anchor;
		return {
			r0: Math.min(a.row, this.row),
			r1: Math.max(a.row, this.row),
			c0: Math.min(a.col, this.col),
			c1: Math.max(a.col, this.col),
			toEnd: this.want === Number.POSITIVE_INFINITY,
		};
	}

	private blockSeg(
		row: number,
		r: { c0: number; c1: number; toEnd: boolean },
	): [number, number] {
		const len = this.lines[row].length;
		const from = Math.min(r.c0, len);
		const to = r.toEnd ? len : Math.min(len, r.c1 + 1);
		return [from, Math.max(from, to)];
	}

	private blockYank(r: ReturnType<VimEngine["blockRect"]>) {
		const rows: string[] = [];
		for (let i = r.r0; i <= r.r1; i++) {
			const [f, t] = this.blockSeg(i, r);
			rows.push(this.lines[i].slice(f, t));
		}
		const text = rows.join("\n");
		this.register = { text, linewise: false, block: true };
		this.host.yank?.(text);
	}

	private blockDelete(r: ReturnType<VimEngine["blockRect"]>) {
		this.beforeEdit();
		for (let i = r.r0; i <= r.r1; i++) {
			const [f, t] = this.blockSeg(i, r);
			this.lines[i] = this.lines[i].slice(0, f) + this.lines[i].slice(t);
		}
		this.row = r.r0;
		this.col = r.c0;
	}

	private blockMap(
		r: ReturnType<VimEngine["blockRect"]>,
		fn: (s: string) => string,
	) {
		this.beforeEdit();
		for (let i = r.r0; i <= r.r1; i++) {
			const [f, t] = this.blockSeg(i, r);
			const line = this.lines[i];
			this.lines[i] = line.slice(0, f) + fn(line.slice(f, t)) + line.slice(t);
		}
		this.row = r.r0;
		this.col = r.c0;
	}

	/** Returns true when the key was handled as a block operation. */
	private blockCommand(p: CmdParsed, n: number): boolean {
		const r = this.blockRect();
		switch (p.name) {
			case "d":
			case "x":
			case "<Del>":
			case "D":
				if (p.name === "D") r.toEnd = true;
				this.blockYank(r);
				this.exitVisual();
				this.blockDelete(r);
				return true;
			case "y":
				this.blockYank(r);
				this.exitVisual();
				this.row = r.r0;
				this.col = r.c0;
				return true;
			case "c":
			case "s":
			case "C":
				if (p.name === "C") r.toEnd = true;
				this.blockYank(r);
				this.exitVisual();
				this.blockDelete(r);
				this.startInsert(1);
				this.blockIns = {
					r0: r.r0,
					r1: r.r1,
					col: r.c0,
					toEnd: false,
					pad: false,
				};
				return true;
			case "I":
				this.exitVisual();
				this.row = r.r0;
				this.col = r.c0;
				this.startInsert(1);
				this.blockIns = {
					r0: r.r0,
					r1: r.r1,
					col: r.c0,
					toEnd: false,
					pad: false,
				};
				return true;
			case "A": {
				this.exitVisual();
				this.row = r.r0;
				if (r.toEnd) {
					this.col = this.lines[r.r0].length;
				} else {
					this.col = r.c1 + 1;
					if (this.lines[r.r0].length < this.col) {
						this.beforeEdit();
						this.lines[r.r0] = this.lines[r.r0].padEnd(this.col);
					}
				}
				this.startInsert(1);
				this.blockIns = {
					r0: r.r0,
					r1: r.r1,
					col: r.c1 + 1,
					toEnd: r.toEnd,
					pad: true,
				};
				return true;
			}
			case "~":
				this.exitVisual();
				this.blockMap(r, swapCase);
				return true;
			case "u":
				this.exitVisual();
				this.blockMap(r, (s) => s.toLowerCase());
				return true;
			case "U":
				this.exitVisual();
				this.blockMap(r, (s) => s.toUpperCase());
				return true;
			case "r": {
				const ch = p.arg ?? "";
				if (isSpecial(ch)) return true;
				this.exitVisual();
				this.blockMap(r, (s) => s.replace(/./gsu, ch));
				return true;
			}
			case "p":
			case "P": {
				const reg = { ...this.register };
				if (!reg.text && !reg.linewise) {
					this.err('E353: Nothing in register "');
					return true;
				}
				this.exitVisual();
				if (p.name === "p") this.blockYank(r);
				this.blockDelete(r);
				this.pasteReg(reg, true, n);
				return true;
			}
			case "O": {
				const c = this.anchor.col;
				this.anchor = { row: this.anchor.row, col: this.col };
				this.col = c;
				return true;
			}
		}
		return false;
	}

	private pasteBlock(reg: Register, before: boolean, n: number) {
		const rows = reg.text.split("\n");
		const width = Math.max(...rows.map((s) => s.length));
		const startRow = this.row;
		const line0 = this.lines[startRow];
		const col =
			before || line0.length === 0
				? this.col
				: Math.min(line0.length, this.col + 1);
		for (let i = 0; i < rows.length; i++) {
			const r = startRow + i;
			if (r >= this.lines.length) this.lines.push("");
			let line = this.lines[r];
			if (line.length < col) line = line.padEnd(col);
			const rest = line.slice(col);
			let piece = "";
			for (let k = 0; k < n; k++)
				piece += rows[i].padEnd(rest || k < n - 1 ? width : 0);
			this.lines[r] = line.slice(0, col) + piece + rest;
		}
		this.row = startRow;
		this.col = col;
	}

	/** After I / A / c in block mode: copy the typed text to the other block rows. */
	private replicateBlockInsert() {
		const bi = this.blockIns;
		this.blockIns = null;
		const text = this.insertBuf;
		if (!bi || !text || text.includes("\n") || this.row !== bi.r0) return;
		this.beforeEdit();
		const last = Math.min(bi.r1, this.lines.length - 1);
		for (let r = bi.r0 + 1; r <= last; r++) {
			let line = this.lines[r];
			const col = bi.toEnd ? line.length : bi.col;
			if (line.length < col) {
				if (!bi.pad) continue;
				line = line.padEnd(col);
			}
			this.lines[r] = line.slice(0, col) + text + line.slice(col);
		}
	}

	/* ---------------- insert mode ---------------- */

	private spliceText(text: string) {
		const parts = text.split("\n");
		const line = this.lines[this.row];
		const head = line.slice(0, this.col);
		const tail = line.slice(this.col);
		if (parts.length === 1) {
			this.lines[this.row] = head + text + tail;
			this.col += text.length;
			return;
		}
		const lastPart = parts[parts.length - 1];
		this.lines.splice(
			this.row,
			1,
			head + parts[0],
			...parts.slice(1, -1),
			lastPart + tail,
		);
		this.row += parts.length - 1;
		this.col = lastPart.length;
	}

	private typeText(text: string) {
		this.beforeEdit();
		this.autoIndented = false;
		this.spliceText(text);
		this.insertBuf += text;
	}

	private insertNewline() {
		this.beforeEdit();
		const line = this.lines[this.row];
		const head = line.slice(0, this.col);
		let tail = line.slice(this.col);
		const ws = leadingWs(line);
		const after = this.col >= ws.length;
		const auto = this.options.autoindent;
		const indent = auto && after ? ws : "";
		if (auto && after) tail = tail.replace(/^[ \t]+/, "");
		const newHead = auto && /^\s*$/.test(head) ? "" : head;
		this.lines.splice(this.row, 1, newHead, indent + tail);
		this.row++;
		this.col = indent.length;
		this.insertBuf += "\n";
		this.autoIndented = indent.length > 0 && tail === "";
	}

	private backspace() {
		if (this.col > 0) {
			this.beforeEdit();
			const line = this.lines[this.row];
			this.lines[this.row] = line.slice(0, this.col - 1) + line.slice(this.col);
			this.col--;
			this.insertBuf = this.insertBuf.slice(0, -1);
		} else if (this.row > 0) {
			this.beforeEdit();
			const prev = this.lines[this.row - 1];
			this.col = prev.length;
			this.lines.splice(this.row - 1, 2, prev + this.lines[this.row]);
			this.row--;
			this.insertBuf = this.insertBuf.slice(0, -1);
		}
	}

	private leaveInsert() {
		this.replicateBlockInsert();
		if (this.insertCount > 1 && this.insertBuf) {
			const buf = this.insertBuf;
			this.beforeEdit();
			for (let i = 1; i < this.insertCount; i++) this.spliceText(buf);
		}
		this.insertCount = 1;
		this.insertBuf = "";
		if (this.autoIndented && /^\s+$/.test(this.lines[this.row])) {
			this.beforeEdit();
			this.lines[this.row] = "";
			this.col = 0;
		}
		this.mode = "NORMAL";
		this.col = Math.max(0, this.col - 1);
	}

	private insertKey(key: string) {
		const line = this.lines[this.row];
		const resetRepeat = () => {
			this.insertBuf = "";
			this.autoIndented = false;
		};
		switch (key) {
			case "<Esc>":
			case "<C-c>":
				this.leaveInsert();
				return;
			case "<CR>":
				this.insertNewline();
				return;
			case "<BS>":
			case "<C-h>":
				this.backspace();
				return;
			case "<Del>":
				if (this.col < line.length) {
					this.beforeEdit();
					this.lines[this.row] =
						line.slice(0, this.col) + line.slice(this.col + 1);
				} else if (this.row < this.lines.length - 1) {
					this.beforeEdit();
					this.lines.splice(this.row, 2, line + this.lines[this.row + 1]);
				}
				return;
			case "<Tab>": {
				const sw = this.options.shiftwidth;
				this.typeText(
					this.options.expandtab ? " ".repeat(sw - (this.col % sw)) : "\t",
				);
				return;
			}
			case "<Left>":
				this.col = Math.max(0, this.col - 1);
				resetRepeat();
				return;
			case "<Right>":
				this.col = Math.min(line.length, this.col + 1);
				resetRepeat();
				return;
			case "<Up>":
				if (this.row > 0) this.row--;
				resetRepeat();
				return;
			case "<Down>":
				if (this.row < this.lines.length - 1) this.row++;
				resetRepeat();
				return;
			case "<Home>":
				this.col = 0;
				resetRepeat();
				return;
			case "<End>":
				this.col = line.length;
				resetRepeat();
				return;
			case "<C-w>": {
				const before = line.slice(0, this.col);
				const m = /(?:[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+)?\s*$/u.exec(before);
				const cut = m ? m[0].length : 0;
				if (cut === 0) {
					this.backspace();
					return;
				}
				this.beforeEdit();
				this.lines[this.row] =
					before.slice(0, this.col - cut) + line.slice(this.col);
				this.col -= cut;
				resetRepeat();
				return;
			}
			case "<C-u>": {
				const from =
					this.insertStart.row === this.row && this.insertStart.col < this.col
						? this.insertStart.col
						: 0;
				if (from === this.col) return;
				this.beforeEdit();
				this.lines[this.row] = line.slice(0, from) + line.slice(this.col);
				this.col = from;
				resetRepeat();
				return;
			}
		}
		if (isSpecial(key)) return;
		this.typeText(key);
	}

	/* ---------------- command line ---------------- */

	private openCmdline(type: ":" | "/" | "?", initial = "") {
		this.returnMode = type === ":" ? "NORMAL" : this.mode;
		this.mode = type === ":" ? "COMMAND" : "SEARCH";
		this.cmdType = type;
		this.cmdline = initial;
		this.histIdx = -1;
	}

	private closeCmdline() {
		this.mode = this.returnMode;
		this.cmdline = "";
	}

	private cmdlineKey(key: string) {
		const hist = this.cmdHistory[this.cmdType === ":" ? ":" : "/"];
		switch (key) {
			case "<Esc>":
			case "<C-c>":
				this.closeCmdline();
				return;
			case "<BS>":
			case "<C-h>":
				if (this.cmdline === "") this.closeCmdline();
				else this.cmdline = this.cmdline.slice(0, -1);
				return;
			case "<C-u>":
				this.cmdline = "";
				return;
			case "<C-w>":
				this.cmdline = this.cmdline.replace(/(?:\S+|\s+)\s*$/, "");
				return;
			case "<Up>":
			case "<Down>": {
				if (hist.length === 0) return;
				if (key === "<Up>")
					this.histIdx =
						this.histIdx < 0 ? hist.length - 1 : Math.max(0, this.histIdx - 1);
				else this.histIdx = this.histIdx < 0 ? -1 : this.histIdx + 1;
				this.cmdline =
					this.histIdx >= 0 && this.histIdx < hist.length
						? hist[this.histIdx]
						: "";
				if (this.histIdx >= hist.length) this.histIdx = -1;
				return;
			}
			case "<CR>": {
				const text = this.cmdline;
				const type = this.cmdType;
				if (text && hist[hist.length - 1] !== text) hist.push(text);
				this.closeCmdline();
				if (type === ":") this.runEx(text);
				else this.runSearch(text, type === "/");
				return;
			}
		}
		if (!isSpecial(key)) this.cmdline += key;
	}

	private runSearch(pattern: string, forward: boolean) {
		const pat = pattern || this.search?.pattern || "";
		if (!pat) {
			this.err("E35: No previous regular expression");
			return;
		}
		this.search = { pattern: pat, forward };
		const p = this.searchMotion(true, 1);
		if (p) {
			this.row = p.row;
			this.col = p.col;
		}
	}

	/* ---------------- ex commands ---------------- */

	private parseRange(s: string): {
		rows: [number, number] | null;
		rest: string;
		err?: string;
	} {
		const last = this.lines.length - 1;
		let i = 0;
		let bad: string | undefined;
		const addr = (): number | undefined => {
			let n: number | undefined;
			const ch = s[i];
			if (ch === ".") {
				n = this.row;
				i++;
			} else if (ch === "$") {
				n = last;
				i++;
			} else if (ch === "'") {
				const m = s[i + 1];
				if ((m === "<" || m === ">") && this.lastVisual) {
					n = m === "<" ? this.lastVisual.start : this.lastVisual.end;
				} else {
					bad = "E20: Mark not set";
				}
				i += 2;
			} else if (/\d/.test(ch ?? "")) {
				let d = "";
				while (/\d/.test(s[i] ?? "")) d += s[i++];
				n = Number.parseInt(d, 10) - 1;
			}
			while (s[i] === "+" || s[i] === "-") {
				const sign = s[i++] === "+" ? 1 : -1;
				let d = "";
				while (/\d/.test(s[i] ?? "")) d += s[i++];
				n = (n ?? this.row) + sign * (d ? Number.parseInt(d, 10) : 1);
			}
			return n;
		};
		const fix = (n: number) => clamp(n, 0, last);
		if (s[0] === "%") return { rows: [0, last], rest: s.slice(1) };
		const a = addr();
		let rows: [number, number] | null = null;
		if (s[i] === ",") {
			i++;
			const b = addr();
			rows = [fix(a ?? this.row), fix(b ?? this.row)];
		} else if (a !== undefined) {
			rows = [fix(a), fix(a)];
		}
		if (rows && rows[0] > rows[1]) rows = [rows[1], rows[0]];
		return { rows, rest: s.slice(i), err: bad };
	}

	private runEx(raw: string) {
		let s = raw.replace(/^[\s:]+/, "");
		if (!s) return;
		const rng = this.parseRange(s);
		if (rng.err) {
			this.err(rng.err);
			return;
		}
		const rows = rng.rows;
		s = rng.rest.trimStart();
		if (s === "") {
			if (rows) {
				this.row = rows[1];
				this.col = this.firstNonBlank(this.row);
			}
			return;
		}
		const m = /^([a-zA-Z]+|[<>]+)(!)?\s*([\s\S]*)$/.exec(s);
		if (!m) {
			this.err(`E492: Not an editor command: ${raw}`);
			return;
		}
		const name = m[1];
		const force = !!m[2];
		let arg = m[3];
		const lineRange = (): Range => {
			const [a, b] = rows ?? [this.row, this.row];
			return mk(a, 0, b, 0, true);
		};

		switch (name) {
			case "w":
			case "write":
				this.exWrite(arg.trim(), rows);
				return;
			case "wq":
			case "x":
			case "xit":
			case "exit":
				if (
					(name === "wq" || this.modified || arg.trim()) &&
					!this.exWrite(arg.trim(), null)
				)
					return;
				this.host.quit();
				return;
			case "wa":
			case "wall":
				this.exWrite("", null);
				return;
			case "wqa":
			case "wqall":
			case "xa":
			case "xall":
				if (this.modified && !this.exWrite("", null)) return;
				this.host.quit();
				return;
			case "q":
			case "quit":
			case "qa":
			case "qall":
			case "quita":
			case "quitall":
			case "clo":
			case "close":
				if (this.modified && !force) {
					this.err("E37: No write since last change (add ! to override)");
					return;
				}
				this.host.quit();
				return;
			case "e":
			case "edit":
				if (force || !this.modified) {
					if (arg.trim()) {
						this.err("E32: Opening other files is not supported");
						return;
					}
					this.beforeEdit();
					this.lines = this.savedText.endsWith("\n")
						? this.savedText.slice(0, -1).split("\n")
						: this.savedText.split("\n");
					this.row = clamp(this.row, 0, this.lines.length - 1);
					this.info(`"${this.host.filePath}" reloaded`);
				} else {
					this.err("E37: No write since last change (add ! to override)");
				}
				return;
			case "set":
			case "se":
				this.exSet(arg);
				return;
			case "noh":
			case "nohl":
			case "nohlsearch":
				this.hlActive = false;
				return;
			case "s":
			case "substitute":
				if (force) arg = `!${arg}`;
				this.exSubstitute(arg, rows);
				return;
			case "d":
			case "delete":
			case "de":
				this.applyOp("d", lineRange(), 1);
				return;
			case "y":
			case "yank":
			case "ya":
				this.applyOp("y", lineRange(), 1);
				return;
			case "u":
			case "undo":
				this.undo();
				return;
			case "red":
			case "redo":
				this.redo();
				return;
			case "h":
			case "help":
				this.showHelp = true;
				return;
		}
		if (/^>+$/.test(name) || /^<+$/.test(name)) {
			const r = lineRange();
			this.shiftRows(
				r.start.row,
				r.end.row,
				name[0] === ">" ? 1 : -1,
				name.length,
			);
			this.row = r.end.row;
			this.col = this.firstNonBlank(this.row);
			return;
		}
		this.err(`E492: Not an editor command: ${raw}`);
	}

	private exWrite(target: string, rows: [number, number] | null): boolean {
		const path = target || this.host.filePath;
		if (!path) {
			this.err("E32: No file name");
			return false;
		}
		if (path === this.host.filePath && this.host.readonly) {
			this.err(
				"E45: 'readonly' option is set (bundled file: use :w <newname> to save a copy)",
			);
			return false;
		}
		const isNew = !this.host.exists(path);
		const body = rows ? this.lines.slice(rows[0], rows[1] + 1) : this.lines;
		const text = body.join("\n") + (this.eol || rows ? "\n" : "");
		try {
			this.host.write(path, rows ? text.replace(/\n$/, "") : text);
		} catch (e) {
			this.err(
				`E212: Can't open file for writing: ${e instanceof Error ? e.message : String(e)}`,
			);
			return false;
		}
		if (path === this.host.filePath && !rows) this.savedText = this.serialize();
		this.info(
			`"${path}" ${isNew ? "[New] " : ""}${body.length}L, ${byteLength(text)}B written`,
		);
		return true;
	}

	private exSet(arg: string) {
		const opts = this.options as unknown as Record<string, boolean | number>;
		for (const tok of arg.split(/\s+/).filter(Boolean)) {
			const eq = /^(\w+)=(\d+)$/.exec(tok);
			if (eq) {
				const key = OPT_NAMES[eq[1]];
				if (!key || typeof opts[key] !== "number") {
					this.err(`E518: Unknown option: ${eq[1]}`);
					return;
				}
				const v = Number.parseInt(eq[2], 10);
				if (v < 1) {
					this.err(`E487: Argument must be positive: ${tok}`);
					return;
				}
				opts[key] = v;
				continue;
			}
			const m = /^(inv|no)?(\w+?)([!?])?$/.exec(tok);
			const key = m ? OPT_NAMES[m[2]] : undefined;
			if (!m || !key) {
				this.err(`E518: Unknown option: ${tok}`);
				return;
			}
			const cur = opts[key];
			if (m[3] === "?" || (typeof cur === "number" && !m[1])) {
				this.info(
					typeof cur === "number"
						? `${key}=${cur}`
						: `${cur ? "" : "no"}${key}`,
				);
			} else if (typeof cur === "boolean") {
				opts[key] = m[1] === "inv" || m[3] === "!" ? !cur : m[1] !== "no";
			} else {
				this.err(`E474: Invalid argument: ${tok}`);
				return;
			}
		}
	}

	private exSubstitute(arg: string, rows: [number, number] | null) {
		if (!arg) {
			this.err("E35: No previous regular expression");
			return;
		}
		const delim = arg[0];
		if (/[\w\s\\"|]/.test(delim)) {
			this.err("E146: Regular expressions can't be delimited by letters");
			return;
		}
		const parts: string[] = [];
		let cur = "";
		for (let i = 1; i < arg.length; i++) {
			const ch = arg[i];
			if (ch === "\\" && i + 1 < arg.length) {
				const nx = arg[i + 1];
				cur += nx === delim ? delim : ch + nx;
				i++;
				continue;
			}
			if (ch === delim && parts.length < 2) {
				parts.push(cur);
				cur = "";
				continue;
			}
			cur += ch;
		}
		parts.push(cur);
		const [pat0, repl = "", flags = ""] = parts;
		const pat = pat0 === "" ? (this.search?.pattern ?? "") : pat0;
		if (!pat) {
			this.err("E35: No previous regular expression");
			return;
		}
		const global = flags.includes("g");
		const ic =
			flags.includes("i") ||
			(this.options.ignorecase &&
				!(this.options.smartcase && /[A-Z]/.test(pat)));
		let re: RegExp;
		try {
			re = new RegExp(pat, ic ? "gi" : "g");
		} catch {
			this.err(`E486: Invalid pattern: ${pat}`);
			return;
		}
		const expand = (m: RegExpExecArray): string => {
			let out = "";
			for (let i = 0; i < repl.length; i++) {
				const ch = repl[i];
				if (ch === "\\" && i + 1 < repl.length) {
					const nx = repl[++i];
					if (/\d/.test(nx)) out += m[Number(nx)] ?? "";
					else if (nx === "n" || nx === "r") out += "\n";
					else if (nx === "t") out += "\t";
					else out += nx;
				} else if (ch === "&") {
					out += m[0];
				} else {
					out += ch;
				}
			}
			return out;
		};
		const [r0, r1] = rows ?? [this.row, this.row];
		let count = 0;
		let touched = 0;
		let cursorRow = -1;
		for (let r = r1; r >= r0; r--) {
			const line = this.lines[r];
			re.lastIndex = 0;
			let out = "";
			let lastEnd = 0;
			let did = false;
			let m: RegExpExecArray | null = re.exec(line);
			while (m) {
				did = true;
				count++;
				out += line.slice(lastEnd, m.index) + expand(m);
				lastEnd = m.index + m[0].length;
				if (m[0].length === 0) re.lastIndex++;
				if (!global) break;
				m = re.exec(line);
			}
			if (!did) continue;
			out += line.slice(lastEnd);
			this.beforeEdit();
			const pieces = out.split("\n");
			this.lines.splice(r, 1, ...pieces);
			touched++;
			if (cursorRow < 0) cursorRow = r + pieces.length - 1;
		}
		this.search = { pattern: pat, forward: true };
		this.hlActive = true;
		if (!count) {
			this.err(`E486: Pattern not found: ${pat}`);
			return;
		}
		this.row = cursorRow;
		this.col = this.firstNonBlank(this.row);
		this.info(
			`${count} substitution${count === 1 ? "" : "s"} on ${touched} line${touched === 1 ? "" : "s"}`,
		);
	}
}

const swapCase = (s: string) =>
	s.replace(/\p{L}/gu, (c) =>
		c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase(),
	);
