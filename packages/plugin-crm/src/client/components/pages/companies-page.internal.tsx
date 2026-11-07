"use client";
import { useState, type FormEvent } from "react";
import { PermissionAccess } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import type { Company } from "../../../types";
import { MergeDuplicates } from "../merge-duplicates";
import {
	useCompanies,
	useCreateCompany,
	useUpdateCompany,
	useDeleteCompany,
} from "../../hooks";
import { crmPermissions } from "../../../permissions";
import {
	CrmPage,
	Field,
	Feedback,
	DeleteRecord,
	Pagination,
	useCrmAction,
} from "../shared";
export function CompaniesPage() {
	const [search, setSearch] = useState("");
	const [offset, setOffset] = useState(0);
	const [editing, setEditing] = useState<Company | null | undefined>();
	const { data } = useCompanies({
		search: search || undefined,
		limit: 25,
		offset,
	});
	const create = useCreateCompany();
	const update = useUpdateCompany();
	const remove = useDeleteCompany();
	const action = useCrmAction();
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		void action.run(async () => {
			const input = {
				name: String(fields.get("name")),
				domain: String(fields.get("domain") || ""),
				phone: String(fields.get("phone") || ""),
				notes: String(fields.get("notes") || ""),
			};
			if (editing) await update.mutateAsync({ id: editing.id, data: input });
			else await create.mutateAsync(input);
			setEditing(undefined);
		}, "Company saved");
	};
	return (
		<CrmPage
			title="Companies"
			description="Link contacts and deals to the organizations you work with."
			action={
				<PermissionAccess permission={crmPermissions.company.create()}>
					<Button className="min-h-11" onClick={() => setEditing(null)}>
						New company
					</Button>
				</PermissionAccess>
			}
		>
			<Feedback {...action} />
			{editing !== undefined && (
				<form
					key={editing?.id ?? "new"}
					className="max-w-3xl space-y-4 rounded-lg border p-5"
					onSubmit={save}
				>
					<h2 className="text-xl font-medium">
						{editing ? "Edit company" : "New company"}
					</h2>
					<div className="grid gap-4 sm:grid-cols-2">
						{(
							[
								["name", "Company name"],
								["domain", "Domain"],
								["phone", "Phone"],
							] as const
						).map(([name, label]) => (
							<Field key={name} label={label}>
								{(id) => (
									<Input
										id={id}
										name={name}
										maxLength={500}
										required={name === "name"}
										defaultValue={editing?.[name] ?? ""}
									/>
								)}
							</Field>
						))}
					</div>
					<Field label="Notes">
						{(id) => (
							<Textarea
								id={id}
								name="notes"
								rows={3}
								maxLength={20000}
								defaultValue={editing?.notes ?? ""}
							/>
						)}
					</Field>
					<div className="flex gap-3">
						<Button
							type="submit"
							disabled={create.isPending || update.isPending}
							className="min-h-11"
						>
							Save company
						</Button>
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => setEditing(undefined)}
						>
							Cancel
						</Button>
					</div>
				</form>
			)}
			<Field label="Search companies">
				{(id) => (
					<Input
						id={id}
						type="search"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setOffset(0);
						}}
					/>
				)}
			</Field>
			{data.items.length ? (
				<ul className="divide-y rounded-lg border px-5">
					{data.items.map((company) => (
						<li
							key={company.id}
							className="flex flex-wrap items-center justify-between gap-4 py-5"
						>
							<div className="min-w-0">
								<h2 className="break-words font-semibold">{company.name}</h2>
								<p className="break-words text-sm text-muted-foreground">
									{[company.domain, company.phone].filter(Boolean).join(" / ")}
								</p>
								{company.notes && (
									<p className="mt-2 max-w-2xl whitespace-pre-wrap break-words text-sm">
										{company.notes}
									</p>
								)}
							</div>
							<div className="flex flex-wrap gap-2">
								<MergeDuplicates entity="company" record={company} />
								<PermissionAccess
									permission={crmPermissions.company.update({ id: company.id })}
								>
									<Button
										variant="outline"
										className="min-h-11"
										onClick={() => setEditing(company)}
										aria-label={`Edit ${company.name}`}
									>
										Edit company
									</Button>
								</PermissionAccess>
								<PermissionAccess
									permission={crmPermissions.company.delete({ id: company.id })}
								>
									<DeleteRecord
										label="Delete company"
										description={`${company.name} will be removed; linked records keep their other details.`}
										pending={remove.isPending}
										onDelete={() =>
											void action.run(async () => {
												await remove.mutateAsync(company.id);
											}, "Company deleted")
										}
									/>
								</PermissionAccess>
							</div>
						</li>
					))}
				</ul>
			) : (
				<p className="py-8 text-muted-foreground">
					No companies match. Add a company or adjust your search.
				</p>
			)}
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
		</CrmPage>
	);
}
