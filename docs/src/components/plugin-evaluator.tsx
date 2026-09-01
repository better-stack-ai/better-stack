import { ArrowRight, ExternalLink } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import blogProof from "../../assets/product-proof/blog-proof.webp";
import formBuilderProof from "../../assets/product-proof/form-builder-proof.webp";
import productProofManifest from "../../assets/product-proof/manifest.json";
import openApiProof from "../../assets/product-proof/openapi-proof.webp";
import { PLUGINS } from "@btst/codegen/meta";

type RepresentativePluginKey = "blog" | "form-builder" | "open-api";
type PluginDecisionMeta = NonNullable<
	(typeof PLUGINS)[number]["decision"]
>;
type DecisionActionTarget = "demo" | "docs" | "installation" | "workflow";

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

interface RepresentativeCopy {
	outcome: string;
	audience: string;
	ownership: string;
	workflow: readonly WorkflowStepCopy[];
	catalogAction: DecisionActionCopy;
	actions: readonly [DecisionActionCopy, DecisionActionCopy];
}

const representativeCopy = {
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
} as const satisfies Record<RepresentativePluginKey, RepresentativeCopy>;

const representativeAssets = {
	blog: { file: "blog-proof.webp", image: blogProof },
	"form-builder": {
		file: "form-builder-proof.webp",
		image: formBuilderProof,
	},
	"open-api": { file: "openapi-proof.webp", image: openApiProof },
} as const satisfies Record<
	RepresentativePluginKey,
	{ file: string; image: StaticImageData }
>;

function getRepresentativePlugin(key: RepresentativePluginKey) {
	const plugin = PLUGINS.find((candidate) => candidate.key === key);
	if (!plugin?.decision) {
		throw new Error(`Missing evaluator metadata for ${key}`);
	}
	return { plugin, decision: plugin.decision, copy: representativeCopy[key] };
}

function getProofAsset(key: RepresentativePluginKey) {
	const asset = representativeAssets[key];
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
	key: RepresentativePluginKey,
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
		case "workflow":
			return { ...action, href: `#${key}-workflow`, external: false };
	}
}

export function PluginEvaluatorHeader({
	pluginKey,
}: {
	pluginKey: RepresentativePluginKey;
}) {
	const { decision, copy } = getRepresentativePlugin(pluginKey);
	const proof = getProofAsset(pluginKey);
	const actions = copy.actions.map((action) =>
		resolveAction(pluginKey, decision, action),
	);

	return (
		<section
			aria-labelledby={`${pluginKey}-evaluator-title`}
			className="not-prose my-8 overflow-hidden rounded-2xl border border-fd-border bg-fd-background shadow-sm"
		>
			<div className="grid lg:grid-cols-[minmax(0,1.05fr)_minmax(19rem,0.95fr)]">
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

			<WorkflowStrip
				id={`${pluginKey}-workflow`}
				steps={copy.workflow}
			/>
		</section>
	);
}

export function PluginCatalogCard({
	pluginKey,
}: {
	pluginKey: RepresentativePluginKey;
}) {
	const { plugin, decision, copy } = getRepresentativePlugin(pluginKey);
	const proof = getProofAsset(pluginKey);
	const catalogAction = resolveAction(
		pluginKey,
		decision,
		copy.catalogAction,
	);

	return (
		<article className="overflow-hidden rounded-2xl border border-fd-border bg-fd-background shadow-sm">
			<Image
				src={proof.image}
				alt={proof.alt}
				className="h-auto w-full border-b border-fd-border bg-fd-muted"
				placeholder="blur"
				sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
			/>
			<div className="p-5">
				<TopologyBadges decision={decision} />
				<h3 className="mb-0 mt-4 text-xl font-semibold tracking-tight">
					<Link
						href={decision.docsPath}
						className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-fd-primary"
					>
						{plugin.label}
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
