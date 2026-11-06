"use client";

import { FileText } from "lucide-react";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import { usePluginOverrides } from "@btst/stack/context";
import type { CMSPluginOverrides } from "../../overrides";
import { CMS_PLUGIN_ID } from "../../constants";
import type { SerializedContentType } from "../../../types";
import { cn } from "../../../utils";

/** Display data and navigation supplied by the CMS dashboard. */
export interface ContentTypeCardProps {
	contentType: SerializedContentType & { itemCount: number };
	itemCountLabel: string;
	onOpen: () => void;
	className?: string;
	titleClassName?: string;
}

export function ContentTypeCard({
	page,
	...props
}: ContentTypeCardProps & { page?: "dashboard" }) {
	if (!page) return <DefaultContentTypeCard {...props} />;
	return <ScopedContentTypeCard page={page} {...props} />;
}

function ScopedContentTypeCard({
	page,
	...props
}: ContentTypeCardProps & { page: "dashboard" }) {
	const { pageOverrides } =
		usePluginOverrides<CMSPluginOverrides>(CMS_PLUGIN_ID);
	const TypeCard =
		(page ? pageOverrides?.[page]?.ContentTypeCard : undefined) ??
		DefaultContentTypeCard;
	return <TypeCard {...props} />;
}

function DefaultContentTypeCard({
	contentType,
	itemCountLabel,
	onOpen,
	className,
	titleClassName,
}: ContentTypeCardProps) {
	return (
		<Card
			className={cn(
				"hover:border-primary/50 transition-colors cursor-pointer",
				className,
			)}
			onClick={onOpen}
		>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className={cn("text-lg font-medium", titleClassName)}>
					{contentType.name}
				</CardTitle>
				<FileText className="h-5 w-5 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold">{contentType.itemCount}</div>
				<p className="text-xs text-muted-foreground">{itemCountLabel}</p>
				{contentType.description && (
					<p className="text-sm text-muted-foreground mt-2 line-clamp-2">
						{contentType.description}
					</p>
				)}
			</CardContent>
		</Card>
	);
}
