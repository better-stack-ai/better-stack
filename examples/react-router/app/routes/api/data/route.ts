import type { Route } from "./+types/route";
import { handler } from "~/lib/stack";

export function loader({ request }: Route.LoaderArgs) {
  return handler(request);
}

export function action({ request }: Route.ActionArgs) {
  return handler(request);
}