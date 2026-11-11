import { Command, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Mv extends Command {
	metadata = {
		command: "mv",
		description: "Move or rename files and directories.",
		arguments: [
			{ flag: 0, description: "Source file/directory" },
			{ flag: 1, description: "Destination" },
		],
	};

	public method(terminal: Terminal, args: ParsedArgs, _: string): string {
		const sourcePath = args.get(0) as string;
		const destPath = args.get(1) as string;

		if (!sourcePath || !destPath) return "mv: missing file operand";

		const srcParts = sourcePath.split("/").filter(Boolean);
		const srcName = srcParts.pop()!;
		const srcParentPath = sourcePath.startsWith("/")
			? `/${srcParts.join("/")}`
			: srcParts.join("/");
		const srcParentNode =
			srcParts.length === 0
				? terminal.currentDir
				: resolveNode(terminal, srcParentPath);

		if (srcParentNode?.type !== "directory")
			return `mv: cannot stat '${sourcePath}': No such file or directory`;

		const srcIndex = srcParentNode.children.findIndex(
			(c) => c.name === srcName,
		);
		if (srcIndex === -1)
			return `mv: cannot stat '${sourcePath}': No such file or directory`;

		const targetNode = srcParentNode.children[srcIndex];

		const destNode = resolveNode(terminal, destPath);
		if (destNode?.type === "directory") {
			srcParentNode.children.splice(srcIndex, 1);
			targetNode.name = srcName;
			destNode.children.push(targetNode);
			return "";
		}
		const destParts = destPath.split("/").filter(Boolean);
		const destName = destParts.pop()!;
		const destParentPath = destPath.startsWith("/")
			? `/${destParts.join("/")}`
			: destParts.join("/");
		const destParentNode =
			destParts.length === 0
				? terminal.currentDir
				: resolveNode(terminal, destParentPath);

		if (destParentNode?.type !== "directory") {
			return `mv: cannot move to '${destPath}': No such directory`;
		}

		srcParentNode.children.splice(srcIndex, 1);
		targetNode.name = destName;
		destParentNode.children.push(targetNode);

		return "";
	}
}
