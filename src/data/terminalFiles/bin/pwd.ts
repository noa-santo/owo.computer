import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Pwd extends Command {
	metadata = {
		command: "pwd",
		description: "Print the current working directory path.",
		arguments: [],
	};

	public method(
		terminal: Terminal,
		_args: ParsedArgs,
		_env: Env,
		_: string,
	): string {
		return terminal.currentDir.getAbsolutePath();
	}
}
