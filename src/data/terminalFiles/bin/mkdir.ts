import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import { Directory, resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Mkdir extends Command {
	metadata = {
		command: "mkdir",
		description: "Create directory, if it does not already exist.",
		arguments: [
			{
				flag: 0,
				description: "Name or path of the directory to create.",
				defaultValue: "",
			},
		],
	};

	public method(terminal: Terminal, args: ParsedArgs, _: string): string {
		const targetPath = args.get(0) as string;

		if (!targetPath) {
			return "mkdir: missing operand";
		}

		const parts = targetPath.split("/").filter(Boolean);
		const dirName = parts.pop()!;
		const parentPath = targetPath.startsWith("/")
			? `/${parts.join("/")}`
			: parts.join("/");

		const parentNode =
			parts.length === 0
				? terminal.currentDir
				: resolveNode(terminal, parentPath);

		if (parentNode?.type !== "directory") {
			return `mkdir: cannot create directory '${targetPath}': No such file or directory`;
		}

		const exists = parentNode.children.some((c) => c.name === dirName);
		if (exists) {
			return `mkdir: cannot create directory '${targetPath}': File exists`;
		}

		new Directory(parentNode, dirName);
		return "";
	}
}
