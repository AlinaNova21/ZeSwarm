#!/usr/bin/env node
/**
 * TypeScript Migration Helper Script
 * 
 * This script helps migrate JavaScript files to TypeScript by:
 * 1. Renaming .js files to .ts
 * 2. Adding basic type annotations
 * 3. Updating import statements
 * 4. Adding common Screeps types
 */

const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node migrate-file.js <file.js>');
  console.error('Example: node migrate-file.js src/CreepManager.js');
  process.exit(1);
}

const jsPath = path.resolve(filePath);
const tsPath = jsPath.replace(/\.js$/, '.ts');

if (!fs.existsSync(jsPath)) {
  console.error(`File not found: ${jsPath}`);
  process.exit(1);
}

if (jsPath === tsPath) {
  console.error('File must have .js extension');
  process.exit(1);
}

console.log(`Migrating ${jsPath} -> ${tsPath}`);

// Read the JavaScript file
let content = fs.readFileSync(jsPath, 'utf8');

// Basic TypeScript transformations
content = transformToTypeScript(content);

// Write the TypeScript file
fs.writeFileSync(tsPath, content);

// Remove the original JavaScript file
fs.unlinkSync(jsPath);

console.log('✅ Migration complete!');
console.log('📝 Next steps:');
console.log('  1. Review the generated TypeScript file');
console.log('  2. Add proper type annotations');
console.log('  3. Update imports in other files');
console.log('  4. Run `pnpm build` to check for errors');

function transformToTypeScript(content) {
  // Add TypeScript-specific transformations
  
  // 1. Convert module.exports to export
  content = content.replace(/module\.exports\s*=\s*/, 'export default ');
  content = content.replace(/exports\.(\w+)\s*=/, 'export const $1 =');
  
  // 2. Convert require() to import statements (basic cases)
  content = content.replace(
    /const\s+(\w+)\s*=\s*require\(['"`]([^'"`]+)['"`]\)/g,
    "import $1 from '$2'"
  );
  content = content.replace(
    /const\s+\{([^}]+)\}\s*=\s*require\(['"`]([^'"`]+)['"`]\)/g,
    "import { $1 } from '$2'"
  );
  
  // 3. Add basic type annotations for common Screeps patterns
  content = content.replace(
    /function\s+(\w+)\s*\(\s*creep\s*\)/g,
    'function $1(creep: Creep)'
  );
  content = content.replace(
    /function\s+(\w+)\s*\(\s*room\s*\)/g,
    'function $1(room: Room)'
  );
  content = content.replace(
    /function\s+(\w+)\s*\(\s*spawn\s*\)/g,
    'function $1(spawn: StructureSpawn)'
  );
  
  // 4. Add type annotations for common variable patterns
  content = content.replace(
    /const\s+creeps\s*=\s*Game\.creeps/g,
    'const creeps: { [name: string]: Creep } = Game.creeps'
  );
  content = content.replace(
    /const\s+rooms\s*=\s*Game\.rooms/g,
    'const rooms: { [name: string]: Room } = Game.rooms'
  );
  content = content.replace(
    /const\s+spawns\s*=\s*Game\.spawns/g,
    'const spawns: { [name: string]: StructureSpawn } = Game.spawns'
  );
  
  // 5. Add common type imports if Screeps types are used
  if (content.includes('Creep') || content.includes('Room') || content.includes('Game')) {
    const hasImports = content.includes('import');
    const typeImports = hasImports ? '' : "// Types are provided by @types/screeps\n\n";
    content = typeImports + content;
  }
  
  return content;
}