/**
 * The shape returned by `getDailyNoteSettings()`. Fields are typed as
 * optional because `folder` and `template` may be empty strings rather
 * than meaningful values — and historically callers handle both cases.
 * In practice the resolver always populates each field (defaults fill
 * in for missing plugin settings).
 */
export interface DailyNoteSettings {
	folder?: string;
	format?: string;
	template?: string;
}

export interface Heading {
	index: number;
	value: string;
	level: number;
	rawValue: string;
	line: number;
	insertLocation?: InsertLocation;
}

export interface TMDate {
	display: string;
	value: string;
}

export enum InsertLocation {
	Append = 'APPEND',
	Prepend = 'PREPEND',
}

export enum CustomCommandRoot {
	File = 'FILE',
	DailyNote = 'DAILY_NOTE',
}
