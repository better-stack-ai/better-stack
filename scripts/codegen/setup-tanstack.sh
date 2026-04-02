#!/usr/bin/env bash
# setup-tanstack.sh — Scaffold and configure the TanStack Start codegen project
#
# Usage (from monorepo root):
#   bash scripts/codegen/setup-tanstack.sh

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

step()    { echo -e "\n${BLUE}== $1 ==${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
die()     { echo -e "${RED}✗ $1${NC}"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST="$ROOT_DIR/codegen-projects/tanstack"
PATCHES="$SCRIPT_DIR/patches/tanstack"
CLI_BIN="$ROOT_DIR/packages/cli/dist/index.cjs"

if [ -d "$DEST" ]; then
  die "codegen-projects/tanstack already exists. Run 'bash scripts/codegen/cleanup.sh tanstack' first."
fi

step "Scaffolding TanStack Start project with shadcn init -t start"
mkdir -p "$DEST"
cd "$DEST"
pnpm dlx shadcn@latest init -t start --yes
success "shadcn scaffold complete"

step "Removing .git"
rm -rf "$DEST/.git"
success ".git removed"

step "Building local @btst/codegen CLI"
cd "$ROOT_DIR"
pnpm --filter @btst/codegen build
success "CLI built"

step "Running btst init"
cd "$DEST"
node "$CLI_BIN" init \
  --yes \
  --framework tanstack \
  --adapter memory \
  --plugins "blog,ai-chat,cms,form-builder,ui-builder,kanban,comments,media,route-docs,open-api" \
  --skip-install
success "btst init complete"

step "Applying patches from scripts/codegen/patches/tanstack/"
if [ -d "$PATCHES" ]; then
  cp -r "$PATCHES/." "$DEST/"
  success "Patches applied"
else
  die "Patch directory not found: $PATCHES — run after creating patches/tanstack/"
fi

step "Adding shadcn UI components"
cd "$DEST"
pnpm dlx shadcn@latest add checkbox label skeleton input sonner dropdown-menu separator --yes --overwrite
success "shadcn components added"

step "Patching package.json"
cd "$DEST"
node - <<'PATCH_SCRIPT'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
pkg.name = "tanstack";
pkg.scripts = pkg.scripts || {};
pkg.scripts["start:e2e"] = "vite build && NODE_ENV=test vite preview --port 3007 --host 127.0.0.1";
for (const section of ["dependencies", "devDependencies"]) {
  if (!pkg[section]) continue;
  for (const [key] of Object.entries(pkg[section])) {
    if (key.startsWith("@btst/")) pkg[section][key] = "workspace:*";
  }
}
const deps = pkg.dependencies || {};
pkg.dependencies = {
  ...deps,
  "next-themes": deps["next-themes"] || "^0.4.6",
  "sonner": deps["sonner"] || "^2.0.7",
  "lucide-react": deps["lucide-react"] || "^0.545.0",
};
fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("package.json patched");
PATCH_SCRIPT
success "package.json patched"

step "Creating .env"
cat > "$DEST/.env" <<'ENVFILE'
VITE_PUBLIC_SITE_URL=http://localhost:3007
BASE_URL=http://localhost:3007
# OPENAI_API_KEY=your-key-here
ENVFILE
success ".env created"

step "Creating public/uploads/"
mkdir -p "$DEST/public/uploads"
success "public/uploads/ created"

step "Running pnpm install from monorepo root"
cd "$ROOT_DIR"
pnpm install
success "pnpm install complete"

success "codegen-projects/tanstack is ready!"
echo ""
echo "  To run E2E tests:"
echo "    pnpm -F e2e codegen:e2e:tanstack"
