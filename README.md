# ⚡ envguard

> Static analysis for environment variables — finds dead vars, missing vars, and framework misconfigurations by scanning your source code.

[![npm version](https://badge.fury.io/js/envguard.svg)](https://badge.fury.io/js/envguard)
[![CI](https://github.com/akshitaa011/envguard/actions/workflows/envguard.yml/badge.svg)](https://github.com/akshitaa011/envguard/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Unlike other `.env` linters that only check the `.env` file in isolation, **envguard scans your actual source code using an AST parser** and cross-references it against your declared variables.

---

## The Problem

Every team has this in their `.env`:

```
DATABASE_URL=postgres://...
OLD_STRIPE_KEY=sk_live_XXXXXXX      # hasn't been used since Q2
LEGACY_REDIS_URL=redis://...        # service was deprecated
ANALYTICS_SECRET=abc123             # what even is this
```

And in code:
```js
const api = process.env.OPENAI_API_KEY;  // crashes in production — never declared!
```

envguard catches both.

---

## What It Detects

| Category | Description |
|---|---|
| 🗑️ **Dead** | Declared in `.env`, never referenced in source code |
| ⚠️ **Missing** | Used in source code, not in `.env` — will be `undefined` at runtime |
| 🔧 **Framework issues** | Next.js server vars in client code, Vite prefix violations, CRA prefix violations |
| ❓ **Dynamic** | `process.env[variable]` — flagged for manual review |

---

## Installation

```bash
# Global (for CLI use)
npm install -g envguard

# Local (for project integration)
npm install --save-dev envguard
```

---

## Usage

### Basic scan
```bash
# Scan current directory (auto-detects framework)
envguard check

# Scan a specific directory
envguard check ./my-app

# Specify framework explicitly
envguard check . --framework nextjs
```

### Output formats
```bash
# Human-readable table (default)
envguard check . --output table

# JSON (for programmatic use)
envguard check . --output json

# SARIF (for GitHub Code Scanning)
envguard check . --output sarif > results.sarif
```

### CI: fail the build on missing vars
```bash
# Exit code 1 if any variables are used but not declared
envguard check . --fail-on missing

# Fail on dead OR missing vars
envguard check . --fail-on dead,missing

# Fail on framework errors too
envguard check . --fail-on missing,warnings
```

### List all vars
```bash
envguard list
```

---

## Example Output

```
  ⚡ envguard — environment variable analysis
  Framework: nextjs | Root: .

  ✅ 4 healthy  │  🗑️  2 dead  │  ⚠️  1 missing  │  ❓ 0 dynamic

  🗑️  Dead Variables (2)
  Declared in .env but never referenced in source code

  ┌─────────────────────────┬───────────┬────────┬──────┐
  │ Key                     │ Value     │ File   │ Line │
  ├─────────────────────────┼───────────┼────────┼──────┤
  │ OLD_STRIPE_KEY          │ sk_li**** │ .env   │ 3    │
  │ LEGACY_REDIS_URL        │ red****   │ .env   │ 4    │
  └─────────────────────────┴───────────┴────────┴──────┘

  ⚠️  Missing Variables (1)
  Used in source code but NOT declared in .env

  ┌─────────────────┬──────────────────────────┬────────────────────┬──────┐
  │ Key             │ Access Pattern           │ File               │ Line │
  ├─────────────────┼──────────────────────────┼────────────────────┼──────┤
  │ OPENAI_API_KEY  │ process.env.OPENAI_API_… │ src/lib/openai.ts  │ 12   │
  └─────────────────┴──────────────────────────┴────────────────────┴──────┘

  ✖ Issues found. See above for details.
```

---

## Framework Support

### Next.js
- Warns if a non-`NEXT_PUBLIC_` var is used in a client-side component (will be `undefined` in the browser)
- Warns if `NEXT_PUBLIC_` var name suggests it contains a secret (exposed in browser bundle)
- Errors if `import.meta.env` is used (Vite syntax, not Next.js)

### Vite
- Errors if a var without `VITE_` prefix is accessed via `import.meta.env` (Vite won't expose it)
- Warns if `VITE_` prefix is used on what looks like a secret key (exposed in bundle)
- Warns if `process.env` is used in client files (use `import.meta.env` instead)

### React (CRA)
- Errors if a var without `REACT_APP_` prefix is used in component files

### Express / Node
- Warns if critical-looking vars (DB, SECRET, TOKEN) have empty values

---

## GitHub Action

Add to any project's `.github/workflows/`:

```yaml
- name: Check env variables
  uses: akshitaa011/envguard@v1
  with:
    fail-on: missing
    upload-sarif: true   # Results appear as inline PR annotations
```

---

## API (Library Usage)

```typescript
import { analyze } from 'envguard';

const result = await analyze({
  root: './my-project',
  framework: 'nextjs',
  failOn: ['missing'],
});

console.log(`Dead: ${result.dead.length}`);
console.log(`Missing: ${result.missing.length}`);
console.log(`Warnings: ${result.warnings.length}`);
```

---

## Detection Patterns

envguard detects all of these:

```javascript
// Standard access
process.env.API_KEY

// Bracket string access
process.env['API_KEY']

// Dynamic access (flagged as unanalyzable)
process.env[dynamicVar]

// Destructuring
const { API_KEY, DB_URL } = process.env

// Vite client-side
import.meta.env.VITE_API_URL
import.meta.env['VITE_API_URL']

// Optional chaining
process.env?.API_KEY
```

---

## Options

| Option | Description | Default |
|---|---|---|
| `--env-file` | Path to `.env` file | Auto-detected |
| `--env-example` | Path to `.env.example` | `.env.example` |
| `--framework` | Framework override | Auto-detected |
| `--output` | `table` \| `json` \| `sarif` | `table` |
| `--fail-on` | `dead,missing,warnings` | `missing` |
| `--include` | Glob patterns to scan | All JS/TS files |
| `--exclude` | Dirs to skip | `node_modules,dist,...` |
| `--quiet` | Hide healthy list | `false` |

---

## Contributing

```bash
git clone https://github.com/akshitaa011/envguard
cd envguard
npm install
npm test
npm run build
```

---

## License

MIT
