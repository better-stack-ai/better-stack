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
#   4. Adds shadcn UI components needed by the E2E overlay
#   5. Copies E2E overlay files from scripts/codegen/files/nextjs/ (overwrites)
#   6. Patches package.json (name, production boundary check, workspace deps)
#   7. Creates .env and public/uploads/
#   8. Runs pnpm install from the monorepo root
#
# To update E2E overlay files after editing the codegen project:
#   bash scripts/codegen/update-files-nextjs.sh

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
CLI_BIN="$ROOT_DIR/packages/cli/dist/index.cjs"

# ── Prerequisites ────────────────────────────────────────────────────────────

step "Checking prerequisites"
command -v pnpm >/dev/null 2>&1 || die "pnpm not found"
command -v node >/dev/null 2>&1 || die "node not found"
NODE_VERSION=$(node --version | cut -d. -f1 | tr -d 'v')
[ "$NODE_VERSION" -ge 22 ] || warn "Node.js v22+ recommended (current: $(node --version))"
node "$SCRIPT_DIR/assert-overlay-contracts.mjs"
success "Prerequisites OK"

# ── Guard: already exists ────────────────────────────────────────────────────

if [ -d "$DEST" ]; then
  die "codegen-projects/nextjs already exists. Run 'bash scripts/codegen/cleanup.sh nextjs' first."
fi

# ── Step 1: Scaffold with shadcn ─────────────────────────────────────────────

step "Scaffolding Next.js project with shadcn init -t next"
mkdir -p "$ROOT_DIR/codegen-projects"
cd "$ROOT_DIR/codegen-projects"
pnpm dlx shadcn@latest init -t next --no-monorepo --base radix --preset nova --name nextjs --yes
success "shadcn scaffold complete → $DEST"

# ── Step 2: Remove .git and lock file ────────────────────────────────────────

step "Removing .git and pnpm-lock.yaml from scaffolded project"
rm -rf "$DEST/.git"
rm -f "$DEST/pnpm-lock.yaml"
success ".git and pnpm-lock.yaml removed"

# ── Step 3: Build local CLI and run btst init ─────────────────────────────────

step "Building local @btst/codegen CLI"
cd "$ROOT_DIR"
pnpm --filter @btst/codegen build
success "CLI built → $CLI_BIN"

step "Running btst init (explicit plugin list, skip install)"
cd "$DEST"
# Form Builder rejects the non-isolating memory scaffold. The E2E overlay later
# replaces this production-safe template with its serialized test adapter.
node "$CLI_BIN" init \
  --yes \
  --framework nextjs \
  --adapter prisma \
  --plugins "blog,ai-chat,cms,form-builder,ui-builder,kanban,comments,media,route-docs,open-api" \
  --skip-install
success "btst init complete"

step "Removing temporary Prisma scaffold artifacts before the memory E2E overlay"
rm -f "$DEST/prisma.config.ts"
rm -rf "$DEST/prisma" "$DEST/generated/prisma" "$DEST/src/generated/prisma"
success "Temporary Prisma artifacts removed"

# ── Step 4: Add shadcn UI components ──────────────────────────────────────────
# These are needed by the E2E overlay patches (todo plugin UI, etc.)

step "Adding shadcn UI components (checkbox, label, skeleton, input, sonner, dropdown-menu, separator)"
cd "$DEST"
pnpm dlx shadcn@latest add checkbox label skeleton input sonner dropdown-menu separator empty field item --yes --overwrite
success "shadcn components added"

# Request-aware identity hydration and full-route static rendering cannot share
# one Next.js layout. Preserve the generated SSG/ISR pages in a static route
# group; the request group is supplied by the E2E overlay below.
step "Separating request-aware and static page route groups"
STATIC_PAGES_DIR="$DEST/app/(static)/pages"
mkdir -p "$STATIC_PAGES_DIR"
for static_route in ssg-blog ssg-cms ssg-forms ssg-kanban; do
  static_source="$DEST/app/pages/$static_route"
  if [ -d "$static_source" ]; then
    mv "$static_source" "$STATIC_PAGES_DIR/$static_route"
  fi
done
rm -f "$DEST/app/pages/layout.tsx"
GENERATED_PAGES_ROUTE="$DEST/app/pages/[[...all]]"
if [ -d "$GENERATED_PAGES_ROUTE" ]; then
  rm -r "$GENERATED_PAGES_ROUTE"
fi
success "Request-aware and static page route groups separated"

# ── Step 5: Copy E2E overlay files ────────────────────────────────────────────

step "Copying E2E overlay files from scripts/codegen/files/nextjs/"
cd "$DEST"
FILES_DIR="$SCRIPT_DIR/files/nextjs"
FILE_COUNT=0
while IFS= read -r -d '' src_file; do
  relative="${src_file#$FILES_DIR/}"
  dest_file="$DEST/$relative"
  mkdir -p "$(dirname "$dest_file")"
  cp "$src_file" "$dest_file"
  success "Copied $relative"
  FILE_COUNT=$((FILE_COUNT + 1))
done < <(find "$FILES_DIR" -type f -print0)
success "$FILE_COUNT files copied"

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
pkg.scripts["start:e2e"] = "rm -rf .next && next build && node ../../scripts/codegen/assert-nextjs-auth-boundary.mjs .next && NODE_ENV=test NODE_OPTIONS='--max-old-space-size=4096' next start -p 3006";

// btst init --skip-install doesn't add packages to package.json, so add them manually.
const btstDeps = {
  "@btst/stack": "workspace:*",
  "@btst/adapter-memory": "2.2.3",
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

// Point @btst/* packages that ARE in the workspace to workspace:*
// Adapter packages are published to npm, not in the workspace.
const WORKSPACE_BTST_PKGS = new Set(["@btst/stack"]);
for (const section of ["dependencies", "devDependencies"]) {
  if (!pkg[section]) continue;
  for (const [key] of Object.entries(pkg[section])) {
    if (key.startsWith("@btst/") && WORKSPACE_BTST_PKGS.has(key)) {
      pkg[section][key] = "workspace:*";
    }
  }
}

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
console.log("package.json patched");
PATCH_SCRIPT
success "package.json patched"

# ── Step 7: Create .env ───────────────────────────────────────────────────────

step "Creating .env"
cat > "$DEST/.env" <<ENVFILE
NEXT_PUBLIC_BASE_URL=http://localhost:3006
BASE_URL=http://localhost:3006
NEXT_PUBLIC_SITE_URL=http://localhost:3006
ENVFILE

# Merge any additional vars from .env.common (skips keys already present in .env)
ENV_COMMON="$SCRIPT_DIR/.env.common"
if [ -f "$ENV_COMMON" ]; then
  MERGED=0
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    key="${line%%=*}"
    if ! grep -q "^${key}=" "$DEST/.env"; then
      echo "$line" >> "$DEST/.env"
      MERGED=$((MERGED + 1))
    fi
  done < "$ENV_COMMON"
  success ".env created (merged $MERGED var(s) from .env.common)"
else
  success ".env created (no .env.common found)"
fi

# ── Step 8: Create public/uploads/ ───────────────────────────────────────────

step "Creating public/uploads/ for local media storage"
mkdir -p "$DEST/public/uploads"
success "public/uploads/ created"

# ── Step 9: Install from workspace root ──────────────────────────────────────

step "Running pnpm install from monorepo root"
cd "$ROOT_DIR"
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
echo "  To regenerate patches after changes:"
echo "    node scripts/codegen/generate-patches-nextjs.mjs"
echo ""
