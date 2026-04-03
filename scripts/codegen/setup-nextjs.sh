#!/usr/bin/env bash
# setup-nextjs.sh — Scaffold and configure the Next.js codegen project
#
# Usage (from monorepo root):
#   bash scripts/codegen/setup-nextjs.sh [--baseline-only]
#
# Flags:
#   --baseline-only   Stop after btst init + git baseline commit.
#                     Use this to regenerate .patch files:
#                       1. bash scripts/codegen/setup-nextjs.sh --baseline-only
#                       2. Apply desired changes to codegen-projects/nextjs
#                       3. cd codegen-projects/nextjs && git diff > ../../scripts/codegen/patches/nextjs/NN-name.patch
#                       4. Run: node scripts/codegen/generate-patches-nextjs.mjs
#
# What it does (full run):
#   1. Creates codegen-projects/nextjs/ via `shadcn init -t next --name nextjs`
#   2. Removes .git so the workspace git config tracks the files
#   3. Builds the local CLI and runs `btst init` with an explicit plugin list
#   4. Adds shadcn UI components needed by the E2E overlay
#   5. Applies surgical .patch files from scripts/codegen/patches/nextjs/
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

# Parse flags
BASELINE_ONLY=false
for arg in "$@"; do
  case $arg in
    --baseline-only) BASELINE_ONLY=true ;;
  esac
done

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
node "$CLI_BIN" init \
  --yes \
  --framework nextjs \
  --adapter memory \
  --plugins "blog,ai-chat,cms,form-builder,ui-builder,kanban,comments,media,route-docs,open-api" \
  --skip-install
success "btst init complete"

# ── Step 4: Add shadcn UI components ──────────────────────────────────────────
# These are needed by the E2E overlay patches (todo plugin UI, etc.)

step "Adding shadcn UI components (checkbox, label, skeleton, input, sonner, dropdown-menu, separator)"
cd "$DEST"
pnpm dlx shadcn@latest add checkbox label skeleton input sonner dropdown-menu separator empty field item --yes --overwrite
success "shadcn components added"

# ── Step 5 (baseline-only): Init git baseline for patch regeneration ──────────

if [ "$BASELINE_ONLY" = true ]; then
  step "--baseline-only: initialising git baseline commit"
  cd "$DEST"
  git init -b main
  git config user.email "dev@btst.ai"
  git config user.name "BTST Dev"
  git add -A
  git commit -m "baseline: shadcn init + btst init output"
  success "Git baseline committed at $DEST"
  echo ""
  echo "  Next steps to regenerate patches:"
  echo "    1. Apply desired changes to codegen-projects/nextjs"
  echo "    2. node scripts/codegen/generate-patches-nextjs.mjs"
  echo ""
  exit 0
fi

# ── Step 5: Apply surgical patches ────────────────────────────────────────────

step "Applying E2E overlay patches from scripts/codegen/patches/nextjs/"
cd "$DEST"

# Detect whether shadcn created src/ layout and adjust patch targets accordingly
if [ -f "src/app/globals.css" ]; then
  warn "Detected src/ layout — patches assume non-src layout; manual adjustment may be needed"
fi

PATCH_COUNT=0
for patch_file in "$PATCHES"/*.patch; do
  if [ -f "$patch_file" ]; then
    patch_name="$(basename "$patch_file")"
    if patch -p1 --dry-run --silent < "$patch_file" 2>/dev/null; then
      patch -p1 < "$patch_file"
      success "Applied $patch_name"
      PATCH_COUNT=$((PATCH_COUNT + 1))
    else
      # Try with fuzz factor for patches that don't apply cleanly
      if patch -p1 -F 3 --dry-run --silent < "$patch_file" 2>/dev/null; then
        patch -p1 -F 3 < "$patch_file"
        warn "Applied $patch_name (with fuzz — shadcn output may have changed)"
        PATCH_COUNT=$((PATCH_COUNT + 1))
      else
        die "Failed to apply patch: $patch_name. Run with --baseline-only to regenerate patches."
      fi
    fi
  fi
done
success "$PATCH_COUNT patches applied"

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
