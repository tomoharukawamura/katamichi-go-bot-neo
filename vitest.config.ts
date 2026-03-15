import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		root: ".",
		alias: {
			tools: new URL("./tools", import.meta.url).pathname,
		},
	},
});
