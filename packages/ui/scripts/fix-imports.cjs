#!/usr/bin/env node
/**
 * Fix imports in ui-builder, minimal-tiptap, auto-form and lib/ui-builder files
 * after shadcn CLI installation.
 * 
 * Transforms:
 *   @workspace/components/ui/  → @workspace/ui/components/
 *   @workspace/lib/            → @workspace/ui/lib/
 *   @workspace/hooks/          → @workspace/ui/hooks/
 *   @/                         → @workspace/ui/
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIRS = [
  path.join(ROOT, "src/components/ui-builder"),
  path.join(ROOT, "src/components/minimal-tiptap"),
  path.join(ROOT, "src/components/auto-form"),
  path.join(ROOT, "src/lib/ui-builder"),
  path.join(ROOT, "src/hooks"),
  path.join(ROOT, "src/components"), // For date-picker.tsx etc
];

// Order matters - more specific patterns first
const REPLACEMENTS = [
  // @workspace/components/ui/ → @workspace/ui/components/
  [/@workspace\/components\/ui\//g, "@workspace/ui/components/"],
  // @workspace/lib/ → @workspace/ui/lib/
  [/@workspace\/lib\//g, "@workspace/ui/lib/"],
  // @workspace/hooks/ → @workspace/ui/hooks/
  [/@workspace\/hooks\//g, "@workspace/ui/hooks/"],
  // @/ → @workspace/ui/ (fallback for any remaining)
  [/from\s+["']@\//g, 'from "@workspace/ui/'],
];

function* walk(dir, maxDepth = 10) {
  if (maxDepth <= 0) return;
  if (!fs.existsSync(dir)) return;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath, maxDepth - 1);
    } else if (/\.(tsx?|jsx?|css)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

function fixImports() {
  let totalFixed = 0;
  const processedDirs = new Set();
  
  for (const dir of DIRS) {
    if (!fs.existsSync(dir)) {
      console.log(`Skipping (not found): ${path.relative(ROOT, dir)}`);
      continue;
    }
    
    // Handle both directories and files
    const stat = fs.statSync(dir);
    const files = stat.isDirectory() ? [...walk(dir)] : [dir];
    
    for (const file of files) {
      // Skip if already processed (in case of overlapping dirs)
      if (processedDirs.has(file)) continue;
      processedDirs.add(file);
      
      let content = fs.readFileSync(file, "utf8");
      let modified = false;
      
      for (const [pattern, replacement] of REPLACEMENTS) {
        const newContent = content.replace(pattern, replacement);
        if (newContent !== content) {
          content = newContent;
          modified = true;
        }
      }
      
      if (modified) {
        fs.writeFileSync(file, content);
        console.log(`Fixed: ${path.relative(ROOT, file)}`);
        totalFixed++;
      }
    }
  }
  
  console.log(`\nTotal files fixed: ${totalFixed}`);
}

fixImports();
