import api = require("@btst/stack/api");
import client = require("@btst/stack/client");

void api.createBackendStack;
void client.createClientStack;

type BackendConfig = api.BackendStackConfig;
type BackendResult = api.BackendStack;
type ClientConfig = client.ClientStackConfig;
type ClientResult = client.ClientStack;

declare const backendConfig: BackendConfig;
declare const clientConfig: ClientConfig;
declare const backendResult: BackendResult;
declare const clientResult: ClientResult;
void backendConfig;
void clientConfig;
void backendResult;
void clientResult;
