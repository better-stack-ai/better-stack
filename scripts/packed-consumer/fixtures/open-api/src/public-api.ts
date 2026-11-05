import {
	openApiBackendPlugin,
	generateOpenAPISchema,
	type OpenAPIOptions,
	type ScalarTheme,
	type OpenApiRouter,
} from "@btst/plugin-open-api/api";
import { createBackendStack, type StackContext } from "@btst/stack/api";
import { createMemoryAdapter } from "@btst/adapter-memory";

const theme: ScalarTheme = "moon";
const options: OpenAPIOptions = { theme, path: "/docs", nonce: "nonce" };
const plugin = openApiBackendPlugin(options);
const id: "openApi" = plugin.id;
const stack = createBackendStack({
	basePath: "/api",
	plugins: { openApi: plugin },
	adapter: (db) => createMemoryAdapter(db)({}),
});
const schema = (context: StackContext) => generateOpenAPISchema(context);
// @ts-expect-error the backend package does not add a client factory
import { openApiClientPlugin } from "@btst/plugin-open-api/api";
// @ts-expect-error unsupported reference themes remain invalid
const invalidTheme: ScalarTheme = "invented";
export { id, stack, schema, openApiClientPlugin, invalidTheme };
export type { OpenApiRouter };
