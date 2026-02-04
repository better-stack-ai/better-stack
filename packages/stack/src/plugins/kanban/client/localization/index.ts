import {
	type KanbanCommonLocalization,
	defaultKanbanCommonLocalization,
} from "./kanban-common";
import {
	type KanbanFormsLocalization,
	defaultKanbanFormsLocalization,
} from "./kanban-forms";
import {
	type KanbanListLocalization,
	defaultKanbanListLocalization,
} from "./kanban-list";

export type KanbanLocalization = Partial<
	KanbanCommonLocalization & KanbanFormsLocalization & KanbanListLocalization
>;

export const defaultKanbanLocalization: Required<KanbanLocalization> = {
	...defaultKanbanCommonLocalization,
	...defaultKanbanFormsLocalization,
	...defaultKanbanListLocalization,
};

export type {
	KanbanCommonLocalization,
	KanbanFormsLocalization,
	KanbanListLocalization,
};
