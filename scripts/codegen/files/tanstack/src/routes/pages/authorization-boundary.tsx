import { createFileRoute } from "@tanstack/react-router";
import { blogPermissions } from "@btst/stack/plugins/blog/permissions";
import { clientAuth } from "../../lib/authorization.ui";

export const Route = createFileRoute("/pages/authorization-boundary")({
	component: AuthorizationBoundaryPage,
});

function AuthorizationBoundaryPage() {
	const { CanAccess } = clientAuth;

	return (
		<CanAccess
			permission={blogPermissions.post.delete({
				id: "production-boundary-fixture",
				authorId: "olliethedev",
			})}
			fallback={<p>Denied</p>}
		>
			<p>Allowed</p>
		</CanAccess>
	);
}
