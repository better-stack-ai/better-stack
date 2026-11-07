"use client";

import { useId, useState, type FormEvent } from "react";
import { PermissionRouteAccess } from "@btst/stack/client/components";
import { usePluginSiteNavigation } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { calendarPermissions } from "../../../permissions";
import { createEventTypeSchema } from "../../../schemas";
import type { CalendarEventInput } from "../../../query-keys";
import type { TimeInterval } from "../../../types";
import { CALENDAR_PLUGIN_ID } from "../../constants";
import {
	useCalendarEvent,
	useCreateCalendarEvent,
	useUpdateCalendarEvent,
} from "../../hooks";
import {
	CalendarLoading,
	CalendarPage,
	Field,
	calendarSelectClass,
} from "../shared";

const days = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];
const emptyEvent: CalendarEventInput = {
	name: "",
	slug: "",
	description: "",
	location: "",
	duration: 30,
	capacity: 1,
	timezone: "UTC",
	active: true,
	limits: {},
	dateOverrides: [],
	weeklyAvailability: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
		dayOfWeek,
		start: "09:00",
		end: "17:00",
	})),
};

export function CalendarEventEditorPage({ id }: { id?: string }) {
	return id ? (
		<ExistingEventEditor id={id} />
	) : (
		<EventForm initial={emptyEvent} />
	);
}

function ExistingEventEditor({ id }: { id: string }) {
	const { data: event } = useCalendarEvent(id);
	return (
		<PermissionRouteAccess
			permission={calendarPermissions.eventType.update({
				eventTypeId: id,
				hostId: event.hostId,
			})}
			LoadingComponent={CalendarLoading}
		>
			<EventForm
				key={id}
				id={id}
				initial={createEventTypeSchema.parse(event)}
			/>
		</PermissionRouteAccess>
	);
}

function IntervalFields({
	value,
	onChange,
	label,
}: {
	value: TimeInterval;
	onChange: (value: TimeInterval) => void;
	label: string;
}) {
	const endHintId = useId();
	return (
		<div className="grid min-w-0 grid-cols-2 gap-3">
			<Input
				className="min-h-11"
				type="time"
				required
				aria-label={`${label} start`}
				value={value.start}
				onChange={(e) => onChange({ ...value, start: e.target.value })}
			/>
			<div className="min-w-0 space-y-1">
				<Input
					className="min-h-11"
					type="text"
					pattern="([01][0-9]|2[0-3]):[0-5][0-9]|24:00"
					maxLength={5}
					required
					aria-label={`${label} end`}
					aria-describedby={endHintId}
					value={value.end}
					onChange={(e) => onChange({ ...value, end: e.target.value })}
				/>
				<p id={endHintId} className="text-sm text-muted-foreground">
					HH:mm, up to 24:00.
				</p>
			</div>
		</div>
	);
}

function EventForm({
	id,
	initial,
}: {
	id?: string;
	initial: CalendarEventInput;
}) {
	const [form, setForm] = useState(initial);
	const [teamBooking, setTeamBooking] = useState(
		(initial.teamAvailabilityIds?.length ?? 0) > 0,
	);
	const [teamAvailabilityIds, setTeamAvailabilityIds] = useState(
		(initial.teamAvailabilityIds ?? []).join("\n"),
	);
	const [validationError, setValidationError] = useState("");
	const create = useCreateCalendarEvent();
	const update = useUpdateCalendarEvent();
	const { Link, navigate, resolve } =
		usePluginSiteNavigation(CALENDAR_PLUGIN_ID);
	const pending = create.isPending || update.isPending;
	const error =
		validationError || create.error?.message || update.error?.message;
	const submit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const memberIds = teamAvailabilityIds
			.split("\n")
			.map((value) => value.trim())
			.filter(Boolean);
		if (teamBooking && memberIds.length === 0) {
			setValidationError("Add at least one host availability event ID.");
			return;
		}
		const parsed = createEventTypeSchema.safeParse({
			...form,
			teamAvailabilityIds: teamBooking ? memberIds : [],
		});
		if (!parsed.success) {
			setValidationError(
				parsed.error.issues[0]?.message ??
					"Check the event details and availability.",
			);
			return;
		}
		setValidationError("");
		try {
			if (id) await update.mutateAsync({ id, data: parsed.data });
			else await create.mutateAsync(parsed.data);
			void navigate("calendar");
		} catch {
			// The mutation exposes its validation or authorization error in the form.
		}
	};
	return (
		<CalendarPage>
			<header className="space-y-3">
				<Link
					className="inline-flex min-h-11 items-center underline underline-offset-4"
					href={resolve("calendar").href}
				>
					Back to calendar
				</Link>
				<h1 className="text-2xl font-semibold sm:text-3xl">
					{id ? "Edit event type" : "New event type"}
				</h1>
			</header>
			<form onSubmit={submit} className="space-y-8">
				<fieldset
					disabled={pending}
					className="grid min-w-0 gap-5 sm:grid-cols-2"
				>
					<legend className="mb-4 text-xl font-semibold">Event details</legend>
					<Field id="calendar-event-name" label="Event name">
						<Input
							id="calendar-event-name"
							className="min-h-11"
							required
							maxLength={200}
							value={form.name}
							onChange={(e) => setForm({ ...form, name: e.target.value })}
						/>
					</Field>
					<Field
						id="calendar-event-slug"
						label="Booking page slug"
						hint="Use lowercase letters, numbers and hyphens."
					>
						<Input
							id="calendar-event-slug"
							className="min-h-11"
							required
							pattern="[a-z0-9]+(-[a-z0-9]+)*"
							maxLength={100}
							value={form.slug}
							onChange={(e) => setForm({ ...form, slug: e.target.value })}
						/>
					</Field>
					<Field id="calendar-duration" label="Duration (minutes)">
						<Input
							id="calendar-duration"
							className="min-h-11"
							type="number"
							min={1}
							max={1440}
							step={1}
							list="calendar-durations"
							required
							value={form.duration}
							onChange={(e) =>
								setForm({ ...form, duration: Number(e.target.value) })
							}
						/>
						<datalist id="calendar-durations">
							{[15, 30, 45, 60].map((value) => (
								<option key={value} value={value} />
							))}
						</datalist>
					</Field>
					<Field
						id="calendar-capacity"
						label="Attendees per time slot"
						hint={
							teamBooking
								? "Capacity per assigned host. Use a higher number for a group."
								: "Use 1 for 1:1 bookings, or a higher number for a group."
						}
					>
						<Input
							id="calendar-capacity"
							className="min-h-11"
							type="number"
							min={1}
							max={10000}
							step={1}
							required
							value={form.capacity}
							onChange={(e) =>
								setForm({ ...form, capacity: Number(e.target.value) })
							}
						/>
					</Field>
					<Field
						id="calendar-host-timezone"
						label="Host timezone"
						hint="Availability and booking limits use this timezone."
					>
						<Input
							id="calendar-host-timezone"
							className="min-h-11"
							required
							list="calendar-timezones"
							value={form.timezone}
							onChange={(e) => setForm({ ...form, timezone: e.target.value })}
						/>
						<datalist id="calendar-timezones">
							<option value="UTC" />
							{Intl.supportedValuesOf("timeZone").map((zone) => (
								<option key={zone} value={zone} />
							))}
						</datalist>
					</Field>
					<Field
						id="calendar-price"
						label="Price (minor currency units)"
						hint="Optional. For USD, 2500 means $25.00; zero or blank is free."
					>
						<Input
							id="calendar-price"
							className="min-h-11"
							type="number"
							min={0}
							max={Number.MAX_SAFE_INTEGER}
							step={1}
							value={form.price ?? ""}
							onChange={(e) =>
								setForm({
									...form,
									price: e.target.value === "" ? null : Number(e.target.value),
								})
							}
						/>
					</Field>
					<Field
						id="calendar-currency"
						label="Currency"
						hint="Three-letter uppercase code, supplied with the price, such as USD."
					>
						<Input
							id="calendar-currency"
							className="min-h-11"
							pattern="[A-Z]{3}"
							maxLength={3}
							value={form.currency ?? ""}
							onChange={(e) =>
								setForm({
									...form,
									currency:
										e.target.value === "" ? null : e.target.value.toUpperCase(),
								})
							}
						/>
					</Field>
					<Field id="calendar-location" label="Location">
						<Input
							id="calendar-location"
							className="min-h-11"
							maxLength={500}
							value={form.location}
							onChange={(e) => setForm({ ...form, location: e.target.value })}
						/>
					</Field>
					<div className="sm:col-span-2">
						<Field id="calendar-description" label="Description">
							<Textarea
								id="calendar-description"
								rows={3}
								maxLength={5000}
								value={form.description}
								onChange={(e) =>
									setForm({ ...form, description: e.target.value })
								}
							/>
						</Field>
					</div>
					<label className="flex min-h-11 items-center gap-3 text-sm">
						<input
							type="checkbox"
							className="h-5 w-5 accent-primary"
							checked={form.active}
							onChange={(e) => setForm({ ...form, active: e.target.checked })}
						/>
						Accept bookings
					</label>
				</fieldset>
				<fieldset disabled={pending} className="min-w-0 space-y-4">
					<legend className="text-xl font-semibold">Booking hosts</legend>
					<label className="flex min-h-11 items-center gap-3 text-sm">
						<input
							type="checkbox"
							className="h-5 w-5 accent-primary"
							checked={teamBooking}
							onChange={(e) => setTeamBooking(e.target.checked)}
						/>
						Assign bookings across a team
					</label>
					{teamBooking && (
						<>
							<Field
								id="calendar-team-availability"
								label="Host availability event IDs"
								hint="One individual event type ID per line, with one event per host. Each host keeps that event's timezone, weekly availability and date overrides."
							>
								<Textarea
									id="calendar-team-availability"
									rows={3}
									required
									value={teamAvailabilityIds}
									onChange={(e) => setTeamAvailabilityIds(e.target.value)}
								/>
							</Field>
							<p className="text-sm text-muted-foreground">
								Available hosts receive bookings by fewest lifetime assignments,
								then host ID. Cancellations do not reset the count. Rescheduling
								keeps the assigned host.
							</p>
							<p className="text-sm text-muted-foreground">
								The availability windows below apply to individual bookings.
								Team bookings use the selected hosts' availability instead.
							</p>
						</>
					)}
				</fieldset>
				<fieldset disabled={pending} className="min-w-0 space-y-4">
					<legend className="text-xl font-semibold">Weekly availability</legend>
					<p className="text-sm text-muted-foreground">
						Add time windows in the host timezone. Days without a window are
						unavailable.
					</p>
					{form.weeklyAvailability.map((rule, index) => (
						<div
							key={index}
							className="grid min-w-0 gap-3 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-center"
						>
							<select
								className={calendarSelectClass}
								aria-label={`Availability ${index + 1} day`}
								value={rule.dayOfWeek}
								onChange={(e) =>
									setForm({
										...form,
										weeklyAvailability: form.weeklyAvailability.map(
											(item, i) =>
												i === index
													? { ...item, dayOfWeek: Number(e.target.value) }
													: item,
										),
									})
								}
							>
								{days.map((day, value) => (
									<option key={day} value={value}>
										{day}
									</option>
								))}
							</select>
							<IntervalFields
								label={`Availability ${index + 1}`}
								value={rule}
								onChange={(value) =>
									setForm({
										...form,
										weeklyAvailability: form.weeklyAvailability.map(
											(item, i) => (i === index ? { ...item, ...value } : item),
										),
									})
								}
							/>
							<Button
								className="min-h-11"
								type="button"
								variant="ghost"
								aria-label={`Remove availability ${index + 1}`}
								onClick={() =>
									setForm({
										...form,
										weeklyAvailability: form.weeklyAvailability.filter(
											(_, i) => i !== index,
										),
									})
								}
							>
								Remove
							</Button>
						</div>
					))}
					<Button
						className="min-h-11"
						type="button"
						variant="outline"
						onClick={() =>
							setForm({
								...form,
								weeklyAvailability: [
									...form.weeklyAvailability,
									{ dayOfWeek: 1, start: "09:00", end: "17:00" },
								],
							})
						}
					>
						Add availability window
					</Button>
				</fieldset>
				<fieldset disabled={pending} className="min-w-0 space-y-4">
					<legend className="text-xl font-semibold">Date overrides</legend>
					<p className="text-sm text-muted-foreground">
						Override a date in the host timezone. Leave its time windows empty
						to block the whole day.
					</p>
					{form.dateOverrides.length === 0 && (
						<p className="text-sm">
							No date overrides. Weekly availability applies every week.
						</p>
					)}
					{form.dateOverrides.map((override, index) => (
						<div
							key={index}
							className="min-w-0 space-y-3 rounded-lg border p-4"
						>
							<div className="flex flex-wrap items-end gap-3">
								<div className="min-w-0 flex-1">
									<Field
										id={`calendar-override-${index}`}
										label="Override date"
									>
										<Input
											id={`calendar-override-${index}`}
											className="min-h-11"
											type="date"
											required
											value={override.date}
											onChange={(e) =>
												setForm({
													...form,
													dateOverrides: form.dateOverrides.map((item, i) =>
														i === index
															? { ...item, date: e.target.value }
															: item,
													),
												})
											}
										/>
									</Field>
								</div>
								<Button
									className="min-h-11"
									type="button"
									variant="ghost"
									aria-label={`Remove date override ${index + 1}`}
									onClick={() =>
										setForm({
											...form,
											dateOverrides: form.dateOverrides.filter(
												(_, i) => i !== index,
											),
										})
									}
								>
									Remove date
								</Button>
							</div>
							{override.intervals.length === 0 && (
								<p className="text-sm text-muted-foreground">
									Unavailable all day.
								</p>
							)}
							{override.intervals.map((interval, intervalIndex) => (
								<div
									key={intervalIndex}
									className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
								>
									<IntervalFields
										label={`Override ${index + 1} window ${intervalIndex + 1}`}
										value={interval}
										onChange={(value) =>
											setForm({
												...form,
												dateOverrides: form.dateOverrides.map((item, i) =>
													i === index
														? {
																...item,
																intervals: item.intervals.map((entry, j) =>
																	j === intervalIndex ? value : entry,
																),
															}
														: item,
												),
											})
										}
									/>
									<Button
										className="min-h-11"
										type="button"
										variant="ghost"
										aria-label={`Remove override ${index + 1} window ${intervalIndex + 1}`}
										onClick={() =>
											setForm({
												...form,
												dateOverrides: form.dateOverrides.map((item, i) =>
													i === index
														? {
																...item,
																intervals: item.intervals.filter(
																	(_, j) => j !== intervalIndex,
																),
															}
														: item,
												),
											})
										}
									>
										Remove window
									</Button>
								</div>
							))}
							<Button
								className="min-h-11"
								type="button"
								variant="outline"
								onClick={() =>
									setForm({
										...form,
										dateOverrides: form.dateOverrides.map((item, i) =>
											i === index
												? {
														...item,
														intervals: [
															...item.intervals,
															{ start: "09:00", end: "17:00" },
														],
													}
												: item,
										),
									})
								}
							>
								Add override window
							</Button>
						</div>
					))}
					<Button
						className="min-h-11"
						type="button"
						variant="outline"
						onClick={() =>
							setForm({
								...form,
								dateOverrides: [
									...form.dateOverrides,
									{ date: "", intervals: [] },
								],
							})
						}
					>
						Add date override
					</Button>
				</fieldset>
				<fieldset disabled={pending} className="min-w-0 space-y-4">
					<legend className="text-xl font-semibold">Booking limits</legend>
					<p className="text-sm text-muted-foreground">
						{teamBooking
							? "Limits apply per assigned host in that host's timezone. Leave a limit empty for no limit."
							: "Leave a limit empty for no limit."}
					</p>
					<div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{(
							[
								["perHour", "Max bookings per hour"],
								["perDay", "Max bookings per day"],
								["perWeek", "Max bookings per week"],
								["total", "Max bookings total"],
							] as const
						).map(([key, label]) => (
							<Field key={key} id={`calendar-limit-${key}`} label={label}>
								<Input
									id={`calendar-limit-${key}`}
									className="min-h-11"
									type="number"
									min={1}
									max={1000000}
									step={1}
									value={form.limits[key] ?? ""}
									onChange={(e) =>
										setForm({
											...form,
											limits: {
												...form.limits,
												[key]: e.target.value
													? Number(e.target.value)
													: undefined,
											},
										})
									}
								/>
							</Field>
						))}
					</div>
				</fieldset>
				{error && (
					<p role="alert" className="text-destructive">
						{error}
					</p>
				)}
				<Button className="min-h-11" type="submit" disabled={pending}>
					{pending
						? "Saving event type…"
						: id
							? "Save event type"
							: "Create event type"}
				</Button>
			</form>
		</CalendarPage>
	);
}
