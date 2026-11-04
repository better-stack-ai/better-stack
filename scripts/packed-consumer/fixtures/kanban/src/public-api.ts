import {
	kanbanBackendPlugin,
	type KanbanBackendOptions,
} from "@btst/plugin-kanban/api";
import {
	kanbanClientPlugin,
	type KanbanPluginOverrides,
} from "@btst/plugin-kanban/client";
import { KanbanBoard } from "@btst/plugin-kanban/client/components";
import { useBoard } from "@btst/plugin-kanban/client/hooks";
import { createKanbanQueryKeys } from "@btst/plugin-kanban/query-keys";
import { kanbanPermissions } from "@btst/plugin-kanban/permissions";
import type { Board, Column, Task } from "@btst/plugin-kanban/types";

export type PackedKanbanApi = {
	backend: typeof kanbanBackendPlugin;
	backendOptions: KanbanBackendOptions;
	client: typeof kanbanClientPlugin;
	overrides: KanbanPluginOverrides;
	component: typeof KanbanBoard;
	hook: typeof useBoard;
	queryKeys: typeof createKanbanQueryKeys;
	permissions: typeof kanbanPermissions;
	board: Board;
	column: Column;
	task: Task;
};
