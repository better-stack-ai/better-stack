export interface KanbanListLocalization {
	// Page titles
	kanbanBoards: string;
	manageProjects: string;
	createNewBoard: string;
	boardDetails: string;
	// Actions
	newBoard: string;
	addColumn: string;
	addTask: string;
	// List
	columnsCount: string;
	// Empty states
	noBoardsDescription: string;
	noColumnsDescription: string;
	noTasksDescription: string;
}

export const defaultKanbanListLocalization: KanbanListLocalization = {
	// Page titles
	kanbanBoards: "Kanban Boards",
	manageProjects: "Manage your projects and tasks",
	createNewBoard: "Create New Board",
	boardDetails: "Board Details",
	// Actions
	newBoard: "New Board",
	addColumn: "Add Column",
	addTask: "Add Task",
	// List
	columnsCount: "columns",
	// Empty states
	noBoardsDescription:
		"Create your first kanban board to start organizing your tasks.",
	noColumnsDescription: "Create your first column to start organizing tasks.",
	noTasksDescription: "Add a task to get started",
};
