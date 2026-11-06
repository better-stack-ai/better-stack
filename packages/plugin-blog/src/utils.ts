import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import slug from "slug";

export function slugify(text: string, locale: string = "en"): string {
	return slug(text, { lower: true, locale });
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Simple, dependency-free throttle with cancel/flush helpers
// Behavior: leading and trailing enabled by default
export function throttle<Args extends unknown[]>(
	callback: (...args: Args) => void,
	waitMs: number,
) {
	let timerId: ReturnType<typeof setTimeout> | null = null;
	let lastInvokeTime = 0;
	let trailingArgs: Args | null = null;

	const invoke = (args: Args) => {
		lastInvokeTime = Date.now();
		callback(...args);
	};

	const throttled = (...args: Args) => {
		const now = Date.now();
		const remaining = waitMs - (now - lastInvokeTime);

		// Leading edge
		if (lastInvokeTime === 0) {
			invoke(args);
			return;
		}

		if (remaining <= 0 || remaining > waitMs) {
			if (timerId) {
				clearTimeout(timerId);
				timerId = null;
			}
			invoke(args);
		} else {
			// Schedule trailing edge
			trailingArgs = args;
			if (!timerId) {
				timerId = setTimeout(() => {
					timerId = null;
					if (trailingArgs) {
						invoke(trailingArgs);
						trailingArgs = null;
					}
				}, remaining);
			}
		}
	};

	throttled.cancel = () => {
		if (timerId) {
			clearTimeout(timerId);
			timerId = null;
		}
		trailingArgs = null;
		lastInvokeTime = 0;
	};

	throttled.flush = () => {
		if (timerId && trailingArgs) {
			clearTimeout(timerId);
			timerId = null;
			invoke(trailingArgs);
			trailingArgs = null;
		}
	};

	return throttled as ((...args: Args) => void) & {
		cancel: () => void;
		flush: () => void;
	};
}

export function stripHtml(html: string): string {
	// Remove HTML tags
	let text = html.replace(/<[^>]*>/g, "");

	// Decode common HTML entities
	text = text
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, "/")
		.replace(/&nbsp;/g, " ")
		.replace(/&hellip;/g, "...");

	// Clean up extra whitespace and newlines
	return text.replace(/\s+/g, " ").trim();
}

export function stripMarkdown(markdown: string): string {
	let text = markdown;

	// Remove headers (# ## ### etc.)
	text = text.replace(/^#{1,6}\s+/gm, "");

	// Remove bold and italic (**text**, *text*, __text__, _text_)
	text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
	text = text.replace(/\*([^*]+)\*/g, "$1");
	text = text.replace(/__([^_]+)__/g, "$1");
	text = text.replace(/_([^_]+)_/g, "$1");

	// Remove strikethrough (~~text~~)
	text = text.replace(/~~([^~]+)~~/g, "$1");

	// Remove inline code (`code`)
	text = text.replace(/`([^`]+)`/g, "$1");

	// Remove code blocks (```code```)
	text = text.replace(/```[\s\S]*?```/g, "");

	// Remove links [text](url) -> text
	text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

	// Remove images ![alt](url)
	text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

	// Remove blockquotes (> text)
	text = text.replace(/^>\s+/gm, "");

	// Remove horizontal rules (--- or ***)
	text = text.replace(/^[-*]{3,}$/gm, "");

	// Remove list markers (- * + and numbered lists)
	text = text.replace(/^[\s]*[-*+]\s+/gm, "");
	text = text.replace(/^[\s]*\d+\.\s+/gm, "");

	// Clean up extra whitespace and newlines
	return text
		.replace(/\n\s*\n/g, "\n")
		.replace(/\s+/g, " ")
		.trim();
}
