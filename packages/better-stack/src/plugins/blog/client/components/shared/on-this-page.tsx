"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { cn, slugify } from "../../../utils";
import { usePluginOverrides } from "@btst/stack/context";
import type { BlogPluginOverrides } from "../../overrides";
import { BLOG_LOCALIZATION } from "../../localization";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import { TextAlignStart } from "lucide-react";

interface Heading {
	id: string;
	text: string;
	level: number;
}

interface OnThisPageProps {
	markdown: string;
	className?: string;
}

export function OnThisPage({ markdown, className }: OnThisPageProps) {
	const { localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});
	const headings = useMemo(() => extractHeadings(markdown), [markdown]);
	const activeId = useActiveHeading(headings);

	if (headings.length === 0) {
		// placeholder if no headings are found
		return (
			<div
				className={cn(
					"sticky top-20 z-30 ml-auto hidden xl:flex w-44",
					className,
				)}
			/>
		);
	}

	const handleClick = (id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};

	return (
		<nav
			className={cn(
				"sticky top-20 z-30 ml-auto hidden xl:flex w-44 flex-col gap-2 overflow-hidden pb-8",
				className,
			)}
			aria-label="Table of contents"
		>
			<div className="overflow-y-auto px-2">
				<div className="flex flex-col gap-1 p-4 pt-0 text-sm">
					<p className="flex items-center gap-2 font-semibold text-muted-foreground sticky top-0 h-6 text-xs">
						<TextAlignStart className="w-3 h-3" />{" "}
						{localization.BLOG_POST_ON_THIS_PAGE}
					</p>
					{headings.map(({ id, text, level }) => {
						const paddingLeft =
							level === 1
								? "0"
								: level === 2
									? "0.5rem"
									: level === 3
										? "1rem"
										: level === 4
											? "1.5rem"
											: level === 5
												? "2rem"
												: level === 6
													? "2.5rem"
													: "0";
						return (
							<a
								key={id}
								href={`#${id}`}
								onClick={(e) => {
									e.preventDefault();
									handleClick(id);
								}}
								style={{ paddingLeft }}
								className={cn(
									"text-muted-foreground hover:text-foreground text-[0.8rem] no-underline transition-colors",
									activeId === id && "text-foreground",
								)}
								data-active={activeId === id}
								data-depth={level}
							>
								{text}
							</a>
						);
					})}
				</div>
			</div>
		</nav>
	);
}

export function OnThisPageSelect({ markdown, className }: OnThisPageProps) {
	const { localization } = usePluginOverrides<
		BlogPluginOverrides,
		Partial<BlogPluginOverrides>
	>("blog", {
		localization: BLOG_LOCALIZATION,
	});
	const headings = useMemo(() => extractHeadings(markdown), [markdown]);
	const initialValue = useMemo(() => headings[0]?.id ?? "", [headings]);
	const activeId = useActiveHeading(headings);

	// Use activeId as the value, fallback to initialValue if activeId is empty
	const value = activeId || initialValue;

	if (headings.length === 0) {
		return null;
	}

	const handleValueChange = (id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	};

	return (
		<div
			className={cn(
				"sticky z-30 w-full self-stretch xl:hidden bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60",
				className,
			)}
			style={{
				top: "var(--navbar-height, 16px)",
			}}
		>
			<Select value={value} onValueChange={handleValueChange}>
				<SelectTrigger className="w-full">
					<SelectValue placeholder={localization.BLOG_POST_ON_THIS_PAGE} />
				</SelectTrigger>
				<SelectContent>
					{headings.map(({ id, text, level }) => {
						const indent = level > 1 ? `${(level - 1) * 0.5}rem` : "0";
						return (
							<SelectItem key={id} value={id}>
								<span style={{ paddingLeft: indent }}>{text}</span>
							</SelectItem>
						);
					})}
				</SelectContent>
			</Select>
		</div>
	);
}

function extractHeadings(markdown: string): Heading[] {
	const headings: Heading[] = [];
	const lines = markdown.split("\n");

	for (const line of lines) {
		// Match ATX-style headings (# Heading)
		const match = line.match(/^(#{1,6})\s+(.+)$/);
		if (match) {
			const level = match[1]?.length ?? 0;
			const text = match[2]?.trim() ?? "";
			// Remove any trailing #s or special chars
			const cleanText = text.replace(/\s*#+\s*$/, "").trim();
			// Generate ID using the same slugify utility as the markdown renderer
			const id = slugify(cleanText);

			if (id && cleanText) {
				headings.push({ id, text: cleanText, level });
			}
		}
	}

	return headings;
}

function useActiveHeading(
	headings: Heading[],
	onActiveChange?: (id: string) => void,
): string {
	const [activeId, setActiveId] = useState<string>("");
	const onActiveChangeRef = useRef(onActiveChange);

	// Keep the ref in sync with the callback
	useEffect(() => {
		onActiveChangeRef.current = onActiveChange;
	}, [onActiveChange]);

	useEffect(() => {
		if (headings.length === 0) return;

		const observer = new IntersectionObserver(
			(entries) => {
				// Find the first heading that's in view
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActiveId(entry.target.id);
						onActiveChangeRef.current?.(entry.target.id);
						break;
					}
				}
			},
			{
				rootMargin: "-80px 0px -80% 0px",
				threshold: 0,
			},
		);

		// Observe all heading elements
		headings.forEach(({ id }) => {
			const element = document.getElementById(id);
			if (element) {
				observer.observe(element);
			}
		});

		return () => {
			observer.disconnect();
		};
	}, [headings]);

	return activeId;
}
