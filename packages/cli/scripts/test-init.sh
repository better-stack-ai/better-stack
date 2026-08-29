#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; NC='\033[0m'
step()    { echo -e "\n${BLUE}== $1 ==${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
error()   { echo -e "${RED}✗ $1${NC}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(cd "$PACKAGE_DIR/../.." && pwd)"
TEST_DIR="/tmp/test-btst-init-$(date +%s)"
TEST_PASSED=false
SHADCN_VERSION="4.0.5"
MEMORY_PLUGIN_LIST="blog,ai-chat,cms,ui-builder,kanban,comments,media,route-docs,open-api"

cleanup() {
	if [ "$TEST_PASSED" = true ]; then
		rm -rf "$TEST_DIR"
	else
		warn "Fixture preserved for debugging: $TEST_DIR"
	fi
}
trap cleanup EXIT

write_project_hash() {
	local output_file="$1"
	node <<'EOF' > "$output_file"
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = process.cwd();
const ignored = new Set(["node_modules", ".next", ".git"]);
const records = [];

function walk(dir) {
	for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
		if (ignored.has(name.name)) continue;
		const absolutePath = path.join(dir, name.name);
		const relativePath = path.relative(root, absolutePath);
		if (name.isDirectory()) {
			walk(absolutePath);
			continue;
		}
		if (!name.isFile()) continue;
		records.push({
			path: relativePath,
			content: fs.readFileSync(absolutePath),
		});
	}
}

walk(root);
records.sort((a, b) => a.path.localeCompare(b.path));

const hash = crypto.createHash("sha256");
for (const record of records) {
	hash.update(record.path);
	hash.update("\0");
	hash.update(record.content);
	hash.update("\0");
}
process.stdout.write(hash.digest("hex"));
EOF
}

step "Packing local tarballs"
cd "$ROOT_DIR/packages/stack"
STACK_TGZ=$(npm pack --quiet 2>/dev/null | tr -d '[:space:]')
STACK_TARBALL="$ROOT_DIR/packages/stack/$STACK_TGZ"
test -f "$STACK_TARBALL"
success "Packed @btst/stack -> $(basename "$STACK_TARBALL")"

cd "$ROOT_DIR/packages/cli"
npm run build --silent 2>/dev/null
CODEGEN_TGZ=$(npm pack --quiet 2>/dev/null | tr -d '[:space:]')
CODEGEN_TARBALL="$ROOT_DIR/packages/cli/$CODEGEN_TGZ"
test -f "$CODEGEN_TARBALL"
success "Packed @btst/codegen -> $(basename "$CODEGEN_TARBALL")"


step "Creating Next.js fixture"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
npx --yes create-next-app@latest app \
	--typescript \
	--tailwind \
	--eslint \
	--app \
	--use-npm \
	--yes
cd "$TEST_DIR/app"
echo "legacy-peer-deps=true" > .npmrc
step "Initializing shadcn Next.js baseline"
npx --yes "shadcn@${SHADCN_VERSION}" init --defaults --force --base radix > "$TEST_DIR/shadcn-init.log" 2>&1
if ! node -e 'const fs=require("fs");const s=fs.readFileSync("app/globals.css","utf8");const hasColorInput=s.includes("--color-input: var(--input);");const hasInputToken=s.includes("--input:");process.exit(hasColorInput&&hasInputToken?0:1)'; then
	error "Shadcn baseline is missing required Tailwind tokens (--color-input / --input)"
	error "See shadcn init log: $TEST_DIR/shadcn-init.log"
	exit 1
fi
success "Initialized shadcn baseline in fixture (radix, v${SHADCN_VERSION})"

# shadcn init generates mode-toggle.tsx (needs dropdown-menu) and sonner.tsx.
# next build type-checks all .tsx files, so missing components cause build failures.
npx --yes "shadcn@${SHADCN_VERSION}" add dropdown-menu --yes > /dev/null 2>&1
success "Added shadcn dropdown-menu (required by generated mode-toggle.tsx)"
success "Fixture created at $TEST_DIR/app"

step "Installing packed tarballs"
npm install "$STACK_TARBALL" "$CODEGEN_TARBALL" --legacy-peer-deps
success "Installed local @btst/stack and @btst/codegen"

step "Rejecting Form Builder with the non-isolating memory scaffold"
write_project_hash "$TEST_DIR/init-memory-before.hash"
if npx @btst/codegen init --yes --framework nextjs --adapter memory --plugins form-builder --skip-install > "$TEST_DIR/init-memory-form-builder.log" 2>&1; then
	error "Expected memory + Form Builder init to fail"
	exit 1
fi
write_project_hash "$TEST_DIR/init-memory-after.hash"
if ! grep -q "requires an adapter with isolated transaction support" "$TEST_DIR/init-memory-form-builder.log"; then
	error "Expected Form Builder transaction guidance was not printed"
	exit 1
fi
if [ "$(cat "$TEST_DIR/init-memory-before.hash")" != "$(cat "$TEST_DIR/init-memory-after.hash")" ]; then
	error "Rejected memory + Form Builder init modified the fixture"
	exit 1
fi
success "Memory + Form Builder failed before scaffolding"

step "Rejecting the retired provider-specific authentication plugin"
if npx @btst/codegen init --yes --framework nextjs --adapter memory --plugins better-auth-ui --skip-install > "$TEST_DIR/init-retired-auth.log" 2>&1; then
	error "Expected the retired authentication plugin selection to fail"
	exit 1
fi
if ! grep -q "Unknown plugin(s): better-auth-ui" "$TEST_DIR/init-retired-auth.log"; then
	error "Expected retired authentication plugin guidance was not printed"
	exit 1
fi
success "Retired authentication plugin cannot be selected"

step "Running compatible memory btst init (first pass)"
npx @btst/codegen init --yes --framework nextjs --adapter memory --plugins "$MEMORY_PLUGIN_LIST" --skip-install 2>&1 | tee "$TEST_DIR/init-first.log"
if ! node -e 'const fs=require("fs");const s=fs.readFileSync(process.argv[1],"utf8");process.exit(s.includes("Running @btst/codegen init")?0:1)' "$TEST_DIR/init-first.log"; then
	error "Expected runtime banner not found in init output"
	exit 1
fi
success "First init run completed"

step "Installing runtime deps needed for generated files"
STACK_PEERS=$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("node_modules/@btst/stack/package.json","utf8"));process.stdout.write(Object.keys(p.peerDependencies||{}).map((name)=>name==="@hookform/resolvers"?"@hookform/resolvers@5.2.2":name).join(" "));')
# Collect extraPackages from the maintained plugin catalog via @btst/codegen.
PLUGIN_EXTRA_PACKAGES=$(node -e '
const { PLUGINS } = require("./node_modules/@btst/codegen/dist/lib.cjs");
const extras = PLUGINS.flatMap(p => p.extraInstallSpecs || p.extraPackages || []);
process.stdout.write([...new Set(extras)].join(" "));
')
# Install adapter, maintained plugin extras, and @btst/stack peers.
# next-themes is generated by shadcn init (mode-toggle.tsx, sonner.tsx) but not auto-installed.
# Re-enable strict peer resolution here so this fixture catches incompatible cohorts.
rm .npmrc
npm install --save-exact @btst/adapter-memory@2.2.3 next-themes $PLUGIN_EXTRA_PACKAGES $STACK_PEERS
success "Installed aligned runtime deps with strict peer resolution"

BTST_CLI_VERSION=$(npx --yes @btst/cli@2.2.3 --version)
test "$BTST_CLI_VERSION" = "2.2.3"
test ! -e node_modules/@btst/cli
success "Ran @btst/cli@2.2.3 without adding it to the consumer graph"

step "Asserting generated files and patches"
test -f "lib/stack.ts"
test -f "lib/stack-client.tsx"
test -f "lib/stack-client.server.ts"
test -f "lib/query-client.ts"
test -f "app/api/data/[[...all]]/route.ts"
test -f "app/(request)/pages/[[...all]]/page.tsx"
test -f "app/(request)/pages/layout.tsx"
test -f "app/(static)/pages/layout.tsx"
test -f "app/pages/client-layout.tsx"
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack.ts","utf8");process.exit(s.includes("import { createBackendStack } from \"@btst/stack/api\"")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack.ts","utf8");process.exit(s.includes("mediaBackendPlugin({ storageAdapter: localAdapter() })")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack-client.tsx","utf8");process.exit(s.includes("createClientStack")&&!s.includes("getStackClientForRequest")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack-client.server.ts","utf8");process.exit(s.includes("getStackClientForRequest")&&s.includes("resolveTrustedClientOrigins")&&s.includes("filterCredentialForwardingHeaders")?0:1)'
node -e 'const fs=require("fs");const request=fs.readFileSync("app/(request)/pages/layout.tsx","utf8"),staticLayout=fs.readFileSync("app/(static)/pages/layout.tsx","utf8"),client=fs.readFileSync("app/pages/client-layout.tsx","utf8");process.exit(request.includes("getServerClientOriginsFromHeaders(await headers())")&&staticLayout.includes("getServerClientOrigins()")&&!staticLayout.includes("next/headers")&&client.includes("getStackClient(queryClient, clientOrigins)")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("app/globals.css","utf8");process.exit(s.includes("@btst/stack/plugins/ui-builder/css")?0:1)'
node -e 'const fs=require("fs"),path=require("path");const roots=["app","lib","package.json"];const retired=["@btst","better-auth-ui"].join("/");const read=(p)=>fs.statSync(p).isDirectory()?fs.readdirSync(p).flatMap((n)=>read(path.join(p,n))):[fs.readFileSync(p,"utf8")];process.exit(roots.flatMap(read).some((s)=>s.includes(retired))?1:0)'
success "Generation + patch checks passed"

step "Adding third-party public extension fixture"
mkdir -p lib/fixtures
cp "$PACKAGE_DIR/scripts/fixtures/third-party-plugin.tsx" lib/fixtures/third-party-plugin.tsx
success "Third-party fixture uses public plugin definitions and inferred overrides"

step "Migrating the previous Next.js scaffold on rerun"
rm -r "app/(request)/pages" "app/(static)/pages"
rm "app/pages/client-layout.tsx"
cp -R "$PACKAGE_DIR/scripts/fixtures/legacy-next/e9ff9448/app/pages/." "app/pages/"

npx @btst/codegen init --yes --framework nextjs --adapter memory --plugins "$MEMORY_PLUGIN_LIST" --skip-install > "$TEST_DIR/init-migration.log" 2>&1

test ! -e "app/pages/[[...all]]/page.tsx"
test ! -e "app/pages/layout.tsx"
test ! -e "app/pages/ssg-blog/page.tsx"
test ! -e "app/pages/ssg-blog/[slug]/page.tsx"
test ! -e "app/pages/ssg-cms/[typeSlug]/page.tsx"
test ! -e "app/pages/ssg-forms/page.tsx"
test ! -e "app/pages/ssg-kanban/page.tsx"
test -f "app/(request)/pages/[[...all]]/page.tsx"
test -f "app/(request)/pages/layout.tsx"
test -f "app/(static)/pages/layout.tsx"
test -f "app/(static)/pages/ssg-blog/page.tsx"
test -f "app/(static)/pages/ssg-blog/[slug]/page.tsx"
test -f "app/(static)/pages/ssg-cms/[typeSlug]/page.tsx"
test -f "app/(static)/pages/ssg-kanban/page.tsx"
grep -q "Legacy Next.js files removed: 7" "$TEST_DIR/init-migration.log"
success "Previous scaffold migrated without duplicate /pages routes"

step "Idempotency check after migration"
write_project_hash "$TEST_DIR/init-before.hash"

npx @btst/codegen init --yes --framework nextjs --adapter memory --plugins "$MEMORY_PLUGIN_LIST" --skip-install > "$TEST_DIR/init-second.log" 2>&1
write_project_hash "$TEST_DIR/init-after.hash"

if [ "$(cat "$TEST_DIR/init-before.hash")" != "$(cat "$TEST_DIR/init-after.hash")" ]; then
	error "Second init run produced file changes"
	exit 1
fi
success "Second run was idempotent"

step "Verifying compile on the compatible memory scaffold"
success "Keeping generated BTST CSS imports from the selected plugins"

step "Compiling fixture project"
BASE_URL=http://localhost:3000 npm run build
success "Fixture build succeeded"

TEST_PASSED=true
success "All init checks passed"
