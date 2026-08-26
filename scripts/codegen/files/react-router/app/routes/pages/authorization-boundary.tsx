import { blogPermissions } from "@btst/stack/plugins/blog/permissions";
import { clientAuth } from "../../lib/authorization.ui";

export default function AuthorizationBoundaryPage() {
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
