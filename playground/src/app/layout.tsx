import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
	title: {
		default: "BTST Playground",
		template: "%s | BTST Playground",
	},
	description:
		"Build a BTST project in your browser — select plugins and see them live in a StackBlitz WebContainer.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 antialiased">
				{children}
			</body>
		</html>
	);
}
