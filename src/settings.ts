import { App, PluginSettingTab, SettingDefinitionItem } from 'obsidian';
import TextMoverPlugin from './main';

export interface TextMoverPluginSettings {
	appendAndPrepend: boolean;
}

export const DEFAULT_SETTINGS: TextMoverPluginSettings = {
	appendAndPrepend: false,
};

export class TextMoverSettingTab extends PluginSettingTab {
	plugin: TextMoverPlugin;

	constructor(app: App, plugin: TextMoverPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: 'Append and prepend',
				desc: 'When enabled, you will have the option to either append or prepend to a heading',
				control: {
					type: 'toggle',
					key: 'appendAndPrepend',
				},
			},
		];
	}
}
