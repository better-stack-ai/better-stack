"use client";
import { usePluginOverrides } from "@btst/stack/context";
import { ECOMMERCE_PLUGIN_ID } from "../constants";
import type { EcommercePluginOverrides } from "../overrides";

export function ProductImage({
	image,
	alt,
	className = "",
	priority = false,
}: {
	image?: string;
	alt: string;
	className?: string;
	priority?: boolean;
}) {
	const { resolveImage } = usePluginOverrides<
		EcommercePluginOverrides,
		Partial<EcommercePluginOverrides>
	>(ECOMMERCE_PLUGIN_ID, {});
	const source = image ? (resolveImage?.(image) ?? image) : undefined;
	const safeSource =
		source && (/^https?:\/\//i.test(source) || /^\/(?!\/)/.test(source))
			? source
			: undefined;
	return safeSource ? (
		<img
			src={safeSource}
			alt={alt}
			loading={priority ? "eager" : "lazy"}
			className={`h-full w-full object-cover ${className}`}
		/>
	) : (
		<div
			className={`flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground ${className}`}
			role="img"
			aria-label={`${alt}: no image`}
		>
			No image
		</div>
	);
}
