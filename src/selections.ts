import { Editor, EditorSelection } from "obsidian";

export function removeSelectionFromEditor(editor: Editor) {
	const editorSelections: EditorSelection[] = editor.listSelections();
	const editorSelection: EditorSelection = editorSelections.at(0)!;
	// Check if we need to remove the entire line up to the start of the next line
	const selectionIsEntireLine: boolean = editor.getLine(editorSelection.anchor.line) == editor.getSelection()
	// Remove the selection from the current file
	if (selectionIsEntireLine) {
		// NOTE: this removes the entire line even if it's the last line in the document - in that case it just leaves an empty line
		editor.replaceRange('', editorSelection.anchor, { ch: 0, line: editorSelection.anchor.line + 1 });
	} else {
		// NOTE: need to make sure that `from` is before `to`
		if (editorSelection.anchor.ch < editorSelection.head.ch) {
			editor.replaceRange('', editorSelection.anchor, editorSelection.head);
		} else {
			editor.replaceRange('', editorSelection.head, editorSelection.anchor);
		}
	}
}
