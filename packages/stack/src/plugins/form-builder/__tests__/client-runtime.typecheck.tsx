import { QueryClient } from "@tanstack/react-query";
import { createClientStack } from "../../../client";
import { StackProvider } from "../../../context";
import {
	formBuilderClientPlugin,
	type FormBuilderClientConfig,
} from "../client";

const queryClient = new QueryClient();
const definition = formBuilderClientPlugin({
	hooks: { onErrorLoad: () => undefined },
});

definition.id satisfies "formBuilder";

const stack = createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: { formBuilder: definition },
});

<StackProvider stack={stack} />;
<StackProvider
	stack={stack}
	overrides={{ formBuilder: { showAttribution: false } }}
/>;

// @ts-expect-error Form Builder override values are inferred from registration.
StackProvider({ stack, overrides: { formBuilder: { showAttribution: "no" } } });

// @ts-expect-error Unregistered provider override keys are rejected.
StackProvider({ stack, overrides: { "form-builder": {} } });

createClientStack({
	api: { baseURL: "https://app.example.com", basePath: "/api/data" },
	site: { baseURL: "https://app.example.com", basePath: "/pages" },
	queryClient,
	plugins: {
		// @ts-expect-error Registration keys must match the literal Form Builder ID.
		"form-builder": formBuilderClientPlugin(),
	},
});

const pluginOptions: FormBuilderClientConfig = {};
void pluginOptions;

formBuilderClientPlugin({
	// @ts-expect-error Shared API origins belong to createClientStack().
	apiBaseURL: "https://api.example.com",
});
formBuilderClientPlugin({
	// @ts-expect-error Shared API paths belong to createClientStack().
	apiBasePath: "/api/forms",
});
formBuilderClientPlugin({
	// @ts-expect-error Shared site origins belong to createClientStack().
	siteBaseURL: "https://www.example.com",
});
formBuilderClientPlugin({
	// @ts-expect-error Shared site paths belong to createClientStack().
	siteBasePath: "/forms",
});
formBuilderClientPlugin({
	// @ts-expect-error The query client belongs to createClientStack().
	queryClient,
});
formBuilderClientPlugin({
	// @ts-expect-error Request headers belong to createClientStack().api.
	headers: new Headers(),
});
formBuilderClientPlugin({
	hooks: {
		// @ts-expect-error The canonical loader error callback is onErrorLoad.
		onLoadError: () => undefined,
	},
});
