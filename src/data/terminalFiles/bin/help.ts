import { type ArgumentMap, Command, type Env } from "@/lib/terminal/Command";
import type { Directory } from "@/lib/terminal/Filesystem";

export default class Help extends Command {
	metadata = {
		command: "help",
		description:
			"Prints help text for given command. When no command is given it lists all comands.",
		arguments: [
			{
				flag: 0,
				description: "The command to print help about.",
				defaultValue: "all",
			},
		],
	};
	public method(
		_fs: Directory,
		_args: ArgumentMap,
		_env: Env,
		_: string,
	): string {
		return "Not implemented";
	}
}
