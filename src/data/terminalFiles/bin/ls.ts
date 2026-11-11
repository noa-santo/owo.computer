import { Command, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Ls extends Command {
	metadata = {
		command: "ls",
		description: "List directory contents.",
		arguments: [
			{
				flag: 0,
				description: "The directory to list the contents of.",
				defaultValue: ".",
			},
			{
				flag: "all",
				description: "Don't ignore entries starting with .",
				defaultValue: false,
				type: "boolean" as const,
			},
			{
				flag: "long",
				description: "Use a long listing format.",
				defaultValue: false,
				type: "boolean" as const,
			},
		],
	};

	public method(terminal: Terminal, args: ParsedArgs, _: string): string {
		const targetPath = (args.get(0) as string) ?? ".";
		const node = resolveNode(terminal, targetPath);

		if (!node)
			return `ls: cannot access '${targetPath}': No such file or directory`;
		if (node.type === "file") return node.name;

		const isLong = Boolean(args.get("long"));
		const showAll = Boolean(args.get("all"));

		let children = node.children;
		if (!showAll) {
			children = children.filter((c) => !c.name.startsWith("."));
		}

		children = [...children].sort((a, b) => a.name.localeCompare(b.name));

		if (isLong) {
			return children
				.map((c) => {
					const typeChar = c.type === "directory" ? "d" : "-";
					const size =
						c.type === "file"
							? c.content.length.toString().padStart(5)
							: " 4096";
					return `${typeChar}rw-r--r-- 1 owo owo ${size} ${c.name}`;
				})
				.join("\n");
		}

		return children.map((c) => c.name).join("  ");
	}
}
