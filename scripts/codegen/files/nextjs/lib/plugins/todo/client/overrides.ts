import type { ComponentType, ReactNode } from "react";

/**
 * Overridable components and functions for the Todos plugin
 *
 * External consumers can provide their own implementations of these
 * to customize the behavior for their framework (Next.js, React Router, etc.)
 */
export interface TodosPluginOverrides {
	/**
	 * Link component for navigation
	 * Must accept href and children props at minimum
	 */
	Link: ComponentType<{
		href: string;
		children: ReactNode;
		className?: string;
	}>;

	/**
	 * Optional: Navigation function for programmatic navigation
	 * Useful for redirects after actions
	 */
	navigate?: (path: string) => void | Promise<void>;
}
