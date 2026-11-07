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
