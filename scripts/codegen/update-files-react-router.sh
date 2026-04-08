#!/usr/bin/env bash
# update-files-react-router.sh — Sync E2E overlay files back from the codegen project
#
# Run this after editing files in codegen-projects/react-router/ to persist your
# changes into scripts/codegen/files/react-router/ (the source of truth).
#
# Usage (from monorepo root):
#   bash scripts/codegen/update-files-react-router.sh

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
SRC="$ROOT_DIR/codegen-projects/react-router"
DST="$ROOT_DIR/scripts/codegen/files/react-router"

[ -d "$SRC" ] || die "codegen-projects/react-router does not exist. Run setup-react-router.sh first."

step "Syncing files from codegen-projects/react-router → scripts/codegen/files/react-router"

FILES=(
  "app/lib/adapters-build-check.ts"
  "app/lib/cms-schemas.ts"
  "app/lib/mock-users.ts"
  "app/lib/plugins/todo/api/backend.ts"
  "app/lib/plugins/todo/api/getters.ts"
  "app/lib/plugins/todo/client/client.tsx"
  "app/lib/plugins/todo/client/components.tsx"
  "app/lib/plugins/todo/client/hooks.tsx"
  "app/lib/plugins/todo/client/overrides.ts"
  "app/lib/plugins/todo/schema.ts"
  "app/lib/plugins/todo/types.ts"
  "app/lib/stack-auth.ts"
  "app/lib/stack-client.tsx"
  "app/lib/stack-public-chat.ts"
  "app/lib/stack.ts"
  "app/root.tsx"
  "app/routes.ts"
  "app/routes/api/example-auth/\$.ts"
  "app/routes/api/public-chat/\$.ts"
  "app/routes/cms-example.tsx"
  "app/routes/directory/category.\$categoryId.tsx"
  "app/routes/directory/index.tsx"
  "app/routes/directory/resource.\$id.tsx"
  "app/routes/pages/_layout.tsx"
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
success "$COUNT files updated in scripts/codegen/files/react-router/"
echo ""
echo "  Commit the updated files:"
echo "    git add scripts/codegen/files/react-router/"
echo "    git commit -m 'chore: update react-router E2E overlay files'"
