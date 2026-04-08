#!/usr/bin/env bash
# setup-react-router.sh — Scaffold and configure the React Router codegen project
#
# Usage (from monorepo root):
#   bash scripts/codegen/setup-react-router.sh
#
# What it does:
#   1. Creates codegen-projects/react-router/ via `shadcn init -t react-router`
#   2. Removes .git so the workspace git config tracks the files
#   3. Builds the local CLI and runs `btst init` with an explicit plugin list
#   4. Adds shadcn UI components needed by the E2E overlay
#   5. Copies E2E overlay files from scripts/codegen/files/react-router/ (overwrites)
#   6. Patches package.json (name, start:e2e, workspace deps)
#
# To update E2E overlay files after editing the codegen project:
#   bash scripts/codegen/update-files-react-router.sh
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
DEST="$ROOT_DIR/codegen-projects/react-router"
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
  die "codegen-projects/react-router already exists. Run 'bash scripts/codegen/cleanup.sh react-router' first."
fi

# ── Step 1: Scaffold with shadcn ─────────────────────────────────────────────

step "Scaffolding React Router project with shadcn init -t react-router"
mkdir -p "$ROOT_DIR/codegen-projects"
cd "$ROOT_DIR/codegen-projects"
pnpm dlx shadcn@latest init -t react-router --no-monorepo --base radix --preset nova --name react-router --yes
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
  --framework react-router \
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

# ── Step 5: Copy E2E overlay files ────────────────────────────────────────────

step "Copying E2E overlay files from scripts/codegen/files/react-router/"
cd "$DEST"
FILES_DIR="$SCRIPT_DIR/files/react-router"
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

// Set workspace package name (used by pnpm -F react-router)
pkg.name = "react-router";

// E2E start script: builds React Router then starts in production on port 3008
pkg.scripts = pkg.scripts || {};
pkg.scripts["start:e2e"] = "rm -rf build && rm -rf .react-router && react-router build && NODE_ENV=test PORT=3008 react-router-serve ./build/server/index.js";

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
BASE_URL=http://localhost:3008
VITE_BASE_URL=http://localhost:3008
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

# Derive VITE_HAS_OPENAI_KEY from OPENAI_API_KEY so the pages layout banner works
if grep -q "^OPENAI_API_KEY=." "$DEST/.env" && ! grep -q "^VITE_HAS_OPENAI_KEY=" "$DEST/.env"; then
  echo "VITE_HAS_OPENAI_KEY=1" >> "$DEST/.env"
  success "VITE_HAS_OPENAI_KEY=1 added to .env"
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
success "codegen-projects/react-router is ready!"
echo ""
echo "  To run E2E tests:"
echo "    pnpm -F e2e codegen:e2e:react-router"
echo ""
echo "  To start the project manually:"
echo "    pnpm -F react-router dev"
echo ""
echo "  To regenerate patches after changes:"
echo "    node scripts/codegen/generate-patches-react-router.mjs"
echo ""
