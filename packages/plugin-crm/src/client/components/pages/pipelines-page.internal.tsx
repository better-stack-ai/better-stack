"use client";
import { useState, type FormEvent } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { usePipelines, useCreatePipeline } from "../../hooks";
import { crmPermissions } from "../../../permissions";
import { CRM_PLUGIN_ID } from "../../constants";
import { CrmPage, Field, Feedback, useCrmAction } from "../shared";
export function PipelinesPage() {
	const { data } = usePipelines({ limit: 200 });
	const create = useCreatePipeline();
	const [creating, setCreating] = useState(false);
	const { Link, resolve, navigate } = usePluginSiteNavigation(CRM_PLUGIN_ID);
	const action = useCrmAction();
	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const fields = new FormData(event.currentTarget);
		void action.run(async () => {
			const pipeline = await create.mutateAsync({
				name: String(fields.get("name")),
				stages: String(fields.get("stages"))
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			});
			await navigate(`crm/pipeline/${pipeline.id}`);
		});
	};
	return (
		<CrmPage
			title="Pipelines"
			description="Follow each deal from its first conversation to a decision."
			action={
				<PermissionAccess permission={crmPermissions.pipeline.create()}>
					<Button className="min-h-11" onClick={() => setCreating(!creating)}>
						New pipeline
					</Button>
				</PermissionAccess>
			}
		>
			<Feedback {...action} />
			{creating && (
				<form
					className="max-w-2xl space-y-4 rounded-lg border p-5"
					onSubmit={save}
				>
					<Field label="Pipeline name">
						{(id) => <Input id={id} name="name" required maxLength={500} />}
					</Field>
					<Field
						label="Stages"
						hint="Separate stages with commas, in progression order."
					>
						{(id) => (
							<Input
								id={id}
								name="stages"
								required
								defaultValue="Lead, Qualified, Proposal, Closed"
							/>
						)}
					</Field>
					<div className="flex gap-3">
						<Button
							type="submit"
							className="min-h-11"
							disabled={create.isPending}
						>
							Create pipeline
						</Button>
						<Button
							type="button"
							variant="outline"
							className="min-h-11"
							onClick={() => setCreating(false)}
						>
							Cancel
						</Button>
					</div>
				</form>
			)}
			{data.items.length ? (
				<ul className="divide-y rounded-lg border px-5">
					{data.items.map((pipeline) => (
						<li key={pipeline.id} className="py-5">
							<Link
								className="inline-flex min-h-11 items-center text-lg font-semibold hover:underline"
								href={resolve(`crm/pipeline/${pipeline.id}`).href}
							>
								{pipeline.name}
							</Link>
							<p className="text-sm text-muted-foreground">
								{pipeline.columns.map((column) => column.title).join(" / ")}
							</p>
						</li>
					))}
				</ul>
			) : (
				<p className="py-10 text-muted-foreground">
					No pipelines yet. Create a pipeline and choose the stages your deals
					move through.
				</p>
			)}
		</CrmPage>
	);
}
