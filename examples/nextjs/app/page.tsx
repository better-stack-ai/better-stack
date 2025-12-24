import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";

export default function Home() {
	return (
		<div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
			<main className="flex flex-col gap-1 row-start-2 items-center">
				<h1 className="text-4xl font-bold w-min text-center">
					<b className="text-destructive">@BTST/STACK</b> example with
				</h1>
				<Image
					className="dark:invert"
					src="/next.svg"
					alt="Next.js logo"
					width={180}
					height={38}
					priority
				/>
				<div className="flex flex-col gap-2 items-center m-8 border-2 border-destructive rounded-md pb-2">
					<b className="border-b-2 border-destructive w-full text-center p-2">Pages:</b>
					<Button className="text-destructive" variant="link" asChild>
						<Link href="/pages/route-docs">Available Routes</Link>
					</Button>
				</div>
			</main>
		</div>
	);
}
