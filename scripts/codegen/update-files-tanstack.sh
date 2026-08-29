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
success "$COUNT files updated in scripts/codegen/files/tanstack/"
echo ""
echo "  Commit the updated files:"
echo "    git add scripts/codegen/files/tanstack/"
echo "    git commit -m 'chore: update tanstack E2E overlay files'"
