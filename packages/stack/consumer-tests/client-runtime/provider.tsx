import { StackProvider } from "@btst/stack/context";
import { browserClientStack } from "./index";

<StackProvider
	stack={browserClientStack}
	overrides={{ consumerProbe: { label: "Consumer", format: "short" } }}
/>;

<StackProvider stack={browserClientStack} />;

// @ts-expect-error Override values are inferred from the registered plugin factory.
<StackProvider
	stack={browserClientStack}
	overrides={{ consumerProbe: { label: "Consumer", format: "wide" } }}
/>;

// @ts-expect-error Unknown plugins are not valid provider override keys.
<StackProvider
	stack={browserClientStack}
	overrides={{ missing: { label: "Missing" } }}
/>;
