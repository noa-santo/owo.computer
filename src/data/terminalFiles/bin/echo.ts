import { type ArgumentMap, Command, type Env } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Echo extends Command {
	metadata = {
		command: "echo",
		description: "Display a line of text.",
		arguments: [
			{
				flag: 0,
				description: "Text to print.",
				defaultValue: "",
			},
		],
	};

	public method(
		_terminal: Terminal,
		args: ArgumentMap,
		_env: Env,
		_: string,
	): string {
		const values: string[] = [];
		let i = 0;
		while (args.has(i)) {
			values.push(args.get(i)!);
			i++;
		}
		return values.join(" ");
	}
}
