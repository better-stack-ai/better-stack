/** Lower-level reads bypass authorization and lifecycle; callers own those checks. */
import type { DBAdapter as Adapter } from "@btst/db";
import type { z } from "zod";
import type {
	listContactsSchema,
	listCompaniesSchema,
	listDealsSchema,
	listActivitiesSchema,
	paginationSchema,
} from "../schemas";
import type {
	ContactRecord,
	CompanyRecord,
	DealRecord,
	ActivityRecord,
	Deal,
	Pipeline,
} from "../types";
import type { Task, Column } from "../../kanban/types";
import { getBoardById } from "../../kanban/api/getters";
import {
	serializeBoard,
	serializeColumn,
	serializeTask,
} from "../../kanban/api/serializers";
import {
	serializeContact,
	serializeCompany,
	serializeActivity,
} from "./serializers";

/** Read every adapter page so searches and counts are not silently truncated. */
export async function getCrmRows<T>(
	adapter: Adapter,
	model: string,
): Promise<T[]> {
	const rows: T[] = [];
	for (let offset = 0; ; offset += 200) {
		const page = await adapter.findMany<T>({
			model,
			limit: 200,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		rows.push(...page);
		if (page.length < 200) return rows;
	}
}
/** Paginate an already filtered CRM collection. */
export function crmPage<T>(
	items: T[],
	query: { limit: number; offset: number },
) {
	return {
		items: items.slice(query.offset, query.offset + query.limit),
		total: items.length,
	};
}
export function getContactRecord(adapter: Adapter, id: string) {
	return adapter.findOne<ContactRecord>({
		model: "crmContact",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export function getCompanyRecord(adapter: Adapter, id: string) {
	return adapter.findOne<CompanyRecord>({
		model: "crmCompany",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export function getDealRecord(adapter: Adapter, id: string) {
	return adapter.findOne<DealRecord>({
		model: "crmDeal",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
export function getActivityRecord(adapter: Adapter, id: string) {
	return adapter.findOne<ActivityRecord>({
		model: "crmActivity",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
/** Find contacts across every stored field, including custom-field values and tags. */
export async function listContacts(
	adapter: Adapter,
	query: z.output<typeof listContactsSchema>,
) {
	const term = query.search?.toLocaleLowerCase();
	const companies = term
		? new Map(
				(await getCrmRows<CompanyRecord>(adapter, "crmCompany")).map(
					(company) => [company.id, company.name],
				),
			)
		: new Map<string, string>();
	const items = (await getCrmRows<ContactRecord>(adapter, "crmContact"))
		.map(serializeContact)
		.filter(
			(row) =>
				(!query.companyId || row.companyId === query.companyId) &&
				(!query.tag || row.tags.includes(query.tag)) &&
				(!term ||
					`${JSON.stringify(Object.values(row).filter((value) => value != null))} ${companies.get(row.companyId ?? "") ?? ""}`
						.toLocaleLowerCase()
						.includes(term)),
		)
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return crmPage(items, query);
}
export async function getContactById(adapter: Adapter, id: string) {
	const row = await getContactRecord(adapter, id);
	return row ? serializeContact(row) : null;
}
export async function listCompanies(
	adapter: Adapter,
	query: z.output<typeof listCompaniesSchema>,
) {
	const term = query.search?.toLocaleLowerCase();
	return crmPage(
		(await getCrmRows<CompanyRecord>(adapter, "crmCompany"))
			.map(serializeCompany)
			.filter(
				(row) =>
					!term ||
					JSON.stringify(Object.values(row).filter((value) => value != null))
						.toLocaleLowerCase()
						.includes(term),
			)
			.sort((a, b) => a.name.localeCompare(b.name)),
		query,
	);
}
export async function getCompanyById(adapter: Adapter, id: string) {
	const row = await getCompanyRecord(adapter, id);
	return row ? serializeCompany(row) : null;
}
/** Project authoritative title, stage, and pipeline from the linked Kanban task. */
export async function hydrateDeal(
	adapter: Adapter,
	row: DealRecord,
): Promise<Deal | null> {
	const task = await adapter.findOne<Task>({
		model: "kanbanTask",
		where: [{ field: "id", value: row.taskId, operator: "eq" }],
	});
	if (!task) return null;
	const column = await adapter.findOne<Column>({
		model: "kanbanColumn",
		where: [{ field: "id", value: task.columnId, operator: "eq" }],
	});
	if (!column) return null;
	return {
		...row,
		title: task.title,
		stage: column.id,
		pipelineId: column.boardId,
		closeDate: row.closeDate ? new Date(row.closeDate).toISOString() : null,
		createdAt: new Date(row.createdAt).toISOString(),
		updatedAt: new Date(
			Math.max(
				new Date(row.updatedAt).getTime(),
				new Date(task.updatedAt).getTime(),
			),
		).toISOString(),
	};
}
export async function getDealById(adapter: Adapter, id: string) {
	const row = await getDealRecord(adapter, id);
	return row ? hydrateDeal(adapter, row) : null;
}
export async function listDeals(
	adapter: Adapter,
	query: z.output<typeof listDealsSchema>,
) {
	const rows = await Promise.all(
		(await getCrmRows<DealRecord>(adapter, "crmDeal")).map((row) =>
			hydrateDeal(adapter, row),
		),
	);
	return crmPage(
		rows
			.filter(
				(row): row is Deal =>
					!!row &&
					(!query.pipelineId || row.pipelineId === query.pipelineId) &&
					(!query.contactId || row.contactId === query.contactId) &&
					(!query.companyId || row.companyId === query.companyId) &&
					(!query.status || row.status === query.status),
			)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
		query,
	);
}
export async function getPipeline(
	adapter: Adapter,
	id: string,
): Promise<Pipeline | null> {
	const link = await adapter.findOne({
		model: "crmPipeline",
		where: [{ field: "boardId", value: id, operator: "eq" }],
	});
	if (!link) return null;
	const board = await getBoardById(adapter, id);
	if (!board) return null;
	const taskIds = new Set(
		board.columns.flatMap((column) => column.tasks.map((task) => task.id)),
	);
	const rows = (await getCrmRows<DealRecord>(adapter, "crmDeal")).filter(
		(row) => taskIds.has(row.taskId),
	);
	const deals = (
		await Promise.all(rows.map((row) => hydrateDeal(adapter, row)))
	).filter((deal): deal is Deal => !!deal);
	return {
		...serializeBoard(board),
		columns: board.columns.map((column) => ({
			...serializeColumn(column),
			tasks: column.tasks.map(serializeTask),
		})),
		deals,
	};
}
export async function listPipelines(
	adapter: Adapter,
	query: z.output<typeof paginationSchema>,
) {
	const links = await getCrmRows<{ boardId: string }>(adapter, "crmPipeline");
	const boards = await Promise.all(
		links.map((row) => getPipeline(adapter, row.boardId)),
	);
	return crmPage(
		boards.filter((row): row is Pipeline => !!row),
		query,
	);
}
export async function listActivities(
	adapter: Adapter,
	query: z.output<typeof listActivitiesSchema>,
) {
	return crmPage(
		(await getCrmRows<ActivityRecord>(adapter, "crmActivity"))
			.filter(
				(row) =>
					(!query.contactId || row.contactId === query.contactId) &&
					(!query.dealId || row.dealId === query.dealId),
			)
			.map(serializeActivity)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
		query,
	);
}
export async function getContactActivities(adapter: Adapter, id: string) {
	return listActivities(adapter, { contactId: id, limit: 200, offset: 0 });
}
