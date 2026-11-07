"use client";

import { useId } from "react";
import type { SearchResponse } from "../../types";

export function SourceFilter({
	sources,
	value,
	onChange,
}: {
	sources: SearchResponse["sources"];
	value: string;
	onChange: (source: string) => void;
}) {
	const id = useId();
	return (
		<div className="flex flex-wrap items-center gap-3">
			<label htmlFor={id} className="text-sm font-medium">
				Source
			</label>
			<select
				id={id}
				className="min-h-10 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
				value={value}
				onChange={(event) => onChange(event.target.value)}
			>
				<option value="">All sources</option>
				{sources.map((source) => (
					<option key={source.id} value={source.id}>
						{source.label}
					</option>
				))}
			</select>
		</div>
	);
}
