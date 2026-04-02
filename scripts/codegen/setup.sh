#!/usr/bin/env bash
# setup.sh — Orchestration: set up all (or a specific) codegen project(s)
#
# Usage (from monorepo root):
#   bash scripts/codegen/setup.sh              # sets up all frameworks
#   bash scripts/codegen/setup.sh nextjs       # sets up nextjs only
#   bash scripts/codegen/setup.sh tanstack     # sets up tanstack only
#   bash scripts/codegen/setup.sh react-router # sets up react-router only

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

step()    { echo -e "\n${BLUE}== $1 ==${NC}"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
die()     { echo -e "${RED}✗ $1${NC}"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRAMEWORK="${1:-all}"

case "$FRAMEWORK" in
  nextjs)
    step "Setting up Next.js codegen project"
    bash "$SCRIPT_DIR/setup-nextjs.sh"
    ;;
  tanstack)
    step "Setting up TanStack Start codegen project"
    bash "$SCRIPT_DIR/setup-tanstack.sh"
    ;;
  react-router)
    step "Setting up React Router codegen project"
    bash "$SCRIPT_DIR/setup-react-router.sh"
    ;;
  all)
    step "Setting up all codegen projects"
    bash "$SCRIPT_DIR/setup-nextjs.sh"
    bash "$SCRIPT_DIR/setup-tanstack.sh"
    bash "$SCRIPT_DIR/setup-react-router.sh"
    ;;
  *)
    die "Usage: $0 [nextjs|tanstack|react-router|all]"
    ;;
esac

success "Setup complete"
