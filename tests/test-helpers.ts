import { mockObsidianState } from './mocks/obsidian';

export interface TestFile {
	path: string;
	basename: string;
	content: string;
}

export function createApp(initialFiles: Record<string, string> = {}) {
	const files = new Map<string, TestFile>();
	for (const [path, content] of Object.entries(initialFiles)) {
		files.set(path, {
			path,
			basename: path.split('/').at(-1)!.replace(/\.md$/, ''),
			content,
		});
	}

	const dailyNotes = {
		enabled: true,
		instance: {
			options: {
				format: 'YYYY-MM-DD',
				folder: 'Daily',
				template: '',
			},
		},
	};

	const app = {
		vault: {
			getFileByPath: (path: string) => files.get(path) ?? null,
			getFiles: () => [...files.values()],
			getMarkdownFiles: () =>
				[...files.values()].filter(({ path }) =>
					path.toLowerCase().endsWith('.md')
				),
			cachedRead: async (file: TestFile) => file.content,
			read: async (file: TestFile) => file.content,
			create: async (path: string, content: string) => {
				const file = {
					path,
					basename: path.split('/').at(-1)!.replace(/\.md$/, ''),
					content,
				};
				files.set(path, file);
				return file;
			},
			append: async (file: TestFile, content: string) => {
				file.content += content;
			},
			process: async (
				file: TestFile,
				transform: (content: string) => string
			) => {
				file.content = transform(file.content);
			},
		},
		workspace: {
			activeView: null as unknown,
			getActiveViewOfType() {
				return this.activeView;
			},
		},
		internalPlugins: {
			plugins: { 'daily-notes': dailyNotes },
			getPluginById: (_id: string) => dailyNotes,
		},
	};

	return { app, files, dailyNotes };
}

export class TestEditor {
	text: string;
	selections: Array<{
		anchor: { line: number; ch: number };
		head: { line: number; ch: number };
	}>;

	constructor(text: string, anchor = { line: 0, ch: 0 }, head = anchor) {
		this.text = text;
		this.selections = [{ anchor: { ...anchor }, head: { ...head } }];
	}

	listSelections() {
		return this.selections;
	}

	getLine(line: number) {
		return this.text.split('\n')[line] ?? '';
	}

	getSelection() {
		const selection = this.selections[0]!;
		const start = Math.min(
			this.positionToOffset(selection.anchor),
			this.positionToOffset(selection.head)
		);
		const end = Math.max(
			this.positionToOffset(selection.anchor),
			this.positionToOffset(selection.head)
		);
		return this.text.slice(start, end);
	}

	setSelection(
		anchor: { line: number; ch: number },
		head: { line: number; ch: number }
	) {
		this.selections = [{ anchor: { ...anchor }, head: { ...head } }];
	}

	getCursor(which?: 'anchor' | 'head') {
		const selection = this.selections[0]!;
		return { ...(which === 'anchor' ? selection.anchor : selection.head) };
	}

	setCursor(position: { line: number; ch: number }) {
		this.setSelection(position, position);
	}

	lastLine() {
		return this.text.split('\n').length - 1;
	}

	replaceRange(
		replacement: string,
		from: { line: number; ch: number },
		to: { line: number; ch: number }
	) {
		const start = this.positionToOffset(from);
		const end = this.positionToOffset(to);
		this.text =
			this.text.slice(0, start) + replacement + this.text.slice(end);
		const cursor = this.offsetToPosition(start + replacement.length);
		this.setCursor(cursor);
	}

	private positionToOffset(position: { line: number; ch: number }) {
		const lines = this.text.split('\n');
		if (position.line >= lines.length) return this.text.length;
		const line = position.line;
		let offset = 0;
		for (let index = 0; index < line; index++) {
			offset += lines[index]!.length + 1;
		}
		return Math.min(offset + position.ch, this.text.length);
	}

	private offsetToPosition(offset: number) {
		const safeOffset = Math.min(offset, this.text.length);
		const before = this.text.slice(0, safeOffset).split('\n');
		return {
			line: before.length - 1,
			ch: before.at(-1)!.length,
		};
	}
}

export function resetTestState() {
	mockObsidianState.modalResults.length = 0;
	mockObsidianState.modalItems.length = 0;
	mockObsidianState.notices.length = 0;
}
