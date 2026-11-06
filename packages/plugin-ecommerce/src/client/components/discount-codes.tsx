"use client";
import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
	useCreateDiscountCode,
	useDeleteDiscountCode,
	useDiscountCodes,
} from "../hooks/use-orders";
import { ErrorMessage } from "./storefront";

export function DiscountCodes() {
	const [offset, setOffset] = useState(0);
	const codes = useDiscountCodes({ limit: 25, offset });
	const create = useCreateDiscountCode();
	const remove = useDeleteDiscountCode();
	const [code, setCode] = useState("");
	const [type, setType] = useState<"percent" | "fixed">("percent");
	const [value, setValue] = useState("10");
	const [maxUses, setMaxUses] = useState("");
	const [expiresAt, setExpiresAt] = useState("");
	const [notice, setNotice] = useState("");
	const busy = create.isPending || remove.isPending;
	return (
		<section className="space-y-6" aria-label="Discount Codes">
			<div>
				<h1 className="text-3xl font-semibold tracking-tight">
					Discount Codes
				</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Fixed discounts use integer currency minor units. Usage includes
					pending orders.
				</p>
			</div>
			<form
				className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-3"
				onSubmit={async (event) => {
					event.preventDefault();
					if (busy) return;
					setNotice("");
					try {
						await create.mutateAsync({
							code,
							type,
							value: Number(value),
							...(maxUses ? { maxUses: Number(maxUses) } : {}),
							...(expiresAt
								? { expiresAt: new Date(expiresAt).toISOString() }
								: {}),
						});
						setCode("");
						setOffset(0);
						setNotice("Discount code created.");
					} catch {
						/* Mutation error is rendered below. */
					}
				}}
			>
				<label className="text-sm">
					Code
					<Input
						className="mt-2"
						value={code}
						maxLength={100}
						required
						disabled={busy}
						onChange={(event) => setCode(event.target.value)}
					/>
				</label>
				<label className="text-sm">
					Discount type
					<select
						className="mt-2 h-9 w-full rounded-md border bg-background px-3"
						value={type}
						disabled={busy}
						onChange={(event) =>
							setType(event.target.value as "percent" | "fixed")
						}
					>
						<option value="percent">Percent</option>
						<option value="fixed">Fixed amount</option>
					</select>
				</label>
				<label className="text-sm">
					{type === "percent" ? "Percentage" : "Amount (minor units)"}
					<Input
						className="mt-2"
						type="number"
						min={0}
						max={type === "percent" ? 100 : 100_000_000}
						step={1}
						value={value}
						required
						disabled={busy}
						onChange={(event) => setValue(event.target.value)}
					/>
				</label>
				<label className="text-sm">
					Maximum uses (optional)
					<Input
						className="mt-2"
						type="number"
						min={1}
						step={1}
						value={maxUses}
						disabled={busy}
						onChange={(event) => setMaxUses(event.target.value)}
					/>
				</label>
				<label className="text-sm">
					Expires at (optional)
					<Input
						className="mt-2"
						type="datetime-local"
						value={expiresAt}
						disabled={busy}
						onChange={(event) => setExpiresAt(event.target.value)}
					/>
				</label>
				<Button type="submit" disabled={busy}>
					{create.isPending ? "Creating…" : "Create discount code"}
				</Button>
			</form>
			<ErrorMessage error={codes.error ?? create.error ?? remove.error} />
			{notice ? (
				<p role="status" className="text-sm">
					{notice}
				</p>
			) : null}
			{codes.isPending ? (
				<p role="status">Loading discount codes…</p>
			) : !codes.data?.items.length ? (
				<p className="py-8 text-muted-foreground">No discount codes yet.</p>
			) : (
				<div className="overflow-x-auto">
					<table className="w-full text-left text-sm">
						<caption className="sr-only">
							Discount codes and usage counts
						</caption>
						<thead className="border-b text-muted-foreground">
							<tr>
								{["Code", "Discount", "Uses", "Expires", "Actions"].map(
									(label) => (
										<th
											key={label}
											scope="col"
											className="py-3 pr-4 font-medium"
										>
											{label}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody className="divide-y">
							{codes.data.items.map((item) => (
								<tr key={item.id}>
									<td className="py-4 pr-4 font-medium">{item.code}</td>
									<td className="py-4 pr-4">
										{item.type === "percent"
											? `${item.value}%`
											: `${item.value} minor units`}
									</td>
									<td className="py-4 pr-4">
										{item.uses} / {item.maxUses ?? "Unlimited"}
									</td>
									<td className="whitespace-nowrap py-4 pr-4">
										{item.expiresAt
											? new Date(item.expiresAt).toLocaleString()
											: "No expiry"}
									</td>
									<td className="py-4">
										<Button
											variant="outline"
											disabled={busy}
											aria-label={`Delete ${item.code}`}
											onClick={async () => {
												if (
													!window.confirm(
														`Delete discount code ${item.code}? Existing order amounts will be kept.`,
													)
												)
													return;
												setNotice("");
												try {
													await remove.mutateAsync(item.id);
													if (codes.data.items.length === 1 && offset > 0)
														setOffset(offset - 25);
													setNotice("Discount code deleted.");
												} catch {
													/* Mutation error is rendered above. */
												}
											}}
										>
											Delete
										</Button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			{codes.data && codes.data.total > 25 ? (
				<nav aria-label="Discount code pages" className="flex justify-between">
					<Button
						variant="outline"
						disabled={offset === 0}
						onClick={() => setOffset(Math.max(0, offset - 25))}
					>
						Previous
					</Button>
					<Button
						variant="outline"
						disabled={offset + 25 >= codes.data.total}
						onClick={() => setOffset(offset + 25)}
					>
						Next
					</Button>
				</nav>
			) : null}
		</section>
	);
}
