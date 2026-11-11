import {
	Editor,
	MarkdownView,
	MarkdownFileInfo,
	Notice,
	Plugin,
	EditorSelection,
	FuzzySuggestModal,
	TFile,
	App,
	FuzzyMatch,
	renderResults,
	EditorPosition,
	moment,
	normalizePath,
	SuggestModal,
} from 'obsidian';
import {
	CustomTextMoveCommand,
	DEFAULT_SETTINGS,
	TextMoverPluginSettings,
	TextMoverSettingTab,
} from './settings';
import {
	CustomCommandRoot,
	DailyNoteSettings,
	Heading,
	InsertLocation,
	TMDate,
} from './types';
import {
	getFileHeadings,
	getNextHeading,
	headingInHeadings,
	removeSelectionFromEditor,
} from './utils';

const DEFAULT_DAILY_NOTE_FORMAT = 'YYYY-MM-DD';

export default class TextMoverPlugin extends Plugin {
	settings!: TextMoverPluginSettings;

	async onload() {
		await this.loadSettings();

		// NOTE: command that takes the currently selected text or line
		// and opens a modal to move it to another section within the document
		this.addCommand({
			id: 'move-text-within-document',
			name: 'Move text within current document',
			editorCallback: async (
				editor: Editor,
				ctx: MarkdownView | MarkdownFileInfo
			) => {
				if (!this.validateSelection(editor)) {
					this.resetCursor(editor);
					return;
				}
				const fileContent: string = await this.app.vault.cachedRead(
					ctx.file!
				);
				let headings: Heading[] = getFileHeadings(fileContent);
				if (headings.length === 0) {
					new Notice('No headings found in current document');
					this.resetCursor(editor);
					return;
				}
				// Have to remove the heading that the selection is currently in
				// And have to account for it being the last heading
				const cursor: EditorPosition = editor.getCursor();
				if (cursor.line > headings.last()!.line) {
					headings.remove(headings.last()!);
				} else {
					for (let i = 0; i < headings.length; i++) {
						const heading: Heading = headings[i]!;
						if (
							cursor.line >= heading.line &&
							cursor.line < headings[i + 1]!.line
						) {
							headings.remove(heading);
							break;
						}
					}
				}
				// Select a heading to move to
				const heading: Heading | null = await new HeadingSelectionModal(
					this.app,
					headings,
					this.settings.appendAndPrepend
				).pick();

				if (!heading) {
					this.resetCursor(editor);
					return;
				}

				const currentSelection: string = editor.getSelection();
				removeSelectionFromEditor(editor);

				// Add the selection to the target heading
				const headingIsAfterCursor: boolean =
					heading.line > editor.getCursor().line;
				// NOTE: this accounts for removing the heading before
				const headingIsLast: boolean = heading.index == headings.length;
				const textToAdd: string = '\n' + currentSelection;

				let lineToAdd: number;

				if (headingIsAfterCursor) {
					if (headingIsLast) {
						if (heading.insertLocation == InsertLocation.Prepend) {
							lineToAdd = heading.line - 1;
						} else {
							lineToAdd = editor.lastLine();
						}
					} else {
						if (heading.insertLocation == InsertLocation.Prepend) {
							lineToAdd = heading.line - 1;
						} else {
							// NOTE: this *should* be `headings[heading.index + 1]` to get
							// the next heading but because we've removed the heading the
							// cursor is currently in, we use the selected heading index
							// to actually get the next heading
							lineToAdd = headings[heading.index]!.line - 2;
						}
					}
				} else {
					if (heading.insertLocation == InsertLocation.Prepend) {
						lineToAdd = heading.line;
					} else {
						// NOTE: this `heading + 1` works because the removed heading
						// is after the selected heading so doesn't affect the index
						lineToAdd = headings[heading.index + 1]!.line - 1;
					}
				}

				const lastCh: number = editor.getLine(lineToAdd).length;

				editor.replaceRange(
					textToAdd,
					{ ch: lastCh, line: lineToAdd },
					{ ch: lastCh, line: lineToAdd }
				);

				this.resetCursor(editor);
			},
		});
		// NOTE: command that takes the currently selected text or line
		// and opens a modal to move it to another document
		this.addCommand({
			id: 'move-text-to-another-document',
			name: 'Move text to another document',
			editorCallback: async (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo
			) => {
				// TODO: want to be able to select headings
				if (!this.validateSelection(editor)) {
					return;
				}
				const file = await new FileSelectionModal(this.app).pick();

				if (!file) {
					this.resetCursor(editor);
					return;
				}

				const currentSelection: string = editor.getSelection();
				// Add the selection to the target file
				await this.app.vault.process(file, (data) => {
					return data + '\n' + currentSelection;
				});
				removeSelectionFromEditor(editor);
				this.resetCursor(editor);
			},
		});
		// NOTE: command that takes the currently selected text or line
		// and moves it to the next daily note
		this.addCommand({
			id: 'move-text-to-next-daily-note',
			name: 'Move text to next daily note',
			editorCallback: async (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo
			) => {
				if (!this.validateSelection(editor)) {
					this.resetCursor(editor);
					return;
				}
				if (!this.appHasDailyNotesPluginLoaded()) {
					new Notice('Please enable the daily notes plugin');
					this.resetCursor(editor);
					return;
				}
				const settings: DailyNoteSettings =
					this.getDailyNotesPluginSettings();
				const path: string = this.getPathForNextDailyNote(settings);
				if (await this.addToDailyNote(editor, path, settings)) {
					// remove the selection from the current note
					removeSelectionFromEditor(editor);
				}

				this.resetCursor(editor);
			},
		});
		this.addCommand({
			id: 'move-text-to-daily-note',
			name: 'Move text to daily note',
			editorCallback: async (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo
			) => {
				// for this command the idea is to open a modal that allows the user to type in a natural language
				// date and then it will go through and do the move to daily note flow as previous.
				// the only difference is that it should have an initial modal that selects the correct daily note
				if (!this.validateSelection(editor)) {
					this.resetCursor(editor);
					return;
				}
				if (!this.appHasDailyNotesPluginLoaded()) {
					new Notice('Please enable the daily notes plugin');
					this.resetCursor(editor);
					return;
				}
				const settings: DailyNoteSettings =
					this.getDailyNotesPluginSettings();
				const selectedDate: TMDate | null =
					await new DateSelectionModal(
						this.app,
						settings.format!
					).pick();

				if (!selectedDate) {
					this.resetCursor(editor);
					return;
				}

				const path: string = normalizePath(
					settings.folder +
						'/' +
						moment(selectedDate.value).format(settings.format) +
						'.md'
				);
				if (await this.addToDailyNote(editor, path, settings)) {
					// remove the selection from the current note
					removeSelectionFromEditor(editor);
				}

				this.resetCursor(editor);
			},
		});
		if (this.settings.customCommands) {
			for (let i = 0; i < this.settings.customCommands.length; i++) {
				const command: CustomTextMoveCommand | undefined =
					this.settings.customCommands[i];
				if (!command || !command.path || !command.name) {
					new Notice('This text mover command does not exist');
				} else {
					this.addCustomCommand(command);
				}
			}
		}

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TextMoverSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<TextMoverPluginSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Ensures the current selection in the editor is not a multi cursor selection
	 * and is not a completely empty line.
	 * Will also update the editor selection to be the entire line if there is no selection.
	 */
	validateSelection(editor: Editor): boolean {
		// Selection uses multiple cursors
		const editorSelections: EditorSelection[] = editor.listSelections();
		if (editorSelections.length > 1) {
			new Notice('Cannot move text with multiple selections');
			return false;
		}

		// Selection is not empty
		if (editor.getSelection()) {
			return true;
		}

		// Update the selection to the entire line if there is no selection
		const editorSelection: EditorSelection = editorSelections.at(0)!;
		const currentLineNumber: number = editorSelection.anchor.line;
		const currentLine = editor.getLine(currentLineNumber);
		if (!currentLine) {
			new Notice('Cannot move text with no selection');
			return false;
		}
		editor.setSelection(
			{ ch: 0, line: currentLineNumber },
			{ ch: currentLine.length, line: currentLineNumber }
		);
		return true;
		// FIXME: what about when the editor position is somewhere weird like in frontmatter?
	}

	async addToDailyNote(
		editor: Editor,
		path: string,
		settings: DailyNoteSettings
	): Promise<boolean> {
		let file: TFile | null = this.app.vault.getFileByPath(path);
		if (!file) {
			let newFileData: string = '';
			// get the content of the settings template
			if (settings.template) {
				const templatePath: string = normalizePath(settings.template);
				const templateFile: TFile | null =
					this.app.vault.getFileByPath(templatePath);
				if (templateFile) {
					newFileData = await this.app.vault.read(templateFile);
				}
			}
			file = await this.app.vault.create(path, newFileData);
		}
		// get file headings
		const fileContent: string = await this.app.vault.cachedRead(file);
		const headings: Heading[] = getFileHeadings(fileContent);
		if (headings.length == 0) {
			if (fileContent) {
				await this.app.vault.append(file, '\n' + editor.getSelection());
			} else {
				await this.app.vault.append(file, editor.getSelection());
			}
			return true;
		} else {
			// open selector for headings with each heading duplicated for append or prepend
			const heading: Heading | null = await new HeadingSelectionModal(
				this.app,
				headings,
				this.settings.appendAndPrepend
			).pick();
			if (!heading) {
				// TODO: if the user cancels the heading selection but we have just created a new file,
				// should we delete the newly created file or leave it?
				this.resetCursor(editor);
				return false;
			}
			let lineNumberToInsert: number = 0;
			let lines: string[] = fileContent.split('\n');

			if (heading.insertLocation == InsertLocation.Prepend) {
				lineNumberToInsert = heading.line + 1;
			} else {
				const nextHeading: Heading = getNextHeading(heading, headings);
				if (nextHeading.index == heading.index) {
					lineNumberToInsert = lines.length;
				} else {
					lineNumberToInsert = nextHeading.line;
				}
			}

			// NOTE: even if the index is out of bounds, splice will just
			// add it to the end of the array
			lines.splice(lineNumberToInsert, 0, editor.getSelection());
			await this.app.vault.process(file, (_data: string) => {
				return lines.join('\n');
			});
			return true;
		}
	}

	async addToFile(
		editor: Editor,
		command: CustomTextMoveCommand
	): Promise<boolean> {
		let file: TFile | null;
		if (command.root == CustomCommandRoot.DailyNote) {
			if (!this.appHasDailyNotesPluginLoaded()) {
				new Notice('Please enable the daily notes plugin');
				this.resetCursor(editor);
				return false;
			}
			const settings: DailyNoteSettings =
				this.getDailyNotesPluginSettings();
			const path: string = this.getPathForNextDailyNote(settings);

			let newFileData: string = '';
			// get the content of the settings template
			if (settings.template) {
				const templatePath: string = normalizePath(settings.template);
				const templateFile: TFile | null =
					this.app.vault.getFileByPath(templatePath);
				if (templateFile) {
					newFileData = await this.app.vault.read(templateFile);
				}
			}

			file = this.app.vault.getFileByPath(path);
			if (!file) {
				file = await this.app.vault.create(path, newFileData);
			}
		} else {
			file = this.app.vault.getFileByPath(command.path!);
		}

		if (!file) {
			return false;
		}
		const fileContent: string = await this.app.vault.cachedRead(file);
		if (!fileContent) {
			await this.app.vault.append(file, editor.getSelection());
			return true;
		}
		const headings: Heading[] = getFileHeadings(fileContent);

		let lineNumberToInsert: number = 0;
		let lines: string[] = fileContent.split('\n');

		if (!command.heading || !headingInHeadings(command.heading, headings)) {
			if (command.insertLocation == InsertLocation.Prepend) {
				lineNumberToInsert = 0;
			} else {
				lineNumberToInsert = lines.length;
			}
		} else {
			if (command.insertLocation == InsertLocation.Prepend) {
				lineNumberToInsert = command.heading.line + 1;
			} else {
				const nextHeading: Heading = getNextHeading(
					command.heading,
					headings
				);
				if (nextHeading.index == command.heading.index) {
					lineNumberToInsert = lines.length;
				} else {
					lineNumberToInsert = nextHeading.line;
				}
			}
		}
		// NOTE: even if the index is out of bounds, splice will just
		// add it to the end of the array
		lines.splice(lineNumberToInsert, 0, editor.getSelection());
		await this.app.vault.process(file, (_data: string) => {
			return lines.join('\n');
		});

		return true;
	}

	appHasDailyNotesPluginLoaded(): boolean {
		const dailyNotesPlugin =
			this.app.internalPlugins.plugins['daily-notes'];
		if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
			return true;
		}
		return false;
	}

	getDailyNotesPluginSettings(): DailyNoteSettings {
		const { format, folder, template } =
			this.app.internalPlugins.getPluginById('daily-notes')?.instance
				?.options || {};
		return {
			format: format || DEFAULT_DAILY_NOTE_FORMAT,
			folder: this.validateString(folder).trim(),
			template: this.validateString(template).trim(),
		};
	}

	getPathForNextDailyNote(
		settings?: DailyNoteSettings,
		offset: number = 1
	): string {
		if (!settings) {
			settings = this.getDailyNotesPluginSettings();
		}
		return normalizePath(
			settings.folder +
				'/' +
				moment(Date.now()).add(offset, 'd').format(settings.format) +
				'.md'
		);
	}

	validateString(value: unknown): string {
		return typeof value === 'string' ? value : '';
	}

	resetCursor(editor: Editor): void {
		editor.setCursor(editor.getCursor('head'));
	}

	removeCustomCommand(id: string) {
		this.removeCommand(id);
	}

	addCustomCommand(command: CustomTextMoveCommand) {
		this.addCommand({
			id: command.id!,
			name: command.name!,
			editorCallback: async (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo
			) => {
				if (!command) {
					return new Notice('This text mover command does not exist');
				}
				if (!this.validateSelection(editor)) {
					this.resetCursor(editor);
					return;
				}

				// add to the file
				if (await this.addToFile(editor, command)) {
					// remove the selection from the current note
					removeSelectionFromEditor(editor);
				}

				this.resetCursor(editor);
				return;
			},
		});
	}
}

class FileSelectionModal extends FuzzySuggestModal<TFile> {
	private finish?: (file: TFile | null) => void;

	pick(): Promise<TFile | null> {
		return new Promise((resolve) => {
			this.finish = resolve;
			this.open();
		});
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.finish?.(file);
	}

	onClose(): void {
		// FuzzySuggestModal may close before calling onChooseItem. Defer the
		// dismissal result so a same-turn selection can resolve with its heading.
		void Promise.resolve().then(() => {
			this.finish?.(null);
			this.finish = undefined;
		});
	}
}

class HeadingSelectionModal extends FuzzySuggestModal<Heading> {
	private headings: Heading[];
	private finish?: (heading: Heading | null) => void;
	private appendAndPrepend: boolean;

	constructor(app: App, headings: Heading[], appendAndPrepend: boolean) {
		super(app);
		this.headings = headings;
		this.appendAndPrepend = appendAndPrepend;
	}

	pick(): Promise<Heading | null> {
		return new Promise((resolve) => {
			this.finish = resolve;
			this.open();
		});
	}

	getItems(): Heading[] {
		if (this.appendAndPrepend) {
			let newHeadings: Heading[] = [];
			for (let i = 0; i < this.headings.length; i++) {
				const h: Heading = this.headings[i]!;
				newHeadings.push({
					...h,
					insertLocation: InsertLocation.Append,
				});
				newHeadings.push({
					...h,
					insertLocation: InsertLocation.Prepend,
				});
			}
			return newHeadings;
		}
		return this.headings;
	}

	getItemText(heading: Heading): string {
		return heading.value;
	}

	renderSuggestion(match: FuzzyMatch<Heading>, el: HTMLElement) {
		const valueEl = el.createDiv();
		renderResults(valueEl, match.item.value, match.match);

		el.createEl('small', {
			text: `Heading ${match.item.level} - ${match.item.insertLocation == InsertLocation.Prepend ? 'Prepend' : 'Append'} - Line ${match.item.line}`,
		});
	}

	onChooseItem(heading: Heading, _evt: MouseEvent | KeyboardEvent): void {
		this.finish?.(heading);
	}

	onClose(): void {
		// FuzzySuggestModal may close before calling onChooseItem. Defer the
		// dismissal result so a same-turn selection can resolve with its heading.
		void Promise.resolve().then(() => {
			this.finish?.(null);
			this.finish = undefined;
		});
	}
}

class DateSelectionModal extends SuggestModal<TMDate> {
	private finish?: (tmdate: TMDate | null) => void;
	private defaultSuggestions: TMDate[] = [];
	private dateFormat: string;

	constructor(app: App, dateFormat: string) {
		super(app);
		this.dateFormat = dateFormat;

		let suggestions: TMDate[] = [];
		for (let i = 0; i < 7; i++) {
			const date = moment(Date.now()).add(i, 'd');
			let display = '';
			if (i == 0) {
				display = 'Today';
			} else if (i == 1) {
				display = 'Tomorrow';
			} else {
				display = date.format('dddd');
			}
			suggestions.push({
				display: display,
				value: date.format(dateFormat),
			});
		}
		this.defaultSuggestions = suggestions;
	}

	pick(): Promise<TMDate | null> {
		return new Promise((resolve) => {
			this.finish = resolve;
			this.open();
		});
	}

	getSuggestions(query: string): TMDate[] {
		// query has a number so user wants to put in a manual date
		if (/(?:^\d{1,2})(?:$|\D)/.test(query)) {
			const parts: string[] = query.trim().split(/\s+/);
			const day: number = parseInt(parts[0]!);
			const currentMonth: number = parseInt(
				moment(Date.now()).format('M')
			);

			let suggestions: TMDate[] = [];
			for (let i = 0; i < 12; i++) {
				const currentDate: moment.Moment = moment(Date.now());
				const nextDate = currentDate
					.month(currentMonth - 1 + i)
					.date(day);
				// exclude any duplicate months caused by date wraparound
				if (nextDate.month() == (currentMonth - 1 + i) % 12) {
					suggestions.push({
						display: nextDate.format('Do MMMM YYYY'),
						value: nextDate.format(this.dateFormat),
					});
				}
			}

			if (parts.length > 1) {
				// match the 2nd query part to the month
				return suggestions.filter(({ display }) => {
					const displayParts = display.split(' ');
					return displayParts[1]!
						.toLowerCase()
						.startsWith(parts[1]!.toLowerCase());
				});
			}

			return suggestions;
		}
		// filter the default suggestions
		return this.defaultSuggestions.filter(({ display }) =>
			display.toLowerCase().startsWith(query.toLowerCase())
		);
	}

	renderSuggestion(value: TMDate, el: HTMLElement): void {
		el.createDiv({ text: value.display });
		el.createEl('small', { text: value.value });
	}

	onChooseSuggestion(tmdate: TMDate, _evt: MouseEvent | KeyboardEvent): void {
		this.finish?.(tmdate);
	}

	onClose(): void {
		// FuzzySuggestModal may close before calling onChooseItem. Defer the
		// dismissal result so a same-turn selection can resolve with its heading.
		void Promise.resolve().then(() => {
			this.finish?.(null);
			this.finish = undefined;
		});
	}
}
