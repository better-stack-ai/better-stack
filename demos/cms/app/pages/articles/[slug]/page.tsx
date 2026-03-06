import { myStack } from "@/lib/stack";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

type ArticleData = {
	title: string;
	summary: string;
	body: string;
	publishedAt?: string;
	published: boolean;
};

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const item = await myStack.api.cms.getContentItemBySlug("article", slug);
	if (!item) return { title: "Not Found" };
	const data = item.parsedData as ArticleData;
	return {
		title: data.title,
		description: data.summary,
	};
}

export default async function ArticlePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const item = await myStack.api.cms.getContentItemBySlug("article", slug);

	if (!item) notFound();

	const data = item.parsedData as ArticleData;

	return (
		<div className="max-w-3xl mx-auto px-4 py-12">
			<Link
				href="/pages/articles"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-10"
			>
				← All articles
			</Link>

			<article>
				<header className="mb-8">
					<h1 className="text-3xl font-bold mb-3">{data.title}</h1>
					{data.publishedAt && (
						<time className="text-sm text-muted-foreground">
							{new Date(data.publishedAt).toLocaleDateString("en-US", {
								year: "numeric",
								month: "long",
								day: "numeric",
							})}
						</time>
					)}
				</header>

				<p className="text-lg text-muted-foreground leading-relaxed border-l-2 pl-4 mb-8">
					{data.summary}
				</p>

				<div className="prose prose-sm max-w-none text-foreground space-y-4">
					{data.body.split("\n\n").map((paragraph, i) =>
						paragraph.trim() ? (
							<p key={i} className="leading-relaxed">
								{paragraph.trim()}
							</p>
						) : null,
					)}
				</div>
			</article>
		</div>
	);
}
