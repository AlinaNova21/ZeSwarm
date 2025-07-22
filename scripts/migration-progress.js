#!/usr/bin/env node
/**
 * TypeScript Migration Progress Tracker
 * 
 * Generates a progress report for the TypeScript migration
 */

const fs = require('fs');
const path = require('path');

function findFiles(dir, extensions, exclude = []) {
  const files = [];
  
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);
      
      // Skip excluded directories
      if (exclude.some(ex => relativePath.includes(ex))) {
        continue;
      }
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        files.push(relativePath);
      }
    }
  }
  
  walk(dir);
  return files.sort();
}

function generateReport() {
  const srcDir = path.join(process.cwd(), 'src');
  
  if (!fs.existsSync(srcDir)) {
    console.error('src directory not found');
    process.exit(1);
  }
  
  // Find TypeScript and JavaScript files
  const tsFiles = findFiles(srcDir, ['.ts', '.tsx'], ['tmp', 'node_modules']);
  const jsFiles = findFiles(srcDir, ['.js', '.jsx'], ['tmp', 'node_modules']);
  
  // Filter out type definition files for count
  const tsSourceFiles = tsFiles.filter(f => !f.endsWith('.d.ts'));
  
  const totalFiles = tsSourceFiles.length + jsFiles.length;
  const migratedCount = tsSourceFiles.length;
  const remainingCount = jsFiles.length;
  const percentage = totalFiles > 0 ? Math.round((migratedCount / totalFiles) * 100) : 0;
  
  console.log('# TypeScript Migration Progress Report');
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');
  console.log('## Summary');
  console.log(`- **Total Files**: ${totalFiles}`);
  console.log(`- **Migrated (TypeScript)**: ${migratedCount}`);
  console.log(`- **Remaining (JavaScript)**: ${remainingCount}`);
  console.log(`- **Progress**: ${percentage}%`);
  console.log('');
  
  // Progress bar
  const barLength = 40;
  const filledLength = Math.round((percentage / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  console.log(`\`${bar}\` ${percentage}%`);
  console.log('');
  
  if (tsSourceFiles.length > 0) {
    console.log('## ✅ Migrated Files (TypeScript)');
    tsSourceFiles.forEach(file => {
      console.log(`- \`${file}\``);
    });
    console.log('');
  }
  
  if (jsFiles.length > 0) {
    console.log('## 📋 Remaining Files (JavaScript)');
    
    // Categorize files by priority
    const priorityFiles = [
      'src/main.js',
      'src/config.js', 
      'src/processes.js',
      'src/manager.js',
      'src/constants.js'
    ];
    
    const managerFiles = jsFiles.filter(f => f.includes('Manager.js'));
    const pathfindingFiles = jsFiles.filter(f => f.includes('pathfinding/'));
    const libFiles = jsFiles.filter(f => f.includes('lib/') && !f.includes('pathfinding/'));
    const seasonFiles = jsFiles.filter(f => f.includes('season/'));
    const otherFiles = jsFiles.filter(f => 
      !priorityFiles.includes(f) && 
      !managerFiles.includes(f) && 
      !pathfindingFiles.includes(f) && 
      !libFiles.includes(f) &&
      !seasonFiles.includes(f)
    );
    
    if (priorityFiles.some(f => jsFiles.includes(f))) {
      console.log('### 🔥 High Priority (Core Infrastructure)');
      priorityFiles.filter(f => jsFiles.includes(f)).forEach(file => {
        console.log(`- \`${file}\``);
      });
      console.log('');
    }
    
    if (managerFiles.length > 0) {
      console.log('### 👥 Managers');
      managerFiles.forEach(file => {
        console.log(`- \`${file}\``);
      });
      console.log('');
    }
    
    if (pathfindingFiles.length > 0) {
      console.log('### 🗺️ Pathfinding System');
      pathfindingFiles.forEach(file => {
        console.log(`- \`${file}\``);
      });
      console.log('');
    }
    
    if (libFiles.length > 0) {
      console.log('### 📚 Utility Libraries');
      libFiles.forEach(file => {
        console.log(`- \`${file}\``);
      });
      console.log('');
    }
    
    if (seasonFiles.length > 0) {
      console.log('### 🌟 Seasonal Content');
      seasonFiles.forEach(file => {
        console.log(`- \`${file}\``);
      });
      console.log('');
    }
    
    if (otherFiles.length > 0) {
      console.log('### 📄 Other Files');
      otherFiles.forEach(file => {
        console.log(`- \`${file}\``);
      });
      console.log('');
    }
  }
  
  console.log('## 📊 Migration Statistics');
  console.log('| Category | Count | Percentage |');
  console.log('|----------|--------|------------|');
  console.log(`| Migrated (TS) | ${migratedCount} | ${percentage}% |`);
  console.log(`| Remaining (JS) | ${remainingCount} | ${100-percentage}% |`);
  console.log(`| **Total** | **${totalFiles}** | **100%** |`);
  console.log('');
  
  console.log('## 🛠️ Quick Commands');
  console.log('```bash');
  console.log('# Migrate a specific file');
  console.log('node scripts/migrate-file.js src/CreepManager.js');
  console.log('');
  console.log('# Type check all files');
  console.log('pnpm type-check');
  console.log('');
  console.log('# Build project');
  console.log('pnpm build');
  console.log('');
  console.log('# Update this report');
  console.log('node scripts/migration-progress.js');
  console.log('```');
}

// Run the report
if (require.main === module) {
  generateReport();
}

module.exports = { generateReport, findFiles };