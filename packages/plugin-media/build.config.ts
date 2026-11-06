import { packageBuild } from "../../scripts/package-build";

export default packageBuild([
	"src/api/index",
	"src/api/adapters/local",
	"src/api/adapters/s3",
	"src/api/adapters/vercel-blob",
	"src/client/index",
	"src/client/vercel-blob",
	"src/client/hooks/index",
	"src/client/components/index",
	"src/query-keys",
	"src/permissions",
	"src/types",
]);
