export const mockObsidianState = {
	modalResults: [] as unknown[],
	modalItems: [] as unknown[][],
	notices: [] as string[],
};

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
}

export class AbstractInputSuggest<T> {
	constructor(
		public app: unknown,
		public inputEl: unknown
	) {}

	protected suggestionType?: T;
}

export class Setting {}

export class Modal {}

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

export function moment(input: string | number | Date) {
	const date = new Date(input);
	return {
		add(amount: number, unit: string) {
			if (unit === 'd') date.setDate(date.getDate() + amount);
			return this;
		},
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
				MM: String(date.getMonth() + 1).padStart(2, '0'),
				DD: String(date.getDate()).padStart(2, '0'),
				M: String(date.getMonth() + 1),
				dddd: dayNames[date.getDay()]!,
			};
			return format.replace(/YYYY|MMMM|MMM|MM|DD|M|dddd/g, (token) => values[token]!);
		},
	};
}
