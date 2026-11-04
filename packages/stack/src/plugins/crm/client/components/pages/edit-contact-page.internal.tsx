"use client";
import { useState, type FormEvent } from "react";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import {
	useContact,
	useCompanies,
	useCreateContact,
	useUpdateContact,
} from "../../hooks";
import type { Contact } from "../../../types";
import type { ContactInput } from "@btst/stack/plugins/crm/query-keys";
import { CRM_PLUGIN_ID } from "../../constants";
import { CrmPage, Field, Feedback, selectClass, useCrmAction } from "../shared";
export function EditContactPage({ id }: { id?: string }) {
	return id ? <ExistingContact id={id} /> : <ContactForm />;
}
function ExistingContact({ id }: { id: string }) {
	const { data } = useContact(id);
	return <ContactForm key={data.id} contact={data} />;
}
function ContactForm({ contact }: { contact?: Contact }) {
	const { data: companies } = useCompanies({ limit: 200 });
	const create = useCreateContact();
	const update = useUpdateContact();
	const { Link, resolve, navigate } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	const action = useCrmAction();
	const [customFields, setCustomFields] = useState(
		Object.entries(contact?.customFields ?? {}),
	);
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		void action.run(async () => {
			const companyId = String(fields.get("companyId") || "");
			const input: ContactInput = {
				firstName: String(fields.get("firstName")),
				lastName: String(fields.get("lastName") || ""),
				email: String(fields.get("email") || "") || null,
				phone: String(fields.get("phone") || ""),
				companyId: companyId || null,
				company:
					companies.items.find((c) => c.id === companyId)?.name ??
					String(fields.get("company") || ""),
				title: String(fields.get("title") || ""),
				tags: String(fields.get("tags") || "")
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean),
				notes: String(fields.get("notes") || ""),
				customFields: Object.fromEntries(
					customFields
						.filter(([key]) => key.trim())
						.map(([key, value]) => [key.trim(), value]),
				),
			};
			const saved = contact
				? await update.mutateAsync({ id: contact.id, data: input })
				: await create.mutateAsync(input);
			await navigate(`crm/contacts/${saved.id}`);
		});
	};
	return (
		<CrmPage title={contact ? "Edit contact" : "New contact"}>
			<Feedback {...action} />
			<form className="max-w-3xl space-y-6" onSubmit={save}>
				<div className="grid gap-4 sm:grid-cols-2">
					{(
						[
							["firstName", "First name"],
							["lastName", "Last name"],
							["email", "Email"],
							["phone", "Phone"],
							["title", "Job title"],
						] as const
					).map(([name, label]) => (
						<Field key={name} label={label}>
							{(id) => (
								<Input
									id={id}
									name={name}
									type={
										name === "email"
											? "email"
											: name === "phone"
												? "tel"
												: "text"
									}
									required={name === "firstName"}
									maxLength={name === "email" ? 320 : 500}
									defaultValue={contact?.[name] ?? ""}
								/>
							)}
						</Field>
					))}
					<Field label="Company">
						{(id) => (
							<select
								id={id}
								name="companyId"
								className={selectClass}
								defaultValue={contact?.companyId ?? ""}
							>
								<option value="">No linked company</option>
								{companies.items.map((company) => (
									<option key={company.id} value={company.id}>
										{company.name}
									</option>
								))}
							</select>
						)}
					</Field>
					<Field
						label="Company name"
						hint="Use a name without linking a company record."
					>
						{(id) => (
							<Input
								id={id}
								name="company"
								maxLength={500}
								defaultValue={contact?.company ?? ""}
							/>
						)}
					</Field>
					<Field label="Tags" hint="Separate tags with commas.">
						{(id) => (
							<Input
								id={id}
								name="tags"
								defaultValue={contact?.tags.join(", ")}
							/>
						)}
					</Field>
				</div>
				<Field label="Notes">
					{(id) => (
						<Textarea
							id={id}
							name="notes"
							rows={5}
							maxLength={20000}
							defaultValue={contact?.notes ?? ""}
						/>
					)}
				</Field>
				<fieldset className="space-y-3">
					<legend className="mb-3 text-sm font-medium">Custom fields</legend>
					{customFields.map(([key, value], index) => (
						<div
							key={index}
							className="grid items-end gap-3 sm:grid-cols-[1fr_2fr_auto]"
						>
							<Field label={`Field name ${index + 1}`}>
								{(id) => (
									<Input
										id={id}
										value={key}
										maxLength={100}
										required
										onChange={(e) =>
											setCustomFields((rows) =>
												rows.map((row, i) =>
													i === index ? [e.target.value, row[1]!] : row,
												),
											)
										}
									/>
								)}
							</Field>
							<Field label={`Field value ${index + 1}`}>
								{(id) => (
									<Input
										id={id}
										value={value}
										maxLength={2000}
										onChange={(e) =>
											setCustomFields((rows) =>
												rows.map((row, i) =>
													i === index ? [row[0]!, e.target.value] : row,
												),
											)
										}
									/>
								)}
							</Field>
							<Button
								type="button"
								className="min-h-11"
								variant="outline"
								onClick={() =>
									setCustomFields((rows) => rows.filter((_, i) => i !== index))
								}
							>
								Remove field {index + 1}
							</Button>
						</div>
					))}
					<Button
						type="button"
						variant="outline"
						className="min-h-11"
						disabled={customFields.length >= 100}
						onClick={() => setCustomFields((rows) => [...rows, ["", ""]])}
					>
						Add custom field
					</Button>
				</fieldset>
				<div className="flex gap-3">
					<Button
						type="submit"
						className="min-h-11"
						disabled={create.isPending || update.isPending}
					>
						Save contact
					</Button>
					<Button asChild variant="outline" className="min-h-11">
						<Link
							href={
								resolve(contact ? `crm/contacts/${contact.id}` : "crm/contacts")
									.href
							}
						>
							Cancel
						</Link>
					</Button>
				</div>
			</form>
		</CrmPage>
	);
}
