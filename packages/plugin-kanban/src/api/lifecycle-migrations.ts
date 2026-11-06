/**
 * Removed Kanban lifecycle names and their canonical v3 replacements.
 *
 * Reorder and move operations continue to use the existing update lifecycle;
 * this migration does not invent operation-specific phases.
 */
export const KANBAN_LIFECYCLE_HOOK_MIGRATIONS = Object.freeze({
	onBeforeReadBoard: "onBeforeGetBoard",
	onBoardsRead: "onAfterListBoards",
	onBoardRead: "onAfterGetBoard",
	onBoardCreated: "onAfterCreateBoard",
	onBoardUpdated: "onAfterUpdateBoard",
	onBoardDeleted: "onAfterDeleteBoard",
	onListBoardsError: "onErrorListBoards",
	onReadBoardError: "onErrorGetBoard",
	onCreateBoardError: "onErrorCreateBoard",
	onUpdateBoardError: "onErrorUpdateBoard",
	onDeleteBoardError: "onErrorDeleteBoard",
	onColumnCreated: "onAfterCreateColumn",
	onColumnUpdated: "onAfterUpdateColumn",
	onColumnDeleted: "onAfterDeleteColumn",
	onTaskCreated: "onAfterCreateTask",
	onTaskUpdated: "onAfterUpdateTask",
	onTaskDeleted: "onAfterDeleteTask",
} as const);
