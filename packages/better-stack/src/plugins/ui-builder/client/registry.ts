"use client";

import { z } from "zod";
import type {
	ComponentRegistry,
	ComponentLayer,
} from "@workspace/ui/components/ui-builder/types";

// Import shadcn/ui components
import { Button } from "@workspace/ui/components/button";
import { Badge } from "@workspace/ui/components/badge";
import {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
} from "@workspace/ui/components/accordion";
import {
	Card,
	CardHeader,
	CardFooter,
	CardTitle,
	CardDescription,
	CardContent,
} from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";

// Import UI builder helper components
import { Flexbox } from "@workspace/ui/components/ui-builder/components/flexbox";
import { Grid } from "@workspace/ui/components/ui-builder/components/grid";
import { CodePanel } from "@workspace/ui/components/ui-builder/components/code-panel";
import { Markdown } from "@workspace/ui/components/ui-builder/components/markdown";
import {
	Icon,
	iconNames,
} from "@workspace/ui/components/ui-builder/components/icon";

// Import field override helpers for props panel
import {
	classNameFieldOverrides,
	childrenFieldOverrides,
	iconNameFieldOverrides,
	commonFieldOverrides,
	childrenAsTipTapFieldOverrides,
	childrenAsTextareaFieldOverrides,
} from "@workspace/ui/lib/ui-builder/registry/form-field-overrides";

/**
 * Primitive HTML component definitions
 * These are simple HTML elements that can be used in the UI builder
 */
export const primitiveComponentDefinitions: ComponentRegistry = {
	a: {
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
			href: z.string().optional(),
			target: z
				.enum(["_blank", "_self", "_parent", "_top"])
				.optional()
				.default("_self"),
			rel: z.enum(["noopener", "noreferrer", "nofollow"]).optional(),
			title: z.string().optional(),
			download: z.boolean().optional().default(false),
		}),
		fieldOverrides: commonFieldOverrides(),
	},
	img: {
		schema: z.object({
			className: z.string().optional(),
			src: z.string().default("https://placehold.co/200"),
			alt: z.string().optional(),
			width: z.coerce.number().optional(),
			height: z.coerce.number().optional(),
		}),
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
		},
	},
	div: {
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		fieldOverrides: commonFieldOverrides(),
	},
	iframe: {
		schema: z.object({
			className: z.string().optional(),
			src: z
				.string()
				.default(
					"https://www.youtube.com/embed/dQw4w9WgXcQ?si=oc74qTYUBuCsOJwL",
				),
			title: z.string().optional(),
			width: z.coerce.number().optional(),
			height: z.coerce.number().optional(),
			frameBorder: z.number().optional(),
			allowFullScreen: z.boolean().optional(),
			allow: z.string().optional(),
			referrerPolicy: z
				.enum([
					"no-referrer",
					"no-referrer-when-downgrade",
					"origin",
					"origin-when-cross-origin",
					"same-origin",
					"strict-origin",
					"strict-origin-when-cross-origin",
					"unsafe-url",
				])
				.optional(),
		}),
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
		},
	},
	span: {
		schema: z.object({
			className: z.string().optional(),
			children: z.string().optional(),
		}),
		defaultChildren: "Text",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			children: (layer) => childrenAsTextareaFieldOverrides(layer),
		},
	},
	h1: {
		schema: z.object({
			className: z.string().optional(),
			children: z.string().optional(),
		}),
		defaultChildren: "Heading 1",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			children: (layer) => childrenAsTextareaFieldOverrides(layer),
		},
	},
	h2: {
		schema: z.object({
			className: z.string().optional(),
			children: z.string().optional(),
		}),
		defaultChildren: "Heading 2",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			children: (layer) => childrenAsTextareaFieldOverrides(layer),
		},
	},
	h3: {
		schema: z.object({
			className: z.string().optional(),
			children: z.string().optional(),
		}),
		defaultChildren: "Heading 3",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			children: (layer) => childrenAsTextareaFieldOverrides(layer),
		},
	},
	p: {
		schema: z.object({
			className: z.string().optional(),
			children: z.string().optional(),
		}),
		defaultChildren: "Paragraph",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			children: (layer) => childrenAsTextareaFieldOverrides(layer),
		},
	},
};

/**
 * Complex component definitions (shadcn/ui and custom components)
 * These components have React implementations and more complex schemas
 */
export const complexComponentDefinitions: ComponentRegistry = {
	Button: {
		component: Button,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
			asChild: z.boolean().optional(),
			variant: z
				.enum([
					"default",
					"destructive",
					"outline",
					"secondary",
					"ghost",
					"link",
				])
				.default("default"),
			size: z.enum(["default", "sm", "lg", "icon"]).default("default"),
		}),
		from: "@/components/ui/button",
		defaultChildren: [
			{
				id: "button-text",
				type: "span",
				name: "span",
				props: {},
				children: "Button",
			} satisfies ComponentLayer,
		],
		fieldOverrides: commonFieldOverrides(),
	},
	Badge: {
		component: Badge,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
			variant: z
				.enum(["default", "secondary", "destructive", "outline"])
				.default("default"),
		}),
		from: "@/components/ui/badge",
		defaultChildren: [
			{
				id: "badge-text",
				type: "span",
				name: "span",
				props: {},
				children: "Badge",
			} satisfies ComponentLayer,
		],
		fieldOverrides: commonFieldOverrides(),
	},
	Flexbox: {
		component: Flexbox,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
			direction: z
				.enum(["row", "column", "rowReverse", "columnReverse"])
				.default("row"),
			justify: z
				.enum(["start", "end", "center", "between", "around", "evenly"])
				.default("start"),
			align: z
				.enum(["start", "end", "center", "baseline", "stretch"])
				.default("start"),
			wrap: z.enum(["wrap", "nowrap", "wrapReverse"]).default("nowrap"),
			gap: z
				.preprocess(
					(val) => (typeof val === "number" ? String(val) : val),
					z.enum(["0", "1", "2", "4", "8"]).default("1"),
				)
				.transform(Number),
		}),
		from: "@/components/ui/ui-builder/flexbox",
		fieldOverrides: commonFieldOverrides(),
	},
	Grid: {
		component: Grid,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
			columns: z
				.enum(["auto", "1", "2", "3", "4", "5", "6", "7", "8"])
				.default("1"),
			autoRows: z.enum(["none", "min", "max", "fr"]).default("none"),
			justify: z
				.enum(["start", "end", "center", "between", "around", "evenly"])
				.default("start"),
			align: z
				.enum(["start", "end", "center", "baseline", "stretch"])
				.default("start"),
			templateRows: z
				.enum(["none", "1", "2", "3", "4", "5", "6"])
				.default("none")
				.transform((val) => (val === "none" ? val : Number(val))),
			gap: z
				.preprocess(
					(val) => (typeof val === "number" ? String(val) : val),
					z.enum(["0", "1", "2", "4", "8"]).default("0"),
				)
				.transform(Number),
		}),
		from: "@/components/ui/ui-builder/grid",
		fieldOverrides: commonFieldOverrides(),
	},
	CodePanel: {
		component: CodePanel,
		schema: z.object({
			className: z.string().optional(),
		}),
		from: "@/components/ui/ui-builder/code-panel",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
		},
	},
	Markdown: {
		component: Markdown,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/ui-builder/markdown",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			children: (layer) => childrenAsTipTapFieldOverrides(layer),
		},
	},
	Icon: {
		component: Icon,
		schema: z.object({
			className: z.string().optional(),
			iconName: z
				.enum([...iconNames] as [string, ...string[]])
				.default("Image"),
			size: z.enum(["small", "medium", "large"]).default("medium"),
			color: z
				.enum([
					"accent",
					"accentForeground",
					"primary",
					"primaryForeground",
					"secondary",
					"secondaryForeground",
					"destructive",
					"destructiveForeground",
					"muted",
					"mutedForeground",
					"background",
					"foreground",
				])
				.optional(),
			rotate: z.enum(["none", "90", "180", "270"]).default("none"),
		}),
		from: "@/components/ui/ui-builder/icon",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			iconName: (layer) => iconNameFieldOverrides(layer),
		},
	},
	Accordion: {
		component: Accordion,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
			type: z.enum(["single", "multiple"]).default("single"),
			collapsible: z.boolean().optional(),
		}),
		from: "@/components/ui/accordion",
		defaultChildren: [
			{
				id: "acc-item-1",
				type: "AccordionItem",
				name: "AccordionItem",
				props: { value: "item-1" },
				children: [
					{
						id: "acc-trigger-1",
						type: "AccordionTrigger",
						name: "AccordionTrigger",
						props: {},
						children: [
							{
								id: "acc-trigger-text",
								type: "span",
								name: "span",
								props: {},
								children: "Accordion Item #1",
							},
						],
					},
					{
						id: "acc-content-1",
						type: "AccordionContent",
						name: "AccordionContent",
						props: {},
						children: [
							{
								id: "acc-content-text",
								type: "span",
								name: "span",
								props: {},
								children: "Accordion Content Text",
							},
						],
					},
				],
			},
		] as ComponentLayer[],
		fieldOverrides: commonFieldOverrides(),
	},
	AccordionItem: {
		component: AccordionItem,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
			value: z.string().default("item-1"),
		}),
		from: "@/components/ui/accordion",
		fieldOverrides: commonFieldOverrides(),
	},
	AccordionTrigger: {
		component: AccordionTrigger,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/accordion",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
			children: (layer) => childrenFieldOverrides(layer),
		},
	},
	AccordionContent: {
		component: AccordionContent,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/accordion",
		fieldOverrides: commonFieldOverrides(),
	},
	Card: {
		component: Card,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/card",
		defaultChildren: [
			{
				id: "card-header",
				type: "CardHeader",
				name: "CardHeader",
				props: {},
				children: [
					{
						id: "card-title",
						type: "CardTitle",
						name: "CardTitle",
						props: {},
						children: "Card Title",
					},
					{
						id: "card-description",
						type: "CardDescription",
						name: "CardDescription",
						props: {},
						children: "Card Description",
					},
				],
			},
			{
				id: "card-content",
				type: "CardContent",
				name: "CardContent",
				props: {},
				children: [
					{
						id: "card-content-text",
						type: "span",
						name: "span",
						props: {},
						children: "Card Content Text",
					},
				],
			},
			{
				id: "card-footer",
				type: "CardFooter",
				name: "CardFooter",
				props: {},
				children: [
					{
						id: "card-footer-text",
						type: "span",
						name: "span",
						props: {},
						children: "Card Footer Text",
					},
				],
			},
		] as ComponentLayer[],
		fieldOverrides: commonFieldOverrides(),
	},
	CardHeader: {
		component: CardHeader,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/card",
		fieldOverrides: commonFieldOverrides(),
	},
	CardTitle: {
		component: CardTitle,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/card",
		fieldOverrides: commonFieldOverrides(),
	},
	CardDescription: {
		component: CardDescription,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/card",
		fieldOverrides: commonFieldOverrides(),
	},
	CardContent: {
		component: CardContent,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/card",
		fieldOverrides: commonFieldOverrides(),
	},
	CardFooter: {
		component: CardFooter,
		schema: z.object({
			className: z.string().optional(),
			children: z.any().optional(),
		}),
		from: "@/components/ui/card",
		fieldOverrides: commonFieldOverrides(),
	},
	Separator: {
		component: Separator,
		schema: z.object({
			className: z.string().optional(),
			orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
			decorative: z.boolean().default(true),
		}),
		from: "@/components/ui/separator",
		fieldOverrides: {
			className: (layer) => classNameFieldOverrides(layer),
		},
	},
};

/**
 * Default component registry for the UI Builder
 *
 * Includes:
 * - Primitive HTML elements (div, span, h1-h6, p, a, img, iframe)
 * - Layout components (Flexbox, Grid)
 * - Content components (Markdown, Icon, CodePanel)
 * - shadcn/ui components (Button, Badge, Card, Accordion, Separator)
 *
 * @example
 * ```typescript
 * import { defaultComponentRegistry } from "@btst/stack/plugins/ui-builder/client"
 *
 * // Use as-is
 * uiBuilderClientPlugin({
 *   componentRegistry: defaultComponentRegistry,
 *   // ...
 * })
 *
 * // Or extend with custom components
 * import { createComponentRegistry } from "@btst/stack/plugins/ui-builder/client"
 *
 * const customRegistry = createComponentRegistry({
 *   ...defaultComponentRegistry,
 *   MyComponent: {
 *     component: MyComponent,
 *     schema: myComponentSchema,
 *   },
 * })
 * ```
 */
export const defaultComponentRegistry: ComponentRegistry = {
	...primitiveComponentDefinitions,
	...complexComponentDefinitions,
};

/**
 * Helper to create a custom component registry
 *
 * This is a simple passthrough function that provides type safety
 * when creating or extending component registries.
 *
 * @example
 * ```typescript
 * // Extend the default registry
 * const customRegistry = createComponentRegistry({
 *   ...defaultComponentRegistry,
 *   CustomButton: {
 *     component: CustomButton,
 *     schema: z.object({
 *       label: z.string(),
 *       variant: z.enum(['primary', 'secondary']),
 *     }),
 *   },
 * })
 *
 * // Create a minimal registry
 * const minimalRegistry = createComponentRegistry({
 *   div: primitiveComponentDefinitions.div,
 *   span: primitiveComponentDefinitions.span,
 *   Button: complexComponentDefinitions.Button,
 * })
 * ```
 */
export function createComponentRegistry(
	components: ComponentRegistry,
): ComponentRegistry {
	return components;
}
