import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class History extends Command {
	metadata = {
		command: "history",
		description: "Display the command history list with line numbers.",
		arguments: [],
	};

	public method(terminal: Terminal, _args: ParsedArgs, _stdin: string): string {
		const homePaths = terminal.env.get("HOME");
		const homePath =
			homePaths && homePaths.length > 0 ? homePaths[0] : "/home/owo";
		const historyFilePath = `${homePath}/.history`;
		const node = resolveNode(terminal, historyFilePath);
		if (!node) return "";
		if (node.type === "directory")
			return `history: ${historyFilePath} is a directory`;
		return node.content.split("\n").filter(Boolean).join("\n");
	}
}
