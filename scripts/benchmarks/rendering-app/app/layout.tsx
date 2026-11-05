import "./globals.css";

export const metadata = { title: "BTST matched rendering benchmark" };
export const dynamic = "force-dynamic";

export default function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<body>{children}</body>
		</html>
	);
}
