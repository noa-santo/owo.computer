import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Clear extends Command {
	metadata = {
		command: "clear",
		description: "Clear the terminal screen.",
		arguments: [],
	};

	public method(
		_terminal: Terminal,
		_args: ParsedArgs,
		_env: Env,
		_: string,
	): string {
		return "\x1bc";
	}
}
