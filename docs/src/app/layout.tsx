import CustomSearchDialog from '@/components/search-dialog';
import './global.css';
import { Analytics, type BeforeSendEvent } from '@vercel/analytics/next';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Better Stack',
    template: '%s | Better Stack',
  },
};

const BASE_PATH = '/docs';

/**
 * Fix analytics URL to include basePath.
 *
 * When the docs site is proxied behind the main site (www.better-stack.ai/docs/*),
 * Next.js internally strips the basePath from URLs. This causes @vercel/analytics
 * to report paths like "/plugins/blog" instead of "/docs/plugins/blog".
 *
 * This beforeSend handler ensures the basePath is included in tracked URLs.
 */
function fixAnalyticsBasePath(event: BeforeSendEvent): BeforeSendEvent {
  try {
    const url = new URL(event.url);
    // Only add basePath if the pathname doesn't already include it
    if (!url.pathname.startsWith(BASE_PATH)) {
      url.pathname = `${BASE_PATH}${url.pathname}`;
      return { ...event, url: url.toString() };
    }
  } catch {
    // If URL parsing fails, return event unchanged
  }
  return event;
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          search={{
            SearchDialog: CustomSearchDialog,
          }}
        >{children}</RootProvider>
        <Analytics beforeSend={fixAnalyticsBasePath} />
      </body>
    </html>
  );
}
