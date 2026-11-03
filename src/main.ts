/* eslint-disable obsidianmd/rule-custom-message */
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
	normalizePath
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	TextMoverPluginSettings,
	TextMoverSettingTab
} from './settings';
import { DailyNoteSettings, Heading } from './types';
import { getFileHeadings, removeSelectionFromEditor } from './utils';

const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";

export default class TextMoverPlugin extends Plugin {
	settings!: TextMoverPluginSettings;

	async onload() {
		await this.loadSettings();

		// NOTE: command that takes the currently selected text or line 
		// and opens a modal to move it to another section within the document
		this.addCommand({
			id: 'move-text-within-document',
			name: 'Move text within current document',
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				this.validateSelection(editor);
				const fileContent: string = await this.app.vault.cachedRead(ctx.file!)
				let headings: Heading[] = getFileHeadings(fileContent)
				if (headings.length === 0) {
					new Notice('No headings found in current document');
					return;
				}
				const heading = await new HeadingSelectionModal(this.app, headings).pick();
				console.log(heading)

				if (!heading) {
					return
				}

				// Have to remove the heading that the selection is currently in
				// And have to account for it being the last heading
				const cursor: EditorPosition = editor.getCursor()
				if (cursor.line > headings[headings.length - 1]!.line) {
					headings.remove(headings[headings.length - 1]);
				}
				for (let i = 0; i < headings.length; i++) {
					const heading: Heading = headings[i];
					if (cursor.line >= heading.line && cursor.line < headings[i + 1]!.line) {
						headings.remove(heading);
						break;
					}
				}

				const currentSelection: string = editor.getSelection()
				removeSelectionFromEditor(editor)
				// Add the selection to the target heading
				let index: number = heading.index;
				// If we are moving to the final heading, append the selection to the end of the file
				if (index + 1 >= headings.length) {
					const lastLine: number = editor.lastLine();
					const lastCh: number = editor.getLine(lastLine).length;
					editor.replaceRange(
						'\n' + currentSelection,
						{ ch: lastCh, line: lastLine },
						{ ch: lastCh, line: lastLine }
					);
				} else {
					// If the section we are moving to is after the current cursor position we have to account for the current selection being deleted
					let line: number = headings[heading.index + 1]!.line
					if (line > editor.getCursor().line) {
						line -= 1
					}
					editor.replaceRange(
						currentSelection + '\n',
						{ ch: 0, line: line },
						{ ch: 0, line: line }
					);
				}
			},
		});
		// NOTE: command that takes the currently selected text or line 
		// and opens a modal to move it to another document
		this.addCommand({
			id: 'move-text-to-another-document',
			name: 'Move text to another document',
			editorCallback: async (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				this.validateSelection(editor);
				const file = await new FileSelectionModal(this.app).pick();

				if (!file) {
					return
				}

				const currentSelection: string = editor.getSelection()
				// Add the selection to the target file
				void (async () => {
					await this.app.vault.process(file, (data) => {
						return data + '\n' + currentSelection;
					})
				})();
				removeSelectionFromEditor(editor)
			},
		});
		// NOTE: command that takes the currently selected text or line 
		// and moves it to the next daily note
		this.addCommand({
			id: 'move-text-to-next-daily-note',
			name: 'Move text to next daily note',
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				this.validateSelection(editor);
				if (!this.appHasDailyNotesPluginLoaded()) {
					new Notice('Please enable the daily notes plugin');
					return;
				}
				const settings: DailyNoteSettings = this.getDailyNotesPluginSettings()
				console.log(settings)
				const path: string = normalizePath(settings.folder + '/' + moment(Date.now()).add(1, 'd').format(settings.format) + '.md')
				console.log(path)
				let file: TFile | null = this.app.vault.getFileByPath(path)
				console.log(file)
				if (!file) {
					let newFileData: string = ''
					console.log("couldn't find", path)
					// get the content of the settings template
					if (settings.template) {
						console.log("adding template content")
						const templatePath: string = normalizePath(settings.template)
						const templateFile: TFile | null = this.app.vault.getFileByPath(templatePath)
						if (templateFile) {
							newFileData = await this.app.vault.read(templateFile)
						}
					}
					file = await this.app.vault.create(path, newFileData)
				}
				// get file headings
				const fileContent: string = await this.app.vault.cachedRead(file)
				const headings: Heading[] = getFileHeadings(fileContent)
				if (headings.length == 0) {
					await this.app.vault.append(file, editor.getSelection())
				} else {
					// open selector for headings with each heading duplicated for append or prepend
					console.log(headings)
				}

				// remove the selection from the current note
				// removeSelectionFromEditor(editor)
			},
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-modal-complex',
			name: 'Open modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						// new SelectionModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
				return false;
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new TextMoverSettingTab(this.app, this));
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<TextMoverPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Ensures the current selection in the editor is not a multi cursor selection and is not a completely empty line.
	 * Will also update the editor selection to be the entire line if there is no selection.
	 */
	validateSelection(editor: Editor): void {
		// Selection uses multiple cursors
		const editorSelections: EditorSelection[] = editor.listSelections();
		if (editorSelections.length > 1) {
			new Notice('Cannot move text with multiple selections');
			return;
		}

		// Selection is not empty
		if (editor.getSelection()) {
			return;
		}

		// Update the selection to the entire line if there is no selection
		const editorSelection: EditorSelection = editorSelections.at(0)!;
		const currentLineNumber: number = editorSelection.anchor.line;
		const currentLine = editor.getLine(currentLineNumber)
		if (!currentLine) {
			new Notice('Cannot move text with no selection');
			return;
		}
		editor.setSelection({ ch: 0, line: currentLineNumber }, { ch: currentLine.length, line: currentLineNumber })
		return;
		// FIXME: what about when the editor position is somewhere weird like in frontmatter?
	}

	appHasDailyNotesPluginLoaded(): boolean {
		const dailyNotesPlugin = this.app.internalPlugins.plugins["daily-notes"];
		if (dailyNotesPlugin && dailyNotesPlugin.enabled) {
			return true;
		}
		return false;
	}

	getDailyNotesPluginSettings(): DailyNoteSettings {
		const { format, folder, template } =
			this.app.internalPlugins.getPluginById("daily-notes")?.instance?.options || {};
		return {
			format: format || DEFAULT_DAILY_NOTE_FORMAT,
			folder: this.validateString(folder).trim(),
			template: this.validateString(template).trim(),
		};
	}

	validateString(value: unknown): string {
		return typeof value === "string" ? value : "";
	}
}

class FileSelectionModal extends FuzzySuggestModal<TFile> {
	private finish?: (file: TFile | null) => void;

	pick(): Promise<TFile | null> {
		return new Promise((resolve) => {
			this.finish = resolve
			this.open()
		})
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles();
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.finish?.(file)
	}
}

class HeadingSelectionModal extends FuzzySuggestModal<Heading> {
	private headings: Heading[];
	private finish?: (heading: Heading | null) => void;

	constructor(app: App, headings: Heading[]) {
		super(app);
		this.headings = headings;
	}

	pick(): Promise<Heading | null> {
		return new Promise((resolve) => {
			this.finish = resolve
			this.open()
		})
	}

	getItems(): Heading[] {
		return this.headings;
	}

	getItemText(heading: Heading): string {
		return heading.value;
	}

	renderSuggestion(match: FuzzyMatch<Heading>, el: HTMLElement) {
		const valueEl = el.createDiv();
		renderResults(valueEl, match.item.value, match.match);

		el.createEl('small', { text: `Heading ${match.item.level}` });
	}

	onChooseItem(heading: Heading, _evt: MouseEvent | KeyboardEvent): void {
		this.finish?.(heading)
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
