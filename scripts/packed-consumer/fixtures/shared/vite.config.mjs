import { isBuiltin } from "node:module";

export default {
	plugins: [{
		name: "reject-browser-node-builtins",
		enforce: "pre",
		resolveId(id) {
			if (isBuiltin(id)) throw new Error(`Node built-in reached the browser consumer: ${id}`);
		},
	}],
};
