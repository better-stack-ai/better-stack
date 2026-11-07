"use client";

import { useId, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Label } from "@workspace/ui/components/label";
import { Input } from "@workspace/ui/components/input";
import {
	HELPDESK_ATTACHMENT_MIME_TYPES,
	type HelpdeskAttachment,
} from "../../types";
import { useAttachmentTransport, type useReplyAttachments } from "../hooks";

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
