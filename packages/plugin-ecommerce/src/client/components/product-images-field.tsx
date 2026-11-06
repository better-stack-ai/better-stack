"use client";
import { lazy, Suspense, useId, useState } from "react";
import { useStack } from "@btst/stack/context";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { FormItem } from "@workspace/ui/components/form";
import { Label } from "@workspace/ui/components/label";
import { useFormContext, useFormState } from "react-hook-form";
import type { AutoFormInputComponentProps } from "@workspace/ui/components/auto-form/types";

const MediaPicker = lazy(() =>
	import("@btst/plugin-media/client/components").then((module) => ({
		default: module.MediaPicker,
	})),
);

/** CMS fieldComponents["ecommerce-images"] supports optional Media Library selection and ordering. */
export function ProductImagesField({
	field,
	label,
	isRequired,
}: AutoFormInputComponentProps) {
	const { plugins } = useStack();
	const inputId = useId();
	const { getFieldState } = useFormContext();
	const formState = useFormState({ name: field.name });
	const fieldError = getFieldState(field.name, formState).error;
	const [url, setUrl] = useState("");
	const [error, setError] = useState("");
	const images: string[] = Array.isArray(field.value) ? field.value : [];
	const disabled = Boolean(field.disabled);
	const add = (values: string[]) => {
		field.onChange([...new Set([...images, ...values])].slice(0, 20));
		field.onBlur();
	};
	return (
		<FormItem>
			<Label
				htmlFor={inputId}
				data-slot="form-label"
				data-error={!!fieldError}
				className="data-[error=true]:text-destructive"
			>
				{label}
				{isRequired ? " *" : ""}
			</Label>
			<div className="space-y-3">
				<ol className="space-y-2">
					{images.map((image, index) => (
						<li
							key={`${image}:${index}`}
							className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
						>
							<span className="min-w-0 flex-1 break-all">
								{index + 1}. {image}
							</span>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={disabled || index === 0}
								aria-label={`Move image ${index + 1} earlier`}
								onClick={() => {
									const next = [...images];
									[next[index - 1], next[index]] = [
										next[index]!,
										next[index - 1]!,
									];
									field.onChange(next);
								}}
							>
								Move up
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={disabled || index === images.length - 1}
								aria-label={`Move image ${index + 1} later`}
								onClick={() => {
									const next = [...images];
									[next[index], next[index + 1]] = [
										next[index + 1]!,
										next[index]!,
									];
									field.onChange(next);
								}}
							>
								Move down
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								disabled={disabled}
								aria-label={`Remove image ${index + 1}`}
								onClick={() =>
									field.onChange(
										images.filter((_, position) => position !== index),
									)
								}
							>
								Remove
							</Button>
						</li>
					))}
				</ol>
				{plugins?.media ? (
					<Suspense
						fallback={
							<p className="text-sm text-muted-foreground">
								Loading media picker…
							</p>
						}
					>
						<MediaPicker
							multiple
							accept={["image/*"]}
							trigger={
								<Button
									variant="outline"
									type="button"
									disabled={disabled || images.length >= 20}
								>
									Browse product images
								</Button>
							}
							onSelect={(assets) => add(assets.map((asset) => asset.id))}
						/>
					</Suspense>
				) : null}
				<div className="flex gap-2">
					<Input
						id={inputId}
						aria-label="Product image URL"
						aria-invalid={!!fieldError || !!error}
						aria-describedby={
							[
								fieldError?.message ? `${inputId}-field-error` : "",
								error ? `${inputId}-url-error` : "",
							]
								.filter(Boolean)
								.join(" ") || undefined
						}
						type="url"
						placeholder="https://example.com/product.jpg"
						value={url}
						disabled={disabled || images.length >= 20}
						onChange={(event) => setUrl(event.target.value)}
					/>
					<Button
						type="button"
						variant="outline"
						disabled={disabled || !url.trim() || images.length >= 20}
						onClick={() => {
							try {
								const parsed = new URL(url);
								if (!["http:", "https:"].includes(parsed.protocol))
									throw new Error();
								add([parsed.href]);
								setUrl("");
								setError("");
							} catch {
								setError("Enter an http or https image URL.");
							}
						}}
					>
						Add URL
					</Button>
				</div>
				{error ? (
					<p
						id={`${inputId}-url-error`}
						role="alert"
						className="text-sm text-destructive"
					>
						{error}
					</p>
				) : null}
				<p className="text-xs text-muted-foreground">
					The first image is the product cover. Add up to 20 images.
				</p>
			</div>
			{fieldError?.message ? (
				<p
					id={`${inputId}-field-error`}
					role="alert"
					data-slot="form-message"
					className="text-destructive text-sm"
				>
					{fieldError.message}
				</p>
			) : null}
		</FormItem>
	);
}
