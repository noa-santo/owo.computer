import * as esbuild from "esbuild-wasm";
import type { Command, Env } from "@/lib/terminal/Command";
import { Directory, type File } from "@/lib/terminal/Filesystem";

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
	private static esbuildInitialized = false;
	public histroy: string[];

	public constructor() {
		this.env = new Map<string, string[]>();
		this.fs = new Directory();
		this.loadDefaultFs();
		this.currentDir = this.fs.getChildByPath("/home/owo") as Directory;
		this.env.set("PATH", ["/bin"]);
		this.commandRegistry = new Map<string, Command>();
		this.histroy = [];
	}

	public async init(): Promise<void> {
		await Terminal.initEsbuild();
		await this.buildCommandRegistry();
	}

	private static async initEsbuild(): Promise<void> {
		if (Terminal.esbuildInitialized) return;
		await esbuild.initialize({
			wasmURL: "https://unpkg.com/esbuild-wasm@0.25.0/esbuild.wasm",
		});
		Terminal.esbuildInitialized = true;
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
}
