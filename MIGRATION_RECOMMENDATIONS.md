# TypeScript Migration Recommendations

## Immediate Next Steps

### 1. Environment Setup (Use GitHub Workflow)
The `copilot-setup-steps.yml` workflow is ready to configure your environment. Run it to:
- Install pnpm and setup caching
- Migrate from Yarn to pnpm 
- Generate initial migration status report
- Setup TypeScript development tools

### 2. Fix Existing TypeScript Files
Current TS files have type errors due to missing Screeps type imports. Consider:

```typescript
// Add to top of TypeScript files
declare const Game: any;
declare const Memory: any;
declare const RawMemory: any;
// Or properly configure @types/screeps imports
```

### 3. CI/CD Update
Update `.github/workflows/screeps.yml`:
```yaml
# Replace yarn commands with pnpm
- run: pnpm install
- run: pnpm build
```

## Migration Strategy

### Phase 1: Core Infrastructure (Start Here)
1. `src/constants.js` → `src/constants.ts` (Low risk, high impact)
2. `src/config.js` → `src/config.ts` (Configuration constants)
3. `src/main.js` → `src/main.ts` (Entry point - test thoroughly)

### Phase 2: Managers (Medium Priority)
Focus on manager files that have clear interfaces:
- `src/MemoryManager.js`
- `src/TaskManager.js`
- `src/CreepManager.js`

### Phase 3: Utilities (Low Priority)
- Pathfinding system
- Utility libraries
- UI components

## Package Manager Migration Priority

### Option A: Immediate pnpm Migration
- Remove yarn files: `rm -rf .yarn yarn.lock .yarnrc.yml`
- Install pnpm: `npm install -g pnpm`
- Install deps: `pnpm install`
- Update CI workflows

### Option B: Gradual Migration (Recommended)
- Keep yarn for now
- Test pnpm in development
- Update workflows incrementally
- Full migration after TypeScript progress

## Automation Tools

### Created Scripts
1. **Migration Helper**: `scripts/migrate-file.js`
   - Automated JS→TS conversion
   - Basic type annotation injection
   - Import statement conversion

2. **Progress Tracker**: `scripts/migration-progress.js`
   - Generate status reports
   - Categorize remaining files
   - Track completion percentage

### IDE Configuration
Consider adding `.vscode/settings.json`:
```json
{
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "typescript.suggest.autoImports": true,
  "typescript.check.npmIsInstalled": false
}
```

## Quality Assurance

### Testing Strategy
1. **Incremental Testing**: Test build after each file migration
2. **Runtime Verification**: Deploy to test server for each phase
3. **Performance Monitoring**: Check for performance regressions
4. **Type Safety**: Gradually enable stricter TypeScript options

### Rollback Plan
- Git branches for each migration phase
- Keep JavaScript versions until TypeScript is verified
- Automated backup before major migrations

## Long-term Goals

### Enhanced Type Safety
- Enable strict mode gradually
- Add comprehensive type definitions
- Implement proper error handling

### Developer Experience
- Better IDE support and autocomplete
- Faster refactoring capabilities
- Reduced runtime errors through compile-time checking

### Build Optimization
- Tree shaking improvements
- Better bundle size optimization
- Faster development builds with TypeScript

---

**Estimated Timeline**: 
- Setup & Infrastructure: ✅ Complete
- Core Migration (Phase 1): 1-2 weeks
- Full Migration: 4-6 weeks (depending on testing requirements)