import { AnalyticsWithBasePath } from '@/components/analytics';
import CustomSearchDialog from '@/components/search-dialog';
import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'BTST',
    template: '%s | BTST',
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          search={{
            SearchDialog: CustomSearchDialog,
          }}
        >{children}</RootProvider>
        <AnalyticsWithBasePath />
      </body>
    </html>
  );
}
