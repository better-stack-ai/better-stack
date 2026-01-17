#!/usr/bin/env node
/**
 * Fix imports script for ui-builder and minimal-tiptap components
 * 
 * After shadcn CLI installs components, it may:
 * 1. Create files in src/components/ui/ subdirectory
 * 2. Use @/ or @workspace/components/ui/ or @workspace/lib/ import patterns
 * 
 * This script:
 * 1. Moves files from src/components/ui/* to src/components/* (flattening the ui subdirectory)
 * 2. Fixes all imports to use @workspace/ui/* pattern
 * 3. Ensures all files have // @ts-nocheck
 */

const fs = require("fs");
const path = require("path");

const UI_DIR = path.resolve(__dirname, "../src");
const COMPONENTS_UI_DIR = path.resolve(__dirname, "../src/components/ui");

// Directories that should be processed for import fixes
const DIRS_TO_FIX = [
  path.resolve(__dirname, "../src/components"),
  path.resolve(__dirname, "../src/lib/ui-builder"),
];

// Import pattern replacements
// Order matters - more specific patterns should come first
// Each pattern captures the entire import path and quote style to ensure consistent quotes
const IMPORT_REPLACEMENTS = [
  // Fix previously broken mixed quotes (from previous buggy runs)
  [/from\s+"@workspace\/ui\/([^"']+)'/g, 'from "@workspace/ui/$1"'],
  
  // @/ patterns (shadcn default) - with double quotes
  [/from\s+"@\/components\/ui\/([^"]+)"/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+"@\/components\/([^"]+)"/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+"@\/lib\/([^"]+)"/g, 'from "@workspace/ui/lib/$1"'],
  [/from\s+"@\/hooks\/([^"]+)"/g, 'from "@workspace/ui/hooks/$1"'],
  // @/ patterns (shadcn default) - with single quotes
  [/from\s+'@\/components\/ui\/([^']+)'/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+'@\/components\/([^']+)'/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+'@\/lib\/([^']+)'/g, 'from "@workspace/ui/lib/$1"'],
  [/from\s+'@\/hooks\/([^']+)'/g, 'from "@workspace/ui/hooks/$1"'],
  
  // @workspace/components/ui/ pattern - with double quotes
  [/from\s+"@workspace\/components\/ui\/([^"]+)"/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+"@workspace\/components\/([^"]+)"/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+"@workspace\/lib\/([^"]+)"/g, 'from "@workspace/ui/lib/$1"'],
  [/from\s+"@workspace\/hooks\/([^"]+)"/g, 'from "@workspace/ui/hooks/$1"'],
  // @workspace/components/ui/ pattern - with single quotes
  [/from\s+'@workspace\/components\/ui\/([^']+)'/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+'@workspace\/components\/([^']+)'/g, 'from "@workspace/ui/components/$1"'],
  [/from\s+'@workspace\/lib\/([^']+)'/g, 'from "@workspace/ui/lib/$1"'],
  [/from\s+'@workspace\/hooks\/([^']+)'/g, 'from "@workspace/ui/hooks/$1"'],
];

function walk(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function ensureTsNoCheck(content, filePath) {
  if (content.includes("// @ts-nocheck")) return content;
  
  // Check if file starts with "use client" or "use server"
  const useClientMatch = content.match(/^(['"]use (client|server)['"];?\n?)/);
  if (useClientMatch) {
    return content.replace(useClientMatch[0], useClientMatch[0] + "// @ts-nocheck\n");
  }
  
  return "// @ts-nocheck\n" + content;
}

function fixImportsInContent(content) {
  let modified = false;
  let result = content;
  
  for (const [pattern, replacement] of IMPORT_REPLACEMENTS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    if (pattern.test(result)) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
      modified = true;
    }
  }
  
  return { content: result, modified };
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function rmDirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function moveUiSubdirectory() {
  // Check if src/components/ui exists and has subdirectories we need to move
  if (!fs.existsSync(COMPONENTS_UI_DIR)) {
    console.log("No src/components/ui directory found, skipping move step.");
    return;
  }
  
  const subdirs = ["ui-builder", "minimal-tiptap", "auto-form"];
  
  for (const subdir of subdirs) {
    const srcPath = path.join(COMPONENTS_UI_DIR, subdir);
    const destPath = path.join(__dirname, "../src/components", subdir);
    
    if (fs.existsSync(srcPath)) {
      console.log(`Moving ${srcPath} -> ${destPath}`);
      
      // Remove existing directory if it exists
      if (fs.existsSync(destPath)) {
        console.log(`  Removing existing ${destPath}`);
        rmDirRecursive(destPath);
      }
      
      // Copy new directory
      copyDirRecursive(srcPath, destPath);
      
      // Remove source
      rmDirRecursive(srcPath);
    }
  }
  
  // Also handle any loose files in src/components/ui/ like date-picker.tsx
  if (fs.existsSync(COMPONENTS_UI_DIR)) {
    for (const entry of fs.readdirSync(COMPONENTS_UI_DIR, { withFileTypes: true })) {
      if (!entry.isDirectory() && /\.(tsx?|jsx?)$/.test(entry.name)) {
        const srcPath = path.join(COMPONENTS_UI_DIR, entry.name);
        const destPath = path.join(__dirname, "../src/components", entry.name);
        
        console.log(`Moving file ${srcPath} -> ${destPath}`);
        fs.copyFileSync(srcPath, destPath);
        fs.unlinkSync(srcPath);
      }
    }
    
    // Remove ui directory if empty
    const remaining = fs.readdirSync(COMPONENTS_UI_DIR);
    if (remaining.length === 0) {
      fs.rmdirSync(COMPONENTS_UI_DIR);
      console.log("Removed empty src/components/ui directory");
    } else {
      console.log(`Warning: src/components/ui still has files: ${remaining.join(", ")}`);
    }
  }
}

function fixImports() {
  let totalFixed = 0;
  
  for (const dir of DIRS_TO_FIX) {
    if (!fs.existsSync(dir)) {
      console.log(`Skipping non-existent directory: ${dir}`);
      continue;
    }
    
    console.log(`\nProcessing directory: ${path.relative(process.cwd(), dir)}`);
    
    for (const file of walk(dir)) {
      let content = fs.readFileSync(file, "utf8");
      let modified = false;
      
      // Fix imports
      const importResult = fixImportsInContent(content);
      if (importResult.modified) {
        content = importResult.content;
        modified = true;
      }
      
      // Ensure @ts-nocheck
      const withNoCheck = ensureTsNoCheck(content, file);
      if (withNoCheck !== content) {
        content = withNoCheck;
        modified = true;
      }
      
      if (modified) {
        fs.writeFileSync(file, content);
        console.log(`  Fixed: ${path.relative(process.cwd(), file)}`);
        totalFixed++;
      }
    }
  }
  
  console.log(`\nTotal files fixed: ${totalFixed}`);
}

function main() {
  console.log("=== UI Builder Import Fix Script ===\n");
  
  // Step 1: Move files from src/components/ui/* to src/components/*
  console.log("Step 1: Moving files from src/components/ui/ subdirectory...\n");
  moveUiSubdirectory();
  
  // Step 2: Fix imports in all target directories
  console.log("\nStep 2: Fixing imports...\n");
  fixImports();
  
  console.log("\n=== Done ===");
}

main();
