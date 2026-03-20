#!/usr/bin/env bash
# test-registry.sh — End-to-end validation of the BTST shadcn registry.
#
# Steps:
#  1. Build @btst/stack (ensures dist/ is fresh) — skipped when CI=true
#  2. Rebuild all registries from source         — skipped when CI=true
#  3. Serve registry/ with http-server on port 8766
#  4. npm-pack @btst/stack into a tarball
#  5. Create a blank Next.js project (--use-npm) in /tmp/
#  6. Install the packed tarball + shadcn add each plugin registry item
#  7. npm run build → validates the project compiles
#  8. Cleanup
#
# When invoked from the registry.yml workflow the caller has already run
# `pnpm --filter @btst/stack build` and `pnpm --filter @btst/stack build-registry`
# as dedicated steps, so steps 1 and 2 are skipped to avoid doubling build time.
# Set CI=true (the workflow does this) or pass --skip-build to skip them.

set -euo pipefail

# --skip-build flag or CI=true skips steps 1 & 2 (build + build-registry).
SKIP_BUILD=false
for arg in "$@"; do
    [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true
done
[[ "${CI:-}" == "true" ]] && SKIP_BUILD=true

# ---------------------------------------------------------------------------
# Colours
# ---------------------------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

step()    { echo -e "\n${BLUE}═══════════════════════════════════════════${NC}"; echo -e "${BLUE}STEP: $1${NC}"; echo -e "${BLUE}═══════════════════════════════════════════${NC}\n"; }
success() { echo -e "${GREEN}✓ $1${NC}"; }
warn()    { echo -e "${YELLOW}⚠  $1${NC}"; }
error()   { echo -e "${RED}✗ $1${NC}"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
REGISTRY_DIR="$PACKAGE_DIR/registry"
TEST_DIR="/tmp/test-btst-registry-$(date +%s)"
SERVER_PORT=8766
SERVER_PID=""
TEST_PASSED=false

PLUGIN_NAMES=("ui-builder" "blog" "ai-chat" "cms" "form-builder" "kanban" "comments" "media")

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
    echo ""
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "Stopping HTTP server (PID: $SERVER_PID)…"
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi

    if [ "$TEST_PASSED" = true ] && [ -d "$TEST_DIR" ]; then
        echo "Removing test directory: $TEST_DIR"
        rm -rf "$TEST_DIR"
    elif [ -d "$TEST_DIR" ]; then
        warn "Test directory preserved for debugging: $TEST_DIR"
    fi

    echo -e "${GREEN}Cleanup complete.${NC}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
pause() {
    local seconds="${1:-20}"
    echo "Waiting ${seconds}s…"
    sleep "$seconds"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo -e "${BLUE}"
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║        BTST Shadcn Registry Test Script              ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # ------------------------------------------------------------------
    step "1 — Building @btst/stack package (ensures dist/ is fresh)"
    # ------------------------------------------------------------------
    cd "$PACKAGE_DIR"
    if [ "$SKIP_BUILD" = true ]; then
        warn "Skipping build — dist/ assumed fresh (CI pre-step or --skip-build)"
    else
        pnpm run build
        success "@btst/stack built"
    fi

    # ------------------------------------------------------------------
    step "2 — Building all plugin registries"
    # ------------------------------------------------------------------
    if [ "$SKIP_BUILD" = true ]; then
        warn "Skipping build-registry — registry/ assumed fresh (CI pre-step or --skip-build)"
    else
        pnpm run build-registry
        success "All registries built"
    fi

    # ------------------------------------------------------------------
    step "3 — Starting HTTP server on port $SERVER_PORT"
    # ------------------------------------------------------------------
    # Kill any stale server from a previous run
    lsof -ti:"$SERVER_PORT" | xargs kill -9 2>/dev/null || true
    sleep 1

    npx --yes http-server "$REGISTRY_DIR" -p $SERVER_PORT -c-1 --silent &
    SERVER_PID=$!

    # Wait for server to be ready (up to 15s), then an extra 20s for stability
    for i in $(seq 1 15); do
        if curl -sf "http://localhost:$SERVER_PORT/btst-blog.json" > /dev/null 2>&1; then
            break
        fi
        sleep 1
        if [ "$i" = "15" ]; then
            error "HTTP server did not become available in time"
            exit 1
        fi
    done
    success "HTTP server running (PID: $SERVER_PID)"
    pause 20

    # ------------------------------------------------------------------
    step "4 — Packing @btst/stack with npm pack"
    # ------------------------------------------------------------------
    cd "$PACKAGE_DIR"
    # Use npm pack (not pnpm pack) to produce a standard npm-compatible tarball
    TARBALL_NAME=$(npm pack --quiet 2>/dev/null | tail -1 | tr -d '[:space:]')
    if [ -z "$TARBALL_NAME" ] || [ ! -f "$TARBALL_NAME" ]; then
        # Fallback: find the most recently created .tgz
        TARBALL_NAME=$(ls -t ./*.tgz 2>/dev/null | head -1)
    fi
    if [ -z "$TARBALL_NAME" ] || [ ! -f "$TARBALL_NAME" ]; then
        error "npm pack did not produce a tarball"
        exit 1
    fi
    TARBALL_ABS="$(cd "$(dirname "$TARBALL_NAME")" && pwd)/$(basename "$TARBALL_NAME")"
    success "Packed to $(basename "$TARBALL_ABS")"

    # ------------------------------------------------------------------
    step "5 — Creating blank Next.js project (npm) in $TEST_DIR"
    # ------------------------------------------------------------------
    mkdir -p "$TEST_DIR"
    cd "$TEST_DIR"
    # Force npm so subsequent npm install / npm run build are consistent
    npx --yes create-next-app@latest test-app \
        --typescript \
        --tailwind \
        --eslint \
        --app \
        --src-dir \
        --no-import-alias \
        --use-npm \
        --yes
    success "Next.js project created at $TEST_DIR/test-app"

    # ------------------------------------------------------------------
    step "6 — Configuring the test project"
    # ------------------------------------------------------------------
    cd "$TEST_DIR/test-app"

    # Use legacy-peer-deps to handle React 18/19 + peer dep mismatches
    echo "legacy-peer-deps=true" > .npmrc

    # Install @btst/stack from the packed tarball
    npm install "$TARBALL_ABS" --legacy-peer-deps
    success "@btst/stack installed from tarball"

    # Install common peerDeps of @btst/stack that consumers would already have.
    # shadcn add installs the plugin-specific deps listed in each registry item's
    # "dependencies" array; these are the always-present baseline deps.
    npm install \
        @tanstack/react-query \
        react-error-boundary \
        react-hook-form \
        @hookform/resolvers \
        zod \
        lucide-react \
        sonner \
        clsx \
        tailwind-merge \
        class-variance-authority \
        --legacy-peer-deps
    success "Common peer deps installed"

    # Patch tsconfig — mirrors what the ui-builder project does:
    # • skipLibCheck: true        — don't error on 3rd-party types in node_modules
    # • strictFunctionTypes:false — bivariant function params (e.g. error callbacks)
    # • exclude auto-form & minimal-tiptap — external registry components that
    #   aren't ours to fix; exclude them the same way the ui-builder project does
    node -e "
const fs = require('fs');
const tc = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
tc.compilerOptions = tc.compilerOptions || {};
tc.compilerOptions.skipLibCheck = true;
tc.compilerOptions.strictFunctionTypes = false;
tc.exclude = tc.exclude || [];
['src/components/ui/auto-form/**/*', 'src/components/ui/minimal-tiptap/**/*'].forEach(p => {
  if (!tc.exclude.includes(p)) tc.exclude.push(p);
});
fs.writeFileSync('tsconfig.json', JSON.stringify(tc, null, 2));
console.log('tsconfig.json patched');
"
    success "tsconfig.json patched"

    # ------------------------------------------------------------------
    step "7 — Installing plugin registry items via shadcn CLI"
    # ------------------------------------------------------------------
    # Initialize shadcn with Radix as the base component library (radix-nova style).
    # Our source code uses Radix-based shadcn APIs (Accordion type="single"/collapsible,
    # Select onValueChange: (value: string) => void, etc.). The default shadcn@latest
    # uses Base UI components with incompatible APIs for these primitives.
    # Note: the "form" component has no files in the radix-nova registry, so it is
    # embedded from packages/ui (see build-registry.ts — "form" excluded from
    # STANDARD_SHADCN_COMPONENTS). All other standard components (select, accordion,
    # dialog, dropdown-menu, …) are correctly Radix-based with this flag.
    npx --yes shadcn@4.0.5 init --defaults --force --base radix
    success "shadcn init completed (radix-nova)"

    INSTALL_FAILURES=()

    # Install all plugin registry items.
    # If a plugin's registryDependencies reference an external URL that is not
    # yet publicly accessible (e.g. a private repo), the install will fail.
    # We treat those as warnings so the rest of the test can proceed.
    for PLUGIN in "${PLUGIN_NAMES[@]}"; do
        echo "Installing btst-${PLUGIN}…"
        if npx --yes shadcn@4.0.5 add \
            "http://localhost:$SERVER_PORT/btst-${PLUGIN}.json" \
            --yes --overwrite 2>&1; then
            success "btst-${PLUGIN} installed"
        else
            warn "btst-${PLUGIN} install failed (likely an inaccessible external registry dependency). Files from our registry were still written; see debug dir."
            INSTALL_FAILURES+=("$PLUGIN")
        fi
    done

    if [ ${#INSTALL_FAILURES[@]} -gt 0 ]; then
        warn "Plugins with non-critical install failures: ${INSTALL_FAILURES[*]}"
        warn "This is usually caused by registryDependencies pointing to private/unavailable external registries."
    fi

    # ------------------------------------------------------------------
    step "7b — Pinning tiptap packages to 3.20.1"
    # ------------------------------------------------------------------
    # Must run AFTER all `shadcn add` calls so that tiptap packages are already
    # present as direct dependencies — setting npm overrides for packages that
    # are not yet direct deps and then having shadcn add them afterwards causes
    # EOVERRIDE, which silently aborts the shadcn install and leaves plugin
    # files (boards-list-page, page-list-page, …) unwritten.
    node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const V = '3.20.1';
const pkgs = [
  '@tiptap/core','@tiptap/react','@tiptap/pm','@tiptap/starter-kit',
  '@tiptap/extensions','@tiptap/markdown',
  '@tiptap/extension-blockquote','@tiptap/extension-bold',
  '@tiptap/extension-bubble-menu','@tiptap/extension-bullet-list',
  '@tiptap/extension-code','@tiptap/extension-code-block',
  '@tiptap/extension-code-block-lowlight','@tiptap/extension-color',
  '@tiptap/extension-document','@tiptap/extension-dropcursor',
  '@tiptap/extension-floating-menu','@tiptap/extension-gapcursor',
  '@tiptap/extension-hard-break','@tiptap/extension-heading',
  '@tiptap/extension-horizontal-rule','@tiptap/extension-image',
  '@tiptap/extension-italic','@tiptap/extension-link',
  '@tiptap/extension-list','@tiptap/extension-list-item',
  '@tiptap/extension-list-keymap','@tiptap/extension-ordered-list',
  '@tiptap/extension-paragraph','@tiptap/extension-strike',
  '@tiptap/extension-table','@tiptap/extension-text',
  '@tiptap/extension-text-style','@tiptap/extension-typography',
  '@tiptap/extension-underline'
];
pkg.overrides = pkg.overrides || {};
for (const p of pkgs) {
  if (pkg.dependencies?.[p]) pkg.dependencies[p] = V;
  pkg.overrides[p] = V;
}
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2));
console.log('package.json updated with tiptap overrides');
"
    success "Tiptap overrides written (npm install runs in step 8)"

    # ------------------------------------------------------------------
    step "7c — Patching external registry files with known type errors"
    # ------------------------------------------------------------------
    # Some files installed from external registries (e.g. the ui-builder component)
    # have TypeScript issues we cannot fix in their source. Add @ts-nocheck to
    # suppress them — the same pattern the ui-builder project uses for its own test.
    add_ts_nocheck() {
        local file="$1"
        if [ -f "$file" ] && ! grep -q "@ts-nocheck" "$file"; then
            printf '// @ts-nocheck\n' | cat - "$file" > "$file.tmp" && mv "$file.tmp" "$file"
            success "Added @ts-nocheck to: $file"
        fi
    }
    add_ts_nocheck "src/components/ui/ui-builder/index.tsx"
    add_ts_nocheck "src/components/ui/minimal-tiptap/components/image/image-edit-block.tsx"

    # ------------------------------------------------------------------
    step "7d — Creating smoke-import page to force TypeScript to compile all plugin files"
    # ------------------------------------------------------------------
    # Without this page, `next build` only type-checks files reachable from
    # existing pages. Installed plugin components are never imported, so missing
    # npm dependencies (e.g. `remend`, `react-markdown`) go undetected.
    # This page re-exports from each plugin's top-level page wrapper, which
    # causes TypeScript to follow the full import chain for every plugin.
    mkdir -p src/app/btst-smoke-test
    cat > src/app/btst-smoke-test/page.tsx << 'SMOKE_EOF'
"use client";
// Smoke-test page: forces TypeScript to compile all installed btst plugin
// components so that missing npm dependencies are caught at build time.
// Named imports ensure the full dependency chain is type-checked.
import { HomePageComponent } from "@/components/btst/blog/client/components/pages/home-page";
import { ChatPageComponent } from "@/components/btst/ai-chat/client/components/pages/chat-page";
import { DashboardPageComponent } from "@/components/btst/cms/client/components/pages/dashboard-page";
import { FormListPageComponent } from "@/components/btst/form-builder/client/components/pages/form-list-page";
import { BoardsListPageComponent } from "@/components/btst/kanban/client/components/pages/boards-list-page";
import { ModerationPageComponent } from "@/components/btst/comments/client/components/pages/moderation-page";
import { PageListPage } from "@/components/btst/ui-builder/client/components/pages/page-list-page";
import { LibraryPageComponent } from "@/components/btst/media/client/components/pages/library-page";

// Suppress unused-import warnings while still forcing TS to resolve everything.
void [HomePageComponent, ChatPageComponent, DashboardPageComponent,
      FormListPageComponent, BoardsListPageComponent, ModerationPageComponent, PageListPage,
      LibraryPageComponent];

export default function SmokeTestPage() {
  return <div data-testid="btst-smoke-test">Registry smoke test — all plugin imports resolved.</div>;
}
SMOKE_EOF
    success "Smoke-import page created at src/app/btst-smoke-test/page.tsx"

    # ------------------------------------------------------------------
    step "8 — Building the Next.js project"
    # ------------------------------------------------------------------
    npm install --legacy-peer-deps
    npm run build
    success "Project built successfully!"

    TEST_PASSED=true

    echo -e "\n${GREEN}"
    echo "╔══════════════════════════════════════════════════════╗"
    echo "║                   TEST PASSED!                       ║"
    echo "╚══════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "Test project: ${YELLOW}$TEST_DIR/test-app${NC}"
}

main "$@"
