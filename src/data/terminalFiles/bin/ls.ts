import { type ArgumentMap, Command, type Env } from "@/lib/terminal/Command";
import type { Directory } from "@/lib/terminal/Filesystem";

export default class Ls extends Command {
	metadata = {
		command: "ls",
		description:
			"Lists contents of a direcotry. When no argument is given it will use the current one.",
		arguments: [
			{
				flag: 0,
				description: "The directory to list the contents of.",
				defaultValue: ".",
			},
		],
	};
	public method(
		fs: Directory,
		args: ArgumentMap,
		_env: Env,
		_: string,
	): string {
		const node = fs.getChildByPath(args.get(0)!);
		return node.type === "directory"
			? node.children?.map((c) => c.name).join(" ")
			: node.name;
	}
}
