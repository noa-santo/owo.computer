import type { Directory } from "@/lib/terminal/Filesystem";

interface Argument {
	flag: string | number;
	description: string;
	defaultValue?: string;
}

interface CommandMetadata {
	command: string;
	description: string;
	arguments: Argument[];
}

export type ArgumentMap = Map<string | number, string>;

export type Env = Map<string, string[]>;

export interface Command {
	metadata: CommandMetadata;
}

export abstract class Command {
	public abstract method(
		fs: Directory,
		args: ArgumentMap,
		env: Env,
		stdin: string,
	): string;
	public generateHelp(argument?: string | number) {
		if (argument === undefined) return this.metadata.description;
		return `${this.metadata.description}\n${
			this.metadata.arguments.length > 0 &&
			this.metadata.arguments.map(
				(a) =>
					`${typeof a.flag === "string" && a.flag}   ${a.description}   ${a.defaultValue && `Default value: ${a.defaultValue}`}`,
			)
		}`;
	}
}
