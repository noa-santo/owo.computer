import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Crt extends Command {
	metadata = {
		command: "crt",
		description: "Toggle CRT effect.",
		arguments: [],
	};

	public method(_terminal: Terminal, _args: ParsedArgs, _: string): string {
		return "\x1bcrt";
	}
}
