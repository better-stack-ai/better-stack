import { myStack } from "@/lib/stack";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ArticleData = {
	title: string;
	summary: string;
	body: string;
	publishedAt?: string;
	published: boolean;
};

export default async function ArticlesPage() {
	const { items } = await myStack.api.cms.getAllContentItems("article");
	const published = items.filter(
		(item) => (item.parsedData as ArticleData).published,
	);

	return (
		<div className="max-w-3xl mx-auto px-4 py-12">
			<div className="mb-10">
				<h1 className="text-3xl font-bold mb-2">Articles</h1>
				<p className="text-muted-foreground">
					Content managed with the BTST CMS plugin.
				</p>
			</div>

			{published.length === 0 ? (
				<p className="text-muted-foreground">No published articles yet.</p>
			) : (
				<div className="divide-y">
					{published.map((item) => {
						const data = item.parsedData as ArticleData;
						return (
							<Link
								key={item.id}
								href={`/pages/articles/${item.slug}`}
								className="block group py-8 first:pt-0"
							>
								<div className="flex items-start justify-between gap-6">
									<div className="min-w-0">
										<h2 className="text-xl font-semibold group-hover:underline underline-offset-2 mb-2">
											{data.title}
										</h2>
										<p className="text-muted-foreground text-sm leading-relaxed">
											{data.summary}
										</p>
									</div>
									{data.publishedAt && (
										<time className="text-xs text-muted-foreground whitespace-nowrap mt-1 shrink-0">
											{new Date(data.publishedAt).toLocaleDateString("en-US", {
												year: "numeric",
												month: "short",
												day: "numeric",
											})}
										</time>
									)}
								</div>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
