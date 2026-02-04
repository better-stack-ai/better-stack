import { Button } from "@workspace/ui/components/button";
import {
	FormControl,
	FormDescription,
	FormItem,
	FormLabel,
	FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import { usePluginOverrides } from "@btst/stack/context";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_LOCALIZATION } from "../../localization";

export function FeaturedImageField({
	isRequired,
	value,
	onChange,
	setFeaturedImageUploading,
}: {
	isRequired?: boolean;
	value?: string;
	onChange: (value: string) => void;
	setFeaturedImageUploading: (uploading: boolean) => void;
}) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isUploading, setIsUploading] = useState(false);

	const { uploadImage, Image, localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", { localization: BLOG_LOCALIZATION });

	const ImageComponent = Image ? Image : DefaultImage;

	const handleImageUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith("image/")) {
			toast.error(localization.BLOG_FORMS_FEATURED_IMAGE_ERROR_NOT_IMAGE);
			return;
		}

		if (file.size > 4 * 1024 * 1024) {
			toast.error(localization.BLOG_FORMS_FEATURED_IMAGE_ERROR_TOO_LARGE);
			return;
		}

		try {
			setIsUploading(true);
			setFeaturedImageUploading(true);
			const url = await uploadImage(file);
			onChange(url);
			toast.success(localization.BLOG_FORMS_FEATURED_IMAGE_TOAST_SUCCESS);
		} catch (error) {
			toast.error(localization.BLOG_FORMS_FEATURED_IMAGE_TOAST_FAILURE);
			console.error("Failed to upload image:", error);
			toast.error(localization.BLOG_FORMS_FEATURED_IMAGE_TOAST_FAILURE);
		} finally {
			setIsUploading(false);
			setFeaturedImageUploading(false);
		}
	};

	return (
		<FormItem className="flex flex-col">
			<FormLabel>
				{localization.BLOG_FORMS_FEATURED_IMAGE_LABEL}
				{isRequired && (
					<span className="text-destructive">
						{" "}
						{localization.BLOG_FORMS_FEATURED_IMAGE_REQUIRED_ASTERISK}
					</span>
				)}
			</FormLabel>
			<FormControl>
				<div className="space-y-2">
					<div className="flex gap-2">
						<Input
							placeholder={
								localization.BLOG_FORMS_FEATURED_IMAGE_INPUT_PLACEHOLDER
							}
							value={value || ""}
							onChange={(e) => onChange(e.target.value)}
							disabled={isUploading}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={() => fileInputRef.current?.click()}
							disabled={isUploading}
						>
							{isUploading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{localization.BLOG_FORMS_FEATURED_IMAGE_UPLOADING_BUTTON}
								</>
							) : (
								<>
									<Upload className="mr-2 h-4 w-4" />
									{localization.BLOG_FORMS_FEATURED_IMAGE_UPLOAD_BUTTON}
								</>
							)}
						</Button>
					</div>
					<input
						ref={fileInputRef}
						type="file"
						accept="image/*"
						onChange={handleImageUpload}
						className="hidden"
					/>
					{isUploading && (
						<div className="flex items-center gap-2 text-muted-foreground text-sm">
							<Loader2 className="h-4 w-4 animate-spin" />
							{localization.BLOG_FORMS_FEATURED_IMAGE_UPLOADING_TEXT}
						</div>
					)}
					{value && !isUploading && (
						<div className="relative">
							<ImageComponent
								src={value}
								alt={localization.BLOG_FORMS_FEATURED_IMAGE_PREVIEW_ALT}
								className="h-auto w-full max-w-xs rounded-md border"
								width={400}
								height={400}
							/>
						</div>
					)}
				</div>
			</FormControl>
			<FormDescription />
			<FormMessage />
		</FormItem>
	);
}

function DefaultImage({
	src,
	alt,
	className,
	width,
	height,
}: {
	src: string;
	alt: string;
	className?: string;
	width?: number;
	height?: number;
}) {
	return (
		<img
			src={src}
			alt={alt}
			className={className}
			width={width}
			height={height}
		/>
	);
}
