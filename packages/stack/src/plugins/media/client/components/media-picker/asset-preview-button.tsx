"use client";

import { useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import { Eye, X } from "lucide-react";
import type { SerializedAsset } from "../../../types";

export function AssetPreviewButton({
	asset,
	className,
}: {
	asset: SerializedAsset;
	className: string;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				title="Preview"
				aria-label={`Preview ${asset.originalName}`}
				onClick={(event) => {
					event.stopPropagation();
					setOpen(true);
				}}
				className={className}
			>
				<Eye className="size-3" />
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					showCloseButton={false}
					className="h-screen w-screen max-w-none border-0 bg-black/95 p-4 shadow-none sm:max-w-none sm:rounded-none sm:p-6"
				>
					<DialogHeader className="sr-only">
						<DialogTitle>{asset.alt || asset.originalName}</DialogTitle>
					</DialogHeader>

					<DialogClose
						className="absolute right-4 top-4 z-10 rounded bg-black/60 p-2 text-white transition hover:bg-black/80"
						aria-label="Close preview"
					>
						<X className="size-4" />
					</DialogClose>

					<div className="h-full w-full overflow-auto">
						<div className="flex min-h-full w-full items-start justify-center">
							<img
								src={asset.url}
								alt={asset.alt || asset.originalName}
								className="block h-auto w-auto max-w-none"
							/>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
