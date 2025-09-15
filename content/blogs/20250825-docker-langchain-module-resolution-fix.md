---
title: "Fixing Docker Module Resolution Error: LangChain Dependencies Investigation"
date: 2025-08-25
slug: 20250825-docker-langchain-module-resolution-fix
description: "The dockerized ChatOllama application was experiencing critical module resolution errors during chat operations:"
---

# Fixing Docker Module Resolution Error: LangChain Dependencies Investigation

**Date**: August 25, 2025  
**Issue**: Docker container failing with `Cannot find module '@langchain/core/prompts.js'` error  
**Solution**: Dependency version alignment across LangChain packages  

## Problem Description

The dockerized ChatOllama application was experiencing critical module resolution errors during chat operations:

```
[nuxt] [request error] [unhandled] [500] Cannot find module '/app/.output/server/node_modules/@langchain/core/prompts.js' 
imported from /app/.output/server/chunks/routes/api/models/index.post.mjs
```

This error occurred consistently across multiple API endpoints (`/api/models/chat`, `/api/instruction`, `/api/agents`) and prevented the application from functioning properly in Docker containers.

## Investigation Process

### 1. Initial Analysis
- **Error Pattern**: ESM module resolution failure for `@langchain/core/prompts.js`
- **Environment**: Docker container build process, not local development
- **Affected Files**: Server API routes importing from `@langchain/core/prompts`

### 2. Container Inspection
Investigation revealed missing export files in the Docker container:

```bash
# Expected but missing
/app/.output/server/node_modules/@langchain/core/prompts.js

# Available directory structure
/app/.output/server/node_modules/@langchain/core/dist/prompts/index.js
```

### 3. Version Conflict Discovery
Found **three different versions** of `@langchain/core` in the dependency tree:

- **Project specification**: `@langchain/core@^0.3.49`
- **Actual Docker resolution**: `@langchain/core@0.3.72` (pulled by `deepagents@0.0.1`)  
- **Legacy versions**: `@langchain/core@0.1.54` (used by older packages)

The key issue: `deepagents@0.0.1` dependency was forcing `@langchain/core@0.3.72`, while the project specified `^0.3.49`, creating version conflicts during Nuxt's build bundling process.

## Root Cause Analysis

### Core Issue
**Version Mismatch**: The newer `@langchain/core@0.3.72` has different export structures that weren't compatible with how Nuxt bundled the modules for Docker deployment.

### Why Docker vs Local?
- **Local Development**: pnpm's workspace resolution handled conflicts gracefully
- **Docker Build**: Nuxt's production bundling exposed the version inconsistencies
- **Module Resolution**: Different ESM export mappings between versions

### Technical Details
```json
// package.json specified
"@langchain/core": "^0.3.49"

// But dependency resolution pulled
"deepagents@0.0.1" → "@langchain/core@0.3.72"

// Resulted in missing exports during bundling
```

## Solution: Dependency Alignment

### Approach
Instead of manual file patching, we chose **proper dependency management** by updating all LangChain packages to compatible versions.

### Package Updates Applied

```json
{
  // Core updates for version alignment
  "@langchain/core": "^0.3.49" → "^0.3.72",
  
  // Compatible package updates
  "@langchain/anthropic": "^0.3.19" → "^0.3.26",
  "@langchain/community": "^0.3.41" → "^0.3.53", 
  "@langchain/google-genai": "^0.1.5" → "^0.2.16",
  "@langchain/groq": "^0.0.5" → "^0.2.3",
  "@langchain/ollama": "^0.2.0" → "^0.2.3",
  "@langchain/openai": "^0.5.7" → "^0.6.9",
  
  // Provider-specific updates
  "@langchain/azure-openai": "^0.0.4" → "^0.0.11",
  "@langchain/cohere": "^0.0.6" → "^0.3.4",
  
  // Peer dependency fixes
  "ws": "^8.16.0" → "^8.18.0",
  "zod": "^3.23.8" → "^3.24.1"
}
```

### Implementation Steps

```bash
# 1. Update package.json with compatible versions
# 2. Reinstall dependencies
pnpm install

# 3. Verify build success
pnpm run build

# 4. Fix discovered syntax error
# (Missing parenthesis in server/api/agents/[id].post.ts)

# 5. Successful build completion
✓ Built in 17.34s
```

## Verification Results

### Before Fix
- **Docker Error**: Module resolution failure
- **Version Conflicts**: 3 different @langchain/core versions
- **Peer Dependencies**: Multiple warnings
- **Build Status**: Failed in Docker

### After Fix  
- **Dependency Resolution**: All LangChain packages using `@langchain/core@0.3.72`
- **Local Build**: ✅ Successful (`pnpm run build`)
- **Module Exports**: Consistent across all packages
- **Peer Warnings**: Reduced to minimal non-critical issues

## Best Practices Learned

### 1. Dependency Management
- **Always align major dependency versions** across related package families
- **Use exact or compatible ranges** for critical dependencies like LangChain core
- **Regular dependency audits** to catch version drift

### 2. Docker-Specific Considerations
- **Test builds in Docker** during development, not just locally
- **Version conflicts manifest differently** in containerized builds vs local development
- **ESM module resolution** can be sensitive to version mismatches

### 3. Investigation Approach
- **Container inspection first** to understand actual file structure
- **Dependency tree analysis** to identify version conflicts  
- **Standard tooling over manual fixes** for sustainable solutions

## Technical Details for Developers

### Files Modified
- `package.json`: Updated LangChain package versions
- `pnpm-lock.yaml`: Regenerated with consistent resolutions
- `server/api/agents/[id].post.ts`: Fixed syntax error (missing parenthesis)

### Commands for Reproduction
```bash
# Inspect container dependencies
docker exec <container> ls -la /app/.output/server/node_modules/@langchain/core/

# Check for missing exports
docker exec <container> find /app/.output/server/node_modules/@langchain/core -name "*prompt*"

# Verify local vs container differences
npm list @langchain/core
```

### Prevention Strategy
```json
// package.json - Use stricter version ranges for critical deps
{
  "@langchain/core": "~0.3.72",  // Tilde for patch-level only
  "deepagents": "^0.0.1"         // Ensure compatibility
}
```

## Conclusion

This issue highlights the importance of **consistent dependency management** in modern JavaScript applications, especially when deploying via Docker. The proper solution involved updating the entire LangChain ecosystem to compatible versions rather than applying manual patches.

### Key Takeaways
1. **Version conflicts** can manifest differently between local and Docker environments
2. **Dependency alignment** is crucial for ESM module resolution
3. **Standard package management** is always preferable to manual file fixes
4. **Container-specific testing** should be part of the development workflow

The fix ensures ChatOllama's Docker deployment works reliably while maintaining the standard build process and keeping dependencies up-to-date with the latest LangChain ecosystem improvements.