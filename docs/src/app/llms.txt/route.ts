import { source } from '@/lib/source';

export const revalidate = false;

export async function GET() {
  const pages = source.getPages();
  
  const content = `# Better Stack Documentation

> Better Stack is a modern full-stack framework for building web applications.

## Available Documentation Pages

${pages.map((page) => `- ${page.data.title}: /docs${page.url}.mdx`).join('\n')}

## How to Access

- Full documentation: /docs/llms-full.txt
- Individual pages: Append .mdx to any page URL (e.g., /docs/installation.mdx)
`;

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}

