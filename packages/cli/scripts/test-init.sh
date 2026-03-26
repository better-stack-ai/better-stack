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
success "Fixture created at $TEST_DIR/app"

step "Installing packed tarballs"
npm install "$STACK_TARBALL" "$CODEGEN_TARBALL" --legacy-peer-deps
success "Installed local @btst/stack and @btst/codegen"

step "Running btst init (first pass)"
npx @btst/codegen init --yes --framework nextjs --adapter memory --plugins all --skip-install 2>&1 | tee "$TEST_DIR/init-first.log"
if ! node -e 'const fs=require("fs");const s=fs.readFileSync(process.argv[1],"utf8");process.exit(s.includes("Running @btst/codegen init")?0:1)' "$TEST_DIR/init-first.log"; then
	error "Expected runtime banner not found in init output"
	exit 1
fi
success "First init run completed"

step "Installing runtime deps needed for generated files"
STACK_PEERS=$(node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("node_modules/@btst/stack/package.json","utf8"));process.stdout.write(Object.keys(p.peerDependencies||{}).join(" "));')
BETTER_AUTH_UI_PEERS=$(node -e '
const fs=require("fs");
const p=JSON.parse(fs.readFileSync("node_modules/@btst/better-auth-ui/package.json","utf8"));
const skip=new Set(["react","react-dom","tailwindcss","@btst/stack","@btst/yar","better-auth","@tanstack/react-query"]);
const optionalPrefixes=["@triplit","@instantdb","@daveyplate"];
const keys=Object.keys(p.peerDependencies||{}).filter(d=>!skip.has(d)&&!optionalPrefixes.some(pre=>d.startsWith(pre)));
process.stdout.write(keys.join(" "));
')
npm install @btst/adapter-memory @btst/better-auth-ui better-auth $STACK_PEERS $BETTER_AUTH_UI_PEERS --legacy-peer-deps
success "Installed runtime deps (adapter + @btst/better-auth-ui + better-auth + @btst/stack and @btst/better-auth-ui peers)"

step "Asserting generated files and patches"
test -f "lib/stack.ts"
test -f "lib/stack-client.tsx"
test -f "lib/query-client.ts"
test -f "app/api/data/[[...all]]/route.ts"
test -f "app/pages/[[...all]]/page.tsx"
test -f "app/pages/layout.tsx"
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack.ts","utf8");process.exit(s.includes("import { stack } from \"@btst/stack\"")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack.ts","utf8");process.exit(s.includes("mediaBackendPlugin({ storageAdapter: undefined as any })")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("app/globals.css","utf8");process.exit(s.includes("@btst/stack/plugins/ui-builder/css")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("app/globals.css","utf8");process.exit(s.includes("@btst/better-auth-ui/css")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack-client.tsx","utf8");process.exit(s.includes("authClientPlugin")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack-client.tsx","utf8");process.exit(s.includes("accountClientPlugin")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack-client.tsx","utf8");process.exit(s.includes("organizationClientPlugin")?0:1)'
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack-client.tsx","utf8");process.exit(s.includes("@btst/better-auth-ui/client")?0:1)'
success "Generation + patch checks passed"

step "Idempotency check (second pass)"
write_project_hash "$TEST_DIR/init-before.hash"

npx @btst/codegen init --yes --framework nextjs --adapter memory --plugins all --skip-install > "$TEST_DIR/init-second.log" 2>&1
write_project_hash "$TEST_DIR/init-after.hash"

if [ "$(cat "$TEST_DIR/init-before.hash")" != "$(cat "$TEST_DIR/init-after.hash")" ]; then
	error "Second init run produced file changes"
	exit 1
fi
success "Second run was idempotent"

step "Verifying compile on all-plugin scaffold"
success "Keeping generated BTST CSS imports from --plugins all"

step "Compiling fixture project"
npm run build
success "Fixture build succeeded"

TEST_PASSED=true
success "All init checks passed"
