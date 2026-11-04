import api = require("@btst/plugin-kanban/api");
import client = require("@btst/plugin-kanban/client");
import permissions = require("@btst/plugin-kanban/permissions");
import queries = require("@btst/plugin-kanban/query-keys");
import types = require("@btst/plugin-kanban/types");

export const backend: typeof api.kanbanBackendPlugin = api.kanbanBackendPlugin;
export const catalog: typeof permissions.kanbanPermissions =
	permissions.kanbanPermissions;
export const queryKeys: typeof queries.createKanbanQueryKeys =
	queries.createKanbanQueryKeys;
export type ClientFactory = typeof client.kanbanClientPlugin;
export type Column = types.Column;
export type Task = types.Task;
