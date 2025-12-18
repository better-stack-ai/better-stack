"use client";

import { useState, useCallback, useEffect, type ChangeEvent } from "react";
import { toast } from "sonner";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/ui/auto-form/types";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import {
	FormControl,
	FormItem,
	FormMessage,
} from "@workspace/ui/components/form";
import { Trash2, Loader2 } from "lucide-react";
import AutoFormLabel from "@workspace/ui/components/ui/auto-form/common/label";
import AutoFormTooltip from "@workspace/ui/components/ui/auto-form/common/tooltip";

/**
 * Props for the CMSFileUpload component
 */
export interface CMSFileUploadProps extends AutoFormInputComponentProps {
	/**
	 * Function to upload an image file and return the URL.
	 * This is required - consumers must provide an upload implementation.
	 */
	uploadImage: (file: File) => Promise<string>;
}

/**
 * Default file upload component for CMS image fields.
 *
 * This component:
 * - Accepts image files via file input
 * - Uses the required uploadImage prop to upload and get a URL
 * - Shows a preview of the uploaded image
 * - Allows removing the uploaded image
 *
 * You can use this component directly in your fieldComponents override,
 * or create your own custom component using this as a reference.
 *
 * @example
 * ```tsx
 * // Use the default component with your upload function
 * fieldComponents: {
 *   file: (props) => (
 *     <CMSFileUpload {...props} uploadImage={myUploadFn} />
 *   ),
 * }
 * ```
 */
export function CMSFileUpload({
	label,
	isRequired,
	fieldConfigItem,
	fieldProps,
	field,
	uploadImage,
}: CMSFileUploadProps) {
	// Exclude showLabel and value from props spread
	// File inputs cannot have their value set programmatically (browser security)
	const {
		showLabel: _showLabel,
		value: _value,
		...safeFieldProps
	} = fieldProps;
	const showLabel = _showLabel === undefined ? true : _showLabel;
	const [isUploading, setIsUploading] = useState(false);
	const [previewUrl, setPreviewUrl] = useState<string | null>(
		field.value || null,
	);

	// Sync previewUrl with field.value when it changes (e.g., when editing an existing item)
	// This is necessary because useState only uses the initial value once on mount
	useEffect(() => {
		if (field.value && field.value !== previewUrl) {
			setPreviewUrl(field.value);
		}
	}, [field.value, previewUrl]);

	const handleFileChange = useCallback(
		async (e: ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			// Check if it's an image
			if (!file.type.startsWith("image/")) {
				toast.error("Please select an image file");
				return;
			}

			setIsUploading(true);
			try {
				const url = await uploadImage(file);
				setPreviewUrl(url);
				field.onChange(url);
			} catch (error) {
				console.error("Image upload failed:", error);
				toast.error("Failed to upload image");
			} finally {
				setIsUploading(false);
			}
		},
		[field, uploadImage],
	);

	const handleRemove = useCallback(() => {
		setPreviewUrl(null);
		field.onChange("");
	}, [field]);

	return (
		<FormItem>
			{showLabel && (
				<AutoFormLabel
					label={fieldConfigItem?.label || label}
					isRequired={isRequired}
				/>
			)}
			{!previewUrl && (
				<FormControl>
					<div className="relative">
						<Input
							type="file"
							accept="image/*"
							{...safeFieldProps}
							onChange={handleFileChange}
							disabled={isUploading}
							className="cursor-pointer"
							data-testid="image-upload-input"
						/>
						{isUploading && (
							<div className="absolute inset-0 flex items-center justify-center bg-background/80">
								<Loader2 className="h-4 w-4 animate-spin" />
							</div>
						)}
					</div>
				</FormControl>
			)}
			{previewUrl && (
				<div className="flex items-center gap-2">
					<div className="relative h-20 w-20 overflow-hidden rounded-md border">
						<img
							src={previewUrl}
							alt="Preview"
							className="h-full w-full object-cover"
							data-testid="image-preview"
						/>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleRemove}
						className="flex items-center gap-1"
						data-testid="remove-image-button"
					>
						<Trash2 className="h-4 w-4" />
						Remove
					</Button>
				</div>
			)}
			<AutoFormTooltip fieldConfigItem={fieldConfigItem} />
			<FormMessage />
		</FormItem>
	);
}
