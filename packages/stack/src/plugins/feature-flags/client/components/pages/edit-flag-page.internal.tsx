"use client";

import { useId, useState, type FormEvent } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { featureFlagsPermissions } from "../../../permissions";
import type { FeatureFlag, SegmentRule } from "../../../types";
import type { CreateFlagInput } from "../../../schemas";
import {
	useArchiveFlag,
	useCreateFlag,
	useFlagDefinition,
	useUpdateFlag,
} from "../../hooks";
import { FEATURE_FLAGS_PLUGIN_ID } from "../../constants";
import { Field, FlagsPage, Rollout } from "../shared";

export function EditFlagPage({ flagKey }: { flagKey?: string }) {
	return flagKey ? <ExistingFlag flagKey={flagKey} /> : <FlagForm />;
}

function ExistingFlag({ flagKey }: { flagKey: string }) {
	const { data: flag } = useFlagDefinition(flagKey);
	return <FlagForm key={flagKey} flag={flag} />;
}

function FlagForm({ flag }: { flag?: FeatureFlag }) {
	const id = useId();
	const { Link, resolve, navigate } = usePluginSiteNavigation(
		FEATURE_FLAGS_PLUGIN_ID,
	);
	const create = useCreateFlag();
	const update = useUpdateFlag();
	const archive = useArchiveFlag();
	const [name, setName] = useState(flag?.name ?? "");
	const [key, setKey] = useState(flag?.key ?? "");
	const [description, setDescription] = useState(flag?.description ?? "");
	const [type, setType] = useState<FeatureFlag["type"]>(
		flag?.type ?? "boolean",
	);
	const [percent, setPercent] = useState(flag?.rolloutPct ?? 0);
	const [tags, setTags] = useState(flag?.tags.join(", ") ?? "");
	const [enabled, setEnabled] = useState(flag?.enabled ?? false);
	const [rules, setRules] = useState(() =>
		(flag?.segments ?? []).map((rule, index) => ({
			...rule,
			id: String(index),
			text: Array.isArray(rule.value) ? rule.value.join(", ") : rule.value,
		})),
	);
	const [nextRule, setNextRule] = useState(rules.length);
	const [error, setError] = useState("");
	const [message, setMessage] = useState("");
	const [confirmArchive, setConfirmArchive] = useState(false);
	const pending = create.isPending || update.isPending || archive.isPending;
	const readOnly = !!flag?.archivedAt;
	const listPath = resolve("feature-flags").href;
	const split = (value: string) => [
		...new Set(
			value
				.split(",")
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
	const save = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError("");
		setMessage("");
		if (type === "segment" && !rules.length) {
			setError("Add at least one targeting rule.");
			return;
		}
		const segments: SegmentRule[] = rules.map((rule) => ({
			field: rule.field,
			operator: rule.operator,
			value: rule.operator === "in" ? split(rule.text) : rule.text.trim(),
		}));
		const data: CreateFlagInput = {
			key,
			name,
			description,
			type,
			rolloutPct: type === "rollout" ? percent : null,
			segments: type === "segment" ? segments : [],
			tags: split(tags),
			...(flag ? {} : { enabled }),
		};
		try {
			if (flag) {
				const { key: _key, ...patch } = data;
				await update.mutateAsync({ key: flag.key, data: patch });
				setMessage("Flag saved");
			} else {
				await create.mutateAsync(data);
				await navigate("feature-flags");
			}
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The flag could not be saved. Try again.",
			);
		}
	};
	const archiveFlag = async () => {
		if (!flag) return;
		setError("");
		try {
			await archive.mutateAsync(flag.key);
			await navigate("feature-flags");
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The flag could not be archived. Try again.",
			);
		}
	};
	const changeRule = (ruleId: string, patch: Partial<(typeof rules)[number]>) =>
		setRules((current) =>
			current.map((rule) =>
				rule.id === ruleId ? { ...rule, ...patch } : rule,
			),
		);
	return (
		<FlagsPage
			title={flag ? flag.name : "New flag"}
			description={
				flag
					? "Update the audience and configuration for this feature."
					: "Give your feature a stable key, then choose who can see it."
			}
			action={<Link href={listPath}>All flags</Link>}
		>
			{readOnly && (
				<p className="ff-notice">
					This flag is archived and always evaluates to false.
				</p>
			)}
			<form onSubmit={(event) => void save(event)}>
				<fieldset className="ff-form-grid" disabled={pending || readOnly}>
					<legend className="ff-sr-only">Flag configuration</legend>
					<div className="ff-form-section">
						<h2>Flag details</h2>
						<Field id={`${id}-name`} label="Name">
							<input
								id={`${id}-name`}
								required
								maxLength={200}
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="New checkout"
							/>
						</Field>
						<Field
							id={`${id}-key`}
							label="Key"
							hint="Use lowercase letters, numbers, and hyphens. The key cannot change later."
						>
							<input
								id={`${id}-key`}
								aria-describedby={`${id}-key-hint`}
								required
								pattern="[a-z0-9]+(-[a-z0-9]+)*"
								maxLength={100}
								readOnly={!!flag}
								value={key}
								onChange={(event) => setKey(event.target.value)}
								placeholder="new-checkout"
							/>
						</Field>
						<Field id={`${id}-description`} label="Description">
							<textarea
								id={`${id}-description`}
								maxLength={2000}
								rows={3}
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="What does this flag control?"
							/>
						</Field>
						<Field
							id={`${id}-tags`}
							label="Tags"
							hint="Separate tags with commas to organize your flags."
						>
							<input
								id={`${id}-tags`}
								aria-describedby={`${id}-tags-hint`}
								value={tags}
								onChange={(event) => setTags(event.target.value)}
								placeholder="beta, checkout"
							/>
						</Field>
					</div>
					<div className="ff-form-section">
						<h2>Delivery</h2>
						<Field id={`${id}-type`} label="Flag type">
							<select
								id={`${id}-type`}
								value={type}
								onChange={(event) =>
									setType(event.target.value as FeatureFlag["type"])
								}
							>
								<option value="boolean">Boolean</option>
								<option value="rollout">Percentage rollout</option>
								<option value="segment">Segment targeting</option>
							</select>
						</Field>
						{type === "boolean" && (
							<p className="ff-explanation">
								When enabled, this flag is true for everyone. Disable it at any
								time from the flag list.
							</p>
						)}
						{type === "rollout" && (
							<>
								<Field
									id={`${id}-percent`}
									label="Rollout percentage"
									hint="The same user or session stays in the same rollout group."
								>
									<input
										id={`${id}-percent`}
										type="number"
										min={0}
										max={100}
										step="any"
										required
										value={percent}
										onChange={(event) => setPercent(event.target.valueAsNumber)}
										aria-describedby={`${id}-percent-hint`}
									/>
								</Field>
								<Rollout percent={Number.isFinite(percent) ? percent : 0} />
							</>
						)}
						{type === "segment" && (
							<div className="ff-rules">
								<p className="ff-note">
									All rules must match. “Is one of” accepts comma-separated
									values.
								</p>
								{rules.map((rule, index) => (
									<fieldset key={rule.id} className="ff-rule">
										<legend>Rule {index + 1}</legend>
										<label>
											Field
											<select
												value={rule.field}
												onChange={(event) => {
													const field = event.target
														.value as SegmentRule["field"];
													changeRule(rule.id, {
														field,
														operator: field === "tags" ? "contains" : "equals",
													});
												}}
											>
												<option value="userId">User ID</option>
												<option value="email">Email</option>
												<option value="tags">Tags</option>
											</select>
										</label>
										<label>
											Match
											<select
												value={rule.operator}
												onChange={(event) =>
													changeRule(rule.id, {
														operator: event.target
															.value as SegmentRule["operator"],
													})
												}
											>
												<option
													value={rule.field === "tags" ? "contains" : "equals"}
												>
													{rule.field === "tags" ? "Contains" : "Equals"}
												</option>
												<option value="in">Is one of</option>
											</select>
										</label>
										<label>
											Value
											<input
												required
												maxLength={32000}
												value={rule.text}
												onChange={(event) =>
													changeRule(rule.id, { text: event.target.value })
												}
											/>
										</label>
										<button
											type="button"
											onClick={() =>
												setRules((current) =>
													current.filter((item) => item.id !== rule.id),
												)
											}
											aria-label={`Remove rule ${index + 1}`}
										>
											Remove
										</button>
									</fieldset>
								))}
								<button
									type="button"
									onClick={() => {
										setRules((current) => [
											...current,
											{
												id: String(nextRule),
												field: "userId",
												operator: "equals",
												value: "",
												text: "",
											},
										]);
										setNextRule((current) => current + 1);
									}}
									disabled={rules.length >= 50}
								>
									Add rule
								</button>
							</div>
						)}
						{!flag && (
							<label className="ff-checkbox">
								<input
									type="checkbox"
									checked={enabled}
									onChange={(event) => setEnabled(event.target.checked)}
								/>
								Enable on creation
							</label>
						)}
					</div>
				</fieldset>
				{error && (
					<p role="alert" className="ff-error">
						{error}
					</p>
				)}
				{message && (
					<p role="status" className="ff-success">
						{message}
					</p>
				)}
				<div className="ff-form-footer">
					<div className="ff-actions">
						{!readOnly && (
							<PermissionAccess
								permission={
									flag
										? featureFlagsPermissions.flags.update({ key: flag.key })
										: featureFlagsPermissions.flags.create({ key })
								}
							>
								<button className="ff-primary" type="submit" disabled={pending}>
									{pending ? "Saving…" : flag ? "Save changes" : "Create flag"}
								</button>
							</PermissionAccess>
						)}
						<Link href={listPath}>Cancel</Link>
					</div>
					{flag && !readOnly && (
						<PermissionAccess
							permission={featureFlagsPermissions.flags.archive({
								key: flag.key,
							})}
						>
							<button
								type="button"
								disabled={pending}
								onClick={() => setConfirmArchive(true)}
							>
								Archive flag
							</button>
						</PermissionAccess>
					)}
				</div>
			</form>
			{confirmArchive && (
				<div className="ff-notice" role="alert">
					<h2>Archive {flag?.name}?</h2>
					<p>
						Archived flags always evaluate to false. Its key remains reserved.
					</p>
					<div className="ff-actions">
						<button
							type="button"
							disabled={pending}
							onClick={() => void archiveFlag()}
						>
							Confirm archive
						</button>
						<button type="button" onClick={() => setConfirmArchive(false)}>
							Keep flag
						</button>
					</div>
				</div>
			)}
		</FlagsPage>
	);
}
