#!/bin/bash
# Format hook for BTST monorepo
# Runs after file edits (Agent and Tab) to auto-fix linting issues

# Read JSON input from stdin (required by hooks spec)
cat > /dev/null

# Run lint fix
pnpm run lint:fix

exit 0
