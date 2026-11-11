import type { Terminal } from "@/lib/terminal/Terminal";

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

export abstract class Command {
    public abstract metadata: CommandMetadata;
	public abstract method(
		terminal: Terminal,
		args: ArgumentMap,
		env: Env,
		stdin: string,
	): string;

    public generateHelp(argument?: string | number): string {
		if (argument === undefined) return this.metadata.description;

        const argsList = this.metadata.arguments
            .map((a) => {
                const flagStr = typeof a.flag === "string" ? a.flag : `[arg ${a.flag}]`;
                const defaultStr = a.defaultValue !== undefined ? ` (default: ${a.defaultValue})` : "";
                return `  ${flagStr}\t${a.description}${defaultStr}`;
            })
            .join("\n");

        return `${this.metadata.description}\n\nArguments:\n${argsList}`;
	}
}
