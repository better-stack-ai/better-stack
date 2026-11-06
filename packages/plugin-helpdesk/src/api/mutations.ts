/** Lower-level writes bypass validation and authorization; callers own those checks. */
import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type { z } from "zod";
import type { cannedReplySchema } from "../schemas";
import type { CannedReplyRecord, MessageRecord, TicketRecord } from "../types";
import type { HelpdeskDataAdapter } from "./getters";
const memoryTransactions = new WeakMap<Adapter, Promise<unknown>>();
/** Atomic ticket and message writes; serialize memory transactions, which lack isolation. */
export async function withHelpdeskTransaction<T>(
	adapter: Adapter,
	run: (tx: HelpdeskDataAdapter) => Promise<T>,
): Promise<T> {
	if (!adapter.options?.adapterConfig.transaction)
		throw new OperationHttpError(
			503,
			"Helpdesk writes require an adapter with transactions enabled",
			"HELPDESK_TRANSACTIONS_REQUIRED",
		);
	if (adapter.options.adapterConfig.adapterId !== "memory")
		return adapter.transaction(run);
	const previous = memoryTransactions.get(adapter) ?? Promise.resolve();
	const current = previous.catch(() => {}).then(() => adapter.transaction(run));
	memoryTransactions.set(adapter, current);
	try {
		return await current;
	} finally {
		if (memoryTransactions.get(adapter) === current)
			memoryTransactions.delete(adapter);
	}
}
/** Acquire the ticket row's SQL write lock before reading mutable SLA and status data. */
export async function lockTicket(adapter: HelpdeskDataAdapter, id: string) {
	const ticket = await adapter.update<TicketRecord>({
		model: "helpdeskTicket",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: { lockVersion: crypto.randomUUID() },
	});
	if (!ticket)
		throw new OperationHttpError(404, "Ticket not found", "HELPDESK_NOT_FOUND");
	return ticket;
}
export function createTicketRecord(
	adapter: HelpdeskDataAdapter,
	data: Omit<TicketRecord, "id">,
) {
	return adapter.create<TicketRecord>({ model: "helpdeskTicket", data });
}
export function createMessageRecord(
	adapter: HelpdeskDataAdapter,
	data: Omit<MessageRecord, "id">,
) {
	return adapter.create<MessageRecord>({ model: "helpdeskMessage", data });
}
export function updateTicketRecord(
	adapter: HelpdeskDataAdapter,
	id: string,
	update: Partial<Omit<TicketRecord, "id" | "customerId">>,
) {
	return adapter.update<TicketRecord>({
		model: "helpdeskTicket",
		where: [{ field: "id", value: id, operator: "eq" }],
		update,
	});
}
export function createCannedReply(
	adapter: HelpdeskDataAdapter,
	input: z.output<typeof cannedReplySchema>,
) {
	const now = new Date();
	return adapter.create<CannedReplyRecord>({
		model: "helpdeskCannedReply",
		data: { ...input, createdAt: now, updatedAt: now },
	});
}
export function updateCannedReply(
	adapter: HelpdeskDataAdapter,
	id: string,
	input: z.output<typeof cannedReplySchema>,
) {
	return adapter.update<CannedReplyRecord>({
		model: "helpdeskCannedReply",
		where: [{ field: "id", value: id, operator: "eq" }],
		update: { ...input, updatedAt: new Date() },
	});
}
export function deleteCannedReply(adapter: HelpdeskDataAdapter, id: string) {
	return adapter.delete({
		model: "helpdeskCannedReply",
		where: [{ field: "id", value: id, operator: "eq" }],
	});
}
