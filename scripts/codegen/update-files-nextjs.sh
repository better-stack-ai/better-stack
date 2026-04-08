#!/usr/bin/env bash
# update-files-nextjs.sh — Sync E2E overlay files back from the codegen project
#
# Run this after editing files in codegen-projects/nextjs/ to persist your
# changes into scripts/codegen/files/nextjs/ (the source of truth).
#
# Usage (from monorepo root):
#   bash scripts/codegen/update-files-nextjs.sh

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

step()    { echo -e "\n${BLUE}== $1 ==${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
die()     { echo -e "${RED}✗ $1${NC}"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SRC="$ROOT_DIR/codegen-projects/nextjs"
DST="$ROOT_DIR/scripts/codegen/files/nextjs"

[ -d "$SRC" ] || die "codegen-projects/nextjs does not exist. Run setup-nextjs.sh first."

step "Syncing files from codegen-projects/nextjs → scripts/codegen/files/nextjs"

FILES=(
  "app/api/example-auth/[[...all]]/route.ts"
  "app/api/public-chat/[[...all]]/route.ts"
  "app/cms-example/page.tsx"
  "app/directory/[id]/page.tsx"
  "app/directory/category/[categoryId]/page.tsx"
  "app/directory/page.tsx"
  "app/layout.tsx"
  "app/pages/layout.tsx"
  "components/mode-toggle.tsx"
  "components/navbar.tsx"
  "lib/adapters-build-check.ts"
  "lib/cms-schemas.ts"
  "lib/mock-users.ts"
  "lib/plugins/todo/api/backend.ts"
  "lib/plugins/todo/api/getters.ts"
  "lib/plugins/todo/client/client.tsx"
  "lib/plugins/todo/client/components.tsx"
  "lib/plugins/todo/client/hooks.tsx"
  "lib/plugins/todo/client/overrides.ts"
  "lib/plugins/todo/schema.ts"
  "lib/plugins/todo/types.ts"
  "lib/stack-auth.ts"
  "lib/stack-client.tsx"
  "lib/stack-public-chat.ts"
  "lib/stack.ts"
)

COUNT=0
for f in "${FILES[@]}"; do
  src_file="$SRC/$f"
  dst_file="$DST/$f"
  if [ -f "$src_file" ]; then
    mkdir -p "$(dirname "$dst_file")"
    cp "$src_file" "$dst_file"
    success "$f"
    COUNT=$((COUNT + 1))
  else
    echo -e "${RED}⚠ Missing: $f${NC}"
  fi
done

echo ""
success "$COUNT files updated in scripts/codegen/files/nextjs/"
echo ""
echo "  Commit the updated files:"
echo "    git add scripts/codegen/files/nextjs/"
echo "    git commit -m 'chore: update nextjs E2E overlay files'"
