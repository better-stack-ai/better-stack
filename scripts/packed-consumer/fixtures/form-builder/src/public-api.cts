import api = require("@btst/plugin-form-builder/api");
import client = require("@btst/plugin-form-builder/client");
import permissions = require("@btst/plugin-form-builder/permissions");
import queries = require("@btst/plugin-form-builder/query-keys");
import types = require("@btst/plugin-form-builder/types");

export const backend: typeof api.formBuilderBackendPlugin =
	api.formBuilderBackendPlugin;
export const catalog: typeof permissions.formBuilderPermissions =
	permissions.formBuilderPermissions;
export const queryKeys: typeof queries.createFormBuilderQueryKeys =
	queries.createFormBuilderQueryKeys;
export type ClientFactory = typeof client.formBuilderClientPlugin;
export type Form = types.Form;
export type FormSubmission = types.FormSubmission;
