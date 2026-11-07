"use client";
import { useState } from "react";
import { PermissionAccess } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import type { Deal } from "../../types";
import type { CrmOwnerFilter } from "../../query-keys";
import { crmPermissions } from "../../permissions";
import { useAssignDealOwner, useDealOwners } from "../hooks";
import { Field, Feedback, selectClass, useCrmAction } from "./shared";

function DirectoryOwnerName({ ownerId }: { ownerId: string }) {
	const { data } = useDealOwners();
	return (
		data.items.find((owner) => owner.id === ownerId)?.name ??
		`Unavailable staff member (${ownerId})`
	);
}
export function DealOwnerName({ ownerId }: { ownerId: string | null }) {
	if (!ownerId) return <>Unassigned</>;
	return (
		<PermissionAccess
			permission={crmPermissions.owner.read()}
			fallback={ownerId}
		>
			<DirectoryOwnerName ownerId={ownerId} />
		</PermissionAccess>
	);
}

function DirectoryOwnerOptions() {
	const { data } = useDealOwners();
	return data.items.map((owner) => (
		<option key={owner.id} value={`owner:${owner.id}`}>
			{owner.name}
		</option>
	));
}

export function DealOwnerFilter({
	value,
	onChange,
}: {
	value: CrmOwnerFilter;
	onChange: (value: CrmOwnerFilter) => void;
}) {
	return (
		<div className="max-w-xs">
			<Field label="Filter by owner">
				{(id) => (
					<select
						id={id}
						className={selectClass}
						value={
							value.ownerId ? `owner:${value.ownerId}` : (value.owner ?? "all")
						}
						onChange={(event) => {
							const selected = event.target.value;
							onChange(
								selected === "all"
									? {}
									: selected === "current" || selected === "unassigned"
										? { owner: selected }
										: { ownerId: selected.slice(6) },
							);
						}}
					>
						<option value="all">All owners</option>
						<option value="current">My deals</option>
						<option value="unassigned">Unassigned</option>
						<PermissionAccess permission={crmPermissions.owner.read()}>
							<DirectoryOwnerOptions />
						</PermissionAccess>
					</select>
				)}
			</Field>
		</div>
	);
}

export function DealOwnerEditor({
	deal,
	onReload,
}: {
	deal: Deal;
	onReload: () => Promise<unknown>;
}) {
	const { data } = useDealOwners();
	const assign = useAssignDealOwner();
	const action = useCrmAction();
	const [ownerId, setOwnerId] = useState(deal.ownerId ?? "");
	const facts = (proposedOwnerId: string | null) => ({
		id: deal.id,
		taskId: deal.taskId,
		pipelineId: deal.pipelineId,
		currentOwnerId: deal.ownerId,
		proposedOwnerId,
	});
	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				void action.run(async () => {
					await assign.mutateAsync({
						id: deal.id,
						ownerId: ownerId || null,
						expectedOwnerId: deal.ownerId,
					});
				}, "Deal owner updated");
			}}
		>
			<Field label="Deal owner">
				{(id) => (
					<select
						id={id}
						className={selectClass}
						value={ownerId}
						disabled={assign.isPending}
						onChange={(event) => setOwnerId(event.target.value)}
					>
						{!deal.ownerId ? (
							<option value="">Unassigned</option>
						) : (
							<PermissionAccess
								permission={crmPermissions.deal.assign(facts(null))}
							>
								<option value="">Unassigned</option>
							</PermissionAccess>
						)}
						{deal.ownerId &&
							!data.items.some((owner) => owner.id === deal.ownerId) && (
								<option value={deal.ownerId}>
									Unavailable staff member ({deal.ownerId})
								</option>
							)}
						{data.items.map((owner) =>
							owner.id === deal.ownerId ? (
								<option key={owner.id} value={owner.id}>
									{owner.name}
								</option>
							) : (
								<PermissionAccess
									key={owner.id}
									permission={crmPermissions.deal.assign(facts(owner.id))}
								>
									<option value={owner.id}>{owner.name}</option>
								</PermissionAccess>
							),
						)}
					</select>
				)}
			</Field>
			<PermissionAccess
				permission={crmPermissions.deal.assign(facts(ownerId || null))}
			>
				<Button
					type="submit"
					variant="outline"
					className="min-h-11 self-start"
					disabled={assign.isPending || ownerId === (deal.ownerId ?? "")}
				>
					Update owner
				</Button>
			</PermissionAccess>
			<Feedback {...action} />
			{action.error && (
				<Button
					type="button"
					variant="outline"
					className="min-h-11 self-start"
					onClick={() =>
						void action.run(async () => {
							await onReload();
						})
					}
				>
					Reload owner
				</Button>
			)}
		</form>
	);
}
