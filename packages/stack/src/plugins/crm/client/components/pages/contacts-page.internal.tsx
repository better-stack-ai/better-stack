"use client";
import { useState } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { useRegisterPageAIContext } from "@btst/stack/plugins/ai-chat/client/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { useContacts, useSearchContacts } from "../../hooks";
import { crmPermissions } from "../../../permissions";
import { CRM_PLUGIN_ID } from "../../constants";
import { CrmPage, Field, Pagination, fullName } from "../shared";

export function ContactsPage() {
	const [search, setSearch] = useState("");
	const [tag, setTag] = useState("");
	const [offset, setOffset] = useState(0);
	const { data } = useContacts({
		search: search || undefined,
		tag: tag || undefined,
		limit: 25,
		offset,
	});
	const { Link, resolve } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	const searchContacts = useSearchContacts();
	useRegisterPageAIContext({
		routeName: "crm-contacts",
		pageDescription:
			`CRM contact register. Current results:\n${JSON.stringify(data.items)}`.slice(
				0,
				16000,
			),
		suggestions: ["Find a contact", "Which contacts should I follow up with?"],
		clientTools: {
			queryCrmContacts: async ({ search, tag }) => {
				setSearch(search ?? "");
				setTag(tag ?? "");
				setOffset(0);
				const results = await searchContacts({ search, tag, limit: 25 });
				return {
					success: true,
					message: JSON.stringify(results),
				};
			},
		},
	});
	return (
		<CrmPage
			title="Contacts"
			description="People, their companies, and the conversations that move a relationship forward."
			action={
				<PermissionAccess permission={crmPermissions.contact.create()}>
					<Button asChild className="min-h-11">
						<Link href={resolve("crm/contacts/new").href}>New contact</Link>
					</Button>
				</PermissionAccess>
			}
		>
			<div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
				<Field
					label="Search contacts"
					hint="Search any field, including notes and custom fields."
				>
					{(id) => (
						<Input
							id={id}
							type="search"
							value={search}
							placeholder="Name, email, company, or any detail"
							onChange={(e) => {
								setSearch(e.target.value);
								setOffset(0);
							}}
						/>
					)}
				</Field>
				<Field label="Filter by tag">
					{(id) => (
						<Input
							id={id}
							value={tag}
							placeholder="Any tag"
							onChange={(e) => {
								setTag(e.target.value);
								setOffset(0);
							}}
						/>
					)}
				</Field>
			</div>
			{data.items.length ? (
				<div className="overflow-x-auto rounded-lg border">
					<table className="w-full text-left text-sm">
						<caption className="sr-only">CRM contacts</caption>
						<thead className="border-b bg-muted/40">
							<tr>
								<th className="p-4 font-medium">Contact</th>
								<th className="p-4 font-medium">Company</th>
								<th className="p-4 font-medium">Tags</th>
							</tr>
						</thead>
						<tbody>
							{data.items.map((contact) => (
								<tr key={contact.id} className="border-b last:border-0">
									<td className="p-4">
										<Link
											className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline"
											href={resolve(`crm/contacts/${contact.id}`).href}
										>
											{fullName(contact)}
										</Link>
										<p className="break-all text-muted-foreground">
											{contact.email || contact.phone || "No contact details"}
										</p>
									</td>
									<td className="p-4">
										{contact.company || "—"}
										{contact.title && (
											<p className="text-muted-foreground">{contact.title}</p>
										)}
									</td>
									<td className="p-4">
										<div className="flex flex-wrap gap-1">
											{contact.tags.map((tag) => (
												<span
													key={tag}
													className="rounded-sm bg-muted px-2 py-1 text-xs"
												>
													{tag}
												</span>
											))}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="py-10 text-muted-foreground">
					No contacts match. Add a contact or adjust your filters.
				</p>
			)}
			<Pagination offset={offset} total={data.total} onChange={setOffset} />
		</CrmPage>
	);
}
