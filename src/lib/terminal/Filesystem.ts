export interface Directory {
	type: "directory";
	name: string;
	children: (Directory | File)[];
}

export class Directory {
	public type: "directory" = "directory";
	public name: string;
	public children: (Directory | File)[] = [];

	public constructor(parent?: Directory, name?: string) {
		this.name = parent === undefined ? "/" : name!;
		if (parent) parent.children.push(this);
	}

	public getChildByPath(_path: string): Directory | File {
		// todo
		return this;
	}
}

export type File = {
	type: "file";
	name: string;
	content: string;
};
