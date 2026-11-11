import { Command } from "@/lib/terminal/Command";

export default class Whoami extends Command {
	metadata = {
		command: "whoami",
		description: "Print effective userid.",
		arguments: [],
	};
	public method(): string {
		return "owo";
	}
}
