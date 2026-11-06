import { packageBuild } from "../../scripts/package-build";

export default packageBuild([
	"src/api/index",
	"src/client/index",
	"src/client/hooks/index",
	"src/client/components/index",
	"src/client/context/page-ai-context",
	"src/query-keys",
	"src/permissions",
	"src/types",
]);
