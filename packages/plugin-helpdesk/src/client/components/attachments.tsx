"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
	useIdentity,
	useIdentitySourceGeneration,
	useStack,
} from "@btst/stack/context";
import { normalizePath } from "@btst/stack/client";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import {
	HELPDESK_ATTACHMENT_MAX_BYTES,
	HELPDESK_ATTACHMENT_MAX_COUNT,
	HELPDESK_ATTACHMENT_MIME_TYPES,
	type HelpdeskAttachment,
} from "../../types";
import { HELPDESK_PLUGIN_ID } from "../constants";

function useAttachmentTransport(ticketId: string, agent: boolean) {
	const { api, plugins } = useStack();
	const plugin = plugins?.[HELPDESK_PLUGIN_ID];
	const pluginApi = plugin?.api ?? api;
	const path = `/helpdesk/${agent ? "inbox" : "tickets"}/${encodeURIComponent(ticketId)}/attachments`;
	const url = `${pluginApi?.baseURL ?? ""}${normalizePath(`${pluginApi?.basePath ?? ""}/${path}`)}`;
	const init = {
		headers: plugin?.api.browserHeaders,
		credentials: plugin?.api.credentials,
	};
	return {
		url,
		init,
		enabled:
			(plugin?.config as { attachments?: boolean } | undefined)?.attachments ===
			true,
	};
}

type PendingAttachment = {
	key: string;
	file: File;
	attachment?: HelpdeskAttachment;
	error?: string;
};

export function useReplyAttachments(
	ticketId: string,
	agent = false,
	isInternalNote = false,
) {
	const transport = useAttachmentTransport(ticketId, agent);
	const { identity } = useIdentity();
	const generation = useIdentitySourceGeneration();
	const scope = `${transport.url}:${generation}:${identity?.id ?? ""}:${agent}:${isInternalNote}`;
	const activeScope = useRef(scope);
	activeScope.current = scope;
	const [state, setState] = useState<{
		scope: string;
		items: PendingAttachment[];
	}>({ scope, items: [] });
	const [error, setError] = useState("");
	const pending = useRef(
		new Map<string, { abort: () => void; remove?: () => void }>(),
	);
	const items = state.scope === scope ? state.items : [];
	useEffect(() => {
		setState({ scope, items: [] });
		setError("");
		const uploads = pending.current;
		return () => {
			for (const upload of uploads.values()) {
				upload.abort();
				upload.remove?.();
			}
			uploads.clear();
		};
	}, [scope]);
	const discard = (id: string) => {
		void fetch(`${transport.url}/${encodeURIComponent(id)}`, {
			...transport.init,
			method: "DELETE",
		}).catch(() => undefined);
	};
	const upload = async (item: PendingAttachment) => {
		const controller = new AbortController();
		const entry = {
			abort: () => controller.abort(),
			remove: undefined as (() => void) | undefined,
		};
		pending.current.set(item.key, entry);
		setState((current) => ({
			...current,
			items: current.items.map((value) =>
				value.key === item.key ? { ...value, error: undefined } : value,
			),
		}));
		try {
			const body = new FormData();
			body.set("file", item.file);
			if (agent) body.set("isInternalNote", String(isInternalNote));
			const response = await fetch(transport.url, {
				...transport.init,
				method: "POST",
				body,
				signal: controller.signal,
			});
			if (!response.ok)
				throw new Error("Upload failed. Retry or remove this file.");
			const attachment = (await response.json()) as HelpdeskAttachment;
			if (pending.current.get(item.key) !== entry) {
				discard(attachment.id);
				return;
			}
			entry.remove = () => discard(attachment.id);
			setState((current) => ({
				...current,
				items: current.items.map((value) =>
					value.key === item.key ? { ...value, attachment } : value,
				),
			}));
		} catch (caught) {
			if (pending.current.get(item.key) !== entry) return;
			setState((current) => ({
				...current,
				items: current.items.map((value) =>
					value.key === item.key
						? {
								...value,
								error:
									caught instanceof Error
										? caught.message
										: "Upload failed. Retry or remove this file.",
							}
						: value,
				),
			}));
		}
	};
	return {
		enabled: transport.enabled,
		items,
		error,
		blocked: items.some((item) => !item.attachment),
		attachmentIds: items.flatMap((item) =>
			item.attachment ? [item.attachment.id] : [],
		),
		add: (files: File[]) => {
			setError("");
			if (items.length + files.length > HELPDESK_ATTACHMENT_MAX_COUNT) {
				setError("Attach up to 5 files per message.");
				return;
			}
			if (
				files.some(
					(file) =>
						file.size === 0 ||
						file.size > HELPDESK_ATTACHMENT_MAX_BYTES ||
						!(HELPDESK_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
							file.type,
						),
				)
			) {
				setError(
					"Choose PNG, JPEG, WebP, GIF, PDF or plain text files, up to 10 MiB each.",
				);
				return;
			}
			const added = files.map((file) => ({ key: crypto.randomUUID(), file }));
			setState((current) => ({
				scope,
				items: [...(current.scope === scope ? current.items : []), ...added],
			}));
			for (const item of added) void upload(item);
		},
		retry: (item: PendingAttachment) => void upload(item),
		remove: (key: string) => {
			const entry = pending.current.get(key);
			entry?.abort();
			entry?.remove?.();
			pending.current.delete(key);
			setState((current) => ({
				...current,
				items: current.items.filter((item) => item.key !== key),
			}));
		},
		reset: () => {
			if (activeScope.current !== scope) return;
			pending.current.clear();
			setState({ scope, items: [] });
			setError("");
		},
	};
}

export function AttachmentComposer({
	value,
}: {
	value: ReturnType<typeof useReplyAttachments>;
}) {
	const id = useId();
	if (!value.enabled) return null;
	return (
		<div className="space-y-3">
			<div className="space-y-2">
				<Label htmlFor={id}>Attach files</Label>
				<Input
					id={id}
					type="file"
					multiple
					accept={HELPDESK_ATTACHMENT_MIME_TYPES.join(",")}
					onChange={(event) => {
						value.add(Array.from(event.currentTarget.files ?? []));
						event.currentTarget.value = "";
					}}
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				Up to 5 files, 10 MiB each. PNG, JPEG, WebP, GIF, PDF or plain text.
			</p>
			{value.error && (
				<p role="alert" className="text-sm text-destructive">
					{value.error}
				</p>
			)}
			{value.items.length > 0 && (
				<ul aria-label="Attachments to send" className="space-y-2">
					{value.items.map((item) => (
						<li
							key={item.key}
							className="flex flex-wrap items-center gap-2 text-sm"
						>
							<span className="min-w-0 break-all">{item.file.name}</span>
							{item.error ? (
								<>
									<span role="alert" className="text-destructive">
										{item.error}
									</span>
									<Button
										type="button"
										variant="outline"
										size="sm"
										aria-label={`Retry ${item.file.name}`}
										onClick={() => value.retry(item)}
									>
										Retry
									</Button>
								</>
							) : item.attachment ? (
								<span role="status" className="text-muted-foreground">
									Ready to send
								</span>
							) : (
								<>
									<progress
										aria-label={`Uploading ${item.file.name}`}
										className="max-w-32"
									/>
									<span role="status">Uploading…</span>
								</>
							)}
							<Button
								type="button"
								variant="outline"
								size="sm"
								aria-label={`Remove ${item.file.name}`}
								onClick={() => value.remove(item.key)}
							>
								Remove
							</Button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export function MessageAttachments({
	ticketId,
	attachments,
	agent,
}: {
	ticketId: string;
	attachments: HelpdeskAttachment[];
	agent: boolean;
}) {
	const { url, init } = useAttachmentTransport(ticketId, agent);
	const [error, setError] = useState("");
	return (
		<>
			<ul aria-label="Message attachments" className="space-y-2 text-sm">
				{attachments.map((attachment) => (
					<li key={attachment.id}>
						<a
							href={`${url}/${encodeURIComponent(attachment.id)}`}
							download={attachment.filename}
							className="inline-flex min-h-11 items-center break-all underline"
							aria-label={`Download ${attachment.filename}`}
							onClick={(event) => {
								event.preventDefault();
								setError("");
								void (async () => {
									try {
										const response = await fetch(
											`${url}/${encodeURIComponent(attachment.id)}`,
											init,
										);
										if (!response.ok)
											throw new Error(
												"This attachment could not be downloaded. Try again.",
											);
										const objectURL = URL.createObjectURL(
											await response.blob(),
										);
										const link = document.createElement("a");
										link.href = objectURL;
										link.download = attachment.filename;
										link.click();
										setTimeout(() => URL.revokeObjectURL(objectURL), 1000);
									} catch (caught) {
										setError(
											caught instanceof Error
												? caught.message
												: "Download failed.",
										);
									}
								})();
							}}
						>
							{attachment.filename} ({Math.ceil(attachment.size / 1024)} KiB)
						</a>
					</li>
				))}
			</ul>
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
		</>
	);
}
