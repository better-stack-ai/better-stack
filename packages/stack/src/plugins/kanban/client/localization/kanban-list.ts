export interface KanbanListLocalization {
	// Page titles
	kanbanBoards: string;
	manageProjects: string;
	createNewBoard: string;
	createNewBoardDescription: string;
	boardDetails: string;
	boardDetailsDescription: string;
	// Actions
	newBoard: string;
	addColumn: string;
	addTask: string;
	editBoard: string;
	editColumn: string;
	editTask: string;
	// List
	columnsCount: string;
	// Empty states
	noBoardsDescription: string;
	noColumnsDescription: string;
	noTasksDescription: string;
	boardNotFound: string;
	boardNotFoundDescription: string;
	addColumnDescription: string;
	editColumnDescription: string;
	editBoardDescription: string;
	addTaskDescription: string;
	editTaskDescription: string;
}

export const defaultKanbanListLocalization: KanbanListLocalization = {
	// Page titles
	kanbanBoards: "Kanban Boards",
	manageProjects: "Manage your projects and tasks",
	createNewBoard: "Create New Board",
	createNewBoardDescription: "Set up a new kanban board for your project",
	boardDetails: "Board Details",
	boardDetailsDescription: "Enter the details for your new kanban board.",
	// Actions
	newBoard: "New Board",
	addColumn: "Add Column",
	addTask: "Add Task",
	editBoard: "Edit Board",
	editColumn: "Edit Column",
	editTask: "Edit Task",
	// List
	columnsCount: "columns",
	// Empty states
	noBoardsDescription:
		"Create your first kanban board to start organizing your tasks.",
	noColumnsDescription: "Create your first column to start organizing tasks.",
	noTasksDescription: "Add a task to get started",
	boardNotFound: "Board not found",
	boardNotFoundDescription:
		"The board you're looking for doesn't exist or you don't have access to it.",
	addColumnDescription: "Add a new column to this board.",
	editColumnDescription: "Update the column details.",
	editBoardDescription: "Update board details.",
	addTaskDescription: "Create a new task.",
	editTaskDescription: "Update task details.",
};
