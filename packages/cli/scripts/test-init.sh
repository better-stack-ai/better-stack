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

cleanup() {
	if [ "$TEST_PASSED" = true ]; then
		rm -rf "$TEST_DIR"
	else
		warn "Fixture preserved for debugging: $TEST_DIR"
	fi
}
trap cleanup EXIT

step "Packing local tarballs"
cd "$ROOT_DIR/packages/stack"
STACK_TGZ=$(npm pack --quiet 2>/dev/null | tr -d '[:space:]')
STACK_TARBALL="$ROOT_DIR/packages/stack/$STACK_TGZ"
test -f "$STACK_TARBALL"
success "Packed @btst/stack -> $(basename "$STACK_TARBALL")"

cd "$ROOT_DIR/packages/cli"
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
success "Fixture created at $TEST_DIR/app"

step "Installing packed tarballs"
npm install "$STACK_TARBALL" "$CODEGEN_TARBALL" --legacy-peer-deps
success "Installed local @btst/stack and @btst/codegen"

step "Running btst init (first pass)"
npx @btst/codegen init --yes --framework nextjs --adapter memory --skip-install 2>&1 | tee "$TEST_DIR/init-first.log"
if ! node -e 'const fs=require("fs");const s=fs.readFileSync(process.argv[1],"utf8");process.exit(s.includes("Running @btst/codegen init")?0:1)' "$TEST_DIR/init-first.log"; then
	error "Expected runtime banner not found in init output"
	exit 1
fi
success "First init run completed"

step "Installing runtime deps needed for generated files"
npm install @tanstack/react-query @btst/adapter-memory @btst/yar --legacy-peer-deps
success "Installed runtime deps"

step "Asserting generated files and patches"
test -f "lib/stack.ts"
test -f "lib/stack-client.tsx"
test -f "lib/query-client.ts"
test -f "app/api/data/[[...all]]/route.ts"
test -f "app/pages/[[...all]]/page.tsx"
test -f "app/pages/layout.tsx"
node -e 'const fs=require("fs");const s=fs.readFileSync("lib/stack.ts","utf8");process.exit(s.includes("import { stack } from \"@btst/stack\"")?0:1)'
success "Generation + patch checks passed"

step "Idempotency check (second pass)"
git init > /dev/null
git add .
git commit -m "baseline" > /dev/null
npx @btst/codegen init --yes --framework nextjs --adapter memory --skip-install > "$TEST_DIR/init-second.log" 2>&1
if ! git diff --exit-code > /dev/null; then
	error "Second init run produced file changes"
	exit 1
fi
success "Second run was idempotent"

step "Compiling fixture project"
npm run build
success "Fixture build succeeded"

TEST_PASSED=true
success "All init checks passed"
