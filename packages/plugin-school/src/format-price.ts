/** Format integer minor currency units using en-US currency formatting. */
export function formatSchoolPrice(course: { price: number; currency: string }) {
	if (course.price === 0) return "Free";
	const formatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: course.currency,
	});
	return formatter.format(
		course.price / 10 ** formatter.resolvedOptions().maximumFractionDigits!,
	);
}
