"use client";

import { useRef, useState } from "react";
import { PermissionAccess } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import type { Contact, Company, MergePreview } from "../../types";
import { crmPermissions } from "../../permissions";
import {
	useDuplicateSuggestions,
	useMergeRecords,
	usePreviewMerge,
} from "../hooks";
import { Feedback, Field, Pagination, fullName, selectClass } from "./shared";

type MergeRecord = Contact | Company;
const recordName = (record: MergeRecord) =>
	"firstName" in record ? fullName(record) : record.name;
const fieldValue = (value: unknown) =>
	value == null || value === ""
		? "Empty"
		: typeof value === "string"
			? value
			: JSON.stringify(value);

export function MergeDuplicates({
	entity,
	record,
}: {
	entity: "contact" | "company";
	record: MergeRecord;
}) {
	const [open, setOpen] = useState(false);
	const trigger = useRef<HTMLButtonElement>(null);
	const [message, setMessage] = useState("");
	return (
		<PermissionAccess
			permission={crmPermissions[entity].update({ id: record.id })}
		>
			<Button
				ref={trigger}
				variant="outline"
				className="min-h-11"
				aria-label={`Find duplicates for ${recordName(record)}`}
				onClick={() => {
					setMessage("");
					setOpen(true);
				}}
			>
				Find duplicates
			</Button>
			<Feedback message={message} />
			{open && (
				<MergeDialog
					entity={entity}
					record={record}
					onClose={() => setOpen(false)}
					onCloseAutoFocus={() => trigger.current?.focus()}
					onMerged={() => {
						setOpen(false);
						setMessage(
							"Records merged. Linked records and activity history were preserved.",
						);
					}}
				/>
			)}
		</PermissionAccess>
	);
}

function MergeDialog({
	entity,
	record,
	onClose,
	onCloseAutoFocus,
	onMerged,
}: {
	entity: "contact" | "company";
	record: MergeRecord;
	onClose: () => void;
	onCloseAutoFocus: () => void;
	onMerged: () => void;
}) {
	const [offset, setOffset] = useState(0);
	const [preview, setPreview] = useState<MergePreview<MergeRecord> | null>(
		null,
	);
	const [choices, setChoices] = useState<Record<string, "survivor" | "source">>(
		{},
	);
	const [error, setError] = useState("");
	const suggestions = useDuplicateSuggestions(entity, record.id, offset);
	const previewMutation = usePreviewMerge(entity);
	const merge = useMergeRecords(entity);
	const pending = previewMutation.isPending || merge.isPending;
	const loadPreview = async (survivorId: string, sourceId: string) => {
		setError("");
		setChoices({});
		setPreview(null);
		try {
			setPreview(await previewMutation.mutateAsync({ survivorId, sourceId }));
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "The preview could not be loaded.",
			);
		}
	};
	const mergeRecords = async () => {
		if (!preview) return;
		setError("");
		try {
			await merge.mutateAsync({
				survivorId: preview.survivor.id,
				sourceId: preview.source.id,
				versions: preview.versions,
				choices,
			});
			onMerged();
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: "The merge could not be completed.",
			);
			setPreview(null);
			setChoices({});
			void suggestions.refetch();
		}
	};
	return (
		<AlertDialog
			open
			onOpenChange={(open) => {
				if (!open && !pending) onClose();
			}}
		>
			<AlertDialogContent
				className="max-h-[90dvh] min-w-0 overflow-y-auto sm:max-w-3xl"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					onCloseAutoFocus();
				}}
			>
				<AlertDialogHeader className="min-w-0">
					<AlertDialogTitle>
						{preview ? "Review merge" : "Duplicate suggestions"}
					</AlertDialogTitle>
					<AlertDialogDescription className="break-words">
						{preview
							? "Choose the surviving record and resolve every conflicting field before merging."
							: `Possible duplicates for ${recordName(record)}. Matching ${entity === "contact" ? "email addresses" : "domains"} suggest a duplicate; they do not prove identity. No records are merged automatically.`}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Feedback error={error} />
				{pending && (
					<p role="status">
						{merge.isPending ? "Merging records…" : "Loading merge preview…"}
					</p>
				)}
				{preview ? (
					<div className="min-w-0 space-y-5">
						<Field label="Surviving record">
							{(id) => (
								<select
									id={id}
									className={selectClass}
									value={preview.survivor.id}
									disabled={pending}
									onChange={() =>
										void loadPreview(preview.source.id, preview.survivor.id)
									}
								>
									<option value={preview.survivor.id}>
										{recordName(preview.survivor)} ({preview.survivor.id})
									</option>
									<option value={preview.source.id}>
										{recordName(preview.source)} ({preview.source.id})
									</option>
								</select>
							)}
						</Field>
						<p className="break-words text-sm">
							{recordName(preview.source)} will be merged into{" "}
							{recordName(preview.survivor)}. The source record will be removed.
						</p>
						<section className="space-y-3" aria-label="Merge fields">
							<h3 className="font-semibold">Fields and conflict choices</h3>
							{preview.fields.map((field) => (
								<div
									key={field.name}
									className="min-w-0 space-y-2 rounded-md border p-3"
								>
									{field.conflict ? (
										<Field label={`Resolve ${field.name}`}>
											{(id) => (
												<select
													id={id}
													className={selectClass}
													value={choices[field.name] ?? ""}
													disabled={pending}
													onChange={(event) =>
														setChoices({
															...choices,
															[field.name]: event.target.value as
																| "survivor"
																| "source",
														})
													}
												>
													<option value="" disabled>
														Choose a value
													</option>
													<option value="survivor">
														Keep surviving record value
													</option>
													<option value="source">
														Use source record value
													</option>
												</select>
											)}
										</Field>
									) : (
										<p className="text-sm font-medium">{field.name}</p>
									)}
									<dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
										<div className="min-w-0">
											<dt className="text-muted-foreground">
												Surviving record
											</dt>
											<dd className="whitespace-pre-wrap break-words">
												{fieldValue(field.survivorValue)}
											</dd>
										</div>
										<div className="min-w-0">
											<dt className="text-muted-foreground">Source record</dt>
											<dd className="whitespace-pre-wrap break-words">
												{fieldValue(field.sourceValue)}
											</dd>
										</div>
									</dl>
								</div>
							))}
						</section>
						<section className="space-y-2" aria-label="Affected relationships">
							<h3 className="font-semibold">Affected relationships</h3>
							<ul className="space-y-1 text-sm">
								{preview.relationships.map((relationship) => (
									<li key={relationship.name}>
										{relationship.name}: {relationship.count}
									</li>
								))}
							</ul>
						</section>
						{preview.warnings.map((warning) => (
							<p
								key={warning}
								className="break-words text-sm text-muted-foreground"
							>
								{warning}
							</p>
						))}
					</div>
				) : !pending ? (
					<div className="space-y-4">
						{suggestions.isPending ? (
							<p role="status">Loading duplicate suggestions…</p>
						) : suggestions.isError ? (
							<>
								<Feedback error={suggestions.error.message} />
								<Button
									variant="outline"
									onClick={() => void suggestions.refetch()}
								>
									Retry suggestions
								</Button>
							</>
						) : suggestions.data?.items.length ? (
							<>
								<p className="break-all text-sm text-muted-foreground">
									Normalized match: {suggestions.data.normalizedValue}
								</p>
								<ul className="divide-y rounded-md border px-4">
									{suggestions.data.items.map((candidate) => (
										<li
											key={candidate.id}
											className="flex flex-wrap items-center justify-between gap-3 py-3"
										>
											<div className="min-w-0">
												<p className="break-words font-medium">
													{recordName(candidate)}
												</p>
												<p className="break-all text-sm text-muted-foreground">
													{candidate.id}
												</p>
											</div>
											<PermissionAccess
												permission={crmPermissions[entity].merge({
													survivorId: record.id,
													sourceId: candidate.id,
												})}
											>
												<Button
													variant="outline"
													className="min-h-11"
													onClick={() =>
														void loadPreview(record.id, candidate.id)
													}
													aria-label={`Preview merge with ${recordName(candidate)}`}
												>
													Preview merge
												</Button>
											</PermissionAccess>
										</li>
									))}
								</ul>
								<Pagination
									offset={offset}
									total={suggestions.data.total}
									onChange={setOffset}
								/>
							</>
						) : (
							<p className="py-4 text-muted-foreground">
								No duplicate suggestions for this record.
							</p>
						)}
					</div>
				) : null}
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>Close</AlertDialogCancel>
					{preview && (
						<>
							<Button
								variant="outline"
								disabled={pending}
								onClick={() => {
									setPreview(null);
									setChoices({});
									setError("");
								}}
							>
								Back to suggestions
							</Button>
							<PermissionAccess
								permission={crmPermissions[entity].merge({
									survivorId: preview.survivor.id,
									sourceId: preview.source.id,
								})}
							>
								<Button
									disabled={
										pending ||
										preview.fields.some(
											(field) => field.conflict && !choices[field.name],
										)
									}
									onClick={() => void mergeRecords()}
								>
									Merge records
								</Button>
							</PermissionAccess>
						</>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
