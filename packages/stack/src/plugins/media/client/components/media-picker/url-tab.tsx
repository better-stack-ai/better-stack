import { useState } from "react";
import { useRegisterAssetForm } from "../../hooks/use-media";
import type { SerializedAsset } from "../../../types";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import { Loader2, Check } from "lucide-react";
import { useCan, useTranslate } from "@btst/stack/context";

export function UrlTab({
	folderId,
	onRegistered,
}: {
	folderId: string | null;
	onRegistered: (asset: SerializedAsset) => void;
}) {
	const t = useTranslate();
	const { can: canCreate } = useCan({
		resource: "media:asset",
		action: "create",
	});
	const [url, setUrl] = useState("");
	const form = useRegisterAssetForm({
		folderId: folderId ?? undefined,
		onSuccess: onRegistered,
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!canCreate) return;
		form.clearErrors();
		const trimmed = url.trim();
		if (!trimmed) return;
		const asset = await form.submit({ url: trimmed });
		if (asset) {
			setUrl("");
		}
	};

	if (!canCreate) return null;

	const urlError = form.fieldErrors.url;

	return (
		<div className="flex h-full flex-col gap-3 pt-2">
			<p className="text-sm text-muted-foreground">
				{t(
					"media.url.description",
					"Paste a public URL to register it as an asset without uploading a file.",
				)}
			</p>
			<form onSubmit={handleSubmit} className="flex flex-col gap-2">
				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						type="text"
						inputMode="url"
						autoCapitalize="none"
						autoCorrect="off"
						value={url}
						onChange={(e) => {
							setUrl(e.target.value);
							form.clearErrors();
						}}
						placeholder="https://example.com/image.png"
						className="flex-1"
						data-testid="media-url-input"
						autoFocus
					/>
					<Button
						type="submit"
						size="sm"
						disabled={form.isSubmitting || !url.trim()}
						className="w-full sm:w-auto"
					>
						{form.isSubmitting ? (
							<Loader2 className="mr-1 size-4 animate-spin" />
						) : (
							<Check className="mr-1 size-4" />
						)}
						{t("media.url.use", "Use URL")}
					</Button>
				</div>
				{urlError ? (
					<p className="text-sm text-destructive">{String(urlError)}</p>
				) : null}
			</form>
		</div>
	);
}
