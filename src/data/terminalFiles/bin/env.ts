import { Command, Env, type ParsedArgs } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class EnvCmd extends Command {
	metadata = {
		command: "env",
		description: "Print the current environment variables.",
		arguments: [],
	};

	public method(terminal: Terminal, _args: ParsedArgs, _stdin: string): string {
		const lines: string[] = [];
		for (const [key, values] of terminal.env.entries()) {
			lines.push(`${key}=${values.join(":")}`);
		}
		return lines.join("\n");
	}
}
