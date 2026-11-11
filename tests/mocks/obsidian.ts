export const mockObsidianState = {
	modalResults: [] as unknown[],
	modalItems: [] as unknown[][],
	suggestionQueries: [] as string[],
	suggestionItems: [] as unknown[][],
	notices: [] as string[],
	openModals: [] as Modal[],
};

class MockElement {
	settings: Setting[] = [];
	children: unknown[] = [];
	value = '';
	private onReplace?: () => void;

	constructor(onReplace?: () => void) {
		this.onReplace = onReplace;
	}

	replaceChildren(...children: unknown[]) {
		this.children = children;
		this.onReplace?.();
	}

	dispatchEvent(_event: Event) {
		return true;
	}
}

declare global {
	interface Array<T> {
		last(): T | undefined;
		remove(item: T): void;
	}
}

Array.prototype.last = function <T>(this: T[]) {
	return this[this.length - 1];
};

Array.prototype.remove = function <T>(this: T[], item: T) {
	const index = this.indexOf(item);
	if (index !== -1) this.splice(index, 1);
};

type ModalCallbacks<T = unknown> = {
	onClose?: () => void;
	onChooseItem?: (item: T, event: unknown) => void;
	onChooseSuggestion?: (item: T, event: unknown) => void;
};

export class Plugin {
	app: unknown;
	commands: Array<Record<string, unknown>> = [];
	storedData: unknown = {};

	constructor(app: unknown) {
		this.app = app;
	}

	async loadData() {
		return this.storedData;
	}

	async saveData(data: unknown) {
		this.storedData = data;
	}

	addCommand(command: Record<string, unknown>) {
		this.commands.push(command);
	}

	removeCommand(id: string) {
		this.commands = this.commands.filter((command) => command.id !== id);
	}

	addSettingTab() {}
}

export class FuzzySuggestModal<T> {
	app: unknown;

	constructor(app: unknown) {
		this.app = app;
	}

	open() {
		const result = mockObsidianState.modalResults.shift();
		const callbacks = this as unknown as ModalCallbacks<T>;
		const modal = this as unknown as { getItems?: () => T[] };
		mockObsidianState.modalItems.push(modal.getItems?.() ?? []);
		if (result == null) {
			callbacks.onClose?.();
		} else {
			callbacks.onChooseItem?.(result as T, {});
		}
	}
}

export class SuggestModal<T> {
	app: unknown;

	constructor(app: unknown) {
		this.app = app;
	}

	open() {
		const result = mockObsidianState.modalResults.shift();
		const callbacks = this as unknown as ModalCallbacks<T>;
		const modal = this as unknown as {
			getSuggestions?: (query: string) => T[];
		};
		const query = mockObsidianState.suggestionQueries.shift() ?? '';
		mockObsidianState.suggestionItems.push(
			modal.getSuggestions?.(query) ?? []
		);
		if (result == null) {
			callbacks.onClose?.();
		} else {
			callbacks.onChooseSuggestion?.(result as T, {});
		}
	}
}

export class PluginSettingTab {
	constructor(
		public app: unknown,
		public plugin: unknown
	) {}

	update() {}
}

export class AbstractInputSuggest<T> {
	constructor(
		public app: unknown,
		public inputEl: unknown
	) {}

	protected suggestionType?: T;

	close() {}
}

export class Setting {
	name = '';
	text?: TextComponent;
	dropdown?: DropdownComponent;
	search?: SearchComponent;
	button?: ButtonComponent;

	constructor(private contentEl: MockElement) {
		contentEl.settings.push(this);
	}

	setName(name: string) {
		this.name = name;
		return this;
	}

	setDesc(_description: string) {
		return this;
	}

	addText(callback: (component: TextComponent) => unknown) {
		this.text = new TextComponent();
		callback(this.text);
		return this;
	}

	addDropdown(callback: (component: DropdownComponent) => unknown) {
		this.dropdown = new DropdownComponent();
		callback(this.dropdown);
		return this;
	}

	addSearch(callback: (component: SearchComponent) => unknown) {
		this.search = new SearchComponent();
		void callback(this.search);
		return this;
	}

	addButton(callback: (component: ButtonComponent) => unknown) {
		this.button = new ButtonComponent();
		callback(this.button);
		return this;
	}
}

export class TextComponent {
	private changeCallback?: (value: string) => unknown;
	placeholder = '';

	setPlaceholder(value: string) {
		this.placeholder = value;
		return this;
	}

	onChange(callback: (value: string) => unknown) {
		this.changeCallback = callback;
		return this;
	}

	change(value: string) {
		return this.changeCallback?.(value);
	}
}

export class DropdownComponent {
	selectEl = new MockElement(() => {
		this.options = {};
	});
	options: Record<string, string> = {};
	value = '';
	private changeCallback?: (value: string) => unknown;

	addOptions(options: Record<string, string>) {
		this.options = { ...this.options, ...options };
		return this;
	}

	onChange(callback: (value: string) => unknown) {
		this.changeCallback = callback;
		return this;
	}

	setValue(value: string) {
		this.value = value;
		return this;
	}

	change(value: string) {
		this.value = value;
		return this.changeCallback?.(value);
	}
}

export class SearchComponent {
	inputEl = new MockElement();
	disabled = false;
	private changeCallback?: (value: string) => unknown;

	onChange(callback: (value: string) => unknown) {
		this.changeCallback = callback;
		return this;
	}

	setValue(value: string) {
		this.inputEl.value = value;
		return this;
	}

	setDisabled(disabled: boolean) {
		this.disabled = disabled;
		return this;
	}

	change(value: string) {
		this.inputEl.value = value;
		return this.changeCallback?.(value);
	}
}

export class ButtonComponent {
	buttonEl = new MockElement();
	disabled = false;
	text = '';
	private clickCallback?: () => unknown;

	setButtonText(text: string) {
		this.text = text;
		return this;
	}

	setCta() {
		return this;
	}

	setDisabled(disabled: boolean) {
		this.disabled = disabled;
		return this;
	}

	onClick(callback: () => unknown) {
		this.clickCallback = callback;
		return this;
	}

	click() {
		if (!this.disabled) return this.clickCallback?.();
		return undefined;
	}
}

export class Modal {
	contentEl = new MockElement();
	title = '';
	closed = false;
	app: unknown;

	constructor(app?: unknown) {
		this.app = app;
	}

	setTitle(title: string) {
		this.title = title;
	}

	open() {
		mockObsidianState.openModals.push(this);
	}

	close() {
		this.closed = true;
	}
}

export class MarkdownView {}

export class Notice {
	constructor(message: string) {
		mockObsidianState.notices.push(message);
	}
}

export function normalizePath(path: string) {
	return path
		.split('/')
		.filter((part) => part && part !== '.')
		.join('/');
}

export function renderResults() {}

interface MockMoment {
	add(amount: number, unit: string): MockMoment;
	month(): number;
	month(value: number): MockMoment;
	date(): number;
	date(value: number): MockMoment;
	format(format?: string): string;
}

export function moment(input: string | number | Date): MockMoment {
	const date = new Date(input);
	let result: MockMoment;
	const month = ((value?: number) => {
		if (value === undefined) return date.getMonth();
		date.setMonth(value);
		return result;
	}) as MockMoment['month'];
	const dayOfMonth = ((value?: number) => {
		if (value === undefined) return date.getDate();
		date.setDate(value);
		return result;
	}) as MockMoment['date'];
	result = {
		add(amount: number, unit: string) {
			if (unit === 'd') date.setDate(date.getDate() + amount);
			return this;
		},
		month,
		date: dayOfMonth,
		format(format = 'YYYY-MM-DD') {
			const dayNames = [
				'Sunday',
				'Monday',
				'Tuesday',
				'Wednesday',
				'Thursday',
				'Friday',
				'Saturday',
			];
			const monthNames = [
				'January',
				'February',
				'March',
				'April',
				'May',
				'June',
				'July',
				'August',
				'September',
				'October',
				'November',
				'December',
			];
			const values: Record<string, string> = {
				YYYY: String(date.getFullYear()),
				MMMM: monthNames[date.getMonth()]!,
				MMM: monthNames[date.getMonth()]!.slice(0, 3),
				Do: `${date.getDate()}${
					date.getDate() % 10 === 1 && date.getDate() !== 11
						? 'st'
						: date.getDate() % 10 === 2 && date.getDate() !== 12
							? 'nd'
							: date.getDate() % 10 === 3 && date.getDate() !== 13
								? 'rd'
								: 'th'
				}`,
				MM: String(date.getMonth() + 1).padStart(2, '0'),
				DD: String(date.getDate()).padStart(2, '0'),
				M: String(date.getMonth() + 1),
				dddd: dayNames[date.getDay()]!,
			};
			return format.replace(
				/YYYY|MMMM|MMM|Do|MM|DD|M|dddd/g,
				(token) => values[token]!
			);
		},
	};
	return result;
}
