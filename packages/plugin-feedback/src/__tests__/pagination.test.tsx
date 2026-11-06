// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Pagination } from "../client/components/shared";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

it("pages linked requests without submitting a filled release form", async () => {
	const submit = vi.fn();
	function ReleaseForm() {
		const [offset, setOffset] = useState(0);
		return (
			<form
				onSubmit={(event) => {
					event.preventDefault();
					submit();
				}}
			>
				<input name="title" required defaultValue="Reporting release" />
				<textarea
					name="body"
					required
					defaultValue="Saved views now support CSV exports."
				/>
				<Pagination offset={offset} total={50} onChange={setOffset} />
				<button type="submit">Publish release</button>
			</form>
		);
	}
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	try {
		await act(async () => root.render(<ReleaseForm />));
		const button = (label: string) =>
			[...host.querySelectorAll("button")].find(
				(element) => element.textContent === label,
			)!;
		await act(async () => button("Next page").click());
		expect(host.textContent).toContain("26–50 of 50");
		expect(submit).not.toHaveBeenCalled();
		await act(async () => button("Previous page").click());
		expect(host.textContent).toContain("1–25 of 50");
		expect(submit).not.toHaveBeenCalled();
		await act(async () => button("Publish release").click());
		expect(submit).toHaveBeenCalledTimes(1);
	} finally {
		await act(async () => root.unmount());
		host.remove();
	}
});
