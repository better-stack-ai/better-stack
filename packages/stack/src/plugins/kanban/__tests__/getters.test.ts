import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "@btst/adapter-memory";
import { defineDb } from "@btst/db";
import type { Adapter } from "@btst/db";
import { kanbanSchema } from "../db";
import { getAllBoards, getBoardById } from "../api/getters";

const createTestAdapter = (): Adapter => {
	const db = defineDb({}).use(kanbanSchema);
	return createMemoryAdapter(db)({});
};

async function createBoard(
	adapter: Adapter,
	name: string,
	slug: string,
	ownerId?: string,
): Promise<any> {
	return adapter.create({
		model: "kanbanBoard",
		data: {
			name,
			slug,
			...(ownerId ? { ownerId } : {}),
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

async function createColumn(
	adapter: Adapter,
	boardId: string,
	title: string,
	order: number,
): Promise<any> {
	return adapter.create({
		model: "kanbanColumn",
		data: {
			boardId,
			title,
			order,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

async function createTask(
	adapter: Adapter,
	columnId: string,
	title: string,
	order: number,
): Promise<any> {
	return adapter.create({
		model: "kanbanTask",
		data: {
			columnId,
			title,
			priority: "MEDIUM",
			order,
			isArchived: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
}

describe("kanban getters", () => {
	let adapter: Adapter;

	beforeEach(() => {
		adapter = createTestAdapter();
	});

	describe("getAllBoards", () => {
		it("returns empty array when no boards exist", async () => {
			const { items, total } = await getAllBoards(adapter);
			expect(items).toEqual([]);
			expect(total).toBe(0);
		});

		it("returns all boards with columns and tasks", async () => {
			const board = (await createBoard(adapter, "My Board", "my-board")) as any;
			const col = (await createColumn(adapter, board.id, "To Do", 0)) as any;
			await createTask(adapter, col.id, "Task 1", 0);

			const { items: boards, total } = await getAllBoards(adapter);
			expect(boards).toHaveLength(1);
			expect(total).toBe(1);
			expect(boards[0]!.slug).toBe("my-board");
			expect(boards[0]!.columns).toHaveLength(1);
			expect(boards[0]!.columns[0]!.title).toBe("To Do");
			expect(boards[0]!.columns[0]!.tasks).toHaveLength(1);
			expect(boards[0]!.columns[0]!.tasks[0]!.title).toBe("Task 1");
		});

		it("returns boards with empty columns array when no columns exist", async () => {
			await createBoard(adapter, "Empty Board", "empty-board");

			const { items: boards } = await getAllBoards(adapter);
			expect(boards).toHaveLength(1);
			expect(boards[0]!.columns).toEqual([]);
		});

		it("filters boards by slug", async () => {
			await createBoard(adapter, "Board A", "board-a");
			await createBoard(adapter, "Board B", "board-b");

			const { items, total } = await getAllBoards(adapter, { slug: "board-a" });
			expect(items).toHaveLength(1);
			expect(total).toBe(1);
			expect(items[0]!.slug).toBe("board-a");
		});

		it("filters boards by ownerId", async () => {
			await createBoard(adapter, "Alice Board", "alice-board", "user-alice");
			await createBoard(adapter, "Bob Board", "bob-board", "user-bob");

			const { items, total } = await getAllBoards(adapter, {
				ownerId: "user-alice",
			});
			expect(items).toHaveLength(1);
			expect(total).toBe(1);
			expect(items[0]!.slug).toBe("alice-board");
		});

		it("sorts columns by order", async () => {
			const board = (await createBoard(adapter, "Board", "board")) as any;
			// Create columns out of order
			await createColumn(adapter, board.id, "Done", 2);
			await createColumn(adapter, board.id, "To Do", 0);
			await createColumn(adapter, board.id, "In Progress", 1);

			const { items: boards } = await getAllBoards(adapter);
			expect(boards[0]!.columns[0]!.title).toBe("To Do");
			expect(boards[0]!.columns[1]!.title).toBe("In Progress");
			expect(boards[0]!.columns[2]!.title).toBe("Done");
		});
	});

	describe("getBoardById", () => {
		it("returns null when board does not exist", async () => {
			const board = await getBoardById(adapter, "nonexistent");
			expect(board).toBeNull();
		});

		it("returns the board with columns and tasks", async () => {
			const board = (await createBoard(adapter, "My Board", "my-board")) as any;
			const col1 = (await createColumn(adapter, board.id, "To Do", 0)) as any;
			const col2 = (await createColumn(adapter, board.id, "Done", 1)) as any;
			await createTask(adapter, col1.id, "Task A", 0);
			await createTask(adapter, col1.id, "Task B", 1);
			await createTask(adapter, col2.id, "Task C", 0);

			const result = await getBoardById(adapter, board.id);
			expect(result).not.toBeNull();
			expect(result!.id).toBe(board.id);
			expect(result!.columns).toHaveLength(2);
			expect(result!.columns[0]!.tasks).toHaveLength(2);
			expect(result!.columns[1]!.tasks).toHaveLength(1);
		});

		it("returns board with empty columns when no columns exist", async () => {
			const board = (await createBoard(adapter, "Empty Board", "empty")) as any;

			const result = await getBoardById(adapter, board.id);
			expect(result).not.toBeNull();
			expect(result!.columns).toEqual([]);
		});
	});
});
