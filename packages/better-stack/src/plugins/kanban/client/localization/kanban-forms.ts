export interface KanbanFormsLocalization {
	// Board form
	boardName: string;
	boardNamePlaceholder: string;
	boardDescription: string;
	boardDescriptionPlaceholder: string;
	createBoard: string;
	updateBoard: string;
	deleteBoard: string;
	deleteBoardConfirm: string;
	// Column form
	columnTitle: string;
	columnTitlePlaceholder: string;
	createColumn: string;
	updateColumn: string;
	deleteColumn: string;
	deleteColumnConfirm: string;
	// Task form
	taskTitle: string;
	taskTitlePlaceholder: string;
	taskDescription: string;
	taskDescriptionPlaceholder: string;
	taskPriority: string;
	taskColumn: string;
	taskAssignee: string;
	createTask: string;
	updateTask: string;
	deleteTask: string;
	deleteTaskConfirm: string;
	// Validation
	nameRequired: string;
	titleRequired: string;
}

export const defaultKanbanFormsLocalization: KanbanFormsLocalization = {
	// Board form
	boardName: "Name",
	boardNamePlaceholder: "e.g., Project Alpha",
	boardDescription: "Description",
	boardDescriptionPlaceholder: "Describe your board...",
	createBoard: "Create Board",
	updateBoard: "Update Board",
	deleteBoard: "Delete Board",
	deleteBoardConfirm:
		"Are you sure you want to delete this board? This action cannot be undone. All columns and tasks will be permanently removed.",
	// Column form
	columnTitle: "Title",
	columnTitlePlaceholder: "e.g., To Do",
	createColumn: "Create Column",
	updateColumn: "Update Column",
	deleteColumn: "Delete Column",
	deleteColumnConfirm:
		"Are you sure you want to delete this column? All tasks in this column will be permanently removed.",
	// Task form
	taskTitle: "Title",
	taskTitlePlaceholder: "e.g., Fix login bug",
	taskDescription: "Description",
	taskDescriptionPlaceholder: "Describe the task...",
	taskPriority: "Priority",
	taskColumn: "Column",
	taskAssignee: "Assignee",
	createTask: "Create Task",
	updateTask: "Update Task",
	deleteTask: "Delete Task",
	deleteTaskConfirm:
		"Are you sure you want to delete this task? This action cannot be undone.",
	// Validation
	nameRequired: "Name is required",
	titleRequired: "Title is required",
};
