import { Editor, EditorSelection } from 'obsidian';
import { Heading } from './types';

export function removeSelectionFromEditor(editor: Editor) {
	const editorSelections: EditorSelection[] = editor.listSelections();
	const editorSelection: EditorSelection = editorSelections.at(0)!;
	// Check if we need to remove the entire line up to the start of the next line
	const selectionIsEntireLine: boolean =
		editor.getLine(editorSelection.anchor.line) == editor.getSelection();
	// Remove the selection from the current file
	if (selectionIsEntireLine) {
		// NOTE: this removes the entire line even if it's the last line in the document - in that case it just leaves an empty line
		editor.replaceRange('', editorSelection.anchor, {
			ch: 0,
			line: editorSelection.anchor.line + 1,
		});
	} else {
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
	}
}

export function getFileHeadings(fileContent: string): Heading[] {
	let headings: Heading[] = [];
	const regex: RegExp = /^(#{1,6})\s(.*)/gm;
	const matches: RegExpStringIterator<RegExpExecArray> =
		fileContent.matchAll(regex);
	const lines: string[] = fileContent.split('\n');
	let i = 0;
	for (const match of matches) {
		headings.push({
			index: i,
			rawValue: match[0],
			level: match[1]!.length,
			value: match[2]!,
			line: lines.indexOf(match[0]),
		});
		i += 1;
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
