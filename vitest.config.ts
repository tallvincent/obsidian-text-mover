/* eslint obsidianmd/no-nodejs-modules: "off" -- Vitest config runs in Node and is not bundled into the plugin. */
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			obsidian: resolve(projectRoot, 'tests/mocks/obsidian.ts'),
		},
	},
	test: {
		clearMocks: true,
	},
});
