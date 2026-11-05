"use client";
import type { FormEvent } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useCreateDeal, useUpdateDeal } from "../hooks";
import type { Deal, Pipeline } from "../../types";
import type { DealInput } from "@btst/plugin-crm/query-keys";
import {
	CompanyRelationFields,
	ContactRelationFields,
} from "./relation-options";
import { Field, Feedback, selectClass, useCrmAction } from "./shared";
export function DealForm({
	pipeline,
	stage,
	deal,
	onSaved,
	onCancel,
}: {
	pipeline: Pipeline;
	stage?: string;
	deal?: Deal;
	onSaved: (deal: Deal) => void | Promise<void>;
	onCancel: () => void;
}) {
	const create = useCreateDeal();
	const update = useUpdateDeal();
	const action = useCrmAction();
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		void action.run(async () => {
			const value = String(fields.get("value") || "");
			const date = String(fields.get("closeDate") || "");
			const input: Omit<DealInput, "pipelineId" | "stage"> = {
				title: String(fields.get("title")),
				value: value ? Number(value) : null,
				currency: String(fields.get("currency")).toUpperCase(),
				contactId: String(fields.get("contactId") || "") || null,
				companyId: String(fields.get("companyId") || "") || null,
				closeDate: date ? new Date(`${date}T12:00:00Z`).toISOString() : null,
				status: String(fields.get("status") || "open") as DealInput["status"],
			};
			const saved = deal
				? await update.mutateAsync({ id: deal.id, data: input })
				: await create.mutateAsync({
						...input,
						pipelineId: pipeline.id,
						stage: String(fields.get("stage")),
					});
			await onSaved(saved);
		});
	};
	return (
		<form className="max-w-3xl space-y-4 rounded-lg border p-5" onSubmit={save}>
			<h2 className="text-xl font-medium">{deal ? "Edit deal" : "New deal"}</h2>
			<Feedback {...action} />
			<div className="grid gap-4 sm:grid-cols-2">
				<Field label="Deal title">
					{(id) => (
						<Input
							id={id}
							name="title"
							required
							maxLength={500}
							defaultValue={deal?.title}
						/>
					)}
				</Field>
				<Field label="Value">
					{(id) => (
						<Input
							id={id}
							name="value"
							type="number"
							min={0}
							step="any"
							defaultValue={deal?.value ?? ""}
						/>
					)}
				</Field>
				<Field label="Currency">
					{(id) => (
						<Input
							id={id}
							name="currency"
							required
							pattern="[A-Za-z]{3}"
							maxLength={3}
							defaultValue={deal?.currency ?? "USD"}
						/>
					)}
				</Field>
				<Field label="Close date">
					{(id) => (
						<Input
							id={id}
							name="closeDate"
							type="date"
							defaultValue={deal?.closeDate?.slice(0, 10) ?? ""}
						/>
					)}
				</Field>
				{!deal && (
					<Field label="Stage">
						{(id) => (
							<select
								id={id}
								name="stage"
								className={selectClass}
								required
								defaultValue={stage ?? pipeline.columns[0]?.id}
							>
								{pipeline.columns.map((column) => (
									<option value={column.id} key={column.id}>
										{column.title}
									</option>
								))}
							</select>
						)}
					</Field>
				)}
				<Field label="Status">
					{(id) => (
						<select
							id={id}
							name="status"
							className={selectClass}
							defaultValue={deal?.status ?? "open"}
						>
							<option value="open">Open</option>
							<option value="won">Won</option>
							<option value="lost">Lost</option>
						</select>
					)}
				</Field>
				<ContactRelationFields value={deal?.contactId ?? ""} />
				<CompanyRelationFields value={deal?.companyId ?? ""} />
			</div>
			<div className="flex gap-3">
				<Button
					type="submit"
					className="min-h-11"
					disabled={create.isPending || update.isPending}
				>
					Save deal
				</Button>
				<Button
					type="button"
					className="min-h-11"
					variant="outline"
					onClick={onCancel}
				>
					Cancel
				</Button>
			</div>
		</form>
	);
}
