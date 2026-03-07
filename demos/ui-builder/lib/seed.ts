import { UI_BUILDER_TYPE_SLUG } from "@btst/stack/plugins/ui-builder";

const initialVariables = [
	{
		id: "userName",
		name: "User Name",
		type: "string",
		defaultValue: "Alex",
	},
	{
		id: "getStartedFn",
		name: "Get Started Action",
		type: "function",
		defaultValue: "showWelcomeToast",
	},
];

const initialLayers = [
	{
		id: "page-root",
		type: "div",
		name: "Page",
		props: {
			className:
				"min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-8",
		},
		children: [
			{
				id: "welcome-card",
				type: "Card",
				name: "Welcome Card",
				props: {
					className: "w-full max-w-md shadow-xl",
				},
				children: [
					{
						id: "card-header",
						type: "CardHeader",
						name: "Card Header",
						props: {
							className: "flex flex-row items-center gap-4 pb-2",
						},
						children: [
							{
								id: "avatar",
								type: "div",
								name: "Avatar",
								props: {
									className:
										"h-16 w-16 rounded-full border-2 border-primary bg-primary flex items-center justify-center shrink-0",
								},
								children: [
									{
										id: "avatar-initial",
										type: "span",
										name: "Initial",
										props: {
											className: "text-xl font-bold text-primary-foreground",
										},
										children: "A",
									},
								],
							},
							{
								id: "header-text",
								type: "div",
								name: "Header Text",
								props: {
									className: "flex flex-col gap-1",
								},
								children: [
									{
										id: "greeting",
										type: "CardTitle",
										name: "Greeting",
										props: {
											className: "text-2xl",
										},
										children: [
											{
												id: "greeting-text",
												type: "span",
												name: "Greeting Text",
												props: {},
												children: "Hello, ",
											},
											{
												id: "user-name",
												type: "span",
												name: "User Name",
												props: {
													className: "text-primary",
												},
												children: { __variableRef: "userName" },
											},
											{
												id: "greeting-emoji",
												type: "span",
												name: "Emoji",
												props: {},
												children: " 👋",
											},
										],
									},
									{
										id: "role-badge",
										type: "Badge",
										name: "Role Badge",
										props: {
											variant: "secondary",
											className: "w-fit",
										},
										children: "Developer",
									},
								],
							},
						],
					},
					{
						id: "card-content",
						type: "CardContent",
						name: "Card Content",
						props: {},
						children: [
							{
								id: "welcome-text",
								type: "CardDescription",
								name: "Welcome Message",
								props: {
									className: "text-base leading-relaxed",
								},
								children:
									"Welcome to UI Builder! This card demonstrates variable binding and interactive functions.",
							},
						],
					},
					{
						id: "card-footer",
						type: "CardFooter",
						name: "Card Footer",
						props: {
							className: "flex gap-3",
						},
						children: [
							{
								id: "get-started-btn",
								type: "Button",
								name: "Get Started Button",
								props: {
									className: "flex-1",
									onClick: { __variableRef: "getStartedFn" },
								},
								children: [
									{
										id: "btn-text",
										type: "span",
										name: "Button Text",
										props: {},
										children: "Get Started",
									},
								],
							},
							{
								id: "learn-more-btn",
								type: "Button",
								name: "Learn More Button",
								props: {
									variant: "outline",
									className: "flex-1",
								},
								children: [
									{
										id: "learn-more-text",
										type: "span",
										name: "Button Text",
										props: {},
										children: "Learn More",
									},
								],
							},
						],
					},
				],
			},
		],
	},
];

export async function seedUIBuilderData(api: any) {
	try {
		// This also calls ensureSynced internally
		const existing = await api.cms.getAllContentItems(UI_BUILDER_TYPE_SLUG, {
			limit: 1,
		});
		if (existing.items && existing.items.length > 0) return;

		await api.cms.createContentItem(UI_BUILDER_TYPE_SLUG, {
			slug: "welcome",
			data: {
				layers: JSON.stringify(initialLayers),
				variables: JSON.stringify(initialVariables),
				status: "published",
			},
		});

		console.log("[demo] UI Builder seed complete — 1 sample page created");
	} catch (err) {
		console.error("[demo] UI Builder seed failed:", err);
	}
}
