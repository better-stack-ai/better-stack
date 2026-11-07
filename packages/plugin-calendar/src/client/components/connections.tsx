"use client";

import { useState } from "react";
import { PermissionAccess, useIdentity } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { calendarPermissions } from "../../permissions";
import type { CalendarConnection } from "../../types";
import {
	useCalendarConnections,
	useConnectedCalendarOptions,
	useConnectCalendarProvider,
	useDisconnectCalendarProvider,
	useRetryCalendarSync,
	useSelectConnectedCalendar,
} from "../hooks";
import { calendarSelectClass, Field } from "./shared";

const providerNames = { google: "Google", microsoft: "Microsoft" } as const;

export function CalendarConnectionsSection() {
	const { data, isPending, error, refetch, isFetching } =
		useCalendarConnections();
	const { identity } = useIdentity();
	const connect = useConnectCalendarProvider();
	const retry = useRetryCalendarSync();
	if (isPending) return <p role="status">Loading calendar connections…</p>;
	if (error)
		return (
			<p role="alert" className="text-destructive">
				{error.message}
			</p>
		);
	if (
		!data ||
		!identity ||
		(data.providers.length === 0 &&
			data.connections.length === 0 &&
			data.sync.length === 0)
	)
		return null;
	return (
		<section
			aria-labelledby="calendar-connections-heading"
			className="space-y-4"
		>
			<div>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h2
						id="calendar-connections-heading"
						className="text-xl font-semibold"
					>
						Connected calendars
					</h2>
					<Button
						className="min-h-11"
						variant="outline"
						disabled={isFetching}
						onClick={() => void refetch()}
					>
						Refresh connections
					</Button>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					Authorize an account through this application, then connect and choose
					a calendar. Busy times block bookings; confirmed bookings synchronize
					automatically.
				</p>
			</div>
			{connect.error && (
				<p role="alert" className="text-destructive">
					{connect.error.message}
				</p>
			)}
			<PermissionAccess permission={calendarPermissions.connection.connect({})}>
				<div className="flex flex-wrap gap-2">
					{data.providers.map((provider) => (
						<Button
							key={provider}
							className="min-h-11"
							variant="outline"
							disabled={
								connect.isPending ||
								data.connections.some(
									(item) =>
										item.provider === provider && item.status === "connected",
								)
							}
							onClick={() => connect.mutate(provider)}
						>
							Connect {providerNames[provider]}
						</Button>
					))}
				</div>
			</PermissionAccess>
			{data.connections
				.filter((connection) => connection.status === "connected")
				.map((connection) => (
					<Connection
						key={`${connection.id}:${connection.calendarId}`}
						connection={connection}
						hostId={identity.id}
					/>
				))}
			{data.sync.length > 0 && (
				<div className="space-y-3">
					<h3 className="font-medium">Booking synchronization</h3>
					{retry.error && (
						<p role="alert" className="text-destructive">
							{retry.error.message}
						</p>
					)}
					<ul className="divide-y rounded-lg border">
						{data.sync.map((sync) => (
							<li
								key={sync.id}
								className="space-y-2 p-4"
								data-testid="calendar-sync-state"
							>
								<div className="flex flex-wrap items-baseline justify-between gap-2">
									<p className="break-all text-sm">Booking {sync.bookingId}</p>
									<span className="text-sm font-medium">
										{sync.state === "synced"
											? "Synced"
											: sync.state === "failed"
												? "Sync failed"
												: "Sync pending"}
									</span>
								</div>
								<p className="text-sm text-muted-foreground">
									{data.connections.find(
										(connection) => connection.id === sync.connectionId,
									)?.label ?? "Disconnected calendar"}{" "}
									· {sync.attempts}{" "}
									{sync.attempts === 1 ? "attempt" : "attempts"}
								</p>
								{sync.error && (
									<p className="text-sm text-destructive">{sync.error}</p>
								)}
								{sync.state !== "synced" && (
									<PermissionAccess
										permission={calendarPermissions.sync.retry({
											hostId: identity.id,
											syncId: sync.id,
										})}
									>
										<Button
											className="min-h-11"
											variant="outline"
											disabled={retry.isPending}
											onClick={() => retry.mutate(sync.id)}
										>
											Retry synchronization
											<span className="sr-only">
												{" "}
												for booking {sync.bookingId}
											</span>
										</Button>
									</PermissionAccess>
								)}
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function Connection({
	connection,
	hostId,
}: {
	connection: CalendarConnection;
	hostId: string;
}) {
	const {
		data: calendars,
		error: calendarsError,
		isPending,
	} = useConnectedCalendarOptions(connection.id);
	const select = useSelectConnectedCalendar();
	const disconnect = useDisconnectCalendarProvider();
	const [calendarId, setCalendarId] = useState(connection.calendarId ?? "");
	const error = calendarsError ?? select.error ?? disconnect.error;
	return (
		<div className="space-y-4 rounded-lg border p-4 sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="min-w-0">
					<h3 className="break-words font-medium">{connection.label}</h3>
					<p className="text-sm text-muted-foreground">
						{providerNames[connection.provider]} ·{" "}
						{connection.calendarName ??
							"Choose a calendar to enable synchronization"}
					</p>
				</div>
				<PermissionAccess
					permission={calendarPermissions.connection.manage({
						hostId,
						connectionId: connection.id,
					})}
				>
					<Button
						className="min-h-11"
						variant="outline"
						disabled={disconnect.isPending || select.isPending}
						onClick={() => {
							if (
								window.confirm(
									"Disconnect this calendar? Mirrored booking events will be removed before access is revoked. Local bookings will remain.",
								)
							)
								disconnect.mutate(connection.id);
						}}
					>
						Disconnect<span className="sr-only"> {connection.label}</span>
					</Button>
				</PermissionAccess>
			</div>
			{error && (
				<p role="alert" className="text-destructive">
					{error.message}
				</p>
			)}
			{isPending ? (
				<p role="status">Loading calendars…</p>
			) : (
				<PermissionAccess
					permission={calendarPermissions.connection.manage({
						hostId,
						connectionId: connection.id,
					})}
				>
					<form
						className="flex flex-wrap items-end gap-3"
						onSubmit={(event) => {
							event.preventDefault();
							select.mutate({ id: connection.id, calendarId });
						}}
					>
						<div className="min-w-0 flex-1">
							<Field
								label={`Calendar for ${connection.label}`}
								id={`calendar-connection-${connection.id}`}
							>
								<select
									id={`calendar-connection-${connection.id}`}
									className={calendarSelectClass}
									value={calendarId}
									onChange={(event) => setCalendarId(event.target.value)}
									required
								>
									<option value="">Choose a calendar</option>
									{calendars?.map((calendar) => (
										<option key={calendar.id} value={calendar.id}>
											{calendar.name}
										</option>
									))}
								</select>
							</Field>
						</div>
						<Button
							type="submit"
							className="min-h-11"
							disabled={
								!calendarId ||
								select.isPending ||
								disconnect.isPending ||
								calendarId === connection.calendarId
							}
						>
							Save calendar
						</Button>
					</form>
				</PermissionAccess>
			)}
		</div>
	);
}
