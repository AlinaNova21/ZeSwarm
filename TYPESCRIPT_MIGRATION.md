# TypeScript Migration Guide for ZeSwarm

This document provides a comprehensive guide for migrating the ZeSwarm codebase from JavaScript to TypeScript.

## Current Status
- **Progress**: 10/81 files migrated (12% complete)
- **Build System**: ✅ Already configured with TypeScript support
- **Package Manager**: Migrating from Yarn v2 to pnpm

## Quick Start

### Environment Setup
1. **Install pnpm** (if not already installed):
   ```bash
   npm install -g pnpm
   ```

2. **Setup project dependencies**:
   ```bash
   pnpm install
   ```

3. **Verify TypeScript setup**:
   ```bash
   pnpm build
   pnpm tsc --noEmit
   ```

### Migration Workflow

#### 1. Automated Migration (Recommended)
Use the migration helper script for basic file conversion:

```bash
node scripts/migrate-file.js src/CreepManager.js
```

This script will:
- Rename `.js` to `.ts`
- Convert `module.exports` to `export default`
- Convert `require()` to `import`
- Add basic Screeps type annotations

#### 2. Manual Migration Steps
For complex files or when automated migration needs refinement:

1. **Rename file**: `filename.js` → `filename.ts`
2. **Update imports**: Convert require statements to ES6 imports
3. **Add type annotations**: Start with function parameters and return types
4. **Test build**: Run `pnpm build` to catch type errors
5. **Update references**: Update imports in other files

## Migration Priority Order

### Phase 1: Core Infrastructure (High Priority)
```
src/main.js          -> src/main.ts          (Entry point)
src/config.js        -> src/config.ts        (Configuration)
src/constants.js     -> src/constants.ts     (Constants)
src/processes.js     -> src/processes.ts     (Process management)
src/manager.js       -> src/manager.ts       (Core manager)
```

### Phase 2: Memory & Task Management
```
src/MemoryManager.js -> src/MemoryManager.ts
src/TaskManager.js   -> src/TaskManager.ts
src/MemHack.js       -> src/MemHack.ts
```

### Phase 3: Managers
```
src/CreepManager.js     -> src/CreepManager.ts
src/SpawnManager.js     -> src/SpawnManager.ts
src/DefenseManager.js   -> src/DefenseManager.ts
src/RaidManager.js      -> src/RaidManager.ts
src/UpgradeManager.js   -> src/UpgradeManager.ts
src/ExpansionPlanner.js -> src/ExpansionPlanner.ts
src/LayoutManager.js    -> src/LayoutManager.ts
```

### Phase 4: Pathfinding System
```
src/lib/pathfinding/index.js        -> src/lib/pathfinding/index.ts
src/lib/pathfinding/pathing.js      -> src/lib/pathfinding/pathing.ts
src/lib/pathfinding/Traveler.js     -> src/lib/pathfinding/Traveler.ts
src/lib/pathfinding/pathing.utils.js -> src/lib/pathfinding/pathing.utils.ts
```

### Phase 5: Utilities & Libraries
```
src/lib/mincut.js    -> src/lib/mincut.ts
src/lib/Tree.js      -> src/lib/Tree.ts
src/lib/Pathfind.js  -> src/lib/Pathfind.ts
```

### Phase 6: UI & Visualization
```
src/RoomVisual.js -> src/RoomVisual.ts
src/ui.js         -> src/ui.ts
```

### Phase 7: Seasonal Content
```
src/season/index.js                      -> src/season/index.ts
src/season/season1/index.js              -> src/season/season1/index.ts
src/season/season1/ScoreManager.js       -> src/season/season1/ScoreManager.ts
src/season/season2/index.js              -> src/season/season2/index.ts
src/season/season3/index.js              -> src/season/season3/index.ts
```

## TypeScript Best Practices

### 1. Type Definitions
Always use proper types for Screeps objects:

```typescript
// Good
function manageCreep(creep: Creep): void {
  // implementation
}

// Better - with union types for specificity
function manageCreep(creep: Creep): CreepMoveReturnCode | CreepActionReturnCode {
  // implementation
}
```

### 2. Interface Definitions
Create interfaces for complex data structures:

```typescript
interface CreepTask {
  type: string;
  target: Id<RoomObject>;
  priority: number;
  assigned?: string;
}

interface RoomMemory {
  tasks: CreepTask[];
  lastScanned: number;
  threatLevel: number;
}
```

### 3. Generic Functions
Use generics for reusable functions:

```typescript
function findStructures<T extends Structure>(
  room: Room, 
  structureType: StructureConstant
): T[] {
  return room.find(FIND_STRUCTURES, {
    filter: (s): s is T => s.structureType === structureType
  });
}
```

### 4. Strict Type Checking
Gradually enable stricter type checking:

```json
// tsconfig.json - start with these enabled
{
  "compilerOptions": {
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## Common Migration Patterns

### Module Exports
```javascript
// Before (JS)
module.exports = class CreepManager {
  // ...
}

// After (TS)
export default class CreepManager {
  // ...
}
```

### Function Types
```javascript
// Before (JS)
function processCreep(creep, task) {
  // ...
}

// After (TS)
function processCreep(creep: Creep, task: CreepTask): void {
  // ...
}
```

### Memory Types
```typescript
// Extend global interfaces for memory
declare global {
  interface CreepMemory {
    task?: CreepTask;
    role: string;
    room: string;
  }
  
  interface RoomMemory {
    threats: Id<Creep>[];
    lastDefenseCheck: number;
  }
}
```

## Testing Migration

### Build Verification
After migrating each file:

```bash
# Type check
pnpm tsc --noEmit

# Full build
pnpm build

# Run linter
pnpm test
```

### Runtime Testing
1. Deploy to test server
2. Monitor console for runtime errors
3. Verify game functionality
4. Check performance impact

## Package Manager Migration (Yarn → pnpm)

### Migration Steps
1. **Remove Yarn files**:
   ```bash
   rm -rf .yarn yarn.lock .yarnrc.yml
   ```

2. **Install pnpm**:
   ```bash
   npm install -g pnpm
   ```

3. **Install dependencies**:
   ```bash
   pnpm install
   ```

4. **Update CI workflows** to use pnpm instead of yarn

### Package.json Updates
Update scripts to use pnpm:

```json
{
  "scripts": {
    "test": "standard src/**/*.{js,ts}",
    "build": "rm -rf dist && rollup -c",
    "type-check": "tsc --noEmit"
  },
  "packageManager": "pnpm@8.0.0"
}
```

## Troubleshooting

### Common Issues

1. **Import Resolution**: Update path mappings in `tsconfig.json`
2. **Type Errors**: Add proper type annotations incrementally
3. **Build Failures**: Check rollup configuration for TypeScript plugin
4. **Runtime Errors**: Verify no behavioral changes during migration

### Getting Help
- Check existing TypeScript files for patterns
- Review Screeps TypeScript documentation
- Use GitHub Issues for tracking migration progress

## Tools and Resources

### Development Tools
- **VS Code**: Excellent TypeScript support
- **TypeScript ESLint**: Linting for TypeScript
- **Prettier**: Code formatting
- **ts-node**: Direct TypeScript execution

### Screeps Resources
- [@types/screeps](https://www.npmjs.com/package/@types/screeps): Official type definitions
- [Screeps TypeScript Starter](https://github.com/screepers/screeps-typescript-starter): Reference implementation

---

## Progress Tracking

Use the GitHub issue template to track migration progress:
- `.github/ISSUE_TEMPLATE/typescript-migration.md`

Update the issue as files are migrated to maintain visibility of progress.