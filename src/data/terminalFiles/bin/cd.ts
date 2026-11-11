import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import type { Directory } from "@/lib/terminal/Filesystem";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Cd extends Command {
	metadata = {
		command: "cd",
		description: "Change the current shell working directory.",
		arguments: [
			{
				flag: 0,
				description: "Directory path to navigate to.",
				defaultValue: "/home/owo",
			},
		],
	};

	public method(
		terminal: Terminal,
		args: ParsedArgs,
		_env: Env,
		_: string,
	): string {
		const targetPath = (args.get(0) as string) ?? "/home/owo";
		const node = resolveNode(terminal, targetPath);

		if (!node) {
			return `cd: ${targetPath}: No such file or directory`;
		}

		if (node.type !== "directory") {
			return `cd: ${targetPath}: Not a directory`;
		}

		terminal.currentDir = node as Directory;
		return "";
	}
}
