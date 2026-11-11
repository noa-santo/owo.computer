import { type ArgumentMap, Command, type Env } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Help extends Command {
	metadata = {
		command: "help",
		description:
			"Prints help text for given command. When no command is given it lists all commands.",
		arguments: [
			{
				flag: 0,
				description: "The command to print help about.",
				defaultValue: "all",
			},
		],
	};

	public method(
		terminal: Terminal,
		args: ArgumentMap,
		_env: Env,
		_: string,
	): string {
		const target = args.get(0);

		if (!target || target === "all") {
			const entries = Array.from(terminal.commandRegistry.entries());
			if (entries.length === 0) {
				return "No commands available in current PATH.";
			}

			const maxLen = Math.max(...entries.map(([name]) => name.length));
			return entries
				.map(
					([name, cmd]) =>
						`${name.padEnd(maxLen + 4)}${cmd.metadata.description}`,
				)
				.join("\n");
		}

		const cmd = terminal.commandRegistry.get(target);
		if (!cmd) {
			return `help: no help topics match '${target}'`;
		}

		return `${cmd.metadata.command} - ${cmd.generateHelp(0)}`;
	}
}
