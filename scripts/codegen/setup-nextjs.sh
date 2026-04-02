#!/usr/bin/env bash
# setup-nextjs.sh — Scaffold and configure the Next.js codegen project
#
# Usage (from monorepo root):
#   bash scripts/codegen/setup-nextjs.sh
#
# What it does:
#   1. Creates codegen-projects/nextjs/ via `shadcn init -t next --name nextjs`
#   2. Removes .git so the workspace git config tracks the files
#   3. Builds the local CLI and runs `btst init` with an explicit plugin list
#   4. Applies patches from scripts/codegen/patches/nextjs/
#   5. Adds shadcn UI components needed by the patches
#   6. Patches package.json (name, start:e2e, workspace deps)
#   7. Creates .env and public/uploads/
#   8. Runs pnpm install from the monorepo root

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

step()    { echo -e "\n${BLUE}== $1 ==${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $1${NC}"; }
die()     { echo -e "${RED}✗ $1${NC}"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEST="$ROOT_DIR/codegen-projects/nextjs"
PATCHES="$SCRIPT_DIR/patches/nextjs"
CLI_BIN="$ROOT_DIR/packages/cli/dist/index.cjs"

# ── Prerequisites ────────────────────────────────────────────────────────────

step "Checking prerequisites"
command -v pnpm >/dev/null 2>&1 || die "pnpm not found"
command -v node >/dev/null 2>&1 || die "node not found"
NODE_VERSION=$(node --version | cut -d. -f1 | tr -d 'v')
[ "$NODE_VERSION" -ge 22 ] || warn "Node.js v22+ recommended (current: $(node --version))"
success "Prerequisites OK"

# ── Guard: already exists ────────────────────────────────────────────────────

if [ -d "$DEST" ]; then
  die "codegen-projects/nextjs already exists. Run 'bash scripts/codegen/cleanup.sh nextjs' first."
fi

# ── Step 1: Scaffold with shadcn ─────────────────────────────────────────────
# shadcn -t next creates a NEW Next.js project in a subdirectory named after --name.
# We run it from codegen-projects/ so it creates codegen-projects/nextjs/.

step "Scaffolding Next.js project with shadcn init -t next"
mkdir -p "$ROOT_DIR/codegen-projects"
cd "$ROOT_DIR/codegen-projects"
# --no-monorepo: skip the monorepo prompt (we're already in one)
# --base radix:  use Radix UI (skips the component library selection prompt)
# --preset nova: use the Nova preset with Lucide + Geist (skips preset selection)
# --name nextjs: creates the project in a nextjs/ subdirectory
# --yes:         accept all remaining defaults
pnpm dlx shadcn@latest init -t next --no-monorepo --base radix --preset nova --name nextjs --yes
success "shadcn scaffold complete → $DEST"

# ── Step 2: Remove .git and lock file ────────────────────────────────────────

step "Removing .git and pnpm-lock.yaml from scaffolded project"
rm -rf "$DEST/.git"
# Remove the project-level lockfile; the workspace root lockfile manages all deps
rm -f "$DEST/pnpm-lock.yaml"
success ".git and pnpm-lock.yaml removed"

# ── Step 3: Build local CLI and run btst init ─────────────────────────────────

step "Building local @btst/codegen CLI"
cd "$ROOT_DIR"
pnpm --filter @btst/codegen build
success "CLI built → $CLI_BIN"

step "Running btst init (explicit plugin list, skip install)"
cd "$DEST"
# --plugins all would include better-auth-ui; use explicit list instead.
# --yes alone selects zero plugins (DEFAULT_PLUGIN_SELECTION=[]).
node "$CLI_BIN" init \
  --yes \
  --framework nextjs \
  --adapter memory \
  --plugins "blog,ai-chat,cms,form-builder,ui-builder,kanban,comments,media,route-docs,open-api" \
  --skip-install
success "btst init complete"

# ── Step 4: Apply patches ─────────────────────────────────────────────────────

step "Applying patches from scripts/codegen/patches/nextjs/"
cd "$DEST"

# Detect whether shadcn created src/ layout
if [ -f "src/app/globals.css" ]; then
  warn "Detected src/ layout — adjusting patch targets"
  APP_DIR="src/app"
  LIB_DIR="src/lib"
  COMPONENTS_DIR="src/components"
else
  APP_DIR="app"
  LIB_DIR="lib"
  COMPONENTS_DIR="components"
fi

# lib/ — overwrite generated stack files; add todos plugin, auth stacks, etc.
cp -r "$PATCHES/lib/." "$DEST/$LIB_DIR/"
success "Patched lib/"

# app/layout.tsx — root layout with PageAIContextProvider, ThemeProvider, Navbar, Toaster
cp "$PATCHES/app/layout.tsx" "$DEST/$APP_DIR/layout.tsx"
success "Patched app/layout.tsx"

# app/pages/layout.tsx — full-featured pages layout
cp "$PATCHES/app/pages/layout.tsx" "$DEST/$APP_DIR/pages/layout.tsx"
success "Patched app/pages/layout.tsx"

# app/pages/[[...all]]/page.tsx — SSR page route with headers() and generateMetadata
mkdir -p "$DEST/$APP_DIR/pages/[[...all]]"
cp "$PATCHES/app/pages/[[...all]]/page.tsx" "$DEST/$APP_DIR/pages/[[...all]]/page.tsx"
success "Patched app/pages/[[...all]]/page.tsx"

# SSG pages
mkdir -p "$DEST/$APP_DIR/pages/ssg-blog/[slug]"
mkdir -p "$DEST/$APP_DIR/pages/ssg-cms/[typeSlug]"
mkdir -p "$DEST/$APP_DIR/pages/ssg-forms"
mkdir -p "$DEST/$APP_DIR/pages/ssg-kanban"
cp "$PATCHES/app/pages/ssg-blog/page.tsx"           "$DEST/$APP_DIR/pages/ssg-blog/page.tsx"
cp "$PATCHES/app/pages/ssg-blog/[slug]/page.tsx"    "$DEST/$APP_DIR/pages/ssg-blog/[slug]/page.tsx"
cp "$PATCHES/app/pages/ssg-cms/[typeSlug]/page.tsx" "$DEST/$APP_DIR/pages/ssg-cms/[typeSlug]/page.tsx"
cp "$PATCHES/app/pages/ssg-forms/page.tsx"          "$DEST/$APP_DIR/pages/ssg-forms/page.tsx"
cp "$PATCHES/app/pages/ssg-kanban/page.tsx"         "$DEST/$APP_DIR/pages/ssg-kanban/page.tsx"
success "Patched SSG pages"

# API routes
mkdir -p "$DEST/$APP_DIR/api/public-chat/[[...all]]"
mkdir -p "$DEST/$APP_DIR/api/example-auth/[[...all]]"
cp "$PATCHES/app/api/public-chat/[[...all]]/route.ts"   "$DEST/$APP_DIR/api/public-chat/[[...all]]/route.ts"
cp "$PATCHES/app/api/example-auth/[[...all]]/route.ts"  "$DEST/$APP_DIR/api/example-auth/[[...all]]/route.ts"
success "Patched API routes"

# Public chat page
mkdir -p "$DEST/$APP_DIR/public-chat"
cp "$PATCHES/app/public-chat/page.tsx" "$DEST/$APP_DIR/public-chat/page.tsx"
success "Patched /public-chat page"

# Sitemap (for smoke.blog.spec.ts sitemap test)
cp "$PATCHES/app/sitemap.ts" "$DEST/$APP_DIR/sitemap.ts"
success "Patched app/sitemap.ts"

# CMS hooks example page (for smoke.cms.spec.ts CMS Hooks Example tests)
mkdir -p "$DEST/$APP_DIR/cms-example"
cp "$PATCHES/app/cms-example/page.tsx" "$DEST/$APP_DIR/cms-example/page.tsx"
success "Patched app/cms-example/page.tsx"

# Directory pages (for smoke.relations-cms.spec.ts CMS Directory Pages tests)
mkdir -p "$DEST/$APP_DIR/directory/[id]"
mkdir -p "$DEST/$APP_DIR/directory/category/[categoryId]"
cp "$PATCHES/app/directory/page.tsx"                              "$DEST/$APP_DIR/directory/page.tsx"
cp "$PATCHES/app/directory/[id]/page.tsx"                         "$DEST/$APP_DIR/directory/[id]/page.tsx"
cp "$PATCHES/app/directory/category/[categoryId]/page.tsx"        "$DEST/$APP_DIR/directory/category/[categoryId]/page.tsx"
success "Patched app/directory/ pages"

# Form demo page (for smoke.form-builder.spec.ts Public Form Submission tests)
mkdir -p "$DEST/$APP_DIR/form-demo/[slug]"
cp "$PATCHES/app/form-demo/[slug]/page.tsx" "$DEST/$APP_DIR/form-demo/[slug]/page.tsx"
success "Patched app/form-demo/ page"

# Preview pages (for smoke.ui-builder.spec.ts Public Page Rendering tests)
mkdir -p "$DEST/$APP_DIR/preview/[slug]"
cp "$PATCHES/app/preview/[slug]/page.tsx"   "$DEST/$APP_DIR/preview/[slug]/page.tsx"
cp "$PATCHES/app/preview/[slug]/client.tsx" "$DEST/$APP_DIR/preview/[slug]/client.tsx"
success "Patched app/preview/ pages"

# Components
mkdir -p "$DEST/$COMPONENTS_DIR/ui"
cp "$PATCHES/components/navbar.tsx"      "$DEST/$COMPONENTS_DIR/navbar.tsx"
cp "$PATCHES/components/mode-toggle.tsx" "$DEST/$COMPONENTS_DIR/mode-toggle.tsx"
cp "$PATCHES/components/ui/empty.tsx"    "$DEST/$COMPONENTS_DIR/ui/empty.tsx"
cp "$PATCHES/components/ui/field.tsx"    "$DEST/$COMPONENTS_DIR/ui/field.tsx"
cp "$PATCHES/components/ui/item.tsx"     "$DEST/$COMPONENTS_DIR/ui/item.tsx"
success "Patched components"

# next.config.ts — remove any existing next.config.* files then add patched version
rm -f "$DEST/next.config.js" "$DEST/next.config.mjs" "$DEST/next.config.ts"
cp "$PATCHES/next.config.ts" "$DEST/next.config.ts"
success "Patched next.config.ts"

# ── Step 5: Add shadcn UI components ──────────────────────────────────────────

step "Adding shadcn UI components (checkbox, label, skeleton, input, sonner, dropdown-menu, separator)"
cd "$DEST"
pnpm dlx shadcn@latest add checkbox label skeleton input sonner dropdown-menu separator --yes --overwrite
success "shadcn components added"

# ── Step 6: Patch package.json ────────────────────────────────────────────────

step "Patching package.json"
cd "$DEST"
node - <<'PATCH_SCRIPT'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

// Set workspace package name (used by pnpm -F nextjs)
pkg.name = "nextjs";

// E2E start script: builds Next.js then starts in production on port 3006
pkg.scripts = pkg.scripts || {};
pkg.scripts["start:e2e"] = "rm -rf .next && next build && NODE_ENV=test next start -p 3006";

// btst init --skip-install doesn't add packages to package.json, so add them manually.
// @btst/stack is in the workspace; adapters are published npm packages.
const btstDeps = {
  "@btst/stack": "workspace:*",
  "@btst/adapter-memory": "^2.1.1",
};

// Ensure required runtime deps
const extraDeps = {
  "@ai-sdk/openai": "^2.0.68",
  "ai": "^5.0.94",
  "@tanstack/react-query": "^5.90.2",
  "@tanstack/react-query-devtools": "^5.90.2",
  "next-themes": "^0.4.6",
  "sonner": "^2.0.7",
  "lucide-react": "^0.545.0",
  "zod": "^4.2.0",
};

const deps = pkg.dependencies || {};
pkg.dependencies = {
  ...deps,
  ...btstDeps,
  ...extraDeps,
};

// Point any @btst/* already present to workspace
for (const section of ["dependencies", "devDependencies"]) {
  if (!pkg[section]) continue;
  for (const [key] of Object.entries(pkg[section])) {
    if (key.startsWith("@btst/")) {
      pkg[section][key] = "workspace:*";
    }
  }
}

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("package.json patched");
PATCH_SCRIPT
success "package.json patched"

# ── Step 7: Create .env ───────────────────────────────────────────────────────

step "Creating .env (preserves existing OPENAI_API_KEY if present)"
# Only write the base vars; keep any OPENAI_API_KEY the user set before running
EXISTING_OPENAI_KEY="${OPENAI_API_KEY:-}"
cat > "$DEST/.env" <<ENVFILE
NEXT_PUBLIC_BASE_URL=http://localhost:3006
BASE_URL=http://localhost:3006
NEXT_PUBLIC_SITE_URL=http://localhost:3006
ENVFILE
if [ -n "$EXISTING_OPENAI_KEY" ]; then
  echo "OPENAI_API_KEY=$EXISTING_OPENAI_KEY" >> "$DEST/.env"
  success ".env created (with OPENAI_API_KEY)"
else
  echo "# OPENAI_API_KEY=your-key-here" >> "$DEST/.env"
  success ".env created (no OPENAI_API_KEY — set it to enable AI/WealthReview tests)"
fi

# ── Step 8: Create public/uploads/ ───────────────────────────────────────────

step "Creating public/uploads/ for local media storage"
mkdir -p "$DEST/public/uploads"
success "public/uploads/ created"

# ── Step 9: Install from workspace root ──────────────────────────────────────

step "Running pnpm install from monorepo root"
cd "$ROOT_DIR"
# --no-frozen-lockfile: the codegen project adds new deps not in the existing lockfile
pnpm install --no-frozen-lockfile
success "pnpm install complete"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
success "codegen-projects/nextjs is ready!"
echo ""
echo "  To run E2E tests:"
echo "    pnpm -F e2e codegen:e2e:nextjs"
echo ""
echo "  To start the project manually:"
echo "    pnpm -F nextjs dev"
echo ""
