import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import type {
	Affiliate,
	AffiliatePortal,
	AffiliateStats,
	Commission,
	Conversion,
	ListParams,
	ListResult,
	MarketingAsset,
	Payout,
	ReferralClick,
} from "../types";

export type AffiliateDataAdapter = Omit<Adapter, "transaction">;
type Where = { field: string; value: string; operator: "eq" }[];

/** Normalize adapter Date values for JSON and hydrated query caches. */
export function serializeAffiliateRecord<T>(record: unknown): T {
	const { lockVersion: _lockVersion, ...result } = record as Record<
		string,
		unknown
	>;
	for (const field of ["createdAt", "updatedAt", "paidAt"]) {
		const value = result[field];
		if (value instanceof Date) result[field] = value.toISOString();
	}
	return result as T;
}

async function byField<T>(
	adapter: AffiliateDataAdapter,
	model: string,
	field: string,
	value: string,
): Promise<T | null> {
	const row = await adapter.findOne({
		model,
		where: [{ field, value, operator: "eq" }],
	});
	return row ? serializeAffiliateRecord<T>(row) : null;
}
export const getAffiliate = (adapter: AffiliateDataAdapter, id: string) =>
	byField<Affiliate>(adapter, "affiliate", "id", id);
export const getAffiliateByUserId = (
	adapter: AffiliateDataAdapter,
	userId: string,
) => byField<Affiliate>(adapter, "affiliate", "userId", userId);
export const getAffiliateByCode = (
	adapter: AffiliateDataAdapter,
	code: string,
) => byField<Affiliate>(adapter, "affiliate", "code", code);
export const getReferralClick = (adapter: AffiliateDataAdapter, id: string) =>
	byField<ReferralClick>(adapter, "referralClick", "id", id);
export const getCommission = (adapter: AffiliateDataAdapter, id: string) =>
	byField<Commission>(adapter, "affiliateCommission", "id", id);
export const getPayout = (adapter: AffiliateDataAdapter, id: string) =>
	byField<Payout>(adapter, "affiliatePayout", "id", id);
export const getConversionByExternalRef = (
	adapter: AffiliateDataAdapter,
	externalRef: string,
) =>
	byField<Conversion>(
		adapter,
		"affiliateConversion",
		"externalRef",
		externalRef,
	);

async function list<T>(
	adapter: AffiliateDataAdapter,
	model: string,
	params: ListParams = {},
): Promise<ListResult<T>> {
	const where: Where = [];
	for (const field of ["affiliateId", "status", "currency"] as const) {
		const value = params[field];
		if (value) where.push({ field, value, operator: "eq" });
	}
	const limit = params.limit ?? 50;
	const offset = params.offset ?? 0;
	const [rows, total] = await Promise.all([
		adapter.findMany({
			model,
			where,
			limit,
			offset,
			sortBy: { field: "createdAt", direction: "desc" },
		}),
		adapter.count({ model, where }),
	]);
	return {
		items: rows.map((row) => serializeAffiliateRecord<T>(row)),
		total,
		limit,
		offset,
	};
}
export const listAffiliates = (
	adapter: AffiliateDataAdapter,
	params?: ListParams,
) => list<Affiliate>(adapter, "affiliate", params);
export const listCommissions = (
	adapter: AffiliateDataAdapter,
	params?: ListParams,
) => list<Commission>(adapter, "affiliateCommission", params);
export const listPayouts = (
	adapter: AffiliateDataAdapter,
	params?: ListParams,
) => list<Payout>(adapter, "affiliatePayout", params);

export async function allRows<T>(
	adapter: AffiliateDataAdapter,
	model: string,
	where: Where = [],
): Promise<T[]> {
	const items: T[] = [];
	for (let offset = 0; ; offset += 100) {
		const rows = await adapter.findMany({
			model,
			where,
			limit: 100,
			offset,
			sortBy: { field: "id", direction: "asc" },
		});
		items.push(...rows.map((row) => serializeAffiliateRecord<T>(row)));
		if (rows.length < 100) return items;
	}
}

export async function getAffiliateStats(
	adapter: AffiliateDataAdapter,
	affiliateId: string,
): Promise<AffiliateStats> {
	const where: Where = [
		{ field: "affiliateId", value: affiliateId, operator: "eq" },
	];
	const [clicks, conversions, commissions] = await Promise.all([
		adapter.count({ model: "referralClick", where }),
		adapter.count({ model: "affiliateConversion", where }),
		allRows<Commission>(adapter, "affiliateCommission", where),
	]);
	const currencies = new Map<string, AffiliateStats["totals"][number]>();
	for (const commission of commissions) {
		const total = currencies.get(commission.currency) ?? {
			currency: commission.currency,
			pending: 0,
			approved: 0,
			paid: 0,
			voided: 0,
		};
		const next = BigInt(total[commission.status]) + BigInt(commission.amount);
		if (next > BigInt(Number.MAX_SAFE_INTEGER))
			throw new OperationHttpError(
				409,
				"Commission total exceeds safe integer range",
				"AFFILIATE_AMOUNT_OVERFLOW",
			);
		total[commission.status] = Number(next);
		currencies.set(commission.currency, total);
	}
	return {
		clicks,
		conversions,
		totals: [...currencies.values()].sort((a, b) =>
			a.currency.localeCompare(b.currency),
		),
	};
}

export async function getPortal(
	adapter: AffiliateDataAdapter,
	userId: string,
	assets: MarketingAsset[] = [],
): Promise<AffiliatePortal> {
	const affiliate = await getAffiliateByUserId(adapter, userId);
	if (!affiliate)
		return {
			affiliate: null,
			stats: { clicks: 0, conversions: 0, totals: [] },
			commissions: [],
			payouts: [],
			assets,
		};
	const [stats, commissions, payouts] = await Promise.all([
		getAffiliateStats(adapter, affiliate.id),
		listCommissions(adapter, { affiliateId: affiliate.id, limit: 100 }),
		listPayouts(adapter, { affiliateId: affiliate.id, limit: 100 }),
	]);
	const { notes: _notes, ...profile } = affiliate;
	return {
		affiliate: profile,
		stats,
		commissions: commissions.items,
		payouts: payouts.items,
		assets,
	};
}

function csvCell(value: unknown): string {
	let text = value == null ? "" : String(value);
	if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
	return `"${text.replace(/"/g, '""')}"`;
}

export async function exportPayouts(
	adapter: AffiliateDataAdapter,
	params: ListParams = {},
): Promise<string> {
	const where: Where = [];
	for (const field of ["affiliateId", "status", "currency"] as const) {
		const value = params[field];
		if (value) where.push({ field, value, operator: "eq" });
	}
	const payouts = await allRows<Payout>(adapter, "affiliatePayout", where);
	const fields = [
		"id",
		"affiliateId",
		"amount",
		"currency",
		"status",
		"reference",
		"paidAt",
		"createdAt",
	] as const;
	return [
		fields.map(csvCell).join(","),
		...payouts.map((row) =>
			fields.map((field) => csvCell(row[field])).join(","),
		),
	].join("\r\n");
}
