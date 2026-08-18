import { Button } from "@workspace/ui/components/button";
import {
	FormControl,
	FormDescription,
	FormItem,
	FormLabel,
	FormMessage,
} from "@workspace/ui/components/form";
import { Input } from "@workspace/ui/components/input";
import {
	useNotify,
	usePluginOverrides,
	useTranslate,
} from "@btst/stack/context";
import { Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { BlogPluginOverrides } from "../../overrides";

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
	const notify = useNotify();
	const t = useTranslate();

	const {
		uploadImage,
		Image,
		localization,
		imageInputField: ImageInput,
	} = usePluginOverrides<BlogPluginOverrides>("blog");

	const ImageComponent = Image ? Image : DefaultImage;

	const label = (
		<FormLabel>
			{localization?.BLOG_FORMS_FEATURED_IMAGE_LABEL ??
				t("blog.forms.featuredImageLabel", "Image")}
			{isRequired && (
				<span className="text-destructive">
					{" "}
					{localization?.BLOG_FORMS_FEATURED_IMAGE_REQUIRED_ASTERISK ??
						t("blog.forms.featuredImageRequiredAsterisk", " *")}
				</span>
			)}
		</FormLabel>
	);

	// When a custom imageInput component is provided via overrides, delegate to it.
	if (ImageInput) {
		return (
			<FormItem className="flex flex-col">
				{label}
				<FormControl>
					<ImageInput
						value={value || ""}
						onChange={onChange}
						isRequired={isRequired}
					/>
				</FormControl>
				<FormDescription />
				<FormMessage />
			</FormItem>
		);
	}

	const handleImageUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		if (!file.type.startsWith("image/")) {
			notify.error(
				localization?.BLOG_FORMS_FEATURED_IMAGE_ERROR_NOT_IMAGE ??
					t(
						"blog.forms.featuredImageErrorNotImage",
						"Please select an image file",
					),
			);
			return;
		}

		if (file.size > 4 * 1024 * 1024) {
			notify.error(
				localization?.BLOG_FORMS_FEATURED_IMAGE_ERROR_TOO_LARGE ??
					t(
						"blog.forms.featuredImageErrorTooLarge",
						"Image size must be less than 4MB",
					),
			);
			return;
		}

		try {
			setIsUploading(true);
			setFeaturedImageUploading(true);
			const url = await uploadImage(file);
			onChange(url);
			notify.success(
				localization?.BLOG_FORMS_FEATURED_IMAGE_TOAST_SUCCESS ??
					t(
						"blog.forms.featuredImageToastSuccess",
						"Image uploaded successfully",
					),
			);
		} catch (error) {
			console.error("Failed to upload image:", error);
			notify.error(
				localization?.BLOG_FORMS_FEATURED_IMAGE_TOAST_FAILURE ??
					t("blog.forms.featuredImageToastFailure", "Failed to upload image"),
			);
		} finally {
			setIsUploading(false);
			setFeaturedImageUploading(false);
		}
	};

	return (
		<FormItem className="flex flex-col">
			{label}
			<FormControl>
				<div className="space-y-2">
					<div className="flex gap-2">
						<Input
							placeholder={
								localization?.BLOG_FORMS_FEATURED_IMAGE_INPUT_PLACEHOLDER ??
								t(
									"blog.forms.featuredImageInputPlaceholder",
									"Image URL or upload below...",
								)
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
									{localization?.BLOG_FORMS_FEATURED_IMAGE_UPLOADING_BUTTON ??
										t(
											"blog.forms.featuredImageUploadingButton",
											"Uploading...",
										)}
								</>
							) : (
								<>
									<Upload className="mr-2 h-4 w-4" />
									{localization?.BLOG_FORMS_FEATURED_IMAGE_UPLOAD_BUTTON ??
										t("blog.forms.featuredImageUploadButton", "Upload")}
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
							{localization?.BLOG_FORMS_FEATURED_IMAGE_UPLOADING_TEXT ??
								t(
									"blog.forms.featuredImageUploadingText",
									"Uploading image...",
								)}
						</div>
					)}
					{value && !isUploading && (
						<div className="relative">
							<ImageComponent
								src={value}
								alt={
									localization?.BLOG_FORMS_FEATURED_IMAGE_PREVIEW_ALT ??
									t(
										"blog.forms.featuredImagePreviewAlt",
										"Featured image preview",
									)
								}
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
