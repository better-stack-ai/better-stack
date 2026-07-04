import { createTanStackPageOptions } from "@btst/stack/tanstack";
import { createFileRoute } from "@tanstack/react-router";
import { getStackClient } from "@/lib/stack-client";

export const Route = createFileRoute("/pages/$")(
	createTanStackPageOptions({ getStackClient }),
);
