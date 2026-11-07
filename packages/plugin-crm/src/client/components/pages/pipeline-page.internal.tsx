"use client";
import { useEffect, useRef, useState } from "react";
import { GripVertical } from "lucide-react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import * as Kanban from "@workspace/ui/components/kanban";
import type { Pipeline } from "../../../types";
import type { CrmOwnerFilter } from "../../../query-keys";
import { DealOwnerFilter, DealOwnerName } from "../deal-owner";
type SerializedTask = Pipeline["columns"][number]["tasks"][number];
import { usePipeline, useMoveDeal } from "../../hooks";
import { crmPermissions } from "../../../permissions";
import { CRM_PLUGIN_ID } from "../../constants";
import { CrmPage, Feedback, money, useCrmAction } from "../shared";
import { DealForm } from "../deal-form";
export function PipelinePage({ pipelineId }: { pipelineId: string }) {
	const [ownerFilter, setOwnerFilter] = useState<CrmOwnerFilter>({});
	const { data: pipeline, refetch } = usePipeline(pipelineId, ownerFilter);
	const move = useMoveDeal();
	const [adding, setAdding] = useState<string>();
	const { Link, resolve } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	const action = useCrmAction();
	const dealMap = new Map(pipeline.deals.map((deal) => [deal.taskId, deal]));
	const source = Object.fromEntries(
		pipeline.columns.map((column) => [
			column.id,
			column.tasks.filter((task) => dealMap.has(task.id)),
		]),
	);
	const [state, setState] = useState(source);
	const stateRef = useRef(state);
	const busy = useRef(false);
	useEffect(() => {
		const next = Object.fromEntries(
			pipeline.columns.map((column) => [
				column.id,
				column.tasks.filter((task) =>
					pipeline.deals.some((deal) => deal.taskId === task.id),
				),
			]),
		);
		stateRef.current = next;
		setState(next);
	}, [pipeline]);
	const change = (next: Record<string, SerializedTask[]>) => {
		stateRef.current = next;
		setState(next);
	};
	const persist = () => {
		queueMicrotask(() => {
			const next = stateRef.current;
			if (busy.current) return;
			const changes = Object.entries(next).flatMap(([stage, tasks]) =>
				tasks.flatMap((task, index) => {
					const deal = dealMap.get(task.id);
					const original = source[stage]?.findIndex((t) => t.id === task.id);
					return deal && (deal.stage !== stage || original !== index)
						? [{ id: deal.id, stage, order: index }]
						: [];
				}),
			);
			if (!changes.length) return;
			busy.current = true;
			void action.run(async () => {
				try {
					for (const change of changes) await move.mutateAsync(change);
				} finally {
					busy.current = false;
					await refetch();
				}
			}, "Deal stage updated");
		});
	};
	const columnMap = new Map(
		pipeline.columns.map((column) => [column.id, column]),
	);
	const orderedColumns = Object.entries(state).flatMap(([id, tasks]) => {
		const column = columnMap.get(id);
		return column ? [{ ...column, tasks }] : [];
	});
	const gridClasses: Record<number, string> = {
		1: "md:grid-cols-1",
		2: "md:grid-cols-2",
		3: "md:grid-cols-3",
		4: "md:grid-cols-4",
		5: "md:grid-cols-5",
		6: "md:grid-cols-6",
	};
	const gridClass = gridClasses[orderedColumns.length] ?? "md:grid-cols-6";
	return (
		<CrmPage
			title={pipeline.name}
			description="Move deals between stages by dragging their handles, or choose a stage from a deal's detail page."
			action={
				<PermissionAccess
					permission={crmPermissions.deal.create({
						pipelineId,
						stage: pipeline.columns[0]?.id ?? "",
						contactId: null,
						companyId: null,
					})}
				>
					<Button
						className="min-h-11"
						onClick={() => setAdding(pipeline.columns[0]?.id)}
					>
						New deal
					</Button>
				</PermissionAccess>
			}
		>
			<Feedback {...action} />
			<DealOwnerFilter value={ownerFilter} onChange={setOwnerFilter} />
			<p className="text-sm text-muted-foreground" role="status">
				{pipeline.deals.length} deals
			</p>
			{adding && (
				<DealForm
					pipeline={pipeline}
					stage={adding}
					onSaved={() => setAdding(undefined)}
					onCancel={() => setAdding(undefined)}
				/>
			)}
			<Kanban.Root
				orientation="horizontal"
				value={state}
				onValueChange={change}
				onDragEnd={persist}
				onDragCancel={() => {
					stateRef.current = source;
					setState(source);
				}}
				getItemValue={(task: SerializedTask) => task.id}
			>
				<Kanban.Board
					className={`flex flex-col gap-4 md:auto-rows-fr md:grid-cols-1 md:grid min-h-[400px] ${gridClass}`}
				>
					{orderedColumns.map((column) => (
						<div key={column.id} className="min-w-0">
							<Kanban.Column
								value={column.id}
								className="bg-muted/40 dark:bg-muted/40"
							>
								<div className="flex items-baseline justify-between gap-3 px-1 py-2">
									<h2 className="font-semibold">{column.title}</h2>
									<span className="text-sm text-muted-foreground">
										{column.tasks.length}
									</span>
								</div>
								<div className="space-y-3">
									{column.tasks.map((task) => {
										const deal = dealMap.get(task.id);
										if (!deal) return null;
										const facts = {
											id: deal.id,
											pipelineId,
											contactId: deal.contactId ?? null,
											companyId: deal.companyId ?? null,
											ownerId: deal.ownerId,
											taskId: deal.taskId,
										};
										return (
											<Kanban.Item key={task.id} value={task.id} asChild>
												<article className="space-y-3 rounded-md border bg-card p-3">
													<div className="flex items-start gap-2">
														<PermissionAccess
															permission={crmPermissions.deal.move({
																...facts,
																targetStage: column.id,
															})}
														>
															<Kanban.ItemHandle
																asChild
																disabled={move.isPending}
															>
																<Button
																	variant="ghost"
																	className="min-h-11 min-w-11 shrink-0"
																	disabled={move.isPending}
																	aria-label={`Move deal ${deal.title}`}
																>
																	<GripVertical className="size-4" />
																</Button>
															</Kanban.ItemHandle>
														</PermissionAccess>
														<Link
															href={resolve(`crm/deals/${deal.id}`).href}
															className="inline-flex min-h-11 items-center break-words font-medium hover:underline"
														>
															{deal.title}
														</Link>
													</div>
													<div className="flex flex-wrap items-center justify-between gap-2 text-sm">
														<span className="font-medium tabular-nums">
															{money(deal.value, deal.currency)}
														</span>
														<span className="text-muted-foreground capitalize">
															{deal.status}
														</span>
													</div>
													<p className="break-words text-xs text-muted-foreground">
														Owner: <DealOwnerName ownerId={deal.ownerId} />
													</p>
													{deal.closeDate && (
														<p className="text-xs text-muted-foreground">
															Closes{" "}
															<time dateTime={deal.closeDate}>
																{new Date(deal.closeDate).toLocaleDateString()}
															</time>
														</p>
													)}
												</article>
											</Kanban.Item>
										);
									})}
								</div>
								{!column.tasks.length && (
									<p className="py-6 text-center text-sm text-muted-foreground">
										No deals in this stage.
									</p>
								)}
								<PermissionAccess
									permission={crmPermissions.deal.create({
										pipelineId,
										stage: column.id,
										contactId: null,
										companyId: null,
									})}
								>
									<Button
										variant="ghost"
										className="min-h-11 w-full"
										onClick={() => setAdding(column.id)}
									>
										Add deal to {column.title}
									</Button>
								</PermissionAccess>
							</Kanban.Column>
						</div>
					))}
				</Kanban.Board>
				<Kanban.Overlay>
					<div className="size-full rounded-md bg-primary/10" />
				</Kanban.Overlay>
			</Kanban.Root>
		</CrmPage>
	);
}
