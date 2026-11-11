import { Command, type ParsedArgs } from "@/lib/terminal/Command";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Export extends Command {
	metadata = {
		command: "export",
		description: "Set an environment variable.",
		arguments: [
			{ flag: 0, description: "Variable assignment (e.g., OWO=uwu)" },
		],
	};

	public method(terminal: Terminal, args: ParsedArgs, _: string): string {
		const assignment = args.get(0) as string;
		if (!assignment) return "export: usage: export VAR=value";
		const idx = assignment.indexOf("=");
		if (idx === -1) return "";
		const key = assignment.slice(0, idx);
		const value = assignment.slice(idx + 1);
		terminal.env.set(key, value.split(":"));
		return "";
	}
}
