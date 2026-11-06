import api = require("@btst/plugin-open-api/api");
import core = require("@btst/stack/api");
import memory = require("@btst/adapter-memory");
const options: api.OpenAPIOptions = { theme: "moon", path: "/docs" };
const plugin = api.openApiBackendPlugin(options);
const id: "openApi" = plugin.id;
const stack = core.createBackendStack({
	basePath: "/api",
	plugins: { openApi: plugin },
	adapter: (db) => memory.createMemoryAdapter(db)({}),
});
const schema = (context: core.StackContext) =>
	api.generateOpenAPISchema(context);
export { id, stack, schema };
export type Router = api.OpenApiRouter;
