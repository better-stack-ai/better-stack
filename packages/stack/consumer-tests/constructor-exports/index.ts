import {
	createBackendStack,
	stack,
	type BackendLib,
	type BackendLibConfig,
	type BackendStack,
	type BackendStackConfig,
} from "@btst/stack/api";
import {
	createClientStack,
	createStackClient,
	type ClientLib,
	type ClientLibConfig,
	type ClientStack,
	type ClientStackConfig,
} from "@btst/stack/client";

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
	T,
>() => T extends TRight ? 1 : 2
	? true
	: false;
type Expect<T extends true> = T;

type _BackendFactoriesMatch = Expect<
	Equal<typeof createBackendStack, typeof stack>
>;
type _ClientFactoriesMatch = Expect<
	Equal<typeof createClientStack, typeof createStackClient>
>;
type _BackendConfigAliasMatches = Expect<
	Equal<BackendStackConfig, BackendLibConfig>
>;
type _BackendResultAliasMatches = Expect<Equal<BackendStack, BackendLib>>;
type _ClientConfigAliasMatches = Expect<
	Equal<ClientStackConfig, ClientLibConfig>
>;
type _ClientResultAliasMatches = Expect<Equal<ClientStack, ClientLib>>;

void createBackendStack;
void stack;
void createClientStack;
void createStackClient;
