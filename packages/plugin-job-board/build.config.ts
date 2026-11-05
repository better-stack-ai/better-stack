import { packageBuild } from "../../scripts/package-build";

export default packageBuild([
	"src/index",
	"src/api/index",
	"src/client/index",
	"src/client/hooks/index",
	"src/client/components/index",
	"src/query-keys",
	"src/permissions",
	"src/types",
]);
