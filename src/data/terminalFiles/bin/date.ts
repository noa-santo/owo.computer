import { Command } from "@/lib/terminal/Command";

export default class DateCmd extends Command {
	metadata = {
		command: "date",
		description: "Print the system date and time.",
		arguments: [],
	};
	public method(): string {
		return new Date().toString();
	}
}
