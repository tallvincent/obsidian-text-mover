import { describe, expect, it } from 'vitest';
import type { Editor } from 'obsidian';
import {
	getFileHeadings,
	getNextHeading,
	removeSelectionFromEditor,
} from '../src/utils';
import { InsertLocation } from '../src/types';
import { TestEditor } from './test-helpers';

describe('heading utilities', () => {
	it('parses markdown headings with their levels and line numbers', () => {
		expect(
			getFileHeadings('Intro\n## First\ntext\n#### Nested\n# Last')
		).toEqual([
			{
				index: 0,
				rawValue: '## First',
				level: 2,
				value: 'First',
				line: 1,
			},
			{
				index: 1,
				rawValue: '#### Nested',
				level: 4,
				value: 'Nested',
				line: 3,
			},
			{
				index: 2,
				rawValue: '# Last',
				level: 1,
				value: 'Last',
				line: 4,
			},
		]);
	});

	it('returns no headings for plain text', () => {
		expect(getFileHeadings('plain text\nnot a heading')).toEqual([]);
	});

	it('keeps the correct line number for repeated identical headings', () => {
		const headings = getFileHeadings(
			'# Same\nfirst body\n# Same\nsecond body'
		);

		expect(headings.map(({ line }) => line)).toEqual([0, 2]);
	});

	it('returns the next heading or the current heading at the end', () => {
		const headings = getFileHeadings('# First\n## Second');
		headings[0]!.insertLocation = InsertLocation.Append;

		expect(getNextHeading(headings[0]!, headings)).toBe(headings[1]);
		expect(getNextHeading(headings[1]!, headings)).toBe(headings[1]);
	});
});

describe('selection removal', () => {
	it('removes a full line selected backwards without joining it to the next line', () => {
		const editor = new TestEditor(
			'first\nnext',
			{ line: 0, ch: 5 },
			{ line: 0, ch: 0 }
		);

		removeSelectionFromEditor(editor as unknown as Editor);

		expect(editor.text).toBe('next');
	});

	it('removes a selection that extends through the trailing empty line', () => {
		const editor = new TestEditor(
			'alpha\nbeta\n',
			{ line: 0, ch: 0 },
			{ line: 2, ch: 0 }
		);

		removeSelectionFromEditor(editor as unknown as Editor);

		expect(editor.text).toBe('');
	});
});
