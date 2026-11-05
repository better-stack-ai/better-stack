// Public article dates must render identically during SSR and browser hydration.
// Keep the existing English date style, with an explicit publication timezone.
const formatter = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});

export function formatPostDate(date: string) {
	return formatter.format(new Date(date));
}
