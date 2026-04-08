import type { Route } from "./+types/$";
import { handler } from "~/lib/stack-auth";

export function loader({ request }: Route.LoaderArgs) {
	return handler(request);
}

export function action({ request }: Route.ActionArgs) {
	return handler(request);
}
