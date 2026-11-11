import { Command, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Rm extends Command {
	metadata = {
		command: "rm",
		description: "Remove files or directories.",
		arguments: [
			{
				flag: "r",
				description: "Remove directories and their contents recursively",
				defaultValue: false,
				type: "boolean" as const,
			},
			{ flag: 0, description: "Target to remove" },
		],
	};

	public method(terminal: Terminal, args: ParsedArgs, _: string): string {
		const targetPath = args.get(0) as string;
		if (!targetPath) return "rm: missing operand";

		const recursive = Boolean(args.get("r"));
		const parts = targetPath.split("/").filter(Boolean);
		if (parts.length === 0) return "rm: cannot remove root directory";

		const targetName = parts.pop()!;
		const parentPath = targetPath.startsWith("/")
			? `/${parts.join("/")}`
			: parts.join("/");
		const parentNode =
			parts.length === 0
				? terminal.currentDir
				: resolveNode(terminal, parentPath);

		if (parentNode?.type !== "directory")
			return `rm: cannot remove '${targetPath}': No such file or directory`;

		const index = parentNode.children.findIndex((c) => c.name === targetName);
		if (index === -1)
			return `rm: cannot remove '${targetPath}': No such file or directory`;

		const targetNode = parentNode.children[index];
		if (targetNode.type === "directory" && !recursive) {
			return `rm: cannot remove '${targetPath}': Is a directory`;
		}

		parentNode.children.splice(index, 1);
		return "";
	}
}
