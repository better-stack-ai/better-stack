import { blogPermissions } from "@btst/stack/plugins/blog/permissions";
import { clientAuth } from "../../lib/authorization.ui";

export default function AuthorizationBoundaryPage() {
	const { CanAccess } = clientAuth;
	const { identity, isPending, error } = clientAuth.useIdentity();
	if (error) throw error;

	return (
		<>
			<p data-testid="hydrated-identity">
				{isPending ? "pending" : (identity?.id ?? "anonymous")}
			</p>
			<CanAccess
				permission={blogPermissions.post.delete({
					id: "production-boundary-fixture",
					authorId: "olliethedev",
				})}
				fallback={<p>Denied</p>}
			>
				<p>Allowed</p>
			</CanAccess>
		</>
	);
}
