/**
 * Lower-level reads do not authorize callers or run operation lifecycle hooks.
 * Callers own input validation and access control; use stack operations for requests.
 */
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

/** Adapter reads shared by ordinary callers and an existing transaction. */
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
/** Read an affiliate profile, including administrative notes, by its record ID. */
export const getAffiliate = (adapter: AffiliateDataAdapter, id: string) =>
	byField<Affiliate>(adapter, "affiliate", "id", id);
/** Find the profile owned by an authenticated account ID. */
export const getAffiliateByUserId = (
	adapter: AffiliateDataAdapter,
	userId: string,
) => byField<Affiliate>(adapter, "affiliate", "userId", userId);
/** Resolve a public referral code without filtering the affiliate's status. */
export const getAffiliateByCode = (
	adapter: AffiliateDataAdapter,
	code: string,
) => byField<Affiliate>(adapter, "affiliate", "code", code);
/** Resolve an opaque click ID; callers must still check its attribution window. */
export const getReferralClick = (adapter: AffiliateDataAdapter, id: string) =>
	byField<ReferralClick>(adapter, "referralClick", "id", id);
/** Read a commission and its payout reservation, if any. */
export const getCommission = (adapter: AffiliateDataAdapter, id: string) =>
	byField<Commission>(adapter, "affiliateCommission", "id", id);
/** Read a manual payout batch by ID. */
export const getPayout = (adapter: AffiliateDataAdapter, id: string) =>
	byField<Payout>(adapter, "affiliatePayout", "id", id);
/** Find an existing order/event conversion for retry deduplication. */
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
/** Page affiliate profiles, including administrative notes, newest first. */
export const listAffiliates = (
	adapter: AffiliateDataAdapter,
	params?: ListParams,
) =>
	list<Affiliate>(adapter, "affiliate", {
		limit: params?.limit,
		offset: params?.offset,
		status: params?.status,
	});
/** Page commissions, optionally filtering affiliate, status, and currency. */
export const listCommissions = (
	adapter: AffiliateDataAdapter,
	params?: ListParams,
) => list<Commission>(adapter, "affiliateCommission", params);
/** Page payout batches, optionally filtering affiliate, status, and currency. */
export const listPayouts = (
	adapter: AffiliateDataAdapter,
	params?: ListParams,
) => list<Payout>(adapter, "affiliatePayout", params);

/** Read every matching record in stable ID order, beyond adapter page limits. */
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

/** Count referral activity and total commission minor units separately per currency. */
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

/** Read one account's portal, excluding notes and limiting each history to 100 records. */
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

/** Export all matching batches with quoted cells and escaped spreadsheet formulas. */
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
