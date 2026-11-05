"use client";
import { useState } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import {
	useDeal,
	usePipeline,
	useDeleteDeal,
	useMoveDeal,
	useContact,
	useCompany,
} from "../../hooks";
import { crmPermissions } from "../../../permissions";
import { CRM_PLUGIN_ID } from "../../constants";
import { ActivityTimeline } from "../activity-timeline";
import { DealForm } from "../deal-form";
import {
	CrmPage,
	Field,
	Feedback,
	DeleteRecord,
	fullName,
	money,
	selectClass,
	useCrmAction,
} from "../shared";
function LinkedContact({ id }: { id: string }) {
	const { data } = useContact(id);
	const { Link, resolve } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	return (
		<Link
			className="inline-flex min-h-11 items-center hover:underline"
			href={resolve(`crm/contacts/${id}`).href}
		>
			{fullName(data)}
		</Link>
	);
}
function LinkedCompany({ id }: { id: string }) {
	const { data } = useCompany(id);
	return <span>{data.name}</span>;
}
export function DealDetailPage({ id }: { id: string }) {
	const { data: deal } = useDeal(id);
	const { data: pipeline } = usePipeline(deal.pipelineId);
	const remove = useDeleteDeal();
	const move = useMoveDeal();
	const [editing, setEditing] = useState(false);
	const { Link, resolve, navigate } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	const action = useCrmAction();
	const facts = {
		id,
		pipelineId: deal.pipelineId,
		contactId: deal.contactId ?? null,
		companyId: deal.companyId ?? null,
	};
	return (
		<CrmPage
			title={deal.title}
			description={money(deal.value, deal.currency)}
			action={
				<PermissionAccess permission={crmPermissions.deal.update(facts)}>
					<Button
						className="min-h-11"
						variant="outline"
						onClick={() => setEditing(!editing)}
					>
						Edit deal
					</Button>
				</PermissionAccess>
			}
		>
			<Feedback {...action} />
			{editing && (
				<DealForm
					pipeline={pipeline}
					deal={deal}
					onSaved={() => setEditing(false)}
					onCancel={() => setEditing(false)}
				/>
			)}
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
				<aside className="min-w-0 space-y-6">
					<section className="space-y-5 rounded-lg border p-5">
						<h2 className="text-lg font-semibold">Deal details</h2>
						<dl className="space-y-4 text-sm">
							<div>
								<dt className="text-muted-foreground">Pipeline</dt>
								<dd>
									<Link
										className="inline-flex min-h-11 items-center hover:underline"
										href={resolve(`crm/pipeline/${pipeline.id}`).href}
									>
										{pipeline.name}
									</Link>
								</dd>
							</div>
							<div>
								<dt className="text-muted-foreground">Status</dt>
								<dd className="mt-1 capitalize">{deal.status}</dd>
							</div>
							{deal.contactId && (
								<div>
									<dt className="text-muted-foreground">Contact</dt>
									<dd>
										<LinkedContact id={deal.contactId} />
									</dd>
								</div>
							)}
							{deal.companyId && (
								<div>
									<dt className="text-muted-foreground">Company</dt>
									<dd className="mt-1">
										<LinkedCompany id={deal.companyId} />
									</dd>
								</div>
							)}
							{deal.closeDate && (
								<div>
									<dt className="text-muted-foreground">Close date</dt>
									<dd className="mt-1">
										<time dateTime={deal.closeDate}>
											{new Date(deal.closeDate).toLocaleDateString()}
										</time>
									</dd>
								</div>
							)}
						</dl>
						<Field label="Stage">
							{(fieldId) => (
								<select
									id={fieldId}
									className={selectClass}
									value={deal.stage}
									disabled={move.isPending}
									onChange={(event) => {
										const stage = event.target.value;
										void action.run(async () => {
											await move.mutateAsync({ id, stage });
										}, "Deal stage updated");
									}}
								>
									{pipeline.columns.map((column) =>
										column.id === deal.stage ? (
											<option key={column.id} value={column.id}>
												{column.title}
											</option>
										) : (
											<PermissionAccess
												key={column.id}
												permission={crmPermissions.deal.move({
													...facts,
													targetStage: column.id,
												})}
											>
												<option value={column.id}>{column.title}</option>
											</PermissionAccess>
										),
									)}
								</select>
							)}
						</Field>
					</section>
					<PermissionAccess permission={crmPermissions.deal.delete(facts)}>
						<DeleteRecord
							label="Delete deal"
							description="This deal and its pipeline card will be removed."
							pending={remove.isPending}
							onDelete={() =>
								void action.run(async () => {
									await remove.mutateAsync(id);
									await navigate(`crm/pipeline/${pipeline.id}`);
								})
							}
						/>
					</PermissionAccess>
				</aside>
				<ActivityTimeline
					dealId={id}
					description={`Deal: ${JSON.stringify(deal)}\nPipeline: ${pipeline.name}\nStage: ${pipeline.columns.find((c) => c.id === deal.stage)?.title}`}
				/>
			</div>
		</CrmPage>
	);
}
