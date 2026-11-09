import { Editor, EditorSelection } from 'obsidian';
import { Heading } from './types';

export function removeSelectionFromEditor(editor: Editor) {
	const editorSelections: EditorSelection[] = editor.listSelections();
	const editorSelection: EditorSelection = editorSelections.at(0)!;
	// Check if we need to remove the entire line up to the start of the next line
	const selectionIsEntireLine: boolean =
		editor.getLine(editorSelection.anchor.line) == editor.getSelection();
	// Remove the selection from the current file
	if (
		selectionIsEntireLine &&
		editorSelection.anchor.ch < editorSelection.head.ch
	) {
		// NOTE: this removes the entire line even if it's the last line in the document - in that case it just leaves an empty line
		editor.replaceRange('', editorSelection.anchor, {
			ch: 0,
			line: editorSelection.anchor.line + 1,
		});
	} else if (!selectionIsEntireLine) {
		// NOTE: need to make sure that `from` is before `to`
		if (editorSelection.anchor.ch < editorSelection.head.ch) {
			editor.replaceRange(
				'',
				editorSelection.anchor,
				editorSelection.head
			);
		} else {
			editor.replaceRange(
				'',
				editorSelection.head,
				editorSelection.anchor
			);
		}
	} else {
		editor.replaceRange('', editorSelection.head, {
			ch: 0,
			line: editorSelection.head.line + 1,
		});
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
