"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PermissionAccess, usePluginSiteNavigation } from "@btst/stack/context";
import { notificationsPermissions } from "../../../permissions";
import type { NotificationPreferenceInput } from "../../../query-keys";
import { NOTIFICATIONS_PLUGIN_ID } from "../../constants";
import {
	useNotificationPreferences,
	useUpdateNotificationPreferences,
} from "../../hooks";
import { NotificationsPage } from "../shared";

export function PreferencesPage() {
	const { data } = useNotificationPreferences();
	const update = useUpdateNotificationPreferences();
	const [draft, setDraft] = useState<
		Record<string, NotificationPreferenceInput>
	>({});
	const [saved, setSaved] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const active = useRef(true);
	useLayoutEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
		};
	}, []);
	const { Link, resolve } = usePluginSiteNavigation(NOTIFICATIONS_PLUGIN_ID);
	const preferences = data.map((preference) =>
		Object.hasOwn(draft, preference.category)
			? draft[preference.category]!
			: preference,
	);
	return (
		<NotificationsPage
			title="Notification preferences"
			action={<Link href={resolve("notifications").href}>Back to inbox</Link>}
		>
			<p>Choose how you receive each type of notification.</p>
			<form
				onSubmit={async (event) => {
					event.preventDefault();
					if (isSaving) return;
					setSaved(false);
					setIsSaving(true);
					const edits = Object.values(draft).map(
						({ category, inApp, email }) => ({
							category,
							inApp,
							email,
						}),
					);
					try {
						for (let offset = 0; offset < edits.length; offset += 100) {
							if (!active.current) return;
							await update.mutateAsync(edits.slice(offset, offset + 100));
						}
						if (!active.current) return;
						setDraft({});
						setSaved(true);
					} catch {
						/* The mutation exposes the error below. */
					} finally {
						if (active.current) setIsSaving(false);
					}
				}}
			>
				<fieldset className="nt-preferences" disabled={isSaving}>
					<legend className="nt-sr-only">Delivery channels by category</legend>
					{preferences.length ? (
						preferences.map((preference) => (
							<div className="nt-preference" key={preference.category}>
								<h2>{preference.category}</h2>
								{(["inApp", "email"] as const).map((channel) => (
									<label key={channel}>
										<input
											type="checkbox"
											checked={preference[channel]}
											aria-label={`${preference.category} ${channel === "inApp" ? "in-app" : "email"} notifications`}
											onChange={(event) => {
												setSaved(false);
												setDraft({
													...draft,
													[preference.category]: {
														...preference,
														[channel]: event.target.checked,
													},
												});
											}}
										/>
										{channel === "inApp" ? "In-app" : "Email"}
									</label>
								))}
							</div>
						))
					) : (
						<p>No notification categories are configured yet.</p>
					)}
				</fieldset>
				{update.error && (
					<p className="nt-error" role="alert">
						{update.error.message}
					</p>
				)}
				{saved && <p role="status">Preferences saved.</p>}
				<PermissionAccess
					permission={notificationsPermissions.preferences.update()}
				>
					<button type="submit" disabled={isSaving || !preferences.length}>
						{isSaving ? "Saving…" : "Save preferences"}
					</button>
				</PermissionAccess>
			</form>
		</NotificationsPage>
	);
}
