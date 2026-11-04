import { packageBuild } from "../../scripts/package-build";

export default packageBuild([
	"src/index",
	"src/client/index",
	"src/client/hooks/index",
	"src/client/components/index",
	"src/query-keys",
	"src/types",
]);
