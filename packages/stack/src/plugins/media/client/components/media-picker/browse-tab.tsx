import { useState, useRef } from "react";
import { useAssets } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Loader2, Search, X, Image } from "lucide-react";
import { AssetCard } from "./asset-card";
import { matchesAccept } from "./utils";

export function BrowseTab({
	folderId,
	selected = [],
	accept,
	onToggle,
	onDelete,
	apiBaseURL,
	emptyMessage = "No files found",
}: {
	folderId: string | null;
	selected?: SerializedAsset[];
	accept?: string[];
	onToggle?: (asset: SerializedAsset) => void;
	onDelete?: (id: string) => void | Promise<void>;
	apiBaseURL?: string;
	emptyMessage?: string;
}) {
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const selectable = typeof onToggle === "function";

	const handleSearch = (v: string) => {
		setSearch(v);
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300);
	};

	const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
		useAssets({
			folderId: folderId ?? undefined,
			query: debouncedSearch || undefined,
			limit: 40,
		});

	const allAssets = data?.pages.flatMap((p) => p.items) ?? [];
	const filtered = accept
		? allAssets.filter((a) => matchesAccept(a.mimeType, accept))
		: allAssets;

	return (
		<div className="flex h-full min-h-0 flex-col gap-2">
			<div className="relative">
				<Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
				<Input
					value={search}
					onChange={(e) => handleSearch(e.target.value)}
					placeholder="Search files…"
					className="h-8 pl-7 text-sm"
				/>
				{search && (
					<button
						type="button"
						onClick={() => {
							setSearch("");
							setDebouncedSearch("");
						}}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					>
						<X className="size-3.5" />
					</button>
				)}
			</div>

			{isLoading ? (
				<div className="flex flex-1 items-center justify-center">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			) : filtered.length === 0 ? (
				<div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
					<Image className="size-8" />
					<p>{emptyMessage}</p>
				</div>
			) : (
				<div className="flex-1 overflow-y-auto overscroll-contain">
					<div className="grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{filtered.map((asset) => (
							<AssetCard
								key={asset.id}
								asset={asset}
								selected={selected.some((s) => s.id === asset.id)}
								onToggle={selectable ? () => onToggle(asset) : undefined}
								onDelete={onDelete}
								apiBaseURL={apiBaseURL}
							/>
						))}
					</div>
					{hasNextPage && (
						<div className="flex justify-center py-2">
							<Button
								variant="ghost"
								size="sm"
								onClick={() => fetchNextPage()}
								disabled={isFetchingNextPage}
							>
								{isFetchingNextPage ? (
									<Loader2 className="mr-1 size-3 animate-spin" />
								) : null}
								Load more
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
