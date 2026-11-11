import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import TextMoverPlugin from '../src/main';
import {
	TextMoverSettingTab,
	type CustomTextMoveCommand,
} from '../src/settings';
import { CustomCommandRoot, InsertLocation } from '../src/types';
import {
	ButtonComponent,
	Modal,
	SearchComponent,
	Setting,
	mockObsidianState,
} from './mocks/obsidian';
import { createApp, resetTestState } from './test-helpers';

type TestPlugin = Pick<
	TextMoverPlugin,
	| 'settings'
	| 'getDailyNotesPluginSettings'
	| 'appHasDailyNotesPluginLoaded'
	| 'saveData'
	| 'addCustomCommand'
	| 'removeCustomCommand'
>;

function createSettingsTab(
	initialFiles: Record<string, string> = {},
	commands: CustomTextMoveCommand[] = [],
	options: { dailyNotesEnabled?: boolean; template?: string } = {}
) {
	const { app, files, dailyNotes } = createApp(initialFiles);
	dailyNotes.enabled = options.dailyNotesEnabled ?? true;
	dailyNotes.instance.options.template = options.template ?? '';
	const plugin: TestPlugin = {
		settings: { appendAndPrepend: false, customCommands: commands },
		getDailyNotesPluginSettings: () => ({
			format: 'YYYY-MM-DD',
			folder: 'Daily',
			template: options.template ?? '',
		}),
		appHasDailyNotesPluginLoaded: () => dailyNotes.enabled,
		saveData: vi.fn(async () => undefined),
		addCustomCommand: vi.fn(),
		removeCustomCommand: vi.fn(),
	};
	const tab = new TextMoverSettingTab(
		app as unknown as App,
		plugin as unknown as TextMoverPlugin
	);
	return { app, files, plugin, tab };
}

function openAddCommandModal(tab: TextMoverSettingTab): Modal {
	const definitions = tab.getSettingDefinitions() as Array<{
		addItem?: { action: () => void };
	}>;
	definitions[1]!.addItem!.action();
	return mockObsidianState.openModals.at(-1)!;
}

function setting(modal: Modal, name: string): Setting {
	const settings = (modal.contentEl as unknown as { settings: Setting[] })
		.settings;
	const found = settings.find((item) => item.name === name);
	if (!found) throw new Error(`Setting not found: ${name}`);
	return found;
}

function submitButton(modal: Modal): ButtonComponent {
	const button = (
		modal.contentEl as unknown as { settings: Setting[] }
	).settings.at(-1)?.button;
	if (!button) throw new Error('Submit button not found');
	return button;
}

describe('custom command settings', () => {
	beforeEach(() => resetTestState());

	it('creates, persists, and registers a custom file command', async () => {
		const { plugin, tab } = createSettingsTab({
			'Archive.md': '# Inbox\n\n## Later\n',
		});
		const modal = openAddCommandModal(tab);

		expect(submitButton(modal).disabled).toBe(true);
		setting(modal, 'Name').text!.change('Move to archive');
		await setting(modal, 'File').search!.change('Archive.md');
		const headings = setting(modal, 'Heading').dropdown!;
		expect(headings.value).toBe('none');
		expect(headings.options).toEqual({
			none: 'No heading',
			0: '# Inbox',
			1: '## Later',
		});
		await headings.change('1');
		await setting(modal, 'Insert location').dropdown!.change('prepend');

		const submit = submitButton(modal);
		expect(submit.disabled).toBe(false);
		submit.click();
		await Promise.resolve();

		const expected: CustomTextMoveCommand = {
			id: 'move-to-archive',
			name: 'Move to archive',
			path: 'Archive.md',
			root: CustomCommandRoot.File,
			heading: {
				index: 1,
				rawValue: '## Later',
				level: 2,
				value: 'Later',
				line: 2,
			},
			insertLocation: InsertLocation.Prepend,
		};
		expect(plugin.settings.customCommands).toEqual([expected]);
		expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
		expect(plugin.addCustomCommand).toHaveBeenCalledWith(expected);
		expect(modal.closed).toBe(true);
	});

	it('keeps submission disabled for invalid, duplicate, or missing file values', async () => {
		const existing: CustomTextMoveCommand = {
			id: 'move-to-archive',
			name: 'Move to archive',
			path: 'Archive.md',
			root: CustomCommandRoot.File,
			insertLocation: InsertLocation.Append,
		};
		const { tab } = createSettingsTab({ 'Archive.md': '# Archive' }, [
			existing,
		]);
		const modal = openAddCommandModal(tab);
		const name = setting(modal, 'Name').text!;
		const file = setting(modal, 'File').search!;
		const submit = submitButton(modal);

		name.change('Bad name!');
		await file.change('Archive.md');
		expect(submit.disabled).toBe(true);

		name.change('Move to archive');
		expect(submit.disabled).toBe(true);

		name.change('New command');
		await file.change('Missing.md');
		expect(submit.disabled).toBe(true);

		await file.change('Archive.md');
		expect(submit.disabled).toBe(false);
	});

	it('resets heading choices when switching files and supports no heading', async () => {
		const { plugin, tab } = createSettingsTab({
			'First.md': '# First\n## Stale heading',
			'Second.md': '# Second',
		});
		const modal = openAddCommandModal(tab);
		setting(modal, 'Name').text!.change('Move to second');
		await setting(modal, 'File').search!.change('First.md');
		const heading = setting(modal, 'Heading').dropdown!;
		expect(heading.options['1']).toBe('## Stale heading');
		await heading.change('1');

		await setting(modal, 'File').search!.change('Second.md');
		expect(heading.options).toEqual({ none: 'No heading', 0: '# Second' });
		expect(heading.value).toBe('none');
		submitButton(modal).click();
		await Promise.resolve();
		expect(plugin.settings.customCommands?.[0]?.heading).toBeUndefined();
	});

	it('allows daily-note commands without a template only when the name is valid', async () => {
		const { tab } = createSettingsTab();
		const modal = openAddCommandModal(tab);
		const submit = submitButton(modal);
		const name = setting(modal, 'Name').text!;
		const type = setting(modal, 'Type').dropdown!;

		name.change('Invalid!');
		await type.change('daily_note');
		expect(submit.disabled).toBe(true);
		expect(
			(setting(modal, 'File').search as SearchComponent).disabled
		).toBe(true);

		name.change('Tomorrow note');
		expect(submit.disabled).toBe(false);
		submit.click();
		await Promise.resolve();
		expect(tab.plugin.settings.customCommands).toEqual([
			expect.objectContaining({
				id: 'tomorrow-note',
				name: 'Tomorrow note',
				root: CustomCommandRoot.DailyNote,
				insertLocation: InsertLocation.Append,
			}),
		]);
	});

	it('uses the configured template path for a daily-note command', async () => {
		const { plugin, tab } = createSettingsTab(
			{ 'Templates/Daily.md': '# Daily note' },
			[],
			{ template: './Templates/Daily.md' }
		);
		const modal = openAddCommandModal(tab);
		setting(modal, 'Name').text!.change('Tomorrow note');
		await setting(modal, 'Type').dropdown!.change('daily_note');

		expect(setting(modal, 'File').search!.inputEl.value).toBe(
			'Templates/Daily.md'
		);
		expect(submitButton(modal).disabled).toBe(false);
		submitButton(modal).click();
		await Promise.resolve();

		expect(plugin.settings.customCommands?.[0]).toEqual(
			expect.objectContaining({
				id: 'tomorrow-note',
				path: 'Templates/Daily.md',
				root: CustomCommandRoot.DailyNote,
			})
		);
	});

	it('reports unavailable daily notes and returns to file selection', async () => {
		const { tab } = createSettingsTab({}, [], { dailyNotesEnabled: false });
		const modal = openAddCommandModal(tab);
		await setting(modal, 'Type').dropdown!.change('daily_note');

		expect(mockObsidianState.notices).toContain(
			'Please enable the daily notes plugin to use this commmand type'
		);
		expect(setting(modal, 'File').search!.disabled).toBe(false);
		expect(submitButton(modal).disabled).toBe(true);
	});

	it('deletes the selected command, persists settings, and unregisters it', () => {
		const command: CustomTextMoveCommand = {
			id: 'move-to-archive',
			name: 'Move to archive',
			path: 'Archive.md',
			root: CustomCommandRoot.File,
			insertLocation: InsertLocation.Append,
		};
		const { plugin, tab } = createSettingsTab({}, [command]);
		const definitions = tab.getSettingDefinitions() as Array<{
			onDelete?: (index: number) => void;
			items?: Array<{ name: string; desc: string }>;
		}>;

		expect(definitions[1]!.items).toEqual([
			{
				name: 'Move to archive',
				desc: 'Append to Archive.md ',
				searchable: false,
			},
		]);
		definitions[1]!.onDelete!(0);

		expect(plugin.settings.customCommands).toEqual([]);
		expect(plugin.saveData).toHaveBeenCalledWith(plugin.settings);
		expect(plugin.removeCustomCommand).toHaveBeenCalledWith(
			'move-to-archive'
		);
	});
});
