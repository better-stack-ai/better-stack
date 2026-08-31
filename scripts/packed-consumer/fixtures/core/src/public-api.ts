import { type BackendStack, createBackendStack } from "@btst/stack/api";
import { type ClientStack, createClientStack } from "@btst/stack/client";
import { StackProvider } from "@btst/stack/context";

export type PackedPublicApi = {
	backend: BackendStack;
	client: ClientStack;
	createBackend: typeof createBackendStack;
	createClient: typeof createClientStack;
	provider: typeof StackProvider;
};
