import { type ArgumentMap, Command, type Env } from "@/lib/terminal/Command";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Cat extends Command {
	metadata = {
		command: "cat",
		description: "Concatenate files and print on the standard output.",
		arguments: [
			{
				flag: 0,
				description: "The file to read.",
				defaultValue: "",
			},
		],
	};

	public method(
		terminal: Terminal,
		args: ArgumentMap,
		_env: Env,
		stdin: string,
	): string {
		const filePath = args.get(0);

		if (!filePath) {
			return stdin;
		}

		const node = resolveNode(terminal, filePath);

		if (!node) {
			return `cat: ${filePath}: No such file or directory`;
		}

		if (node.type === "directory") {
			return `cat: ${filePath}: Is a directory`;
		}

		return node.content;
	}
}
