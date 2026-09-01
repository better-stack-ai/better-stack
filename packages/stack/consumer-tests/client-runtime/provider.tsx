import { StackProvider } from "@btst/stack/context";
import { browserClientStack } from "./index";

<StackProvider
	stack={browserClientStack}
	overrides={{ consumerProbe: { label: "Consumer", format: "short" } }}
/>;

<StackProvider stack={browserClientStack} />;

// @ts-expect-error Provider paths come from the resolved stack.
<StackProvider stack={browserClientStack} basePath="/ignored" />;

// @ts-expect-error Provider API configuration comes from the resolved stack.
<StackProvider stack={browserClientStack} api={{ basePath: "/ignored" }} />;

const propsWithLegacyBasePath = {
	stack: browserClientStack,
	basePath: "/ignored",
};
// @ts-expect-error Spread provider props cannot override resolved stack paths.
<StackProvider {...propsWithLegacyBasePath} />;

const propsWithLegacyApi = {
	stack: browserClientStack,
	api: { basePath: "/ignored" },
};
// @ts-expect-error Spread provider props cannot override resolved stack API configuration.
<StackProvider {...propsWithLegacyApi} />;

<StackProvider
	stack={browserClientStack}
	overrides={{
		consumerProbe: {
			label: "Consumer",
			// @ts-expect-error Override values are inferred from the registered plugin factory.
			format: "wide",
		},
	}}
/>;

<StackProvider
	stack={browserClientStack}
	overrides={{
		// @ts-expect-error Unknown plugins are not valid provider override keys.
		missing: { label: "Missing" },
	}}
/>;
