"use client";

import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
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
import type { Campaign, CampaignRecipient } from "../../types";
import {
	useCampaignRecovery,
	useReconcileCampaign,
	useResolveCampaignRecipient,
	useResumeCampaign,
} from "../hooks";
import { Field, selectClass, Status } from "./shared";

export function CampaignRecovery({
	id,
	status,
}: {
	id: string;
	status: Campaign["status"];
}) {
	const { data, refetch, isFetching } = useCampaignRecovery(id);
	const reconcile = useReconcileCampaign();
	const resume = useResumeCampaign();
	const resolve = useResolveCampaignRecipient();
	const [recipient, setRecipient] = useState<CampaignRecipient>();
	const [resolution, setResolution] = useState<
		"" | "delivered" | "failed" | "skipped"
	>("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const pending =
		isFetching || reconcile.isPending || resume.isPending || resolve.isPending;
	const attention = data.items.filter((item) =>
		["failed", "uncertain", "dispatching"].includes(item.status),
	);
	const run = async (action: () => Promise<unknown>, success: string) => {
		setError("");
		setMessage("");
		try {
			await action();
			setMessage(success);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Recovery could not be completed. Try again.",
			);
		}
	};
	return (
		<section aria-label="Campaign recovery" className="space-y-5 border-t pt-8">
			<div className="space-y-2">
				<h2 className="text-lg font-medium">Delivery recovery</h2>
				<p className="max-w-2xl text-sm text-muted-foreground">
					Resume retries failed and unattempted recipients from this campaign's
					original audience. Accepted messages and uncertain requests are never
					resent automatically.
				</p>
			</div>
			<dl className="flex flex-wrap gap-x-8 gap-y-4">
				{(
					[
						["Not attempted", data.counts.pending],
						["In progress", data.counts.dispatching],
						["Uncertain", data.counts.uncertain],
						["Accepted", data.counts.delivered],
						["Failed", data.counts.failed],
						["Skipped", data.counts.skipped],
						["Bounced", data.counts.bounced],
					] as const
				).map(([label, count]) => (
					<div key={label}>
						<dt className="text-sm text-muted-foreground">{label}</dt>
						<dd className="text-2xl font-semibold tabular-nums">
							{count.toLocaleString()}
						</dd>
					</div>
				))}
			</dl>
			{!data.audienceReady && (
				<p className="text-sm" role="status">
					This campaign has no complete saved audience. Automatic resume is
					unavailable; inspect provider records before recovering it manually.
				</p>
			)}
			<div className="flex flex-wrap gap-3">
				<Button
					variant="outline"
					disabled={pending}
					onClick={() => void refetch()}
				>
					Refresh outcomes
				</Button>
				<Button
					variant="outline"
					disabled={pending}
					onClick={() =>
						void run(
							() => reconcile.mutateAsync(id),
							"Provider receipts checked. Unresolved requests still require a decision.",
						)
					}
				>
					Check provider receipts
				</Button>
				<Button
					disabled={
						pending ||
						!data.audienceReady ||
						(status !== "sending" &&
							data.counts.pending + data.counts.failed === 0)
					}
					onClick={() =>
						void run(
							() => resume.mutateAsync(id),
							"Resume completed. Review the current recipient outcomes.",
						)
					}
				>
					{resume.isPending ? "Resuming…" : "Resume eligible recipients"}
				</Button>
			</div>
			{message && (
				<p role="status" className="text-sm">
					{message}
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}
			{attention.length > 0 ? (
				<div className="overflow-x-auto rounded-lg border">
					<table className="w-full min-w-[600px] text-left text-sm">
						<caption className="sr-only">
							Recipients requiring delivery review
						</caption>
						<thead className="border-b bg-muted/40">
							<tr>
								<th className="p-4 font-medium">Recipient</th>
								<th className="p-4 font-medium">Outcome</th>
								<th className="p-4 font-medium">Attempts</th>
								<th className="p-4 font-medium">Recovery</th>
							</tr>
						</thead>
						<tbody>
							{attention.map((item) => (
								<tr key={item.id} className="border-b last:border-0">
									<td className="p-4 break-all">{item.email}</td>
									<td className="p-4">
										<Status value={item.status} />
										{item.lastError && (
											<p className="mt-2 max-w-sm break-words text-xs text-muted-foreground">
												{item.lastError}
											</p>
										)}
										{item.messageId && (
											<p className="mt-2 max-w-sm break-all text-xs text-muted-foreground">
												Receipt: {item.messageId}
											</p>
										)}
									</td>
									<td className="p-4 tabular-nums">{item.attemptCount}</td>
									<td className="p-4">
										{item.status === "failed" ? (
											"Ready for eligible retry"
										) : (
											<Button
												variant="outline"
												disabled={pending}
												aria-label={`Resolve ${item.email}`}
												onClick={() => {
													setRecipient(item);
													setResolution("");
												}}
											>
												Resolve outcome
											</Button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="text-sm text-muted-foreground">
					No failed or uncertain recipients need review.
				</p>
			)}
			<AlertDialog
				open={!!recipient}
				onOpenChange={(open) => {
					if (!open) setRecipient(undefined);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Resolve recipient outcome</AlertDialogTitle>
						<AlertDialogDescription>
							Check provider records for {recipient?.email} before choosing an
							outcome. Mark accepted messages as delivered. Confirming failure
							allows a later resume to retry and may duplicate mail if your
							decision is wrong.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{recipient?.status === "dispatching" && (
						<p className="text-sm">
							This request may still be active. It cannot be marked failed for
							retry, even through receipt lookup. Confirm acceptance or skip it
							without resending.
						</p>
					)}
					<Field id={`resolution-${id}`} label="Verified outcome">
						<select
							id={`resolution-${id}`}
							className={selectClass}
							value={resolution}
							onChange={(event) =>
								setResolution(event.target.value as typeof resolution)
							}
						>
							<option value="">Choose an outcome</option>
							<option value="delivered">Provider accepted the message</option>
							{recipient?.canRetry && (
								<option value="failed">
									Provider did not accept it — allow retry
								</option>
							)}
							<option value="skipped">
								Skip this recipient without resending
							</option>
						</select>
					</Field>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={!resolution || pending}
							onClick={() => {
								if (!recipient || !resolution) return;
								void run(
									() =>
										resolve.mutateAsync({
											id,
											sendId: recipient.id,
											resolution,
										}),
									"Recipient outcome recorded. Resume separately to retry eligible recipients.",
								);
							}}
						>
							Confirm resolution
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	);
}
