"use client";
import { lazy } from "react";
import { ComposedRoute } from "@btst/stack/client/components";
import { SchoolLoading, SchoolNotFound, SchoolError } from "./route-state";
const Page = lazy(() =>
	import("./certificate-page.internal").then((m) => ({
		default: m.CertificatePage,
	})),
);
export function CertificatePageComponent({
	certificateId,
}: {
	certificateId: string;
}) {
	return (
		<ComposedRoute
			path={`/learn/certificates/${certificateId}`}
			PageComponent={Page}
			LoadingComponent={SchoolLoading}
			ErrorComponent={SchoolError}
			NotFoundComponent={SchoolNotFound}
			props={{ certificateId }}
			onError={(error) => console.error("[btst/school]", error)}
		/>
	);
}
