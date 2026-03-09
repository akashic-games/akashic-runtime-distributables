import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["node_modules/", "scripts/tests/", "tests/", "dist/", "temp/", "**/*.config.ts"],
		},
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["scripts/tests/**/*.test.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "e2e",
					include: ["tests/**/*.test.ts"],
				},
			},
		],
	},
});
