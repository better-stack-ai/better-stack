import { isBuiltin } from "node:module";

export default {
	plugins: [
		{
			name: "reject-browser-node-builtins",
			enforce: "pre",
			async resolveId(id, importer) {
				if (!isBuiltin(id)) return;
				const resolved = await this.resolve(id, importer, { skipSelf: true });
				if (
					!resolved ||
					resolved.external ||
					isBuiltin(resolved.id) ||
					resolved.id.includes("__vite-browser-external")
				) {
					throw new Error(`Node built-in reached the browser consumer: ${id}`);
				}
				return resolved;
			},
		},
	],
};
