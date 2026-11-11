import * as esbuild from "esbuild-wasm";
import {
	type Argument,
	type Command,
	type Env,
	generateShortFlags,
	type ParsedArgs,
} from "@/lib/terminal/Command";
import { Directory, type File, writeFile } from "@/lib/terminal/Filesystem";

const rawTerminalFiles = import.meta.glob("/src/data/terminalFiles/**/*", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

const bundledCommands = import.meta.glob("/src/data/terminalFiles/bin/*.ts", {
	eager: true,
}) as Record<string, { default: new () => Command }>;

export class Terminal {
	public env: Env;
	public fs: Directory;
	public currentDir: Directory;
	public commandRegistry: Map<string, Command>;
	private static esbuildInitPromise: Promise<void> | null = null;

	public constructor() {
		this.env = new Map<string, string[]>();
		this.fs = new Directory();
		this.loadDefaultFs();

		const homeDir = this.fs.getChildByPath("/home/owo");
		this.currentDir =
			homeDir && homeDir.type === "directory" ? homeDir : this.fs;

		this.env.set("PATH", ["/bin"]);
		this.commandRegistry = new Map<string, Command>();
	}

	public async init(): Promise<void> {
		await Terminal.initEsbuild();
		await this.buildCommandRegistry();
	}

	private static initEsbuild(): Promise<void> {
		if (!Terminal.esbuildInitPromise) {
			Terminal.esbuildInitPromise = esbuild.initialize({
				wasmURL: "https://unpkg.com/esbuild-wasm@0.25.0/esbuild.wasm",
			});
		}
		return Terminal.esbuildInitPromise;
	}

	private loadDefaultFs(): void {
		const basePath = "/src/data/terminalFiles";

		for (const [filePath, content] of Object.entries(rawTerminalFiles)) {
			const relativePath = filePath.replace(basePath, "");
			const parts = relativePath.split("/").filter(Boolean);

			let currentDir = this.fs;

			for (let i = 0; i < parts.length; i++) {
				const part = parts[i];
				const isLast = i === parts.length - 1;

				if (isLast) {
					const file: File = {
						type: "file",
						name: part,
						content,
					};
					currentDir.children.push(file);
				} else {
					let subDir = currentDir.children.find(
						(child): child is Directory =>
							child.type === "directory" && child.name === part,
					);

					if (!subDir) {
						subDir = new Directory(currentDir, part);
					}

					currentDir = subDir;
				}
			}
		}
	}

	private async parseVirtualCommand(
		fileContent: string,
	): Promise<Command | null> {
		try {
			const transformed = await esbuild.transform(fileContent, {
				loader: "ts",
				format: "cjs",
				target: "es2022",
			});

			const exports: { default?: new () => Command } = {};
			const module = { exports };

			const runner = new Function("exports", "module", transformed.code);
			runner(exports, module);

			const CmdClass = module.exports.default || exports.default;
			if (typeof CmdClass === "function") {
				return new CmdClass();
			}
			return null;
		} catch {
			return null;
		}
	}

	private collectFilesFromDir(dir: Directory): File[] {
		return dir.children.filter((child): child is File => child.type === "file");
	}

	public async buildCommandRegistry(): Promise<void> {
		this.commandRegistry.clear();

		const pathEntries = this.env.get("PATH") ?? [];
		const searchDirs: Directory[] = [];

		for (const pathStr of pathEntries) {
			const dirNode = this.fs.getChildByPath(pathStr);
			if (dirNode && dirNode.type === "directory") {
				searchDirs.push(dirNode);
			}
		}

		if (this.currentDir && !searchDirs.includes(this.currentDir)) {
			searchDirs.push(this.currentDir);
		}

		for (const dir of searchDirs) {
			const files = this.collectFilesFromDir(dir);

			for (const file of files) {
				if (!file.name.endsWith(".ts")) continue;

				const commandName = file.name.slice(0, -3);

				const bundledKey = Object.keys(bundledCommands).find((key) =>
					key.endsWith(`/${file.name}`),
				);

				if (bundledKey && bundledCommands[bundledKey]?.default) {
					const CmdClass = bundledCommands[bundledKey].default;
					this.commandRegistry.set(commandName, new CmdClass());
				} else {
					const virtualCmd = await this.parseVirtualCommand(file.content);
					if (virtualCmd) {
						this.commandRegistry.set(commandName, virtualCmd);
					}
				}
			}
		}
	}

	public executeCommand(rawInput: string): string {
		const trimmed = rawInput.trim();
		if (!trimmed) return "";

		let commandStr = trimmed;
		let redirectTarget: string | null = null;
		let isAppend = false;
		const redirectMatch = commandStr.match(/(>>|>)\s*(\S+)$/);
		if (redirectMatch) {
			isAppend = redirectMatch[1] === ">>";
			redirectTarget = redirectMatch[2];
			commandStr = commandStr.slice(0, redirectMatch.index).trim();
		}

		const pipeline = commandStr
			.split("|")
			.map((cmd) => cmd.trim())
			.filter(Boolean);
		let currentStdin = "";

		for (const pipeSegment of pipeline) {
			const rawTokens = pipeSegment.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
			if (rawTokens.length === 0) continue;

			const cleanTokens = rawTokens.map((t) => t.replace(/^"|"$/g, ""));
			const cmdName = cleanTokens[0];
			const rawArgs = cleanTokens.slice(1);

			const command = this.commandRegistry.get(cmdName);
			if (!command) {
				return `command not found: ${cmdName}`;
			}

			const parsedArgs = this.parseArguments(
				command.metadata.arguments ?? [],
				rawArgs,
			);

			try {
				currentStdin = command.method(this, parsedArgs, this.env, currentStdin);
				if (currentStdin === "\x1bc") return "\x1bc";
			} catch (err) {
				return `Error executing '${cmdName}': ${err instanceof Error ? err.message : String(err)}`;
			}
		}

		if (redirectTarget) {
			try {
				writeFile(this, redirectTarget, currentStdin, isAppend);
				return "";
			} catch (err) {
				return `owo: ${err instanceof Error ? err.message : String(err)}`;
			}
		}

		return currentStdin;
	}

	private parseArguments(spec: Argument[], rawTokens: string[]): ParsedArgs {
		const shortToFull = new Map<string, string>();
		const fullToShort = generateShortFlags(spec);
		for (const [full, short] of fullToShort.entries()) {
			shortToFull.set(short, full);
		}

		const flagsMap = new Map<string, string | boolean>();
		const positional: string[] = [];

		// Apply defaults
		for (const arg of spec) {
			if (typeof arg.flag === "string" && arg.defaultValue !== undefined) {
				flagsMap.set(arg.flag, arg.defaultValue);
			}
		}

		for (let i = 0; i < rawTokens.length; i++) {
			const token = rawTokens[i];

			if (token.startsWith("--")) {
				const eqIdx = token.indexOf("=");
				if (eqIdx !== -1) {
					const flagName = token.slice(2, eqIdx);
					const val = token.slice(eqIdx + 1);
					flagsMap.set(flagName, val);
				} else {
					const flagName = token.slice(2);
					const argDef = spec.find((a) => a.flag === flagName);
					if (argDef && argDef.type === "string" && i + 1 < rawTokens.length) {
						flagsMap.set(flagName, rawTokens[++i]);
					} else {
						flagsMap.set(flagName, true);
					}
				}
			} else if (token.startsWith("-") && token.length > 1) {
				const chars = token.slice(1).split("");
				for (let cIdx = 0; cIdx < chars.length; cIdx++) {
					const char = chars[cIdx];
					const fullFlag = shortToFull.get(char) ?? char;
					const argDef = spec.find((a) => a.flag === fullFlag);

					if (argDef && argDef.type === "string") {
						if (cIdx === chars.length - 1 && i + 1 < rawTokens.length) {
							flagsMap.set(fullFlag, rawTokens[++i]);
						}
					} else {
						flagsMap.set(fullFlag, true);
					}
				}
			} else {
				positional.push(token);
			}
		}

		return {
			flags: flagsMap,
			positional,
			get(key: string | number) {
				if (typeof key === "number") {
					return positional[key];
				}
				return flagsMap.get(key);
			},
			has(key: string | number) {
				if (typeof key === "number") {
					return 0 < key && key < positional.length;
				}
				return flagsMap.has(key);
			},
		};
	}
}
