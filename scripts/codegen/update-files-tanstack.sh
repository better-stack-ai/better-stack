#!/usr/bin/env bash
# update-files-tanstack.sh — Sync E2E overlay files back from the codegen project
#
# Run this after editing files in codegen-projects/tanstack/ to persist your
# changes into scripts/codegen/files/tanstack/ (the source of truth).
#
# Usage (from monorepo root):
#   bash scripts/codegen/update-files-tanstack.sh

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
SRC="$ROOT_DIR/codegen-projects/tanstack"
DST="$ROOT_DIR/scripts/codegen/files/tanstack"

[ -d "$SRC" ] || die "codegen-projects/tanstack does not exist. Run setup-tanstack.sh first."

step "Syncing files from codegen-projects/tanstack → scripts/codegen/files/tanstack"

FILES=(
  "src/lib/adapters-build-check.ts"
  "src/lib/cms-schemas.ts"
  "src/lib/mock-users.ts"
  "src/lib/plugins/todo/api/backend.ts"
  "src/lib/plugins/todo/api/getters.ts"
  "src/lib/plugins/todo/client/client.tsx"
  "src/lib/plugins/todo/client/components.tsx"
  "src/lib/plugins/todo/client/hooks.tsx"
  "src/lib/plugins/todo/client/overrides.ts"
  "src/lib/plugins/todo/schema.ts"
  "src/lib/plugins/todo/types.ts"
  "src/lib/stack-auth.ts"
  "src/lib/stack-client.tsx"
  "src/lib/stack-public-chat.ts"
  "src/lib/stack.ts"
  "src/router.tsx"
  "src/routes/__root.tsx"
  "src/routes/api/example-auth/\$.ts"
  "src/routes/api/public-chat/\$.ts"
  "src/routes/cms-example.tsx"
  "src/routes/directory/\$id.tsx"
  "src/routes/directory/category/\$categoryId.tsx"
  "src/routes/directory/index.tsx"
  "src/routes/pages/\$.tsx"
  "src/routes/pages/route.tsx"
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
success "$COUNT files updated in scripts/codegen/files/tanstack/"
echo ""
echo "  Commit the updated files:"
echo "    git add scripts/codegen/files/tanstack/"
echo "    git commit -m 'chore: update tanstack E2E overlay files'"
