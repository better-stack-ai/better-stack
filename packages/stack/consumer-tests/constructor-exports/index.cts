import api = require("@btst/stack/api");
import client = require("@btst/stack/client");

type Equal<TLeft, TRight> = (<T>() => T extends TLeft ? 1 : 2) extends <
	T,
>() => T extends TRight ? 1 : 2
	? true
	: false;
type Expect<T extends true> = T;

type _BackendFactoriesMatch = Expect<
	Equal<typeof api.createBackendStack, typeof api.stack>
>;
type _ClientFactoriesMatch = Expect<
	Equal<typeof client.createClientStack, typeof client.createStackClient>
>;
type _BackendConfigAliasMatches = Expect<
	Equal<api.BackendStackConfig, api.BackendLibConfig>
>;
type _BackendResultAliasMatches = Expect<
	Equal<api.BackendStack, api.BackendLib>
>;
type _ClientConfigAliasMatches = Expect<
	Equal<client.ClientStackConfig, client.ClientLibConfig>
>;
type _ClientResultAliasMatches = Expect<
	Equal<client.ClientStack, client.ClientLib>
>;

void api.createBackendStack;
void api.stack;
void client.createClientStack;
void client.createStackClient;
