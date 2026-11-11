import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Ls extends Command {
	metadata = {
		command: "ls",
		description:
			"Lists contents of a directory. When no argument is given it will use the current one.",
		arguments: [
			{
				flag: 0,
				description: "The directory to list the contents of.",
				defaultValue: ".",
			},
		],
	};

	public method(
		terminal: Terminal,
		args: ParsedArgs,
		_env: Env,
		_: string,
	): string {
		const fs = terminal.fs;
		const targetPath = (args.get(0) as string) ?? ".";
		const cwd = terminal.currentDir;
		const node = fs.getChildByPath(targetPath, cwd);

		if (!node) {
			return `ls: cannot access '${targetPath}': No such file or directory`;
		}

		return node.type === "directory"
			? node.children.map((c) => c.name).join(" ")
			: node.name;
	}
}
