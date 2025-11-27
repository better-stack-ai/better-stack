import { getLLMText } from '@/lib/get-llm-text';
import { source } from '@/lib/source';
import { notFound } from 'next/navigation';

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug?: string[] }> },
) {
  const { slug } = await params;
  
  // Handle 'index' as the root page (undefined slug)
  const pageSlug = slug?.length === 1 && slug[0] === 'index' ? undefined : slug;
  const page = source.getPage(pageSlug);
  if (!page) notFound();

  return new Response(await getLLMText(page), {
    headers: {
      'Content-Type': 'text/markdown',
    },
  });
}

export function generateStaticParams() {
  // Include 'index' as a valid param for the root page
  const params = source.generateParams();
  return [...params, { slug: ['index'] }];
}

