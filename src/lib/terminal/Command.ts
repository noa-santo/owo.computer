import type { Terminal } from "@/lib/terminal/Terminal";

export interface Argument {
	flag: string | number; // String for options ("--line-number"), number for positional (0, 1)
	description: string;
	defaultValue?: string | boolean;
	type?: "boolean" | "string";
}

interface CommandMetadata {
	command: string;
	description: string;
	arguments: Argument[];
}

export interface ParsedArgs {
	flags: Map<string, string | boolean>;
	positional: string[];
	get(key: string | number): string | boolean | undefined;
	has(key: string | number): boolean;
}
export type Env = Map<string, string[]>;

export abstract class Command {
	public abstract metadata: CommandMetadata;
	public abstract method(
		terminal: Terminal,
		args: ParsedArgs,
		stdin: string,
	): string;

	public generateHelp(): string {
		const flagMap = generateShortFlags(this.metadata.arguments);
		const lines = [
			`${this.metadata.command} - ${this.metadata.description}\n`,
			"Options:",
		];

		for (const arg of this.metadata.arguments) {
			if (typeof arg.flag === "string") {
				const short = flagMap.get(arg.flag);
				const shortStr = short ? `-${short}, ` : "    ";
				const defaultStr =
					arg.defaultValue !== undefined
						? ` (default: ${arg.defaultValue})`
						: "";
				lines.push(
					`  ${shortStr}--${arg.flag.padEnd(16)} ${arg.description}${defaultStr}`,
				);
			}
		}

		const positionals = this.metadata.arguments.filter(
			(a) => typeof a.flag === "number",
		);
		if (positionals.length > 0) {
			lines.push("\nArguments:");
			for (const arg of positionals) {
				lines.push(`  [arg ${arg.flag}]`.padEnd(24) + `${arg.description}`);
			}
		}

		return lines.join("\n");
	}
}

export function generateShortFlags(args: Argument[]): Map<string, string> {
	const fullToShort = new Map<string, string>();
	const usedShorts = new Set<string>();

	for (const arg of args) {
		if (typeof arg.flag !== "string") continue;
		const full = arg.flag;

		let charToUse = "";
		for (const char of full) {
			if (/[a-zA-Z0-9]/.test(char) && !usedShorts.has(char)) {
				charToUse = char;
				break;
			}
		}

		if (charToUse) {
			usedShorts.add(charToUse);
			fullToShort.set(full, charToUse);
		}
	}

	return fullToShort;
}
