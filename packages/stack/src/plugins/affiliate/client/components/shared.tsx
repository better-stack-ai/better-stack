"use client";

import { useState, type ReactNode } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import type { FallbackProps } from "@btst/stack/client/components";
import { affiliatePermissions } from "../../permissions";
import type { Affiliate, AffiliateStats } from "../../types";
import type { AffiliateApplicationInput } from "../../query-keys";
import { AFFILIATE_PLUGIN_ID } from "../constants";
import type { AffiliatePluginOverrides } from "../overrides";

export function AffiliatePage({
	title,
	description,
	action,
	admin = true,
	children,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	admin?: boolean;
	children: ReactNode;
}) {
	const { Link, resolve } = usePluginSiteNavigation(AFFILIATE_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<AffiliatePluginOverrides>(AFFILIATE_PLUGIN_ID);
	return (
		<div className="affiliate-page" data-testid="affiliate-page">
			<header className="affiliate-heading">
				<div>
					<h1>{title}</h1>
					{description && <p className="affiliate-muted">{description}</p>}
				</div>
				{action}
			</header>
			{admin && (
				<nav className="affiliate-nav" aria-label="Affiliate administration">
					<PermissionAccess
						permission={affiliatePermissions.affiliate.read({
							scope: "collection",
						})}
					>
						<Link href={resolve("affiliate/admin/affiliates").href}>
							{localization?.affiliates ?? "Affiliates"}
						</Link>
					</PermissionAccess>
					<PermissionAccess permission={affiliatePermissions.commission.read()}>
						<Link href={resolve("affiliate/admin/commissions").href}>
							{localization?.commissions ?? "Commissions"}
						</Link>
					</PermissionAccess>
					<PermissionAccess permission={affiliatePermissions.payout.read()}>
						<Link href={resolve("affiliate/admin/payouts").href}>
							{localization?.payouts ?? "Payouts"}
						</Link>
					</PermissionAccess>
				</nav>
			)}
			{children}
		</div>
	);
}

export function Field({
	label,
	hint,
	children,
}: {
	label: string;
	hint?: string;
	children: ReactNode;
}) {
	return (
		<label className="affiliate-field">
			<span>{label}</span>
			{children}
			{hint && <span className="affiliate-muted affiliate-small">{hint}</span>}
		</label>
	);
}

export function ProfileFields({
	affiliate,
	defaults,
	userId = false,
	admin = false,
}: {
	affiliate?: Affiliate;
	defaults?: { name?: string; email?: string };
	userId?: boolean;
	admin?: boolean;
}) {
	return (
		<div className="affiliate-form-grid">
			{userId && (
				<Field
					label="User ID"
					hint="The account that will own this affiliate portal."
				>
					<input name="userId" required maxLength={255} />
				</Field>
			)}
			<Field label="Name">
				<input
					name="name"
					required
					maxLength={200}
					autoComplete="name"
					defaultValue={affiliate?.name ?? defaults?.name ?? ""}
				/>
			</Field>
			<Field label="Email">
				<input
					name="email"
					type="email"
					required
					maxLength={320}
					autoComplete="email"
					defaultValue={affiliate?.email ?? defaults?.email ?? ""}
				/>
			</Field>
			<Field
				label="Referral code"
				hint="3–64 lowercase letters, numbers, or single hyphens. Leave blank to generate a code."
			>
				<input
					name="code"
					minLength={3}
					maxLength={64}
					pattern="[a-z0-9]+(-[a-z0-9]+)*"
					defaultValue={affiliate?.code ?? ""}
				/>
			</Field>
			<Field
				label="Payout details"
				hint="Payment instructions for the person arranging your payouts."
			>
				<textarea
					name="payoutDetails"
					rows={3}
					maxLength={10000}
					defaultValue={affiliate?.payoutDetails ?? ""}
				/>
			</Field>
			{admin && (
				<>
					<Field label="Status">
						<select name="status" defaultValue={affiliate?.status ?? "pending"}>
							{(!affiliate || affiliate.status === "pending") && (
								<option value="pending">Pending</option>
							)}
							<option value="approved">Approved</option>
							<option value="suspended">Suspended</option>
						</select>
					</Field>
					<Field label="Commission rule">
						<select
							name="commissionType"
							defaultValue={affiliate?.commissionType ?? ""}
						>
							<option value="">Program default</option>
							<option value="percent">Percentage</option>
							<option value="flat">Flat amount</option>
						</select>
					</Field>
					<Field
						label="Commission value"
						hint="Percentage points, or a flat amount in minor units (100 = USD 1.00)."
					>
						<input
							name="commissionValue"
							type="number"
							min="0"
							step="any"
							defaultValue={affiliate?.commissionValue ?? ""}
						/>
					</Field>
					<Field label="Internal notes">
						<textarea
							name="notes"
							maxLength={10000}
							rows={3}
							defaultValue={affiliate?.notes ?? ""}
						/>
					</Field>
				</>
			)}
		</div>
	);
}

export function readProfile(fields: FormData): AffiliateApplicationInput {
	const code = String(fields.get("code") ?? "").trim();
	return {
		name: String(fields.get("name") ?? ""),
		email: String(fields.get("email") ?? ""),
		...(code ? { code } : {}),
		payoutDetails: String(fields.get("payoutDetails") ?? ""),
	};
}

export function useAffiliateAction() {
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [pending, setPending] = useState(false);
	const run = async (action: () => Promise<void>, success = "") => {
		setError("");
		setMessage("");
		setPending(true);
		try {
			await action();
			setMessage(success);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The change could not be saved. Try again.",
			);
		} finally {
			setPending(false);
		}
	};
	return { error, message, pending, run };
}

export function ActionNotice({
	error,
	message,
}: {
	error: string;
	message: string;
}) {
	return (
		<>
			{error && (
				<p role="alert" className="affiliate-error">
					{error}
				</p>
			)}
			{message && <p role="status">{message}</p>}
		</>
	);
}

export function Status({ value }: { value: string }) {
	return (
		<span className="affiliate-status" data-status={value}>
			{value.charAt(0).toUpperCase() + value.slice(1)}
		</span>
	);
}

export function money(amount: number, currency: string) {
	const formatter = new Intl.NumberFormat(undefined, {
		style: "currency",
		currency,
	});
	const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
	return formatter.format(amount / 10 ** digits);
}

export function date(value: string) {
	return new Date(value).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function Stats({ stats }: { stats: AffiliateStats }) {
	return (
		<section
			aria-label="Affiliate performance"
			className="affiliate-performance"
		>
			<dl className="affiliate-metrics">
				<div>
					<dt>Referral clicks</dt>
					<dd>{stats.clicks.toLocaleString()}</dd>
				</div>
				<div>
					<dt>Conversions</dt>
					<dd>{stats.conversions.toLocaleString()}</dd>
				</div>
			</dl>
			{stats.totals.length > 0 && (
				<div
					className="affiliate-table-scroll"
					role="region"
					aria-label="Commission totals"
					tabIndex={0}
				>
					<table>
						<caption className="affiliate-sr-only">
							Commission totals by currency
						</caption>
						<thead>
							<tr>
								<th>Currency</th>
								<th className="affiliate-number">Pending</th>
								<th className="affiliate-number">Approved</th>
								<th className="affiliate-number">Paid</th>
							</tr>
						</thead>
						<tbody>
							{stats.totals.map((total) => (
								<tr key={total.currency}>
									<th scope="row">{total.currency}</th>
									<td className="affiliate-number">
										{money(total.pending, total.currency)}
									</td>
									<td className="affiliate-number">
										{money(total.approved, total.currency)}
									</td>
									<td className="affiliate-number">
										{money(total.paid, total.currency)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

export function Pagination({
	offset,
	total,
	onChange,
}: {
	offset: number;
	total: number;
	onChange: (offset: number) => void;
}) {
	return (
		<div className="affiliate-pagination">
			<p className="affiliate-muted">
				{total === 0
					? "No results"
					: `${offset + 1}–${Math.min(offset + 25, total)} of ${total}`}
			</p>
			<div className="affiliate-actions">
				<button
					type="button"
					disabled={offset === 0}
					onClick={() => onChange(Math.max(0, offset - 25))}
				>
					Previous page
				</button>
				<button
					type="button"
					disabled={offset + 25 >= total}
					onClick={() => onChange(offset + 25)}
				>
					Next page
				</button>
			</div>
		</div>
	);
}

export function AffiliateLoading() {
	return (
		<div className="affiliate-page" role="status">
			Loading affiliate information…
		</div>
	);
}

export function AffiliateError({ error, resetErrorBoundary }: FallbackProps) {
	return (
		<div className="affiliate-page affiliate-stack" role="alert">
			<h1>Affiliate information unavailable</h1>
			<p>{error.message || "Check your access and try again."}</p>
			<button type="button" onClick={resetErrorBoundary}>
				Retry loading
			</button>
		</div>
	);
}

export function AffiliateNotFound({ message }: { message: string }) {
	return (
		<div className="affiliate-page">
			<h1>Affiliate not found</h1>
			<p>{message}</p>
		</div>
	);
}
