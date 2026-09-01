import { ArrowRight, ExternalLink } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import aiChatProof from "../../assets/product-proof/ai-chat-proof.webp";
import blogProof from "../../assets/product-proof/blog-proof.webp";
import cmsProof from "../../assets/product-proof/cms-proof.webp";
import commentsProof from "../../assets/product-proof/comments-proof.webp";
import formBuilderProof from "../../assets/product-proof/form-builder-proof.webp";
import kanbanProof from "../../assets/product-proof/kanban-proof.webp";
import mediaProof from "../../assets/product-proof/media-proof.webp";
import openApiProof from "../../assets/product-proof/openapi-proof.webp";
import productProofManifest from "../../assets/product-proof/manifest.json";
import routeDocsProof from "../../assets/product-proof/route-docs-proof.webp";
import uiBuilderProof from "../../assets/product-proof/ui-builder-proof.webp";
import { PLUGINS } from "@btst/codegen/meta";

type EvaluatorPluginKey = (typeof PLUGINS)[number]["key"];
type PluginDecisionMeta = NonNullable<
	(typeof PLUGINS)[number]["decision"]
>;
type DecisionActionTarget =
	| "demo"
	| "docs"
	| "installation"
	| "setup"
	| "source"
	| "workflow";

interface WorkflowStepCopy {
	label: string;
	detail: string;
}

interface DecisionActionCopy {
	label: string;
	target: DecisionActionTarget;
}

interface ResolvedDecisionAction extends DecisionActionCopy {
	href: string;
	external: boolean;
}

interface EvaluatorCopy {
	catalogTitle?: string;
	outcome: string;
	audience: string;
	ownership: string;
	workflow: readonly WorkflowStepCopy[];
	catalogAction: DecisionActionCopy;
	actions: readonly [DecisionActionCopy, DecisionActionCopy];
}

const evaluatorCopy = {
	blog: {
		outcome:
			"Publish and manage a content section inside the React application you already run.",
		audience:
			"React teams that need editorial workflows and public, indexable content without adopting a separate hosted CMS.",
		ownership:
			"Posts stay in your database, routes run in your application, and ejected Blog views become editable application code.",
		workflow: [
			{
				label: "Register",
				detail: "Add the Blog backend and client halves to the existing stack.",
			},
			{
				label: "Write",
				detail: "Create and edit drafts with the supplied authoring routes.",
			},
			{
				label: "Store",
				detail:
					"Persist posts and tags through your selected database adapter.",
			},
			{
				label: "Publish",
				detail:
					"Serve the SSR-aware post route with metadata and sitemap output.",
			},
		],
		catalogAction: { label: "Explore Blog", target: "docs" },
		actions: [
			{ label: "View live Blog", target: "demo" },
			{ label: "Install Blog", target: "installation" },
		],
	},
	"ai-chat": {
		outcome:
			"Add a streaming conversation surface while choosing the model, access policy, and operating limits yourself.",
		audience:
			"React teams that already know which AI SDK model provider they want and need chat history, tools, and product UI inside their app.",
		ownership:
			"You select and pay the model provider. Authenticated history stays in your database, and ejected chat pages become editable application code while streaming and data behavior remain packaged.",
		workflow: [
			{
				label: "Choose a model",
				detail:
					"Pass an AI SDK model and keep its credentials in your server environment.",
			},
			{
				label: "Set access",
				detail:
					"Use authenticated persistence with typed rules or choose explicit stateless public mode.",
			},
			{
				label: "Stream",
				detail:
					"Run prompts, tools, and optional attachments through the supplied chat route.",
			},
			{
				label: "Keep context",
				detail:
					"Store identity-scoped conversations in your database when authenticated mode is enabled.",
			},
		],
		catalogAction: { label: "Explore AI Chat", target: "docs" },
		actions: [
			{ label: "View chat shell", target: "demo" },
			{ label: "Install AI Chat", target: "installation" },
		],
	},
	cms: {
		outcome:
			"Define structured content in TypeScript and give operators generated forms for managing it.",
		audience:
			"Teams that want developers to own content models while editors manage records through an in-app admin interface.",
		ownership:
			"Content models live in your code and records stay in your database. You own public rendering and uploads; the packaged admin pages can be overridden or ejected.",
		workflow: [
			{
				label: "Model",
				detail: "Define each content type as a shared Zod schema in your app.",
			},
			{
				label: "Generate forms",
				detail:
					"Turn schema fields and metadata into validated operator-facing forms.",
			},
			{
				label: "Manage",
				detail: "Create and edit typed content records through the admin routes.",
			},
			{
				label: "Render",
				detail:
					"Load records with packaged hooks and present them on application-owned routes.",
			},
		],
		catalogAction: { label: "Explore CMS", target: "docs" },
		actions: [
			{ label: "View CMS workflow", target: "demo" },
			{ label: "Install CMS", target: "installation" },
		],
	},
	"form-builder": {
		outcome:
			"Let operators design forms visually, publish them inside your app, and collect validated submissions.",
		audience:
			"Product teams that need runtime-created forms rather than developer-defined CMS content models.",
		ownership:
			"Form schemas and submissions stay in your database; public rendering, field overrides, hooks, and deployment remain in your application.",
		workflow: [
			{
				label: "Build",
				detail:
					"Arrange fields in the visual editor and check the live preview.",
			},
			{
				label: "Store schema",
				detail: "Save the generated JSON Schema with the form record.",
			},
			{
				label: "Render",
				detail: "Mount FormRenderer on a public route owned by your app.",
			},
			{
				label: "Collect",
				detail:
					"Validate submitted data against the schema and store the record.",
			},
		],
		catalogAction: { label: "Explore Form Builder", target: "docs" },
		actions: [
			{ label: "Understand the workflow", target: "workflow" },
			{ label: "Install Form Builder", target: "installation" },
		],
	},
	"ui-builder": {
		catalogTitle: "UI Builder",
		outcome:
			"Let operators compose pages visually, store the layout through CMS, and render it on routes you own.",
		audience:
			"Teams that already use the BTST CMS plugin and want a constrained visual editor over application-approved components.",
		ownership:
			"The CMS-backed page record stays in your database. You choose the component registry and public route; editor views can be ejected while CMS data behavior remains packaged.",
		workflow: [
			{
				label: "Add CMS",
				detail:
					"Use the required CMS plugin; the CLI adds it automatically when selected.",
			},
			{
				label: "Register components",
				detail:
					"Define the components and blocks an operator is allowed to place.",
			},
			{
				label: "Compose",
				detail: "Arrange layers, variables, and properties in the visual editor.",
			},
			{
				label: "Render",
				detail:
					"Load the CMS record and mount PageRenderer on an application-owned public route.",
			},
		],
		catalogAction: { label: "Explore UI Builder", target: "docs" },
		actions: [
			{ label: "View builder workflow", target: "demo" },
			{ label: "Install UI Builder", target: "installation" },
		],
	},
	kanban: {
		outcome:
			"Add boards, columns, tasks, priorities, and drag-and-drop workflows inside your product.",
		audience:
			"Product teams that need an application-native work board and want to connect it to their own users and authorization rules.",
		ownership:
			"Boards and tasks stay in your database. Your app supplies identity and workflow policy; packaged Kanban pages can be customized or ejected.",
		workflow: [
			{
				label: "Create boards",
				detail: "Use supplied routes and APIs to create a board and its columns.",
			},
			{
				label: "Add work",
				detail: "Create prioritized tasks and connect assignees through your user resolver.",
			},
			{
				label: "Move",
				detail:
					"Reorder columns and drag tasks through isolated database transactions.",
			},
			{
				label: "Enforce policy",
				detail:
					"Apply app-owned authorization rules and domain hooks to every operation.",
			},
		],
		catalogAction: { label: "Explore Kanban", target: "docs" },
		actions: [
			{ label: "View Kanban board", target: "demo" },
			{ label: "Install Kanban", target: "installation" },
		],
	},
	comments: {
		outcome:
			"Attach threaded discussion and moderation to a resource your application already owns.",
		audience:
			"Teams that need comments on posts, tasks, content records, or a custom resource without adopting a hosted discussion service.",
		ownership:
			"Comments and reactions stay in your database. You define resource identity, access rules, and author resolution; the moderation page can be ejected.",
		workflow: [
			{
				label: "Name the resource",
				detail:
					"Mount CommentThread with the resource type and identifier owned by your app.",
			},
			{
				label: "Resolve identity",
				detail:
					"Connect request identity, typed authorization rules, and optional author profiles.",
			},
			{
				label: "Discuss",
				detail: "Create replies and reactions through the supplied typed APIs and UI.",
			},
			{
				label: "Moderate",
				detail:
					"Review pending, approved, and spam comments on the built-in route.",
			},
		],
		catalogAction: { label: "Explore Comments", target: "docs" },
		actions: [
			{ label: "Understand the workflow", target: "workflow" },
			{ label: "Install Comments", target: "installation" },
		],
	},
	media: {
		outcome:
			"Upload, organize, register, and reuse media through a library that runs with your storage.",
		audience:
			"Teams that need a shared media layer for product features while keeping files, metadata, and storage credentials under their control.",
		ownership:
			"Asset metadata stays in your database and files stay in the storage you configure. You own limits, access policy, and embedding; the library view can be ejected.",
		workflow: [
			{
				label: "Choose storage",
				detail:
					"Configure local, S3-compatible, or Vercel Blob storage in your backend.",
			},
			{
				label: "Upload or register",
				detail:
					"Send a file through the matching protocol or register an allowed asset URL.",
			},
			{
				label: "Organize",
				detail: "Search assets, maintain folders, and edit metadata in the library.",
			},
			{
				label: "Reuse",
				detail:
					"Embed MediaPicker or ImageInputField wherever your application needs an asset.",
			},
		],
		catalogAction: { label: "Explore Media", target: "docs" },
		actions: [
			{ label: "Understand the workflow", target: "workflow" },
			{ label: "Install Media", target: "installation" },
		],
	},
	"route-docs": {
		outcome:
			"Generate an explorable reference for the client routes already registered in your BTST stack.",
		audience:
			"Teams that want route paths, parameters, sitemap entries, and navigation context visible inside a development or protected application surface.",
		ownership:
			"The reference is derived from your registered client stack and served by your app. You control which routes exist, who can see the page, and whether to eject its UI.",
		workflow: [
			{
				label: "Register routes",
				detail: "Compose the client plugins whose route definitions should appear.",
			},
			{
				label: "Inspect",
				detail:
					"Read route paths, typed parameters, metadata, and sitemap declarations.",
			},
			{
				label: "Generate",
				detail:
					"Render the route inventory with its owning plugin and dynamic context.",
			},
			{
				label: "Navigate",
				detail:
					"Supply concrete parameters and open a resolved route in your application.",
			},
		],
		catalogAction: { label: "Explore Route Docs", target: "docs" },
		actions: [
			{ label: "Understand the output", target: "workflow" },
			{ label: "Install Route Docs", target: "installation" },
		],
	},
	"open-api": {
		outcome:
			"Expose an OpenAPI 3.1 contract for registered BTST routes and, when useful, an interactive API reference.",
		audience:
			"Backend teams that need machine-readable API documentation without adding a matching BTST client plugin.",
		ownership:
			"The schema stays at your backend base path plus the fixed /open-api/schema suffix. The optional reference defaults to /reference, title and version have defaults, and your deployment and access boundary remain yours.",
		workflow: [
			{
				label: "Register",
				detail:
					"Add the backend-only plugin to the existing BTST backend stack.",
			},
			{
				label: "Inspect",
				detail: "Read registered endpoint metadata and Zod request schemas.",
			},
			{
				label: "Generate 3.1",
				detail: "Serve a deterministic OpenAPI 3.1 document as JSON.",
			},
			{
				label: "Optionally render",
				detail: "Keep JSON only or expose the Scalar reference page.",
			},
		],
		catalogAction: { label: "Explore OpenAPI", target: "docs" },
		actions: [
			{ label: "Inspect the output", target: "workflow" },
			{ label: "Install OpenAPI", target: "installation" },
		],
	},
	"better-auth-ui": {
		catalogTitle: "Better Auth UI",
		outcome:
			"Add auth and account routes to a BTST client stack that already has a Better Auth backend.",
		audience:
			"Teams already operating Better Auth that want its auth and account UI composed into the maintained BTST framework paths.",
		ownership:
			"Your application keeps the Better Auth server, database, providers, secrets, sessions, and deployment. The companion supplies client routes and UI; it does not create or host authentication.",
		workflow: [
			{
				label: "Operate Better Auth",
				detail:
					"Keep the existing server endpoint, schema, providers, secrets, and browser client.",
			},
			{
				label: "Add the companion",
				detail: "Register auth and account client plugins in the BTST client stack.",
			},
			{
				label: "Mount routes",
				detail:
					"Serve sign-in, recovery, account, security, and settings views under your site path.",
			},
			{
				label: "Refresh sessions",
				detail:
					"Use the generated framework-native refresh seam after session changes.",
			},
		],
		catalogAction: { label: "Explore Better Auth UI", target: "docs" },
		actions: [
			{ label: "View companion source", target: "source" },
			{ label: "Install the companion", target: "setup" },
		],
	},
} as const satisfies Record<EvaluatorPluginKey, EvaluatorCopy>;

const evaluatorAssets: Partial<
	Record<EvaluatorPluginKey, { file: string; image: StaticImageData }>
> = {
	blog: { file: "blog-proof.webp", image: blogProof },
	"ai-chat": { file: "ai-chat-proof.webp", image: aiChatProof },
	cms: { file: "cms-proof.webp", image: cmsProof },
	"form-builder": {
		file: "form-builder-proof.webp",
		image: formBuilderProof,
	},
	"ui-builder": { file: "ui-builder-proof.webp", image: uiBuilderProof },
	kanban: { file: "kanban-proof.webp", image: kanbanProof },
	comments: { file: "comments-proof.webp", image: commentsProof },
	media: { file: "media-proof.webp", image: mediaProof },
	"route-docs": { file: "route-docs-proof.webp", image: routeDocsProof },
	"open-api": { file: "openapi-proof.webp", image: openApiProof },
};

function getEvaluatorPlugin(key: EvaluatorPluginKey) {
	const plugin = PLUGINS.find((candidate) => candidate.key === key);
	if (!plugin?.decision) {
		throw new Error(`Missing evaluator metadata for ${key}`);
	}
	const copy: EvaluatorCopy = evaluatorCopy[key];
	return { plugin, decision: plugin.decision, copy };
}

function getProofAsset(key: EvaluatorPluginKey) {
	const asset = evaluatorAssets[key];
	if (!asset) return null;
	const copy = productProofManifest.assets.find(
		(candidate) => candidate.file === asset.file,
	);
	if (!copy) throw new Error(`Missing product-proof manifest entry for ${key}`);
	return { ...asset, alt: copy.alt, caption: copy.caption };
}

function DecisionLink({
	action,
	className,
	children,
}: {
	action: ResolvedDecisionAction;
	className: string;
	children: ReactNode;
}) {
	return action.external ? (
		<a
			href={action.href}
			target="_blank"
			rel="noopener noreferrer"
			className={className}
		>
			{children}
		</a>
	) : (
		<Link href={action.href} className={className}>
			{children}
		</Link>
	);
}

function TopologyBadges({ decision }: { decision: PluginDecisionMeta }) {
	return (
		<div
			className="flex flex-wrap gap-2"
			role="group"
			aria-label="Plugin classification"
		>
			<span className="rounded-full border border-fd-border bg-fd-background px-2.5 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fd-foreground">
				{decision.topology}
			</span>
			{decision.relationship ? (
				<span className="rounded-full border border-fd-border bg-fd-background px-2.5 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fd-foreground">
					{decision.relationship}
				</span>
			) : null}
			<span className="rounded-full border border-fd-border bg-fd-muted px-2.5 py-1 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-fd-muted-foreground">
				Released · {decision.releaseStatus}
			</span>
		</div>
	);
}

function FactBlock({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<div className="border-t border-fd-border p-5 sm:p-6">
			<h3 className="m-0 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fd-muted-foreground">
				{title}
			</h3>
			<div className="mt-3 text-sm leading-6 text-fd-foreground">{children}</div>
		</div>
	);
}

function FactList({ items }: { items: readonly string[] }) {
	return (
		<ul className="m-0 grid list-none gap-2 p-0">
			{items.map((item) => (
				<li key={item} className="flex gap-2">
					<span
						aria-hidden="true"
						className="mt-[0.65rem] size-1.5 shrink-0 rounded-full bg-fd-primary"
					/>
					<span>{item}</span>
				</li>
			))}
		</ul>
	);
}

function WorkflowStrip({
	id,
	steps,
}: {
	id: string;
	steps: readonly WorkflowStepCopy[];
}) {
	return (
		<section
			id={id}
			aria-labelledby={`${id}-title`}
			className="scroll-mt-24 border-t border-fd-border bg-fd-muted/35 p-5 sm:p-6"
		>
			<div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
				<h3 id={`${id}-title`} className="m-0 text-base font-semibold">
					From registration to result
				</h3>
				<p className="m-0 text-xs text-fd-muted-foreground">
					A semantic workflow, not a setup shortcut
				</p>
			</div>
			<ol className="m-0 grid list-none gap-px overflow-hidden rounded-xl border border-fd-border bg-fd-border p-0 sm:grid-cols-2 lg:grid-cols-4">
				{steps.map((step, index) => (
					<li key={step.label} className="bg-fd-background p-4">
						<div className="mb-3 flex items-center gap-2">
							<span className="grid size-6 place-items-center rounded-full bg-fd-primary font-mono text-[0.6875rem] font-bold text-fd-primary-foreground">
								{index + 1}
							</span>
							<span className="text-sm font-semibold">{step.label}</span>
						</div>
						<p className="m-0 text-xs leading-5 text-fd-muted-foreground">
							{step.detail}
						</p>
					</li>
				))}
			</ol>
		</section>
	);
}

function resolveAction(
	key: EvaluatorPluginKey,
	decision: PluginDecisionMeta,
	action: DecisionActionCopy,
): ResolvedDecisionAction {
	switch (action.target) {
		case "demo":
			if (!decision.demoPath) {
				throw new Error(`Missing demo identifier for ${key}`);
			}
			return { ...action, href: decision.demoPath, external: true };
		case "docs":
			return { ...action, href: decision.docsPath, external: false };
		case "installation":
			return { ...action, href: "#installation", external: false };
		case "setup":
			return {
				...action,
				href: "#generate-the-minimal-integration",
				external: false,
			};
		case "source":
			return { ...action, href: decision.sourcePath, external: true };
		case "workflow":
			return { ...action, href: `#${key}-workflow`, external: false };
	}
}

export function PluginEvaluatorHeader({
	pluginKey,
}: {
	pluginKey: EvaluatorPluginKey;
}) {
	const { decision, copy } = getEvaluatorPlugin(pluginKey);
	const proof = getProofAsset(pluginKey);
	const actions = copy.actions.map((action) =>
		resolveAction(pluginKey, decision, action),
	);

	return (
		<section
			aria-labelledby={`${pluginKey}-evaluator-title`}
			className="not-prose my-8 overflow-hidden rounded-2xl border border-fd-border bg-fd-background shadow-sm"
		>
			<div
				className={
					proof
						? "grid lg:grid-cols-[minmax(0,1.05fr)_minmax(19rem,0.95fr)]"
						: "grid"
				}
			>
				<div className="flex flex-col justify-center p-5 sm:p-7 lg:p-8">
					<TopologyBadges decision={decision} />
					<p className="mb-0 mt-6 font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-fd-muted-foreground">
						Best for
					</p>
					<p className="mb-0 mt-2 text-sm leading-6 text-fd-muted-foreground">
						{copy.audience}
					</p>
					<h2
						id={`${pluginKey}-evaluator-title`}
						className="mb-0 mt-5 text-balance text-2xl font-semibold tracking-tight text-fd-foreground sm:text-3xl"
					>
						{copy.outcome}
					</h2>
					<div className="mt-6 flex flex-col gap-3 sm:flex-row">
						{actions.map((action, index) => (
							<DecisionLink
								key={action.href}
								action={action}
								className={
									index === 0
										? "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-fd-primary px-4 py-2 text-sm font-semibold text-fd-primary-foreground outline-none transition-colors hover:bg-fd-primary/90 focus-visible:ring-2 focus-visible:ring-fd-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background"
										: "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-fd-border bg-fd-background px-4 py-2 text-sm font-semibold text-fd-foreground outline-none transition-colors hover:bg-fd-accent focus-visible:ring-2 focus-visible:ring-fd-primary focus-visible:ring-offset-2 focus-visible:ring-offset-fd-background"
								}
							>
								{action.label}
								{action.external ? (
									<ExternalLink aria-hidden="true" className="size-4" />
								) : (
									<ArrowRight aria-hidden="true" className="size-4" />
								)}
							</DecisionLink>
						))}
					</div>
				</div>

				{proof ? (
					<figure className="m-0 border-t border-fd-border bg-fd-muted/35 p-4 lg:border-l lg:border-t-0">
						<Image
							src={proof.image}
							alt={proof.alt}
							className="h-auto w-full rounded-xl border border-fd-border bg-fd-background shadow-sm"
							placeholder="blur"
							priority
							sizes="(max-width: 1024px) 100vw, 42vw"
						/>
						<figcaption className="px-1 pb-1 pt-3 text-xs leading-5 text-fd-muted-foreground">
							{proof.caption}
						</figcaption>
					</figure>
				) : null}
			</div>

			<div className="grid sm:grid-cols-2">
				<FactBlock title="BTST supplies">
					<FactList items={decision.supplies} />
				</FactBlock>
				<FactBlock title="You supply">
					<FactList items={decision.adopterSupplies} />
				</FactBlock>
				<FactBlock title="You own and customize">
					<p className="m-0">{copy.ownership}</p>
				</FactBlock>
				<FactBlock title="Compatibility and dependencies">
					<p className="m-0">
						<span className="font-semibold">Maintained:</span>{" "}
						{decision.supportedFrameworks.join(", ")}.
					</p>
					<p className="mb-0 mt-2">
						<span className="font-semibold">Requires:</span>{" "}
						{decision.dependencies.join("; ")}.
					</p>
					<p className="mb-0 mt-2">
						<span className="font-semibold">External services:</span>{" "}
						{decision.externalServices.length > 0
							? `${decision.externalServices.join("; ")}.`
							: "None required."}
					</p>
				</FactBlock>
			</div>

			<WorkflowStrip id={`${pluginKey}-workflow`} steps={copy.workflow} />
		</section>
	);
}

export function PluginCatalogCard({
	pluginKey,
}: {
	pluginKey: EvaluatorPluginKey;
}) {
	const { plugin, decision, copy } = getEvaluatorPlugin(pluginKey);
	const proof = getProofAsset(pluginKey);
	const catalogAction = resolveAction(
		pluginKey,
		decision,
		copy.catalogAction,
	);

	return (
		<article className="overflow-hidden rounded-2xl border border-fd-border bg-fd-background shadow-sm">
			{proof ? (
				<Image
					src={proof.image}
					alt={proof.alt}
					className="h-auto w-full border-b border-fd-border bg-fd-muted"
					placeholder="blur"
					sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
				/>
			) : null}
			<div className="p-5">
				<TopologyBadges decision={decision} />
				<h3 className="mb-0 mt-4 text-xl font-semibold tracking-tight">
					<Link
						href={decision.docsPath}
						className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-fd-primary"
					>
						{copy.catalogTitle ?? plugin.label}
					</Link>
				</h3>
				<p className="mb-0 mt-2 text-sm leading-6 text-fd-muted-foreground">
					{copy.outcome}
				</p>
				<dl className="mt-4 grid gap-3 border-y border-fd-border py-4 text-xs">
					<div>
						<dt className="font-mono font-semibold uppercase tracking-[0.12em] text-fd-muted-foreground">
							Requires
						</dt>
						<dd className="m-0 mt-1 leading-5 text-fd-foreground">
							{decision.dependencies.join("; ")}
						</dd>
					</div>
					<div>
						<dt className="font-mono font-semibold uppercase tracking-[0.12em] text-fd-muted-foreground">
							Maintained paths
						</dt>
						<dd className="m-0 mt-1 leading-5 text-fd-foreground">
							{decision.supportedFrameworks.join(" · ")}
						</dd>
					</div>
				</dl>
				<DecisionLink
					action={catalogAction}
					className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg font-semibold text-fd-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-fd-primary"
				>
					{catalogAction.label}
					{catalogAction.external ? (
						<ExternalLink aria-hidden="true" className="size-4" />
					) : (
						<ArrowRight aria-hidden="true" className="size-4" />
					)}
				</DecisionLink>
			</div>
		</article>
	);
}
