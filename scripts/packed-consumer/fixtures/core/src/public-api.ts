import { type BackendStack, createBackendStack } from "@btst/stack/api";
import { type ClientStack, createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";
import {
	PageAIContextProvider,
	usePageAIContext,
	useRegisterPageAIContext,
	type PageAIClientTool,
	type PageAIContextConfig,
} from "@btst/stack/page-context";

export type PackedPublicApi = {
	backend: BackendStack;
	client: ClientStack;
	createBackend: typeof createBackendStack;
	createClient: typeof createClientStack;
	provider: typeof StackProvider;
	pageContextProvider: typeof PageAIContextProvider;
	readPageContext: typeof usePageAIContext;
	registerPageContext: typeof useRegisterPageAIContext;
	pageContext: PageAIContextConfig;
	pageTool: PageAIClientTool;
};
