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
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	TextMoverPluginSettings,
	TextMoverSettingTab
} from './settings';

interface Heading {
	index: number,
	value: string;
	level: number;
	rawValue: string;
	line: number;
}

export default class TextMoverPlugin extends Plugin {
	settings!: TextMoverPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		this.addRibbonIcon('dice', 'Sample', (_evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});

		// NOTE: command that takes the currently selected text or line and opens a modal to move it to another section within the document
		this.addCommand({
			id: 'move-text-within-document',
			name: 'Move text within current document',
			editorCallback: async (editor: Editor, ctx: MarkdownView | MarkdownFileInfo) => {
				this.validateSelection(editor);
				let headings: Heading[] = [];
				const regex: RegExp = /^(#{1,6})\s(.*)/gm;
				const content: string = await this.app.vault.cachedRead(ctx.file!);
				const matches: RegExpStringIterator<RegExpExecArray> = content.matchAll(regex);
				const lines: string[] = content.split('\n');
				let i = 0;
				for (const match of matches) {
					headings.push({
						index: i,
						rawValue: match[0],
						level: match[1]!.length,
						value: match[2]!,
						line: lines.indexOf(match[0])
					});
					i += 1;
				}
				if (headings.length === 0) {
					new Notice('No headings found in current document');
					return;
				}
				new HeadingSelectionModal(this.app, editor, headings).open();
			},
		});
		// NOTE: command that takes the currently selected text or line and opens a modal to move it to another document
		this.addCommand({
			id: 'move-text-to-another-document',
			name: 'Move text to another document',
			editorCallback: async (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				this.validateSelection(editor);
				new FileSelectionModal(this.app, editor).open();
			},
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'replace-selected',
			name: 'Replace selected content',
			editorCallback: (
				editor: Editor,
				_ctx: MarkdownView | MarkdownFileInfo,
			) => {
				editor.replaceSelection('Sample editor command');
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
}

class FileSelectionModal extends FuzzySuggestModal<TFile> {
	private editor: Editor;

	constructor(app: App, editor: Editor) {
		super(app);
		this.editor = editor;
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles();
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		const editorSelections: EditorSelection[] = this.editor.listSelections();
		const editorSelection: EditorSelection = editorSelections.at(0)!;
		const currentSelection: string = this.editor.getSelection()
		// Add the selection to the target file
		void (async () => {
			await this.app.vault.process(file, (data) => {
				return data + '\n' + currentSelection;
			})
		})();
		// Check if we need to remove the entire line up to the start of the next line
		const selectionIsEntireLine: boolean = this.editor.getLine(editorSelection.anchor.line) == this.editor.getSelection()
		// Remove the selection from the current file
		if (selectionIsEntireLine) {
			// NOTE: this removes the entire line even if it's the last line in the document - in that case it just leaves an empty line
			this.editor.replaceRange('', editorSelection.anchor, { ch: 0, line: editorSelection.anchor.line + 1 });
		} else {
			// NOTE: need to make sure that `from` is before `to`
			if (editorSelection.anchor.ch < editorSelection.head.ch) {
				this.editor.replaceRange('', editorSelection.anchor, editorSelection.head);
			} else {
				this.editor.replaceRange('', editorSelection.head, editorSelection.anchor);
			}
		}
	}
}

class HeadingSelectionModal extends FuzzySuggestModal<Heading> {
	private editor: Editor;
	private headings: Heading[];

	constructor(app: App, editor: Editor, headings: Heading[]) {
		super(app);
		this.editor = editor;
		this.headings = headings;
	}

	// Have to remove the heading that the selection is currently in
	// And have to account for it being the last heading
	getItems(): Heading[] {
		const cursor: EditorPosition = this.editor.getCursor()
		if (cursor.line > this.headings[this.headings.length - 1]!.line) {
			this.headings.remove(this.headings[this.headings.length - 1]!);
			return this.headings;
		}
		for (let i = 0; i < this.headings.length; i++) {
			const heading: Heading = this.headings[i]!;
			if (cursor.line >= heading.line && cursor.line < this.headings[i + 1]!.line) {
				this.headings.remove(heading);
				break;
			}
		}
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
		const editorSelections: EditorSelection[] = this.editor.listSelections();
		const editorSelection: EditorSelection = editorSelections.at(0)!;
		const currentSelection: string = this.editor.getSelection()
		// Check if we need to remove the entire line up to the start of the next line
		const selectionIsEntireLine: boolean = this.editor.getLine(editorSelection.anchor.line) == this.editor.getSelection()
		// Remove the selection from the current file
		if (selectionIsEntireLine) {
			// NOTE: this removes the entire line even if it's the last line in the document - it just leaves an empty line in that case
			this.editor.replaceRange('', editorSelection.anchor, { ch: 0, line: editorSelection.anchor.line + 1 });
		} else {
			// NOTE: need to make sure that `from` is before `to`
			if (editorSelection.anchor.ch < editorSelection.head.ch) {
				this.editor.replaceRange('', editorSelection.anchor, editorSelection.head);
			} else {
				this.editor.replaceRange('', editorSelection.head, editorSelection.anchor);
			}
		}
		// Add the selection to the target heading
		let index: number = heading.index;
		// If we are moving to the final heading, append the selection to the end of the file
		if (index + 1 > this.headings.length) {
			const lastLine: number = this.editor.lastLine();
			const lastCh: number = this.editor.getLine(lastLine).length;
			this.editor.replaceRange(
				'\n' + currentSelection,
				{ ch: lastCh, line: lastLine },
				{ ch: lastCh, line: lastLine }
			);
		} else {
			this.editor.replaceRange(
				currentSelection + '\n',
				{ ch: 0, line: this.headings[heading.index + 1]!.line },
				{ ch: 0, line: this.headings[heading.index + 1]!.line }
			);
		}
	}
}
