import { describe, expect, it } from "vitest";
import { calculateSlaDeadline, createSlaPolicy } from "../api/sla";
import type { HelpdeskBusinessCalendar } from "../types";

const weekdays: HelpdeskBusinessCalendar = {
	timeZone: "America/New_York",
	workingIntervals: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
		dayOfWeek: dayOfWeek as 1 | 2 | 3 | 4 | 5,
		start: "09:00",
		end: "17:00",
	})),
	holidays: [],
};

describe("business-hours SLA deadlines", () => {
	it("skips weekends, holidays and time outside working hours across a timezone boundary", () => {
		const calendar = { ...weekdays, holidays: ["2026-03-09"] };
		expect(
			calculateSlaDeadline(
				new Date("2026-03-06T21:30:00Z"),
				60,
				calendar,
			).toISOString(),
		).toBe("2026-03-10T13:30:00.000Z");
		expect(
			calculateSlaDeadline(
				new Date("2026-03-07T03:00:00Z"),
				30,
				calendar,
			).toISOString(),
		).toBe("2026-03-10T13:30:00.000Z");
	});
	it.each([
		["2026-03-08T05:00:00Z", 180, "2026-03-08T08:00:00.000Z"],
		["2026-11-01T04:00:00Z", 300, "2026-11-01T09:00:00.000Z"],
	])(
		"counts real working minutes across a daylight-saving transition from %s",
		(start, minutes, due) => {
			const calendar: HelpdeskBusinessCalendar = {
				timeZone: "America/New_York",
				workingIntervals: [{ dayOfWeek: 0, start: "00:00", end: "04:00" }],
			};
			expect(
				calculateSlaDeadline(new Date(start), minutes, calendar).toISOString(),
			).toBe(due);
		},
	);
	it("counts repeated intervals twice and nonexistent intervals zero times", () => {
		const calendar: HelpdeskBusinessCalendar = {
			timeZone: "America/New_York",
			workingIntervals: [{ dayOfWeek: 0, start: "01:30", end: "01:45" }],
		};
		expect(
			calculateSlaDeadline(
				new Date("2026-11-01T04:00:00Z"),
				30,
				calendar,
			).toISOString(),
		).toBe("2026-11-01T06:45:00.000Z");
		calendar.workingIntervals = [
			{ dayOfWeek: 0, start: "02:15", end: "02:30" },
		];
		expect(
			calculateSlaDeadline(
				new Date("2026-03-08T05:00:00Z"),
				15,
				calendar,
			).toISOString(),
		).toBe("2026-03-15T06:30:00.000Z");
	});
	it("handles non-hour daylight-saving shifts and fractional minutes", () => {
		const calendar: HelpdeskBusinessCalendar = {
			timeZone: "Australia/Lord_Howe",
			workingIntervals: [{ dayOfWeek: 0, start: "01:00", end: "04:00" }],
		};
		expect(
			calculateSlaDeadline(
				new Date("2026-10-03T14:30:00Z"),
				150,
				calendar,
			).toISOString(),
		).toBe("2026-10-03T17:00:00.000Z");
		expect(
			calculateSlaDeadline(
				new Date("2026-03-10T13:00:00.250Z"),
				0.5,
				weekdays,
			).toISOString(),
		).toBe("2026-03-10T13:00:30.250Z");
	});
	it("uses exact elapsed minutes without a calendar", () => {
		expect(
			calculateSlaDeadline(new Date("2026-03-07T03:00:00Z"), 30).toISOString(),
		).toBe("2026-03-07T03:30:00.000Z");
	});
	it("finishes the largest normal target and rejects an exhausted sparse calendar", () => {
		const start = new Date("2026-01-01T00:00:00Z");
		const due = calculateSlaDeadline(start, 5_256_000, weekdays);
		expect(due.getUTCFullYear()).toBeGreaterThan(2060);
		expect(due.getUTCFullYear()).toBeLessThan(2126);
		expect(() =>
			calculateSlaDeadline(start, 5_256_000, {
				timeZone: "UTC",
				workingIntervals: [{ dayOfWeek: 1, start: "09:00", end: "09:01" }],
			}),
		).toThrow("100 years");
	});
});

describe("SLA policy validation", () => {
	it.each([
		{ timeZone: "Invalid/Zone", workingIntervals: weekdays.workingIntervals },
		{ ...weekdays, workingIntervals: [] },
		{
			...weekdays,
			workingIntervals: [{ dayOfWeek: 7, start: "09:00", end: "17:00" }],
		},
		{
			...weekdays,
			workingIntervals: [{ dayOfWeek: 1, start: "17:00", end: "09:00" }],
		},
		{
			...weekdays,
			workingIntervals: [{ dayOfWeek: 1, start: "24:00", end: "24:00" }],
		},
		{
			...weekdays,
			workingIntervals: [{ dayOfWeek: 1, start: "09:60", end: "17:00" }],
		},
		{
			...weekdays,
			workingIntervals: [
				weekdays.workingIntervals[0],
				weekdays.workingIntervals[0],
			],
		},
		{ ...weekdays, holidays: ["2026-02-30"] },
		{ ...weekdays, holidays: ["2026-01-01", "2026-01-01"] },
	])("rejects invalid calendar %j", (businessCalendar) => {
		expect(() =>
			createSlaPolicy({
				businessCalendar: businessCalendar as HelpdeskBusinessCalendar,
			}),
		).toThrow();
	});
	it("validates resolution targets and snapshots mutable application configuration", () => {
		for (const urgent of [0, -1, Number.POSITIVE_INFINITY, 5_256_001]) {
			expect(() =>
				createSlaPolicy({ resolutionTargets: { urgent } }),
			).toThrow();
		}
		const businessCalendar = structuredClone(weekdays);
		const options = {
			businessCalendar,
			slaTargets: { urgent: 10 },
			resolutionTargets: { urgent: 60 },
		};
		const policy = createSlaPolicy(options);
		businessCalendar.workingIntervals[0]!.start = "12:00";
		options.slaTargets.urgent = 99;
		options.resolutionTargets.urgent = 99;
		expect(policy.responseTargets.urgent).toBe(10);
		expect(policy.resolutionTargets?.urgent).toBe(60);
		expect(policy.businessCalendar?.workingIntervals[0]?.start).toBe("09:00");
	});
});
