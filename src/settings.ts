import {
	AbstractInputSuggest,
	App,
	ButtonComponent,
	DropdownComponent,
	Modal,
	normalizePath,
	PluginSettingTab,
	SearchComponent,
	Setting,
	SettingDefinitionItem,
	TFile,
} from 'obsidian';
import TextMoverPlugin from './main';
import {
	CustomCommandRoot,
	DailyNoteSettings,
	Heading,
	InsertLocation,
} from './types';
import { capitalizeFirstLetter, getFileHeadings } from './utils';

export interface CustomTextMoveCommand {
	name?: string;
	path?: string;
	root: CustomCommandRoot;
	heading?: Heading;
	insertLocation: InsertLocation;
}

export interface TextMoverPluginSettings {
	appendAndPrepend: boolean;
	customCommands?: CustomTextMoveCommand[];
}

export const DEFAULT_SETTINGS: TextMoverPluginSettings = {
	appendAndPrepend: false,
};

class FileSearchInput extends AbstractInputSuggest<TFile> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	protected getSuggestions(query: string): TFile[] | Promise<TFile[]> {
		return this.app.vault
			.getMarkdownFiles()
			.filter(({ path }) =>
				path.toLowerCase().includes(query.toLowerCase())
			);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path.slice(0, -3));
	}

	selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.inputEl.value = file.path;
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}

class AddCustomCommandModal extends Modal {
	private headingDropdown!: DropdownComponent;
	private submitButton!: ButtonComponent;
	private fileSearch!: SearchComponent;

	private rootOptions = {
		file: 'Specific file',
		daily_note: "Tomorrow's daily note",
	};
	private insertLocationOptions = {
		append: 'Append',
		prepend: 'Prepend',
	};
	private headings: Heading[] = [];
	private defaultHeadingOptions: Record<string, string> = {
		none: 'No heading',
	};
	private headingOptions: Record<string, string> = this.defaultHeadingOptions;

	private command: CustomTextMoveCommand = {
		root: CustomCommandRoot.File,
		insertLocation: InsertLocation.Append,
	};

	constructor(
		app: App,
		plugin: TextMoverPlugin,
		onSubmit: (result: CustomTextMoveCommand) => void
	) {
		super(app);
		this.setTitle('Configure a new custom command');

		new Setting(this.contentEl)
			.setName('Name')
			.setDesc('The name of your custom command')
			.addText((text) =>
				text.setPlaceholder('Enter a name').onChange((value) => {
					this.command.name = value;
					this.updateSubmitButton();
				})
			);

		new Setting(this.contentEl).setName('Type').addDropdown((dropdown) =>
			dropdown.addOptions(this.rootOptions).onChange(async (value) => {
				const root: CustomCommandRoot =
					value.toUpperCase() as CustomCommandRoot;
				this.command.root = root;
				if (root === CustomCommandRoot.File) {
					this.command.path = '';
					this.headingOptions = this.defaultHeadingOptions;
					await this.updateHeadingOptions();
				} else {
					await this.dailyNoteRootSelected(plugin);
				}
				this.updateSubmitButton();
				this.updateFileSearch();
			})
		);

		new Setting(this.contentEl)
			.setName('File')
			.addSearch(async (search) => {
				this.fileSearch = search;
				// FIXME: this needs to be a dropdown with search or make sure the
				// user is not able to modify the input after selecting
				search.onChange(async (path: string) => {
					this.command.path = path;
					await this.updateHeadingOptions(path);
					this.updateSubmitButton();
				});

				new FileSearchInput(this.app, search.inputEl);
			});

		new Setting(this.contentEl)
			.setName('Heading')
			.addDropdown((dropdown) => {
				this.headingDropdown = dropdown;
				return dropdown
					.addOptions(this.headingOptions)
					.onChange(async (value) => {
						const heading: Heading =
							this.headings[parseInt(value)]!;
						this.command.heading = heading;
					});
			});

		new Setting(this.contentEl)
			.setName('Insert location')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(this.insertLocationOptions)
					.onChange(async (value) => {
						const insertLocation: InsertLocation =
							value.toUpperCase() as InsertLocation;
						this.command.insertLocation = insertLocation;
					})
			);

		new Setting(this.contentEl).addButton((btn) => {
			this.submitButton = btn;
			return btn
				.setButtonText('Submit')
				.setCta()
				.setDisabled(true)
				.onClick(() => {
					// TODO: need to check that path is valid before submitting
					this.close();
					onSubmit(this.command);
				});
		});
	}

	private async dailyNoteRootSelected(plugin: TextMoverPlugin) {
		if (plugin.appHasDailyNotesPluginLoaded()) {
			const settings: DailyNoteSettings =
				plugin.getDailyNotesPluginSettings();
			if (settings.template) {
				const path = normalizePath(settings.template);
				await this.updateHeadingOptions(path);
			}
		}
	}

	private async updateHeadingOptions(selectedFilePath?: string) {
		if (selectedFilePath) {
			const file: TFile | null =
				this.app.vault.getFileByPath(selectedFilePath);
			if (!file) {
				return;
			}
			this.command.path = selectedFilePath;
			const fileContent: string = await this.app.vault.cachedRead(file);
			this.headings = getFileHeadings(fileContent);
			this.headingOptions = {
				...this.headingOptions,
				...this.headings.reduce(
					(acc, key) => {
						return {
							...acc,
							[key.index]: key.rawValue,
						};
					},
					{} as Record<string, string>
				),
			};
		}
		// Remove the old choices, then populate the dependent dropdown.
		this.headingDropdown.selectEl.replaceChildren();
		this.headingDropdown.addOptions(this.headingOptions);

		// get the 'no heading' option by default
		const firstValue = Object.keys(this.headingOptions).last();
		this.headingDropdown.setValue(firstValue ?? '');
	}

	private updateSubmitButton() {
		this.submitButton.buttonEl.replaceChildren();
		// true when path is '' or name is ''
		this.submitButton.setDisabled(!this.command.path || !this.command.name);
		this.submitButton.setButtonText('Submit');
	}

	private updateFileSearch() {
		this.fileSearch.inputEl.replaceChildren();
		this.fileSearch.setValue(this.command.path!);
		this.fileSearch.setDisabled(
			this.command.root === CustomCommandRoot.DailyNote
		);
	}
}

export class TextMoverSettingTab extends PluginSettingTab {
	plugin: TextMoverPlugin;

	constructor(app: App, plugin: TextMoverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		let commands: CustomTextMoveCommand[] =
			this.plugin.settings.customCommands ?? [];
		let openAddForm = () => {
			new AddCustomCommandModal(
				this.app,
				this.plugin,
				(result: CustomTextMoveCommand) => {
					// TODO: check values are correct before submitting
					// i.e. path resolves somewhere
					commands.push(result);
					console.log(result);
					this.plugin.settings.customCommands = commands;
					void this.plugin.saveData(this.plugin.settings);
					this.update();
				}
			).open();
		};
		return [
			{
				name: 'Append and prepend',
				desc: 'When enabled, you will have the option to either append or prepend to a heading',
				control: {
					type: 'toggle',
					key: 'appendAndPrepend',
				},
			},
			{
				type: 'list',
				emptyState: 'No custom commands configured',
				addItem: {
					name: 'Add',
					action: openAddForm,
				},
				onDelete: (idx) => {
					commands.splice(idx, 1);
					void this.plugin.saveData(this.plugin.settings);
					this.update();
				},
				items: commands.map((command) => {
					let description: string = '';

					let insertVerb: string = capitalizeFirstLetter(
						command.insertLocation.toLowerCase()
					);

					let file: string = '';
					if (command.root == CustomCommandRoot.DailyNote) {
						file = "tomorrow's daily note";
					} else {
						file = command.path!;
					}

					let heading: string = command.heading?.rawValue || '';

					description = [insertVerb, 'to', file, heading].join(' ');

					return {
						name: command.name!,
						desc: description,
						searchable: false,
					};
				}),
			},
		];
	}
}
