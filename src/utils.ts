import { Editor, EditorPosition, EditorSelection } from 'obsidian';
import { Heading } from './types';

export function removeSelectionFromEditor(editor: Editor) {
	const editorSelections: EditorSelection[] = editor.listSelections();
	const editorSelection: EditorSelection = editorSelections.at(0)!;
	let from: EditorPosition = editorSelection.anchor;
	let to: EditorPosition = editorSelection.head;

	// Order positions by line and then character; character offsets alone do not
	// order selections that span lines (especially when they end on an empty line).
	if (
		from.line > to.line ||
		(from.line === to.line && from.ch > to.ch)
	) {
		[from, to] = [to, from];
	}

	const lineText: string = editor.getLine(from.line);
	const selectionIsEntireLine: boolean =
		from.line === to.line &&
		from.ch === 0 &&
		to.ch === lineText.length &&
		editor.getSelection() === lineText;

	if (selectionIsEntireLine && from.line < editor.lastLine()) {
		// Remove the following line break as well so the next line takes its place.
		editor.replaceRange('', from, { ch: 0, line: from.line + 1 });
	} else {
		// Multi-line selections are removed exactly as selected, including a
		// trailing empty line at the end of the document.
		editor.replaceRange('', from, to);
	}
}

export function getFileHeadings(fileContent: string): Heading[] {
	const headings: Heading[] = [];
	const regex = /^[ \t]{0,3}(#{1,6})[ \t]+(.*)$/gm;

	for (const match of fileContent.matchAll(regex)) {
		const offset = match.index;
		const line =
			fileContent.slice(0, offset).split(/\r\n|\r|\n/).length - 1; // 1-based

		headings.push({
			index: headings.length,
			rawValue: match[0],
			level: match[1]!.length,
			value: match[2]!,
			line,
		});
	}
	return headings;
}

// FIXME: can we get the next heading with understanding that a heading may have been
// removed because that's the heading the current cursor is in?
export function getNextHeading(
	currentHeading: Heading,
	headings: Heading[]
): Heading {
	if (currentHeading.index <= headings.length) {
		const nextHeading = headings.at(currentHeading.index + 1);
		if (nextHeading) {
			return nextHeading;
		}
		return currentHeading;
	} else {
		return currentHeading;
	}
}

export function capitalizeFirstLetter(val: string) {
	return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

export function headingInHeadings(
	heading: Heading,
	headings: Heading[]
): boolean {
	if (!heading || !headings) {
		return false;
	}
	for (let i = 0; i < headings.length; i++) {
		const h = headings[i];
		if (
			h &&
			heading.index === h.index &&
			heading.value === h.value &&
			heading.level === h.level &&
			heading.line === h.line &&
			heading.insertLocation === h.insertLocation &&
			heading.rawValue === h.rawValue
		) {
			return true;
		}
	}
	return false;
}
