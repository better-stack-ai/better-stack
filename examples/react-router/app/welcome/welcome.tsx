import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";
import { Button } from "~/components/ui/button";
import { Link } from "react-router";

export function Welcome() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
			<main className="flex flex-col gap-1 row-start-2 items-center">
				<h1 className="text-4xl font-bold w-min text-center">
					<b className="text-destructive">@BTST/STACK</b> example with
				</h1>
				<div className="w-[300px] max-w-[200vw] p-4">
            <img
              src={logoLight}
              alt="React Router"
              className="block w-full dark:hidden"
            />
            <img
              src={logoDark}
              alt="React Router"
              className="hidden w-full dark:block"
            />
        </div>
				<div className="flex flex-col gap-2 items-center m-8 border-2 border-destructive rounded-md pb-2">
					<b className="border-b-2 border-destructive w-full text-center p-2">Pages:</b>
					<Button className="text-destructive" variant="link" asChild>
						<Link to="/pages/blog">Blog</Link>
					</Button>
					<Button className="text-destructive" variant="link" asChild>
						<Link to="/pages/blog/drafts">Drafts</Link>
					</Button>
					<Button className="text-destructive" variant="link" asChild>
						<Link to="/pages/blog/new">New Post</Link>
					</Button>
					<Button className="text-destructive" variant="link" asChild>
						<Link to="/pages/chat">Chat</Link>
					</Button>
				</div>
			</main>
		</div>
  );
}


