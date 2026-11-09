import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	App,
	Editor,
	MarkdownFileInfo,
	MarkdownView,
	PluginManifest,
} from 'obsidian';
import { CustomCommandRoot, InsertLocation } from '../src/types';
import TextMoverPlugin from '../src/main';
import { mockObsidianState } from './mocks/obsidian';
import {
	createApp,
	resetTestState,
	TestEditor,
	TestFile,
} from './test-helpers';

type RegisteredCommand = {
	id: string;
	editorCallback?: (
		editor: Editor,
		context: MarkdownView | MarkdownFileInfo
	) => Promise<void>;
	checkCallback?: (checking: boolean) => boolean;
};

async function createPlugin(
	data: Record<string, unknown> = {},
	initialFiles: Record<string, string> = {}
) {
	const { app, files, dailyNotes } = createApp(initialFiles);
	const plugin = new TextMoverPlugin(
		app as unknown as App,
		{} as PluginManifest
	);
	(plugin as unknown as { storedData: unknown }).storedData = data;
	await plugin.onload();
	return { plugin, app, files, dailyNotes };
}

function command(plugin: TextMoverPlugin, id: string): RegisteredCommand {
	const found = (
		plugin as unknown as { commands: RegisteredCommand[] }
	).commands.find((registered) => registered.id === id);
	if (!found) {
		throw new Error(`Command not registered: ${id}`);
	}
	return found;
}

async function runEditorCommand(
	plugin: TextMoverPlugin,
	id: string,
	editor: TestEditor,
	file: TestFile
) {
	await command(plugin, id).editorCallback!(
		editor as unknown as Editor,
		{ file } as unknown as MarkdownFileInfo
	);
}

function selectText(
	editor: TestEditor,
	line: number,
	start: number,
	end: number
) {
	editor.setSelection({ line, ch: start }, { line, ch: end });
}

describe('Text Mover commands', () => {
	beforeEach(() => {
		resetTestState();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2024-01-01T12:00:00'));
	});

	it('registers each built-in command and configured custom commands', async () => {
		const { plugin } = await createPlugin({
			customCommands: [
				{
					id: 'move-to-archive',
					name: 'Move to archive',
					path: 'Archive.md',
					root: CustomCommandRoot.File,
					insertLocation: InsertLocation.Append,
				},
			],
		});

		const ids = (
			plugin as unknown as { commands: RegisteredCommand[] }
		).commands.map((registered) => registered.id);
		expect(ids).toEqual(
			expect.arrayContaining([
				'move-text-within-document',
				'move-text-to-another-document',
				'move-text-to-next-daily-note',
				'move-text-to-daily-note',
				'move-to-archive',
			])
		);
	});

	describe('move text within current document', () => {
		it('reports when the current document has no headings', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{ 'Current.md': 'some text' }
			);
			const file = files.get('Current.md')!;
			const editor = new TestEditor(
				'some text',
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(
				plugin,
				'move-text-within-document',
				editor,
				file
			);

			expect(editor.text).toBe('some text');
			expect(mockObsidianState.notices).toContain(
				'No headings found in current document'
			);
		});

		it('moves selected text under a different heading', async () => {
			const content = '# Source\nmove me\n# Target\nexisting';
			const { plugin, files } = await createPlugin(
				{},
				{ 'Current.md': content }
			);
			const file = files.get('Current.md')!;
			const editor = new TestEditor(
				content,
				{ line: 1, ch: 0 },
				{ line: 1, ch: 7 }
			);
			mockObsidianState.modalResults.push({
				index: 1,
				value: 'Target',
				level: 1,
				rawValue: '# Target',
				line: 2,
				insertLocation: InsertLocation.Append,
			});

			await runEditorCommand(
				plugin,
				'move-text-within-document',
				editor,
				file
			);

			expect(editor.text).not.toContain('\nmove me\n');
			expect(editor.text.match(/move me/g)).toHaveLength(1);
			expect(editor.text).toContain('# Target\nexisting\nmove me');
		});

		it('can move text from the final section to an earlier heading', async () => {
			const content = '# First\nexisting\n# Last\nmove me';
			const { plugin, files } = await createPlugin(
				{},
				{ 'Current.md': content }
			);
			const file = files.get('Current.md')!;
			const editor = new TestEditor(
				content,
				{ line: 3, ch: 0 },
				{ line: 3, ch: 7 }
			);
			mockObsidianState.modalResults.push({
				index: 0,
				value: 'First',
				level: 1,
				rawValue: '# First',
				line: 0,
				insertLocation: InsertLocation.Prepend,
			});

			await runEditorCommand(
				plugin,
				'move-text-within-document',
				editor,
				file
			);

			expect(editor.text).toBe('# First\nmove me\nexisting\n# Last\n');
		});
	});

	describe('move text to another document', () => {
		it('appends the selected text to the chosen file and removes it from the source', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{
					'Source.md': 'alpha move beta',
					'Target.md': 'Existing content',
				}
			);
			const source = files.get('Source.md')!;
			const target = files.get('Target.md')!;
			const editor = new TestEditor(source.content);
			selectText(editor, 0, 6, 10);
			mockObsidianState.modalResults.push(target);

			await runEditorCommand(
				plugin,
				'move-text-to-another-document',
				editor,
				source
			);

			expect(target.content).toBe('Existing content\nmove');
			expect(editor.text).toBe('alpha  beta');
		});

		it('leaves the source unchanged when the file picker is dismissed', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{ 'Source.md': 'move me' }
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 7 }
			);
			mockObsidianState.modalResults.push(null);

			await runEditorCommand(
				plugin,
				'move-text-to-another-document',
				editor,
				source
			);

			expect(editor.text).toBe('move me');
		});

		it('only offers Markdown files in the destination picker', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{
					'Source.md': 'move',
					'Target.md': 'existing',
					'image.png': 'not markdown',
				}
			);
			const source = files.get('Source.md')!;
			const target = files.get('Target.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);
			mockObsidianState.modalResults.push(target);

			await runEditorCommand(
				plugin,
				'move-text-to-another-document',
				editor,
				source
			);

			const items = mockObsidianState.modalItems.at(-1) as TestFile[];
			expect(items.map(({ path }) => path)).toEqual([
				'Source.md',
				'Target.md',
			]);
		});

		it('does not remove the source before the destination write completes', async () => {
			const { plugin, app, files } = await createPlugin(
				{},
				{
					'Source.md': 'move',
					'Target.md': 'existing',
				}
			);
			const source = files.get('Source.md')!;
			const target = files.get('Target.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);
			mockObsidianState.modalResults.push(target);

			let releaseWrite!: () => void;
			let signalWriteStarted!: () => void;
			const writeStarted = new Promise<void>((resolve) => {
				signalWriteStarted = resolve;
			});
			let signalWriteCompleted!: () => void;
			const writeCompleted = new Promise<void>((resolve) => {
				signalWriteCompleted = resolve;
			});
			app.vault.process = async (file, transform) => {
				await new Promise<void>((resolve) => {
					releaseWrite = resolve;
					signalWriteStarted();
				});
				file.content = transform(file.content);
				signalWriteCompleted();
			};

			const commandRun = runEditorCommand(
				plugin,
				'move-text-to-another-document',
				editor,
				source
			);
			await writeStarted;
			const sourceWhileWriteIsPending = editor.text;
			releaseWrite();
			await commandRun;
			await writeCompleted;

			expect(sourceWhileWriteIsPending).toBe('move');
			expect(target.content).toBe('existing\nmove');
		});
	});

	describe('move text to the next daily note', () => {
		it('creates the next note and moves the selected text into it', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{ 'Source.md': 'task' }
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(
				plugin,
				'move-text-to-next-daily-note',
				editor,
				source
			);

			expect(files.get('Daily/2024-01-02.md')?.content).toBe('task');
			expect(editor.text).toBe('');
		});

		it('does not move text when Daily Notes is disabled', async () => {
			const { plugin, files, dailyNotes } = await createPlugin(
				{},
				{ 'Source.md': 'task' }
			);
			dailyNotes.enabled = false;
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(
				plugin,
				'move-text-to-next-daily-note',
				editor,
				source
			);

			expect(editor.text).toBe('task');
			expect(mockObsidianState.notices).toContain(
				'Please enable the daily notes plugin'
			);
			expect(files.has('Daily/2024-01-02.md')).toBe(false);
		});

		it('preserves the source when heading selection is canceled', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{
					'Source.md': 'task',
					'Daily/2024-01-02.md': '# Tomorrow\nexisting',
				}
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);
			mockObsidianState.modalResults.push(null);

			await runEditorCommand(
				plugin,
				'move-text-to-next-daily-note',
				editor,
				source
			);

			expect(editor.text).toBe('task');
			expect(files.get('Daily/2024-01-02.md')?.content).toBe(
				'# Tomorrow\nexisting'
			);
		});

		it('separates appended text from existing heading-free daily-note content', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{
					'Source.md': 'task',
					'Daily/2024-01-02.md': 'existing content',
				}
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(
				plugin,
				'move-text-to-next-daily-note',
				editor,
				source
			);

			expect(files.get('Daily/2024-01-02.md')?.content).toBe(
				'existing content\ntask'
			);
		});
	});

	describe('move text to a selected daily note', () => {
		it('uses the selected date rather than tomorrow', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{ 'Source.md': 'task' }
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);
			mockObsidianState.modalResults.push({
				display: '12th March 2030',
				value: '2030-03-12',
			});

			await runEditorCommand(
				plugin,
				'move-text-to-daily-note',
				editor,
				source
			);

			expect(files.get('Daily/2030-03-12.md')?.content).toBe('task');
			expect(files.has('Daily/2024-01-02.md')).toBe(false);
			expect(editor.text).toBe('');
		});

		it('leaves the source unchanged when date selection is canceled', async () => {
			const { plugin, files } = await createPlugin(
				{},
				{ 'Source.md': 'task' }
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);
			mockObsidianState.modalResults.push(null);

			await runEditorCommand(
				plugin,
				'move-text-to-daily-note',
				editor,
				source
			);

			expect(editor.text).toBe('task');
			expect(files.size).toBe(1);
		});

		it.each([
			{
				format: 'YYYY-MM-DD',
				value: '2030-03-20',
				path: 'Daily/2030-03-20.md',
			},
			{
				format: 'MMMM DD, YYYY',
				value: 'March 20, 2030',
				path: 'Daily/March 20, 2030.md',
			},
		])(
			'uses a selected date with format $format',
			async ({ format, value, path }) => {
				const { plugin, app, files } = await createPlugin(
					{},
					{ 'Source.md': 'task' }
				);
				app.internalPlugins.getPluginById(
					'daily-notes'
				).instance.options.format = format;
				const source = files.get('Source.md')!;
				const editor = new TestEditor(
					source.content,
					{ line: 0, ch: 0 },
					{ line: 0, ch: 4 }
				);
				mockObsidianState.modalResults.push({
					display: value,
					value,
				});

				await runEditorCommand(
					plugin,
					'move-text-to-daily-note',
					editor,
					source
				);

				expect(files.get(path)?.content).toBe('task');
			}
		);
	});

	describe('custom commands', () => {
		it('prepends selected text to its configured file', async () => {
			const customCommand = {
				id: 'move-to-archive',
				name: 'Move to archive',
				path: 'Archive.md',
				root: CustomCommandRoot.File,
				insertLocation: InsertLocation.Prepend,
			};
			const { plugin, files } = await createPlugin(
				{ customCommands: [customCommand] },
				{ 'Source.md': 'move', 'Archive.md': '# Archive\nexisting' }
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(plugin, customCommand.id, editor, source);

			expect(files.get('Archive.md')?.content).toBe(
				'move\n# Archive\nexisting'
			);
			expect(editor.text).toBe('');
		});

		it('moves text to the next daily note for a daily-note custom command', async () => {
			const customCommand = {
				id: 'move-to-daily',
				name: 'Move to daily',
				path: 'placeholder.md',
				root: CustomCommandRoot.DailyNote,
				insertLocation: InsertLocation.Append,
			};
			const { plugin, files, dailyNotes } = await createPlugin(
				{ customCommands: [customCommand] },
				{ 'Source.md': 'task', 'Template.md': '# Daily template' }
			);
			dailyNotes.instance.options.template = 'Template.md';
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(plugin, customCommand.id, editor, source);

			expect(files.get('Daily/2024-01-02.md')?.content).toBe(
				'# Daily template\ntask'
			);
			expect(editor.text).toBe('');
		});

		it('adds to an existing note for a daily-note custom command', async () => {
			const customCommand = {
				id: 'move-to-daily',
				name: 'Move to daily',
				path: 'Template.md',
				root: CustomCommandRoot.DailyNote,
				insertLocation: InsertLocation.Append,
			};
			const { plugin, app, files, dailyNotes } = await createPlugin(
				{ customCommands: [customCommand] },
				{
					'Source.md': 'task',
					'Template.md': '# Template',
					'Daily/2024-01-02.md': '# Existing note',
				}
			);
			dailyNotes.instance.options.template = 'Template.md';
			app.vault.create = async () => {
				throw new Error('File already exists');
			};
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await expect(
				runEditorCommand(plugin, customCommand.id, editor, source)
			).resolves.toBeUndefined();

			expect(files.get('Daily/2024-01-02.md')?.content).toBe(
				'# Existing note\ntask'
			);
		});

		it('preserves the source when Daily Notes is disabled', async () => {
			const customCommand = {
				id: 'move-to-daily',
				name: 'Move to daily',
				path: 'Template.md',
				root: CustomCommandRoot.DailyNote,
				insertLocation: InsertLocation.Append,
			};
			const { plugin, files, dailyNotes } = await createPlugin(
				{ customCommands: [customCommand] },
				{ 'Source.md': 'task', 'Template.md': '# Template' }
			);
			dailyNotes.enabled = false;
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(plugin, customCommand.id, editor, source);

			expect(editor.text).toBe('task');
		});

		it('preserves the source when the configured destination file is missing', async () => {
			const customCommand = {
				id: 'move-to-missing-file',
				name: 'Move to missing file',
				path: 'Missing.md',
				root: CustomCommandRoot.File,
				insertLocation: InsertLocation.Append,
			};
			const { plugin, files } = await createPlugin(
				{ customCommands: [customCommand] },
				{ 'Source.md': 'task' }
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(plugin, customCommand.id, editor, source);

			expect(editor.text).toBe('task');
		});

		it('inserts text under the configured heading rather than at file level', async () => {
			const customCommand = {
				id: 'move-under-first-heading',
				name: 'Move under first heading',
				path: 'Target.md',
				root: CustomCommandRoot.File,
				heading: {
					index: 0,
					rawValue: '# First',
					level: 1,
					value: 'First',
					line: 0,
				},
				insertLocation: InsertLocation.Append,
			};
			const { plugin, files } = await createPlugin(
				{ customCommands: [customCommand] },
				{
					'Source.md': 'task',
					'Target.md':
						'# First\nfirst content\n# Second\nsecond content',
				}
			);
			const source = files.get('Source.md')!;
			const editor = new TestEditor(
				source.content,
				{ line: 0, ch: 0 },
				{ line: 0, ch: 4 }
			);

			await runEditorCommand(plugin, customCommand.id, editor, source);

			expect(files.get('Target.md')?.content).toBe(
				'# First\nfirst content\ntask\n# Second\nsecond content'
			);
		});
	});

	describe('command registration', () => {
		it('does not register the removed Open modal (complex) placeholder', async () => {
			const { plugin } = await createPlugin();
			const ids = (
				plugin as unknown as { commands: RegisteredCommand[] }
			).commands.map((registered) => registered.id);
			expect(ids).not.toContain('open-modal-complex');
		});
	});
});

describe('selection validation', () => {
	beforeEach(resetTestState);

	it('rejects multiple selections', async () => {
		const { plugin } = await createPlugin();
		const editor = new TestEditor('first\nsecond');
		editor.selections.push({
			anchor: { line: 1, ch: 0 },
			head: { line: 1, ch: 6 },
		});

		expect(plugin.validateSelection(editor as unknown as Editor)).toBe(
			false
		);
		expect(mockObsidianState.notices).toContain(
			'Cannot move text with multiple selections'
		);
	});

	it('selects the current line when there is no explicit selection', async () => {
		const { plugin } = await createPlugin();
		const editor = new TestEditor('first line', { line: 0, ch: 5 });

		expect(plugin.validateSelection(editor as unknown as Editor)).toBe(
			true
		);
		expect(editor.getSelection()).toBe('first line');
	});

	it('rejects an empty current line', async () => {
		const { plugin } = await createPlugin();
		const editor = new TestEditor('');

		expect(plugin.validateSelection(editor as unknown as Editor)).toBe(
			false
		);
		expect(mockObsidianState.notices).toContain(
			'Cannot move text with no selection'
		);
	});
});
