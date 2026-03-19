import { useState } from "react";
import { useRegisterAsset } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Loader2, Check } from "lucide-react";

export function UrlTab({
	folderId,
	onRegistered,
}: {
	folderId: string | null;
	onRegistered: (asset: SerializedAsset) => void;
}) {
	const [url, setUrl] = useState("");
	const [error, setError] = useState<string | null>(null);
	const { mutateAsync: registerAsset, isPending } = useRegisterAsset();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		const trimmed = url.trim();
		if (!trimmed) return;
		try {
			const filename = trimmed.split("/").pop() ?? "asset";
			const asset = await registerAsset({
				url: trimmed,
				filename,
				folderId: folderId ?? undefined,
			});
			setUrl("");
			onRegistered(asset);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to register URL");
		}
	};

	return (
		<div className="flex h-full flex-col gap-3 pt-2">
			<p className="text-sm text-muted-foreground">
				Paste a public URL to register it as an asset without uploading a file.
			</p>
			<form onSubmit={handleSubmit} className="flex flex-col gap-2">
				<div className="flex gap-2">
					<Input
						type="url"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com/image.png"
						className="flex-1"
						data-testid="media-url-input"
						autoFocus
					/>
					<Button type="submit" size="sm" disabled={isPending || !url.trim()}>
						{isPending ? (
							<Loader2 className="mr-1 size-4 animate-spin" />
						) : (
							<Check className="mr-1 size-4" />
						)}
						Use URL
					</Button>
				</div>
				{error && <p className="text-sm text-destructive">{error}</p>}
			</form>
		</div>
	);
}
