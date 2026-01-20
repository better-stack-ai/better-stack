#!/bin/bash
# Session initialization hook for better-stack monorepo
# Sets up environment variables for the session

# Read JSON input from stdin (required by hooks spec)
cat > /dev/null

# Output session configuration
# Set Node.js 22 environment and any other project-specific env vars
cat << 'EOF'
{
  "env": {
    "NODE_OPTIONS": "--max-old-space-size=8192"
  },
  "additional_context": "This is the better-stack monorepo. Use Node.js v22 (run: source ~/.nvm/nvm.sh && nvm use 22). Build with: pnpm build. Typecheck with: pnpm typecheck. Lint with: pnpm lint."
}
EOF
