import type { Terminal } from "@/lib/terminal/Terminal";

export interface Directory {
	type: "directory";
	name: string;
	children: (Directory | File)[];
}

export class Directory {
	public type: "directory" = "directory";
	public name: string;
	public children: (Directory | File)[] = [];
	public parent?: Directory;

	public constructor(parent?: Directory, name?: string) {
		this.parent = parent;
		this.name = parent === undefined ? "/" : name!;
		if (parent) parent.children.push(this);
	}

	public getChildByPath(
		path: string,
		cwd: Directory = this,
	): Directory | File | null {
		if (!path || path.trim() === "") return cwd;

		const isAbsolute = path.startsWith("/");
		const segments = path.split("/").filter(Boolean);

		let current: Directory | File = isAbsolute ? this.getRoot() : cwd;

		for (const segment of segments) {
			if (current.type !== "directory") return null;

			if (segment === ".") {
				continue;
			}

			if (segment === "..") {
				current = current.parent ?? current;
				continue;
			}

			const found: Directory | File | undefined = current.children.find(
				(child) => child.name === segment,
			);
			if (!found) return null;
			current = found;
		}

		return current;
	}

	public getAbsolutePath(): string {
		if (!this.parent) return "/";
		const parentPath = this.parent.getAbsolutePath();
		return parentPath === "/" ? `/${this.name}` : `${parentPath}/${this.name}`;
	}

	private getRoot(): Directory {
		let current: Directory = this;
		while (current.parent) {
			current = current.parent;
		}
		return current;
	}
}

export type File = {
	type: "file";
	name: string;
	content: string;
	bundled?: boolean;
};

export function resolveNode(
	terminal: Terminal,
	pathStr: string,
): Directory | File | null {
	return terminal.fs.getChildByPath(pathStr, terminal.currentDir);
}

export function writeFile(
	terminal: Terminal,
	targetPath: string,
	content: string,
	append = false,
): void {
	const parts = targetPath.split("/").filter(Boolean);
	if (parts.length === 0) throw new Error(`${targetPath}: Is a directory`);

	const fileName = parts.pop()!;
	const parentPath = targetPath.startsWith("/")
		? `/${parts.join("/")}`
		: parts.join("/");

	const parentNode =
		parts.length === 0
			? terminal.currentDir
			: resolveNode(terminal, parentPath);

	if (parentNode?.type !== "directory") {
		throw new Error(`${targetPath}: No such file or directory`);
	}

	const existingChild = parentNode.children.find((c) => c.name === fileName);

	if (existingChild) {
		if (existingChild.type === "directory") {
			throw new Error(`${targetPath}: Is a directory`);
		}
		existingChild.content = append
			? existingChild.content
				? `${existingChild.content}\n${content}`
				: content
			: content;
	} else {
		const newFile: File = {
			type: "file",
			name: fileName,
			content,
		};
		parentNode.children.push(newFile);
	}
}
