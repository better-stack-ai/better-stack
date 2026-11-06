"use client";

import {
	useEffect,
	useId,
	useState,
	type ReactNode,
	type FormHTMLAttributes,
} from "react";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import type { FallbackProps } from "@btst/stack/client/components";
import { parseListStateFromSearchParams } from "@btst/stack/client";
import { useListState, type ListStateSchema } from "@btst/stack/client/hooks";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { helpdeskPermissions } from "../../permissions";
import type {
	CustomerMessage,
	HelpdeskMessage,
	HelpdeskTicket,
	TicketStatus,
} from "../../types";
import type { HelpdeskPluginOverrides } from "../overrides";
import { HELPDESK_PLUGIN_ID } from "../constants";

const HELPDESK_LIST_STATE_SCHEMA = {
	search: { type: "string", default: "" },
	status: { type: "string", default: "" },
	priority: { type: "string", default: "" },
	assigneeId: { type: "string", default: "", history: "replace" },
	offset: { type: "number", default: 0 },
} as const satisfies ListStateSchema;

export function useHelpdeskListState(namespace: string) {
	const [state, setState] = useListState(namespace, HELPDESK_LIST_STATE_SCHEMA);
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	// Request loaders prefetch the default list; match it during hydration.
	const initial = parseListStateFromSearchParams(
		namespace,
		HELPDESK_LIST_STATE_SCHEMA,
		"",
	);
	return [hydrated ? state : initial, setState] as const;
}

export function TicketSearch({
	search,
	onSearch,
}: {
	search: string;
	onSearch: (search: string) => void;
}) {
	return (
		<HelpdeskForm
			role="search"
			onSubmit={(event) => {
				event.preventDefault();
				const value = new FormData(event.currentTarget).get("search");
				onSearch(
					String(value ?? "")
						.trim()
						.normalize("NFC"),
				);
			}}
		>
			<div className="flex flex-wrap items-end gap-3">
				<div className="min-w-0 flex-1">
					<Field label="Search tickets">
						{(id) => (
							<Input
								key={search}
								id={id}
								type="search"
								name="search"
								maxLength={200}
								defaultValue={search}
								placeholder="Search subjects and conversations"
							/>
						)}
					</Field>
				</div>
				<Button className="min-h-11">Search</Button>
			</div>
		</HelpdeskForm>
	);
}

export const statuses = ["open", "pending", "resolved", "closed"] as const;
export const priorities = ["low", "medium", "high", "urgent"] as const;
export const selectClass =
	"border-input bg-background min-h-11 w-full min-w-0 rounded-md border px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";
export function HelpdeskPage({
	title,
	description,
	children,
}: {
	title: string;
	description?: string;
	children: ReactNode;
}) {
	const { Link, resolve } = usePluginSiteNavigation(HELPDESK_PLUGIN_ID);
	return (
		<main
			className="container mx-auto min-w-0 max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8"
			data-testid="helpdesk-page"
		>
			<header className="space-y-2">
				<h1 className="break-words text-3xl font-semibold tracking-tight">
					{title}
				</h1>
				{description && (
					<p className="max-w-2xl text-muted-foreground">{description}</p>
				)}
			</header>
			<nav
				aria-label="Helpdesk"
				className="flex flex-wrap gap-x-6 border-b text-sm font-medium"
			>
				<PermissionAccess
					permission={helpdeskPermissions.customerTicket.list()}
				>
					<Link
						href={resolve("helpdesk").href}
						className="inline-flex min-h-11 items-center hover:underline"
					>
						My tickets
					</Link>
				</PermissionAccess>
				<PermissionAccess permission={helpdeskPermissions.ticket.list()}>
					<Link
						href={resolve("helpdesk/inbox").href}
						className="inline-flex min-h-11 items-center hover:underline"
					>
						Agent inbox
					</Link>
				</PermissionAccess>
			</nav>
			{children}
		</main>
	);
}
/** Keep JavaScript forms inert until their event handlers are attached. */
export function HelpdeskForm({
	children,
	disabled = false,
	...props
}: FormHTMLAttributes<HTMLFormElement> & { disabled?: boolean }) {
	const [hydrated, setHydrated] = useState(false);
	useEffect(() => setHydrated(true), []);
	return (
		<form {...props} data-hydrated={hydrated}>
			<fieldset disabled={!hydrated || disabled} className="min-w-0 space-y-4">
				{children}
			</fieldset>
		</form>
	);
}
export function Field({
	label,
	children,
}: {
	label: string;
	children: (id: string) => ReactNode;
}) {
	const id = useId();
	return (
		<div className="min-w-0 space-y-2">
			<Label htmlFor={id}>{label}</Label>
			{children(id)}
		</div>
	);
}
export function StatusBadge({ status }: { status: TicketStatus }) {
	return (
		<span className="inline-flex rounded-sm border px-2 py-1 text-xs font-medium capitalize">
			{status}
		</span>
	);
}
/** First-response SLA state for agent views, refreshed while the queue stays open. */
export function SLAStatusBadge({ ticket }: { ticket: HelpdeskTicket }) {
	const [now, setNow] = useState<number | null>(null);
	useEffect(() => {
		setNow(Date.now());
		const timer = setInterval(() => setNow(Date.now()), 30_000);
		return () => clearInterval(timer);
	}, []);
	const breached =
		now !== null &&
		!ticket.firstRespondedAt &&
		new Date(ticket.slaDueAt).getTime() < now;
	const responseLate =
		ticket.firstRespondedAt &&
		new Date(ticket.firstRespondedAt).getTime() >
			new Date(ticket.slaDueAt).getTime();
	const text = ticket.firstRespondedAt
		? responseLate
			? "Responded late"
			: "SLA met"
		: breached
			? "SLA breached"
			: "Awaiting response";
	return (
		<span
			className={`inline-flex rounded-sm border px-2 py-1 text-xs font-medium ${breached || responseLate ? "border-destructive text-destructive" : "text-muted-foreground"}`}
		>
			{text}
		</span>
	);
}
export function Conversation({
	page,
	messages,
}: {
	page?: "helpdeskTicket" | "helpdeskInboxTicket";
	messages: (CustomerMessage | HelpdeskMessage)[];
}) {
	return page ? (
		<ScopedConversation page={page} messages={messages} />
	) : (
		<DefaultConversation messages={messages} />
	);
}

function ScopedConversation({
	page,
	messages,
}: {
	page: "helpdeskTicket" | "helpdeskInboxTicket";
	messages: (CustomerMessage | HelpdeskMessage)[];
}) {
	const { pageOverrides } =
		usePluginOverrides<HelpdeskPluginOverrides>(HELPDESK_PLUGIN_ID);
	const Component = page ? pageOverrides?.[page]?.Conversation : undefined;
	return Component ? (
		<Component messages={messages} />
	) : (
		<DefaultConversation messages={messages} />
	);
}

function DefaultConversation({
	messages,
}: {
	messages: (CustomerMessage | HelpdeskMessage)[];
}) {
	return (
		<section aria-label="Conversation" className="space-y-4">
			{messages.map((message) => {
				const internal = "isInternalNote" in message && message.isInternalNote;
				return (
					<article
						key={message.id}
						className={`space-y-3 rounded-lg border p-4 ${internal ? "border-dashed bg-muted/50" : ""}`}
					>
						<header className="flex flex-wrap items-center justify-between gap-2 text-sm">
							<span className="font-medium">
								{internal
									? "Internal note · agents only"
									: message.authorType === "agent"
										? "Support reply"
										: "Customer"}
							</span>
							<time
								dateTime={message.createdAt}
								className="text-xs text-muted-foreground"
							>
								{formatDate(message.createdAt)}
							</time>
						</header>
						<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
							{message.body}
						</p>
					</article>
				);
			})}
		</section>
	);
}
export const formatDate = (value: string) =>
	new Date(value).toLocaleString("en-US", {
		timeZone: "UTC",
		dateStyle: "medium",
		timeStyle: "short",
	}) + " UTC";
export function useHelpdeskAction() {
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
			} catch (caught) {
				setError(
					caught instanceof Error
						? caught.message
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
					: "No tickets"}
			</p>
			<div className="flex gap-2">
				<Button
					variant="outline"
					disabled={!offset}
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
export function HelpdeskLoading() {
	return (
		<p className="p-8" role="status">
			Loading helpdesk…
		</p>
	);
}
export function HelpdeskError({ resetErrorBoundary }: FallbackProps) {
	return (
		<div className="space-y-4 p-8" role="alert">
			<h1 className="text-2xl font-semibold">Helpdesk unavailable</h1>
			<p>Tickets could not be loaded. Check your access or try again.</p>
			<Button variant="outline" onClick={resetErrorBoundary}>
				Retry loading
			</Button>
		</div>
	);
}
export function HelpdeskNotFound({ message }: { message: string }) {
	return (
		<div className="space-y-2 p-8">
			<h1 className="text-2xl font-semibold">Ticket not found</h1>
			<p>{message}</p>
		</div>
	);
}
