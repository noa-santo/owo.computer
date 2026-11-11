import { Command, type Env, type ParsedArgs } from "@/lib/terminal/Command";
import { resolveNode } from "@/lib/terminal/Filesystem";
import type { Terminal } from "@/lib/terminal/Terminal";

export default class Grep extends Command {
	metadata = {
		command: "grep",
		description: "Print lines matching a pattern.",
		arguments: [
			{
				flag: "ignore-case",
				description: "Ignore case distinctions in patterns and data.",
				defaultValue: false,
				type: "boolean" as const,
			},
			{
				flag: "invert-match",
				description:
					"Invert the sense of matching, to select non-matching lines.",
				defaultValue: false,
				type: "boolean" as const,
			},
			{
				flag: "line-number",
				description: "Prefix each line of output with its 1-based line number.",
				defaultValue: false,
				type: "boolean" as const,
			},
			{
				flag: "count",
				description: "Print only a count of matching lines.",
				defaultValue: false,
				type: "boolean" as const,
			},
			{
				flag: "word-regexp",
				description:
					"Select only those lines containing matches that form whole words.",
				defaultValue: false,
				type: "boolean" as const,
			},
			{
				flag: 0,
				description: "Pattern to search for.",
			},
			{
				flag: 1,
				description: "File path to read from.",
			},
		],
	};

	public method(
		terminal: Terminal,
		args: ParsedArgs,
		_env: Env,
		stdin: string,
	): string {
		const pattern = args.get(0) as string | undefined;
		const filePath = args.get(1) as string | undefined;

		if (!pattern) {
			return "grep: missing pattern";
		}

		let inputContent = stdin;

		if (filePath) {
			const node = resolveNode(terminal, filePath);
			if (!node) return `grep: ${filePath}: No such file or directory`;
			if (node.type === "directory") return `grep: ${filePath}: Is a directory`;
			inputContent = node.content;
		}

		if (inputContent === undefined) return "";

		const ignoreCase = Boolean(args.get("ignore-case"));
		const invertMatch = Boolean(args.get("invert-match"));
		const lineNumber = Boolean(args.get("line-number"));
		const countOnly = Boolean(args.get("count"));
		const wordRegexp = Boolean(args.get("word-regexp"));

		let regexPattern = pattern;
		if (wordRegexp) {
			regexPattern = `\\b${pattern}\\b`;
		}

		const regexFlags = ignoreCase ? "i" : "";
		let regex: RegExp;
		try {
			regex = new RegExp(regexPattern, regexFlags);
		} catch {
			return `grep: invalid regular expression '${pattern}'`;
		}

		const lines = inputContent.split("\n");
		const matchedLines: string[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const isMatch = regex.test(line);
			const matches = invertMatch ? !isMatch : isMatch;

			if (matches) {
				const lineOutput = lineNumber ? `${i + 1}:${line}` : line;
				matchedLines.push(lineOutput);
			}
		}

		if (countOnly) {
			return String(matchedLines.length);
		}

		return matchedLines.join("\n");
	}
}
