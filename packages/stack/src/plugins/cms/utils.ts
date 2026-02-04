import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import slug from "slug";

export function slugify(text: string, locale: string = "en"): string {
	return slug(text, { lower: true, locale });
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
