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
import { Notice } from '../tests/mocks/obsidian';

export interface CustomTextMoveCommand {
	id?: string;
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
	private plugin: TextMoverPlugin;
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
	private dailyNotesPluginSettings: DailyNoteSettings;

	constructor(
		app: App,
		plugin: TextMoverPlugin,
		onSubmit: (result: CustomTextMoveCommand) => void
	) {
		super(app);
		this.plugin = plugin;
		this.setTitle('Configure a new custom command');
		this.dailyNotesPluginSettings = plugin.getDailyNotesPluginSettings();

		new Setting(this.contentEl)
			.setName('Name')
			.setDesc(
				'Only letters, numbers, and spaces are allowed. Cannot be the same as another custom command.'
			)
			.addText((text) =>
				text.setPlaceholder('Enter a name').onChange((value) => {
					if (this.nameIsValid(value)) {
						this.command.name = value;
						this.updateSubmitButton();
					} else {
						this.command.name = value;
						this.updateSubmitButton();
					}
				})
			);

		new Setting(this.contentEl)
			.setName('Type')
			.setDesc("Move to a specific file or to tomorrow's daily note.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(this.rootOptions)
					.onChange(async (value) => {
						const root: CustomCommandRoot =
							value.toUpperCase() as CustomCommandRoot;
						this.command.root = root;
						if (root === CustomCommandRoot.File) {
							this.command.path = '';
							this.headingOptions = this.defaultHeadingOptions;
							await this.updateHeadingOptions();
						} else {
							await this.dailyNoteRootSelected();
						}
						this.updateSubmitButton();
						this.updateFileSearch();
					})
			);

		new Setting(this.contentEl)
			.setName('File')
			.setDesc('Must be a valid file path.')
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
			.setDesc(
				"The heading to move the text to. Select 'no heading' to use the file contents."
			)
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
			.setDesc('Either append or prepend the text to the file.')
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
					this.command.id = this.nameToId(this.command.name);
					this.close();
					onSubmit(this.command);
				});
		});
	}

	private async dailyNoteRootSelected() {
		if (this.plugin.appHasDailyNotesPluginLoaded()) {
			let path: string = '';
			if (this.dailyNotesPluginSettings.template) {
				path = normalizePath(this.dailyNotesPluginSettings.template);
				await this.updateHeadingOptions(path);
			}
			this.command.path = path;
		} else {
			new Notice(
				'Please enable the daily notes plugin to use this commmand type'
			);
			this.command.root = CustomCommandRoot.File;
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
		let disabled: boolean = true;
		if (
			this.command.path &&
			this.nameIsValid(this.command.name) &&
			this.pathIsValid(this.command.path)
		) {
			disabled = false;
		} else if (
			this.command.root == CustomCommandRoot.DailyNote &&
			!this.dailyNotesPluginSettings.template
		) {
			disabled = false;
		}
		this.submitButton.setDisabled(disabled);
		this.submitButton.setButtonText('Submit');
	}

	private updateFileSearch() {
		this.fileSearch.inputEl.replaceChildren();
		this.fileSearch.setValue(this.command.path!);
		this.fileSearch.setDisabled(
			this.command.root === CustomCommandRoot.DailyNote
		);
	}

	private pathIsValid(path: string): boolean {
		return this.app.vault.getFileByPath(path) != null;
	}

	private nameToId(name?: string): string {
		if (!name) {
			return '';
		}
		return name?.toLowerCase().replace(' ', '-');
	}

	private nameIsValid(name?: string): boolean {
		if (!name) {
			return false;
		}
		if (!/^[a-zA-Z0-9\s]*$/.test(name)) {
			return false;
		}
		return this.idIsValid(this.nameToId(name));
	}

	private idIsValid(id?: string): boolean {
		if (!id) {
			return false;
		}
		const duplicateId = this.plugin.settings.customCommands
			?.map(({ id }) => id)
			.includes(id);
		return /^[a-zA-Z0-9-\s]*$/.test(id) && !duplicateId;
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
					commands.push(result);
					this.plugin.settings.customCommands = commands;
					void this.plugin.saveData(this.plugin.settings);
					this.plugin.addCustomCommand(result);
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
					const commandToRemove: CustomTextMoveCommand =
						commands.splice(idx, 1)[0]!;
					void this.plugin.saveData(this.plugin.settings);
					this.plugin.removeCustomCommand(commandToRemove.id!);
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
