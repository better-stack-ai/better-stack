"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export interface WhenVisibleProps {
	/** Content to render once the element scrolls into view */
	children: ReactNode;
	/** Optional placeholder rendered before the element enters the viewport */
	fallback?: ReactNode;
	/** IntersectionObserver threshold (0–1). Defaults to 0 (any pixel visible). */
	threshold?: number;
	/** Root margin passed to IntersectionObserver. Defaults to "200px" to preload slightly early. */
	rootMargin?: string;
	/** Additional className applied to the sentinel wrapper div */
	className?: string;
}

/**
 * Lazy-mounts children only when the sentinel element scrolls into the viewport.
 * Once mounted, children remain mounted even if the element scrolls out of view.
 *
 * Use this to defer expensive renders (comment threads, carousels, etc.) until
 * the user actually scrolls to that section.
 */
export function WhenVisible({
	children,
	fallback = null,
	threshold = 0,
	rootMargin = "200px",
	className,
}: WhenVisibleProps) {
	const [isVisible, setIsVisible] = useState(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;

		// If IntersectionObserver is not available (SSR/old browsers), show immediately
		if (typeof IntersectionObserver === "undefined") {
			setIsVisible(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];
				if (entry?.isIntersecting) {
					setIsVisible(true);
					observer.disconnect();
				}
			},
			{ threshold, rootMargin },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, [threshold, rootMargin]);

	return (
		<div ref={sentinelRef} className={className}>
			{isVisible ? children : fallback}
		</div>
	);
}
