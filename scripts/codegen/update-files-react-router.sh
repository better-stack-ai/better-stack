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

# The destination tree is the overlay manifest. Deriving from it keeps every
# maintained file—including server-only origin helpers—in the reverse sync.
FILES=()
while IFS= read -r file; do
  FILES+=("${file#./}")
done < <(cd "$DST" && find . -type f -print | LC_ALL=C sort)

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
