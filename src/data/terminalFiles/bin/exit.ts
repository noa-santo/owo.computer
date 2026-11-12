import { Command } from "@/lib/terminal/Command";

export default class Exit extends Command {
	metadata = {
		command: "exit",
		description: "Exit the terminal and return to the previous page",
		arguments: [],
	};

	method(): string {
		window.history.back();
		return "";
	}
}
