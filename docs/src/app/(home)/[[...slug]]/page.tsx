import { source } from "@/lib/source";
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from "fumadocs-ui/page";
import { notFound } from "next/navigation";
import { createRelativeLink } from "fumadocs-ui/mdx";
import { createGenerator } from "fumadocs-typescript"
import { AutoTypeTable } from "fumadocs-typescript/ui"
import { getMDXComponents } from "@/mdx-components";
import { PageActions } from "@/components/page-actions";
import { SOCIALS } from "@/constants";

const generator = createGenerator()

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDXContent = page.data.body;

  // page.url returns path without basePath, e.g., '/' for root or '/installation' for subpages
  // We need to include basePath '/docs' for the full URL
  // For root page, use /docs/index.mdx to match the rewrite pattern
  const slugPath = params.slug?.join('/') || 'index';
  const markdownUrl = `/docs/${slugPath}.mdx`;
  const githubUrl = `${SOCIALS.Github}/blob/main/docs/content/docs/${slugPath}.mdx`;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <PageActions markdownUrl={markdownUrl} githubUrl={githubUrl} />
      <DocsBody>
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
            AutoTypeTable: (props) => (
              <AutoTypeTable {...props} generator={generator} />
          ),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    icon: page.data.icon,
    full: page.data.full,
  };
}
