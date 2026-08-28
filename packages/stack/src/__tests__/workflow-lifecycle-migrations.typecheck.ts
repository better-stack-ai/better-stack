import type { FormBuilderBackendHooks } from "../plugins/form-builder/api";
import type { KanbanBackendHooks } from "../plugins/kanban/api";
import type { MediaBackendHooks } from "../plugins/media/api";

const formBuilderHooks = {
	onBeforeListForms: async () => undefined,
	onBeforeGetForm: async () => undefined,
	onBeforeGetFormForUpdate: async () => undefined,
	onBeforeCreateForm: async () => undefined,
	onAfterCreateForm: async () => undefined,
	onBeforeUpdateForm: async () => undefined,
	onAfterUpdateForm: async () => undefined,
	onBeforeDeleteForm: async () => undefined,
	onAfterDeleteForm: async () => undefined,
	onBeforeSubmission: async () => undefined,
	onAfterSubmission: async () => undefined,
	onErrorSubmission: async () => undefined,
	onBeforeListSubmissions: async () => undefined,
	onBeforeGetSubmission: async () => undefined,
	onBeforeDeleteSubmission: async () => undefined,
	onAfterDeleteSubmission: async () => undefined,
	onError: async () => undefined,
} satisfies FormBuilderBackendHooks;

const kanbanHooks = {
	onBeforeListBoards: async () => undefined,
	onAfterListBoards: async () => undefined,
	onErrorListBoards: async () => undefined,
	onBeforeGetBoard: async () => undefined,
	onAfterGetBoard: async () => undefined,
	onErrorGetBoard: async () => undefined,
	onBeforeCreateBoard: async () => undefined,
	onAfterCreateBoard: async () => undefined,
	onErrorCreateBoard: async () => undefined,
	onBeforeUpdateBoard: async () => undefined,
	onAfterUpdateBoard: async () => undefined,
	onErrorUpdateBoard: async () => undefined,
	onBeforeDeleteBoard: async () => undefined,
	onAfterDeleteBoard: async () => undefined,
	onErrorDeleteBoard: async () => undefined,
	onBeforeCreateColumn: async () => undefined,
	onAfterCreateColumn: async () => undefined,
	onBeforeUpdateColumn: async () => undefined,
	onAfterUpdateColumn: async () => undefined,
	onBeforeDeleteColumn: async () => undefined,
	onAfterDeleteColumn: async () => undefined,
	onBeforeCreateTask: async () => undefined,
	onAfterCreateTask: async () => undefined,
	onBeforeUpdateTask: async () => undefined,
	onAfterUpdateTask: async () => undefined,
	onBeforeDeleteTask: async () => undefined,
	onAfterDeleteTask: async () => undefined,
} satisfies KanbanBackendHooks;

const mediaHooks = {
	onBeforeUpload: async () => undefined,
	onAfterUpload: async () => undefined,
	onBeforeDeleteAsset: async () => undefined,
	onAfterDeleteAsset: async () => undefined,
	onBeforeListAssets: async () => undefined,
	onBeforeUpdateAsset: async () => undefined,
	onBeforeListFolders: async () => undefined,
	onBeforeCreateFolder: async () => undefined,
	onBeforeDeleteFolder: async () => undefined,
	onError: async () => undefined,
} satisfies MediaBackendHooks;

void formBuilderHooks;
void kanbanHooks;
void mediaHooks;

// Explicit migration fixtures: every removed spelling must stay rejected.
({
	// @ts-expect-error Use onBeforeCreateForm.
	onBeforeFormCreated: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onAfterCreateForm.
	onAfterFormCreated: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onBeforeUpdateForm.
	onBeforeFormUpdated: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onAfterUpdateForm.
	onAfterFormUpdated: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onBeforeDeleteForm.
	onBeforeFormDeleted: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onAfterDeleteForm.
	onAfterFormDeleted: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onErrorSubmission.
	onSubmissionError: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onBeforeDeleteSubmission.
	onBeforeSubmissionDeleted: async () => undefined,
}) satisfies FormBuilderBackendHooks;
({
	// @ts-expect-error Use onAfterDeleteSubmission.
	onAfterSubmissionDeleted: async () => undefined,
}) satisfies FormBuilderBackendHooks;

// @ts-expect-error Use onBeforeGetBoard.
({ onBeforeReadBoard: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterListBoards.
({ onBoardsRead: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterGetBoard.
({ onBoardRead: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterCreateBoard.
({ onBoardCreated: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterUpdateBoard.
({ onBoardUpdated: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterDeleteBoard.
({ onBoardDeleted: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onErrorListBoards.
({ onListBoardsError: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onErrorGetBoard.
({ onReadBoardError: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onErrorCreateBoard.
({ onCreateBoardError: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onErrorUpdateBoard.
({ onUpdateBoardError: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onErrorDeleteBoard.
({ onDeleteBoardError: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterCreateColumn.
({ onColumnCreated: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterUpdateColumn.
({ onColumnUpdated: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterDeleteColumn.
({ onColumnDeleted: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterCreateTask.
({ onTaskCreated: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterUpdateTask.
({ onTaskUpdated: async () => undefined }) satisfies KanbanBackendHooks;
// @ts-expect-error Use onAfterDeleteTask.
({ onTaskDeleted: async () => undefined }) satisfies KanbanBackendHooks;

// @ts-expect-error Use onBeforeDeleteAsset.
({ onBeforeDelete: async () => undefined }) satisfies MediaBackendHooks;
// @ts-expect-error Use onAfterDeleteAsset.
({ onAfterDelete: async () => undefined }) satisfies MediaBackendHooks;
// @ts-expect-error Use onError.
({ onOperationError: async () => undefined }) satisfies MediaBackendHooks;
