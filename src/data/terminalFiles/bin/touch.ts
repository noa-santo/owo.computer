import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import type { File } from "@/lib/terminal/Filesystem";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Touch extends Command {
	metadata = {
		command: "touch",
		description: "Update timestamps or create a new empty file.",
		arguments: [
			{
				flag: 0,
				description: "Name or path of the file to create.",
				defaultValue: "",
			},
		],
	};

	public method(
		terminal: Terminal,
		args: ParsedArgs,
		_env: Env,
		_: string,
	): string {
		const targetPath = args.get(0) as string;

		if (!targetPath) {
			return "touch: missing file operand";
		}

		const parts = targetPath.split("/").filter(Boolean);
		const fileName = parts.pop()!;
		const parentPath = targetPath.startsWith("/")
			? `/${parts.join("/")}`
			: parts.join("/");

		const parentNode =
			parts.length === 0
				? terminal.currentDir
				: resolveNode(terminal, parentPath);

		if (parentNode?.type !== "directory") {
			return `touch: cannot touch '${targetPath}': No such file or directory`;
		}

		const existing = parentNode.children.find((c) => c.name === fileName);
		if (!existing) {
			const newFile: File = {
				type: "file",
				name: fileName,
				content: "",
			};
			parentNode.children.push(newFile);
		}

		return "";
	}
}
