"use client";

import { useId, useState, type ReactNode } from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import type { FallbackProps } from "@btst/stack/client/components";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { crmPermissions } from "../../permissions";
import { CRM_PLUGIN_ID } from "../constants";
import type { CrmPluginOverrides } from "../overrides";

export function CrmPage({
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
	const { Link, resolve } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	const { localization } =
		usePluginOverrides<CrmPluginOverrides>(CRM_PLUGIN_ID);
	return (
		<div
			className="container mx-auto min-w-0 max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8"
			data-testid="crm-page"
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
				aria-label="CRM"
				className="flex flex-wrap gap-x-6 border-b text-sm font-medium"
			>
				{(
					[
						[
							"contacts",
							localization?.contacts ?? "Contacts",
							crmPermissions.contact.read(),
						],
						[
							"companies",
							localization?.companies ?? "Companies",
							crmPermissions.company.read(),
						],
					] as const
				).map(([path, label, permission]) => (
					<PermissionAccess key={path} permission={permission}>
						<Link
							href={resolve(`crm/${path}`).href}
							className="inline-flex min-h-11 items-center rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
						>
							{label}
						</Link>
					</PermissionAccess>
				))}
				<PermissionAccess permission={crmPermissions.pipeline.read()}>
					<PermissionAccess permission={crmPermissions.deal.read()}>
						<Link
							href={resolve("crm/pipelines").href}
							className="inline-flex min-h-11 items-center rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring"
						>
							{localization?.pipelines ?? "Pipelines"}
						</Link>
					</PermissionAccess>
				</PermissionAccess>
			</nav>
			{children}
		</div>
	);
}
export function Field({
	label,
	children,
	hint,
}: {
	label: string;
	children: (id: string) => ReactNode;
	hint?: string;
}) {
	const id = useId();
	return (
		<div className="min-w-0 space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children(id)}
			{hint && <p className="text-sm text-muted-foreground">{hint}</p>}
		</div>
	);
}
export function CrmLoading() {
	return (
		<p className="p-8" role="status">
			Loading CRM…
		</p>
	);
}
export function CrmError({ resetErrorBoundary }: FallbackProps) {
	return (
		<div className="space-y-4 p-8" role="alert">
			<h1 className="text-2xl font-semibold">CRM unavailable</h1>
			<p>
				CRM information could not be loaded. Check your access or try again.
			</p>
			<Button onClick={resetErrorBoundary} variant="outline">
				Retry loading
			</Button>
		</div>
	);
}
export function CrmNotFound({ message }: { message: string }) {
	return (
		<div className="space-y-2 p-8">
			<h1 className="text-2xl font-semibold">Record not found</h1>
			<p>{message}</p>
		</div>
	);
}
export const selectClass =
	"border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
export function useCrmAction() {
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	return {
		error,
		message,
		run: async (action: () => Promise<void>, success?: string) => {
			setError("");
			setMessage("");
			try {
				await action();
				if (success) setMessage(success);
			} catch (error) {
				setError(
					error instanceof Error
						? error.message
						: "The change could not be saved. Try again.",
				);
			}
		},
	};
}
export function Feedback({
	error,
	message,
}: {
	error?: string;
	message?: string;
}) {
	return (
		<>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
		</>
	);
}
export function DeleteRecord({
	label,
	description,
	pending,
	onDelete,
}: {
	label: string;
	description: string;
	pending: boolean;
	onDelete: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button
				variant="outline"
				className="min-h-11"
				disabled={pending}
				onClick={() => setOpen(true)}
			>
				{label}
			</Button>
			<AlertDialog open={open} onOpenChange={setOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{label}?</AlertDialogTitle>
						<AlertDialogDescription>{description}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction disabled={pending} onClick={onDelete}>
							{label}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
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
		<div className="flex flex-wrap items-center justify-between gap-3 text-sm">
			<p className="text-muted-foreground">
				{total
					? `${offset + 1}–${Math.min(offset + 25, total)} of ${total}`
					: "No results"}
			</p>
			<div className="flex gap-2">
				<Button
					variant="outline"
					className="min-h-11"
					disabled={!offset}
					onClick={() => onChange(Math.max(0, offset - 25))}
				>
					Previous page
				</Button>
				<Button
					variant="outline"
					className="min-h-11"
					disabled={offset + 25 >= total}
					onClick={() => onChange(offset + 25)}
				>
					Next page
				</Button>
			</div>
		</div>
	);
}
export const fullName = (contact: {
	firstName: string;
	lastName?: string | null;
}) => [contact.firstName, contact.lastName].filter(Boolean).join(" ");
export const money = (value: number | null | undefined, currency: string) =>
	value == null
		? "No value"
		: new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
				value,
			);
