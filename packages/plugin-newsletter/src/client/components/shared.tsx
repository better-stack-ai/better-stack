"use client";

import type { ReactNode } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import type { FallbackProps } from "@btst/stack/client/components";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { newsletterPermissions } from "../../permissions";
import { NEWSLETTER_PLUGIN_ID } from "../constants";
import type { NewsletterPluginOverrides } from "../overrides";

export function NewsletterPage({
	title,
	description,
	action,
	children,
}: {
	title: string;
	description?: string;
	action?: ReactNode;
	children: ReactNode;
}) {
	const { Link, resolve } = usePluginSiteNavigation(NEWSLETTER_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<NewsletterPluginOverrides>(NEWSLETTER_PLUGIN_ID);
	return (
		<div
			className="container mx-auto min-w-0 max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8"
			data-testid="newsletter-page"
		>
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div className="min-w-0 space-y-2">
					<h1 className="break-words text-3xl font-semibold tracking-tight">
						{title}
					</h1>
					{description && (
						<p className="max-w-2xl text-muted-foreground">{description}</p>
					)}
				</div>
				{action}
			</header>
			<nav
				aria-label="Newsletter"
				className="flex gap-6 border-b pb-3 text-sm font-medium"
			>
				<PermissionAccess
					permission={newsletterPermissions.campaign.read({
						scope: "collection",
					})}
				>
					<Link
						href={resolve("newsletter/campaigns").href}
						className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
					>
						{localization?.campaigns ?? "Campaigns"}
					</Link>
				</PermissionAccess>
				<PermissionAccess
					permission={newsletterPermissions.subscriber.read({
						scope: "collection",
					})}
				>
					<Link
						href={resolve("newsletter/subscribers").href}
						className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
					>
						{localization?.subscribers ?? "Subscribers"}
					</Link>
				</PermissionAccess>
			</nav>
			{children}
		</div>
	);
}

export function Field({
	id,
	label,
	children,
	hint,
}: {
	id: string;
	label: string;
	children: ReactNode;
	hint?: string;
}) {
	return (
		<div className="min-w-0 space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
		</div>
	);
}

export function NewsletterLoading() {
	return (
		<div className="p-8" role="status">
			Loading newsletter…
		</div>
	);
}

export function NewsletterError({ resetErrorBoundary }: FallbackProps) {
	return (
		<div className="space-y-4 p-8" role="alert">
			<h1 className="text-2xl font-semibold">Newsletter unavailable</h1>
			<p>
				Newsletter information could not be loaded. Check your access or try
				again.
			</p>
			<Button variant="outline" onClick={resetErrorBoundary}>
				Retry loading
			</Button>
		</div>
	);
}

export function NewsletterNotFound({ message }: { message: string }) {
	return (
		<div className="space-y-2 p-8">
			<h1 className="text-2xl font-semibold">Campaign not found</h1>
			<p>{message}</p>
		</div>
	);
}

export function Status({ value }: { value: string }) {
	return (
		<span className="inline-flex rounded-md border px-2 py-1 text-xs font-medium">
			{value.charAt(0).toUpperCase() + value.slice(1)}
		</span>
	);
}

export const selectClass =
	"border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

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
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
			<p className="text-muted-foreground">
				{total === 0
					? "No results"
					: `${offset + 1}–${Math.min(offset + 25, total)} of ${total}`}
			</p>
			<div className="flex gap-2">
				<Button
					variant="outline"
					disabled={offset === 0}
					onClick={() => onChange(Math.max(0, offset - 25))}
				>
					Previous page
				</Button>
				<Button
					variant="outline"
					disabled={offset + 25 >= total}
					onClick={() => onChange(offset + 25)}
				>
					Next page
				</Button>
			</div>
		</div>
	);
}
