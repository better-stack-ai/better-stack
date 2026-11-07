"use client";

import { useEffect, useRef, useState } from "react";
import {
	useIdentity,
	useIdentitySourceGeneration,
	useStack,
} from "@btst/stack/context";
import { normalizePath } from "@btst/stack/client";
import {
	HELPDESK_ATTACHMENT_MAX_BYTES,
	HELPDESK_ATTACHMENT_MAX_COUNT,
	HELPDESK_ATTACHMENT_MIME_TYPES,
	type HelpdeskAttachment,
} from "../../types";
import { HELPDESK_PLUGIN_ID } from "../constants";

export function useAttachmentTransport(ticketId: string, agent: boolean) {
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
