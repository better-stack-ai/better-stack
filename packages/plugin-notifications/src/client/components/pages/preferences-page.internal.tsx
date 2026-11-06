"use client";

import { useState } from "react";
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
	const { Link, resolve } = usePluginSiteNavigation(NOTIFICATIONS_PLUGIN_ID);
	const preferences = data.map(
		(preference) => draft[preference.category] ?? preference,
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
					setSaved(false);
					try {
						await update.mutateAsync(
							preferences.map(({ category, inApp, email }) => ({
								category,
								inApp,
								email,
							})),
						);
						setDraft({});
						setSaved(true);
					} catch {
						/* The mutation exposes the error below. */
					}
				}}
			>
				<fieldset className="nt-preferences" disabled={update.isPending}>
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
					<button
						type="submit"
						disabled={update.isPending || !preferences.length}
					>
						{update.isPending ? "Saving…" : "Save preferences"}
					</button>
				</PermissionAccess>
			</form>
		</NotificationsPage>
	);
}
