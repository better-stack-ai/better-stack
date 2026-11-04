/**
 * Lower-level writes validate domain inputs but do not authorize callers or run
 * operation lifecycle hooks. Callers own those concerns; use stack operations for requests.
 */
import type { DBAdapter as Adapter } from "@btst/db";
import { OperationHttpError } from "@btst/stack/plugins/api";
import { isClickWithinWindow, safeLandingPath } from "../attribution";
import { calculateCommission } from "../commission";
import {
	createAffiliateSchema,
	createConversionSchema,
	createPayoutSchema,
	trackClickSchema,
	updateAffiliateSchema,
	updateCommissionSchema,
	updatePayoutSchema,
} from "../schemas";
import type {
	Affiliate,
	AffiliateOptions,
	Commission,
	Conversion,
	CreateAffiliateInput,
	CreateConversionInput,
	CreatePayoutInput,
	Payout,
	ReferralClick,
	TrackClickInput,
	UpdateAffiliateInput,
} from "../types";
import {
	allRows,
	type AffiliateDataAdapter,
	getAffiliate,
	getAffiliateByCode,
	getCommission,
	getConversionByExternalRef,
	getPayout,
	getReferralClick,
	serializeAffiliateRecord,
} from "./getters";

const queues = new WeakMap<Adapter, Map<string, Promise<unknown>>>();
function fail(message: string, status = 409): never {
	throw new OperationHttpError(status, message, "AFFILIATE_CONFLICT");
}

/** Serialize ledger changes with a transactional affiliate row lock and a memory-adapter queue. */
export async function withAffiliateTransaction<T>(
	adapter: Adapter,
	affiliateId: string | null,
	run: (tx: AffiliateDataAdapter) => Promise<T>,
): Promise<T> {
	const config = adapter.options?.adapterConfig;
	if (!config?.transaction)
		fail("Affiliate writes require an adapter with transactions enabled", 503);
	let pending = queues.get(adapter);
	if (!pending) {
		pending = new Map();
		queues.set(adapter, pending);
	}
	const key = config.adapterId === "memory" ? "*" : (affiliateId ?? "create");
	const previous = pending.get(key) ?? Promise.resolve();
	const operation = previous
		.catch(() => {})
		.then(() =>
			adapter.transaction(async (tx) => {
				if (affiliateId) {
					const locked = await tx.update({
						model: "affiliate",
						where: [{ field: "id", value: affiliateId, operator: "eq" }],
						update: { lockVersion: crypto.randomUUID() },
					});
					if (!locked) fail("Affiliate not found", 404);
				}
				return run(tx);
			}),
		);
	pending.set(key, operation);
	try {
		return await operation;
	} finally {
		if (pending.get(key) === operation) pending.delete(key);
	}
}

async function ensureUniqueAffiliate(
	adapter: AffiliateDataAdapter,
	input: { code?: string; email?: string; userId?: string },
	excludeId?: string,
) {
	for (const field of ["code", "email", "userId"] as const) {
		const value = input[field];
		if (!value) continue;
		const existing = await adapter.findOne<{ id: string }>({
			model: "affiliate",
			where: [{ field, value, operator: "eq" }],
		});
		if (existing && existing.id !== excludeId)
			fail(`Affiliate ${field} is already in use`);
	}
}

/** Create a pending profile with unique account, email, and referral code. */
export async function createAffiliate(
	adapter: Adapter,
	input: CreateAffiliateInput,
): Promise<Affiliate> {
	const data = createAffiliateSchema.parse(input);
	return withAffiliateTransaction(adapter, null, async (tx) => {
		const values = {
			...data,
			email: data.email.toLowerCase(),
			code:
				data.code ??
				`partner-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`,
		};
		await ensureUniqueAffiliate(tx, values);
		return serializeAffiliateRecord<Affiliate>(
			await tx.create({
				model: "affiliate",
				data: {
					...values,
					status: "pending",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}),
		);
	});
}

/** Update a profile while enforcing unique fields, status transitions, and commission rules. */
export async function updateAffiliate(
	adapter: Adapter,
	id: string,
	input: UpdateAffiliateInput,
): Promise<Affiliate> {
	const data = updateAffiliateSchema.parse(input);
	return withAffiliateTransaction(adapter, id, async (tx) => {
		const current = await getAffiliate(tx, id);
		if (!current) fail("Affiliate not found", 404);
		const values = {
			...data,
			...(data.email ? { email: data.email.toLowerCase() } : {}),
		};
		await ensureUniqueAffiliate(tx, values, id);
		if (data.status && data.status !== current.status) {
			const allowed =
				current.status === "pending"
					? ["approved", "suspended"]
					: current.status === "approved"
						? ["suspended"]
						: ["approved"];
			if (!allowed.includes(data.status))
				fail("Invalid affiliate status transition");
		}
		const ruleType =
			data.commissionType === undefined
				? current.commissionType
				: data.commissionType;
		const ruleValue =
			data.commissionValue === undefined
				? current.commissionValue
				: data.commissionValue;
		if ((ruleType == null) !== (ruleValue == null))
			fail("Commission override requires both type and value", 400);
		if (ruleType != null && ruleValue != null) {
			try {
				calculateCommission(0, ruleType, ruleValue);
			} catch (error) {
				fail(
					error instanceof Error ? error.message : "Invalid commission rule",
					400,
				);
			}
		}
		return serializeAffiliateRecord<Affiliate>(
			await tx.update({
				model: "affiliate",
				where: [{ field: "id", value: id, operator: "eq" }],
				update: { ...values, updatedAt: new Date() },
			}),
		);
	});
}

/** Delete a profile and its clicks only when no financial history exists. */
export async function deleteAffiliate(
	adapter: Adapter,
	id: string,
): Promise<{ success: true }> {
	return withAffiliateTransaction(adapter, id, async (tx) => {
		for (const model of [
			"affiliateConversion",
			"affiliateCommission",
			"affiliatePayout",
		]) {
			if (
				await tx.count({
					model,
					where: [{ field: "affiliateId", value: id, operator: "eq" }],
				})
			)
				fail(
					"Affiliates with financial history must be suspended instead of deleted",
				);
		}
		await tx.deleteMany({
			model: "referralClick",
			where: [{ field: "affiliateId", value: id, operator: "eq" }],
		});
		await tx.delete({
			model: "affiliate",
			where: [{ field: "id", value: id, operator: "eq" }],
		});
		return { success: true };
	});
}

/** Record a local landing-page visit for an approved affiliate. */
export async function trackClick(
	adapter: Adapter,
	input: TrackClickInput,
): Promise<ReferralClick> {
	const data = trackClickSchema.parse(input);
	const landingPath = safeLandingPath(data.landingPath);
	const affiliate = await getAffiliateByCode(adapter, data.code);
	if (!affiliate || affiliate.status !== "approved")
		fail("Approved affiliate not found", 404);
	return withAffiliateTransaction(adapter, affiliate.id, async (tx) => {
		if ((await getAffiliate(tx, affiliate.id))?.status !== "approved")
			fail("Approved affiliate not found", 404);
		return serializeAffiliateRecord<ReferralClick>(
			await tx.create({
				model: "referralClick",
				data: {
					...data,
					landingPath,
					affiliateId: affiliate.id,
					createdAt: new Date(),
				},
			}),
		);
	});
}

async function previousConversion(
	adapter: AffiliateDataAdapter,
	input: CreateConversionInput,
) {
	if (!input.externalRef) return null;
	const conversion = await getConversionByExternalRef(
		adapter,
		input.externalRef,
	);
	if (!conversion) return null;
	if (
		conversion.amount !== input.amount ||
		conversion.currency !== (input.currency ?? "USD")
	)
		fail("Conversion external reference already has different values");
	const commission = await adapter.findOne({
		model: "affiliateCommission",
		where: [{ field: "conversionId", value: conversion.id, operator: "eq" }],
	});
	if (!commission) fail("Conversion commission is missing");
	return {
		conversion,
		commission: serializeAffiliateRecord<Commission>(commission),
	};
}

/** Atomically create an attributed conversion and commission, deduplicating stable external references. */
export async function createConversion(
	adapter: Adapter,
	input: CreateConversionInput,
	options: AffiliateOptions = {},
): Promise<{ conversion: Conversion; commission: Commission } | null> {
	const data = createConversionSchema.parse(input);
	const existing = await previousConversion(adapter, data);
	if (existing) return existing;
	if (!data.attribution) return null;
	const click = data.attribution.clickId
		? await getReferralClick(adapter, data.attribution.clickId)
		: null;
	if (
		data.attribution.clickId &&
		(!click || !isClickWithinWindow(click, options.attributionWindowDays))
	)
		return null;
	const affiliate = click
		? await getAffiliate(adapter, click.affiliateId)
		: data.attribution.code
			? await getAffiliateByCode(adapter, data.attribution.code)
			: null;
	if (!affiliate || affiliate.status !== "approved") return null;
	if (click && data.attribution.code && click.code !== data.attribution.code)
		fail("Attribution code does not match referral click", 400);
	try {
		return await withAffiliateTransaction(adapter, affiliate.id, async (tx) => {
			const duplicate = await previousConversion(tx, data);
			if (duplicate) return duplicate;
			const current = await getAffiliate(tx, affiliate.id);
			if (!current || current.status !== "approved") return null;
			const type =
				current.commissionType ?? options.defaultCommissionType ?? "percent";
			const value =
				current.commissionValue ?? options.defaultCommissionValue ?? 20;
			const amount = calculateCommission(data.amount, type, value);
			const conversion = serializeAffiliateRecord<Conversion>(
				await tx.create({
					model: "affiliateConversion",
					data: {
						affiliateId: affiliate.id,
						...(click ? { clickId: click.id } : {}),
						...(data.externalRef ? { externalRef: data.externalRef } : {}),
						amount: data.amount,
						currency: data.currency,
						status: "pending",
						createdAt: new Date(),
					},
				}),
			);
			const commission = serializeAffiliateRecord<Commission>(
				await tx.create({
					model: "affiliateCommission",
					data: {
						affiliateId: affiliate.id,
						conversionId: conversion.id,
						amount,
						currency: data.currency,
						status: "pending",
						payoutId: "",
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				}),
			);
			return { conversion, commission };
		});
	} catch (error) {
		const duplicate = await previousConversion(adapter, data);
		if (duplicate) return duplicate;
		throw error;
	}
}

/** Approve or void an unsettled commission that has no payout reservation. */
export async function updateCommission(
	adapter: Adapter,
	id: string,
	input: { status: "approved" | "voided" },
): Promise<Commission> {
	const data = updateCommissionSchema.parse(input);
	const found = await getCommission(adapter, id);
	if (!found) fail("Commission not found", 404);
	return withAffiliateTransaction(adapter, found.affiliateId, async (tx) => {
		const current = await getCommission(tx, id);
		if (!current) fail("Commission not found", 404);
		if (current.status === data.status) return current;
		if (
			current.payoutId ||
			!["pending", "approved"].includes(current.status) ||
			(current.status === "approved" && data.status !== "voided")
		)
			fail("Commission is paid, reserved, or cannot transition to that status");
		const result = await tx.update({
			model: "affiliateCommission",
			where: [{ field: "id", value: id, operator: "eq" }],
			update: { status: data.status, updatedAt: new Date() },
		});
		await tx.update({
			model: "affiliateConversion",
			where: [{ field: "id", value: current.conversionId, operator: "eq" }],
			update: { status: data.status === "approved" ? "approved" : "rejected" },
		});
		return serializeAffiliateRecord<Commission>(result);
	});
}

/** Reserve approved commissions in one currency for a manual payout batch. */
export async function createPayout(
	adapter: Adapter,
	input: CreatePayoutInput,
): Promise<Payout> {
	const data = createPayoutSchema.parse(input);
	return withAffiliateTransaction(adapter, data.affiliateId, async (tx) => {
		const affiliate = await getAffiliate(tx, data.affiliateId);
		if (!affiliate || affiliate.status !== "approved")
			fail("Payouts require an approved affiliate");
		const all = await allRows<Commission>(tx, "affiliateCommission", [
			{ field: "affiliateId", value: data.affiliateId, operator: "eq" },
			{ field: "currency", value: data.currency, operator: "eq" },
			{ field: "status", value: "approved", operator: "eq" },
			{ field: "payoutId", value: "", operator: "eq" },
		]);
		const selected = data.commissionIds
			? all.filter((item) => data.commissionIds?.includes(item.id))
			: all;
		if (
			!selected.length ||
			(data.commissionIds &&
				selected.length !== new Set(data.commissionIds).size)
		)
			fail("Select available approved commissions in one currency");
		const amount = selected.reduce(
			(total, item) => total + BigInt(item.amount),
			0n,
		);
		if (amount > BigInt(Number.MAX_SAFE_INTEGER))
			fail("Payout exceeds safe integer range", 400);
		const payout = serializeAffiliateRecord<Payout>(
			await tx.create({
				model: "affiliatePayout",
				data: {
					affiliateId: data.affiliateId,
					amount: Number(amount),
					currency: data.currency,
					status: "pending",
					createdAt: new Date(),
				},
			}),
		);
		for (const item of selected) {
			await tx.update({
				model: "affiliateCommission",
				where: [{ field: "id", value: item.id, operator: "eq" }],
				update: { payoutId: payout.id, updatedAt: new Date() },
			});
		}
		return payout;
	});
}

/** Mark a pending batch sent and its commissions paid, or failed and release its reservations. */
export async function updatePayout(
	adapter: Adapter,
	id: string,
	input: { status: "sent" | "failed"; reference?: string },
): Promise<Payout> {
	const data = updatePayoutSchema.parse(input);
	const found = await getPayout(adapter, id);
	if (!found) fail("Payout not found", 404);
	return withAffiliateTransaction(adapter, found.affiliateId, async (tx) => {
		const current = await getPayout(tx, id);
		if (!current) fail("Payout not found", 404);
		if (current.status === data.status) return current;
		if (current.status !== "pending")
			fail("Only pending payouts can be marked sent or failed");
		const commissions = await allRows<Commission>(tx, "affiliateCommission", [
			{ field: "payoutId", value: id, operator: "eq" },
		]);
		for (const commission of commissions) {
			await tx.update({
				model: "affiliateCommission",
				where: [{ field: "id", value: commission.id, operator: "eq" }],
				update:
					data.status === "sent"
						? { status: "paid", updatedAt: new Date() }
						: { payoutId: "", updatedAt: new Date() },
			});
		}
		return serializeAffiliateRecord<Payout>(
			await tx.update({
				model: "affiliatePayout",
				where: [{ field: "id", value: id, operator: "eq" }],
				update: {
					...data,
					...(data.status === "sent" ? { paidAt: new Date() } : {}),
				},
			}),
		);
	});
}
