"use client";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	useContact,
	useCompany,
	useDeals,
	useDeleteContact,
} from "../../hooks";
import { crmPermissions } from "../../../permissions";
import { CRM_PLUGIN_ID } from "../../constants";
import { ActivityTimeline } from "../activity-timeline";
import {
	CrmPage,
	Feedback,
	DeleteRecord,
	fullName,
	money,
	useCrmAction,
} from "../shared";
function ContactCompany({ id }: { id: string }) {
	const { data } = useCompany(id);
	return (
		<div>
			<dt className="text-muted-foreground">Company</dt>
			<dd className="mt-1 break-words">{data.name}</dd>
		</div>
	);
}
export function ContactDetailPage({ id }: { id: string }) {
	const { data: contact } = useContact(id);
	const { data: deals } = useDeals({ contactId: id, limit: 100 });
	const remove = useDeleteContact();
	const { Link, resolve, navigate } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	const action = useCrmAction();
	return (
		<CrmPage
			title={fullName(contact)}
			description={[contact.title, contact.company]
				.filter(Boolean)
				.join(" at ")}
			action={
				<PermissionAccess permission={crmPermissions.contact.update({ id })}>
					<Button asChild variant="outline" className="min-h-11">
						<Link href={resolve(`crm/contacts/${id}/edit`).href}>
							Edit contact
						</Link>
					</Button>
				</PermissionAccess>
			}
		>
			<Feedback {...action} />
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
				<aside className="min-w-0 space-y-6">
					<section className="space-y-4 rounded-lg border p-5">
						<h2 className="text-lg font-semibold">Contact details</h2>
						<dl className="space-y-4 text-sm">
							{(
								[
									["Email", contact.email],
									["Phone", contact.phone],
									["Company", contact.companyId ? null : contact.company],
									["Job title", contact.title],
									...Object.entries(contact.customFields),
								] as [string, string | null | undefined][]
							)
								.filter(([, value]) => value)
								.map(([label, value]) => (
									<div key={label}>
										<dt className="text-muted-foreground">{label}</dt>
										<dd className="mt-1 break-words">{value}</dd>
									</div>
								))}
							{contact.companyId && <ContactCompany id={contact.companyId} />}
						</dl>
						{contact.tags.length > 0 && (
							<div className="flex flex-wrap gap-2">
								{contact.tags.map((tag) => (
									<span
										key={tag}
										className="rounded-sm bg-muted px-2 py-1 text-xs"
									>
										{tag}
									</span>
								))}
							</div>
						)}
						{contact.notes && (
							<div className="space-y-2 border-t pt-4">
								<h3 className="text-sm font-medium">Notes</h3>
								<p className="whitespace-pre-wrap break-words text-sm leading-6">
									{contact.notes}
								</p>
							</div>
						)}
					</section>
					<section className="space-y-3">
						<h2 className="text-lg font-semibold">Deals</h2>
						{deals.items.length ? (
							<ul className="divide-y">
								{deals.items.map((deal) => (
									<li key={deal.id} className="py-3">
										<Link
											href={resolve(`crm/deals/${deal.id}`).href}
											className="inline-flex min-h-11 items-center font-medium hover:underline"
										>
											{deal.title}
										</Link>
										<p className="text-sm text-muted-foreground">
											{money(deal.value, deal.currency)} · {deal.status}
										</p>
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">
								No deals linked to this contact.
							</p>
						)}
					</section>
					<PermissionAccess permission={crmPermissions.contact.delete({ id })}>
						<DeleteRecord
							label="Delete contact"
							description="This contact will be removed. Existing deals remain in their pipelines."
							pending={remove.isPending}
							onDelete={() =>
								void action.run(async () => {
									await remove.mutateAsync(id);
									await navigate("crm/contacts");
								})
							}
						/>
					</PermissionAccess>
				</aside>
				<ActivityTimeline
					contactId={id}
					description={`Contact: ${fullName(contact)}\n${JSON.stringify(contact)}\nDeals: ${JSON.stringify(deals.items)}`}
				/>
			</div>
		</CrmPage>
	);
}
