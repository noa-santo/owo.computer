import { type ArgumentMap, Command, type Env } from "@/lib/terminal/Command";
import type { Directory } from "@/lib/terminal/Filesystem";
import {Terminal} from "@/lib/terminal/Terminal";

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

	public method(terminal: Terminal, args: ArgumentMap, _env: Env, _: string): string {
		const fs = terminal.fs;
		const targetPath = args.get(0) ?? ".";
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
