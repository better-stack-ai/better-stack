"use client";

import { useState } from "react";
import { useRegisterPageAIContext } from "@btst/stack/page-context";
import {
	PermissionAccess,
	usePluginOverrides,
	usePluginSiteNavigation,
} from "@btst/stack/context";
import { featureFlagsPermissions } from "../../../permissions";
import type { FeatureFlag } from "../../../types";
import { useSuspenseFlags, useToggleFlag } from "../../hooks";
import { FEATURE_FLAGS_PLUGIN_ID } from "../../constants";
import type { FeatureFlagsPluginOverrides } from "../../overrides";
import { FlagsPage as Page, Rollout } from "../shared";

export function FlagsPage() {
	const [search, setSearch] = useState("");
	const [tag, setTag] = useState("");
	const [includeArchived, setIncludeArchived] = useState(false);
	const {
		data: flags,
		refetch,
		isFetching,
	} = useSuspenseFlags({ includeArchived });
	const { Link, resolve } = usePluginSiteNavigation(FEATURE_FLAGS_PLUGIN_ID);
	const { localization } = usePluginOverrides<FeatureFlagsPluginOverrides>(
		FEATURE_FLAGS_PLUGIN_ID,
	);
	const tags = [...new Set(flags.flatMap((flag) => flag.tags))].sort();
	const visible = flags.filter(
		(flag) =>
			(!tag || flag.tags.includes(tag)) &&
			`${flag.name} ${flag.key} ${flag.description ?? ""}`
				.toLowerCase()
				.includes(search.toLowerCase()),
	);
	useRegisterPageAIContext({
		routeName: "feature-flags-admin",
		pageDescription: JSON.stringify({
			page: "Read-only Feature Flags dashboard summary. No mutation tools are available.",
			search,
			tag,
			includeArchived,
			totalFlags: flags.length,
			visibleFlags: visible.length,
			enabledFlags: visible.filter((flag) => flag.enabled).length,
		}).slice(0, 16000),
	});
	return (
		<Page
			title={localization?.title ?? "Feature flags"}
			description="Control what's live. Roll out changes to the right audience."
			action={
				<Link className="ff-primary" href={resolve("feature-flags/new").href}>
					{localization?.newFlag ?? "New flag"}
				</Link>
			}
		>
			<div className="ff-toolbar">
				<label className="ff-search">
					Find a flag
					<input
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						placeholder="Search name or key"
					/>
				</label>
				<label>
					Tag
					<select value={tag} onChange={(event) => setTag(event.target.value)}>
						<option value="">All tags</option>
						{tags.map((value) => (
							<option key={value}>{value}</option>
						))}
					</select>
				</label>
				<label className="ff-checkbox">
					<input
						type="checkbox"
						checked={includeArchived}
						onChange={(event) => setIncludeArchived(event.target.checked)}
					/>
					Show archived
				</label>
				<button
					type="button"
					disabled={isFetching}
					onClick={() => void refetch()}
				>
					Refresh flags
				</button>
			</div>
			<p className="ff-count">
				{visible.length} {visible.length === 1 ? "flag" : "flags"}
			</p>
			{visible.length ? (
				<ul className="ff-list" aria-label="Feature flags">
					{visible.map((flag) => (
						<FlagRow key={flag.key} flag={flag} />
					))}
				</ul>
			) : (
				<div className="ff-empty">
					<h2>
						{flags.length ? "No matching flags" : "Your first flag starts here"}
					</h2>
					<p>
						{flags.length
							? "Try another name, key, or tag."
							: "Create a flag to control a feature without redeploying your app."}
					</p>
				</div>
			)}
		</Page>
	);
}

function FlagRow({ flag }: { flag: FeatureFlag }) {
	const toggle = useToggleFlag();
	const { Link, resolve } = usePluginSiteNavigation(FEATURE_FLAGS_PLUGIN_ID);
	const [error, setError] = useState("");
	const change = async () => {
		setError("");
		try {
			await toggle.mutateAsync({ key: flag.key, enabled: !flag.enabled });
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The flag could not be changed. Try again.",
			);
		}
	};
	return (
		<li className="ff-row" data-archived={!!flag.archivedAt}>
			<div className="ff-identity">
				<Link
					href={resolve(`feature-flags/${flag.key}`).href}
					className="ff-name"
				>
					{flag.name}
				</Link>
				<code>{flag.key}</code>
				{flag.description && <p>{flag.description}</p>}
				{flag.tags.length > 0 && (
					<ul className="ff-tags" aria-label="Tags">
						{flag.tags.map((tag) => (
							<li key={tag}>{tag}</li>
						))}
					</ul>
				)}
			</div>
			<div className="ff-audience">
				{flag.type === "rollout" ? (
					<Rollout page="flags" percent={flag.rolloutPct ?? 0} />
				) : (
					<>
						<span>
							{flag.type === "segment" ? "Segment targeting" : "Boolean"}
						</span>
						<p>
							{flag.type === "segment"
								? `${flag.segments.length} targeting ${flag.segments.length === 1 ? "rule" : "rules"}`
								: "Everyone when enabled"}
						</p>
					</>
				)}
			</div>
			<div className="ff-row-actions">
				{flag.archivedAt ? (
					<span className="ff-muted">Archived</span>
				) : (
					<PermissionAccess
						permission={featureFlagsPermissions.flags.toggle({ key: flag.key })}
					>
						<button
							type="button"
							className="ff-toggle"
							role="switch"
							aria-label={`Enable ${flag.name}`}
							aria-checked={flag.enabled}
							disabled={toggle.isPending}
							onClick={() => void change()}
						>
							<span aria-hidden="true" />
							{flag.enabled ? "Enabled" : "Disabled"}
						</button>
					</PermissionAccess>
				)}
				<PermissionAccess
					permission={featureFlagsPermissions.evaluations.read({
						key: flag.key,
					})}
				>
					<Link href={resolve(`feature-flags/${flag.key}/log`).href}>
						Evaluation log
					</Link>
				</PermissionAccess>
			</div>
			{error && (
				<p role="alert" className="ff-error">
					{error}
				</p>
			)}
		</li>
	);
}
