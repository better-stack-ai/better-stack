#!/usr/bin/env bash
# cleanup.sh — Remove a codegen project so it can be re-created from scratch
#
# Usage (from monorepo root):
#   bash scripts/codegen/cleanup.sh nextjs
#   bash scripts/codegen/cleanup.sh tanstack
#   bash scripts/codegen/cleanup.sh react-router
#   bash scripts/codegen/cleanup.sh all

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
FRAMEWORK="${1:-}"

cleanup_framework() {
  local fw="$1"
  local dir="$ROOT_DIR/codegen-projects/$fw"
  step "Cleaning up $fw"
  if [ -d "$dir" ]; then
    rm -rf "$dir"
    success "Removed $dir"
  else
    success "Nothing to clean: $dir does not exist"
  fi
}

case "$FRAMEWORK" in
  nextjs|tanstack|react-router)
    cleanup_framework "$FRAMEWORK"
    ;;
  all)
    cleanup_framework "nextjs"
    cleanup_framework "tanstack"
    cleanup_framework "react-router"
    ;;
  *)
    die "Usage: $0 [nextjs|tanstack|react-router|all]"
    ;;
esac

success "Cleanup complete"
