import { tool } from "ai";
import type { Tool } from "ai";
import { z } from "zod";

/**
 * Built-in client-side-only tool schemas for route-aware AI context.
 *
 * These tools have no `execute` function — they are handled on the client side
 * via the onToolCall handler in ChatInterface, which dispatches to handlers
 * registered by pages via useRegisterPageAIContext.
 *
 * Consumers can add their own tool schemas via clientToolSchemas in AiChatBackendConfig.
 * The server merges built-ins + consumer schemas and filters by the availableTools
 * list sent with each request.
 */
export const BUILT_IN_PAGE_TOOL_SCHEMAS: Record<string, Tool> = {
	/**
	 * Fill in the blog post editor form fields.
	 * Registered by blog new/edit page via useRegisterPageAIContext.
	 */
	fillBlogForm: tool({
		description:
			"Fill in the blog post editor form fields. Call this when the user asks to write, draft, or populate a blog post. You can fill any combination of title, content, excerpt, and tags.",
		inputSchema: z.object({
			title: z.string().optional().describe("The post title"),
			content: z
				.string()
				.optional()
				.describe(
					"Full markdown content for the post body. Use proper markdown formatting with headings, lists, etc.",
				),
			excerpt: z
				.string()
				.optional()
				.describe("A short summary/excerpt of the post (1-2 sentences)"),
			tags: z
				.array(z.string())
				.optional()
				.describe("Array of tag names to apply to the post"),
		}),
	}),

	/**
	 * Replace the UI builder page layers with new ones.
	 * Registered by the UI builder edit page via useRegisterPageAIContext.
	 */
	updatePageLayers: tool({
		description: `Replace the UI builder page component layers. Call this when the user asks to change, add, redesign, or update the page layout and components.

Rules:
- Provide the COMPLETE layer tree, not a partial diff. The entire tree will replace the current layers.
- Only use component types that appear in the "Available Component Types" list in the page context.
- Every layer must have a unique \`id\` string (e.g. "hero-section", "card-title-1").
- The \`type\` field must exactly match a name from the component registry (e.g. "div", "Button", "Card", "Flexbox").
- The \`name\` field is the human-readable label shown in the layers panel.
- \`props\` contains component-specific props (className uses Tailwind classes).
- \`children\` is either an array of child ComponentLayer objects, or a plain string for text content.
- Use \`Flexbox\` or \`Grid\` for layout instead of raw div flex/grid when possible.
- Preserve any layers the user has not asked to change — read the current layers from the page context first.
- ALWAYS use shadcn/ui semantic color tokens in className (e.g. bg-background, bg-card, bg-primary, text-foreground, text-muted-foreground, text-primary-foreground, border-border) instead of hardcoded Tailwind colors like bg-white, bg-gray-*, text-black, etc. This ensures the UI automatically adapts to light and dark themes.`,
		inputSchema: z.object({
			layers: z
				.array(
					z.object({
						id: z.string().describe("Unique identifier for this layer"),
						type: z
							.string()
							.describe(
								"Component type — must match a key in the component registry (e.g. 'div', 'Button', 'Card', 'Flexbox')",
							),
						name: z
							.string()
							.describe(
								"Human-readable display name shown in the layers panel",
							),
						props: z
							.record(z.string(), z.any())
							.describe(
								"Component props object. Use Tailwind classes for className. See the component registry for valid props per type.",
							),
						children: z
							.any()
							.optional()
							.describe(
								"Child layers (array of ComponentLayer) or plain text string",
							),
					}),
				)
				.describe(
					"Complete replacement layer tree. Must include ALL layers for the page, not just changed ones.",
				),
		}),
	}),
};
