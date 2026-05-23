# ⚡ envguard

> Static analysis for environment variables — finds dead, missing, empty, duplicate vars and security issues by scanning your actual source code using AST parsing.

[![npm version](https://img.shields.io/npm/v/@akshitaa11/envguard.svg)](https://www.npmjs.com/package/@akshitaa11/envguard)
[![CI](https://github.com/akshitaa011/envguard/actions/workflows/envguard.yml/badge.svg)](https://github.com/akshitaa011/envguard/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## Why envguard?

Most `.env` linters only check the `.env` file itself — formatting, duplicates, syntax.

**envguard does something fundamentally different.**

It parses your actual source code using a full AST parser (Babel) and cross-references every `process.env.X` call against your declared variables. This means it catches real bugs — variables that will be `undefined` at runtime, secrets that are dead weight, and framework-specific misconfigurations that would only surface in production.

---

## The Problem

Every project eventually ends up with this:

```env
DATABASE_URL=postgres://...
OLD_STRIPE_KEY=sk_live_xxxxx
LEGACY_REDIS_URL=redis://localhost:6379
JWT_SECRET=
API_KEY=abc
API_KEY=xyz
```

And somewhere in code:

```js
const api = process.env.OPENAI_API_KEY;
```

envguard catches all of it before it reaches production.

---

## What It Detects

| Category | Icon | Description |
|---|---|---|
| Dead Variables | 🗑️ | Declared in `.env` but never referenced in source code |
| Missing Variables | ⚠️ | Used in source code but not declared in `.env` |
| Empty Variables | 🚨 | Declared without a value |
| Duplicate Variables | 🔁 | Same key declared multiple times |
| Example Mismatch | 📄 | `.env` and `.env.example` are out of sync |
| Security Issues | 🔐 | `.env` exposure & real secret detection |
| Framework Issues | 🔧 | Framework-specific env mistakes |
| Dynamic Access | ❓ | Unresolved dynamic env access |

---

## Installation

```bash
# Global install
npm install -g @akshitaa011/envguard

# Local install
npm install --save-dev @akshitaa011/envguard
```

---

## Quick Start

```bash
# Scan current directory
npx @akshitaa011/envguard check .

# Scan a specific project
npx @akshitaa011/envguard check ./my-app

# Framework override
npx @akshitaa011/envguard check . --framework nextjs
```

---

## Usage

### Output Formats

```bash
# Human-readable table
envguard check . --output table

# JSON output
envguard check . --output json

# SARIF output
envguard check . --output sarif > results.sarif
```

### CI Integration

```bash
# Fail build on missing vars
envguard check . --fail-on missing

# Fail on multiple issue types
envguard check . --fail-on dead,missing,empty,duplicates,security
```

### Monorepo Support

```bash
envguard check . --monorepo
```

### List All Variables

```bash
envguard list .
```

---

## Example Output

### Missing, dead, empty and duplicate variable detection

![envguard output](./assets/output-1.png)

### Duplicate and healthy variable reporting

![envguard output](./assets/output-2.png)

### CLI Output

```txt
⚡ envguard — environment variable analysis
Framework: express | Root: .

🚨 SECURITY: ".env" is NOT in your .gitignore. Add ".env*" to .gitignore immediately.

✅ 3 healthy │ 🗑️ 1 dead │ ⚠️ 1 missing │ 🚨 1 empty │ 🔁 1 duplicate │ ❓ 0 dynamic

⚠️ Missing Variables (1)

Used in source code but NOT declared in .env — will be undefined at runtime

┌─────────────────┬──────────────────────────────┬────────────────────┬──────┐
│ Key             │ Access Pattern              │ File               │ Line │
├─────────────────┼──────────────────────────────┼────────────────────┼──────┤
│ OPENAI_API_KEY  │ process.env.OPENAI_API_KEY │ src/lib/openai.ts  │ 12   │
└─────────────────┴──────────────────────────────┴────────────────────┴──────┘

🗑️ Dead Variables (1)

Declared in .env but never referenced in source code

┌──────────────────┬───────────┬────────┬──────┐
│ Key              │ Value     │ File   │ Line │
├──────────────────┼───────────┼────────┼──────┤
│ OLD_STRIPE_KEY   │ sk_li**** │ .env   │ 3    │
└──────────────────┴───────────┴────────┴──────┘

🚨 Empty Variables (1)

┌────────────┬────────┬──────┐
│ Key        │ File   │ Line │
├────────────┼────────┼──────┤
│ JWT_SECRET │ .env   │ 5    │
└────────────┴────────┴──────┘

🔁 Duplicate Variables (1)

API_KEY — declared 2x:
line 6: abc****
line 7: xyz****

✖ Issues found. See above for details.
```

---

## Framework Support

| Framework | Auto-detected | Checks Applied |
|---|---|---|
| Next.js | ✅ | `NEXT_PUBLIC_` exposure, client/server misuse |
| Vite | ✅ | Missing `VITE_` prefix |
| React (CRA) | ✅ | Missing `REACT_APP_` prefix |
| Express / Node | ✅ | Empty DB/SECRET/TOKEN detection |
| NestJS | ✅ | Auto-detection support |
| Remix | ✅ | Auto-detection support |
| Astro | ✅ | Auto-detection support |

---

## Constant Folding

envguard resolves dynamic env access when the variable is a string constant:

```js
const key = "OPENROUTER_API_KEY";
const val = process.env[key];
```

Resolved as:

```txt
OPENROUTER_API_KEY
```

Unresolvable accesses are flagged as dynamic.

---

## Security Checks

```txt
🚨 SECURITY: ".env" is NOT in your .gitignore
🛡️ OPENAI_API_KEY appears to contain a real secret
🛡️ GITHUB_TOKEN appears to contain a real secret
```

Detects:
- OpenAI keys
- OpenRouter keys
- GitHub PATs
- AWS Access Keys
- Slack tokens
- JWT-like secrets

---

## .env.example Validation

```txt
📄 .env.example Mismatches

In .env but missing from .env.example:
  GEMINI_API_KEY
  JWT_SECRET

In .env.example but missing locally:
  SENDGRID_KEY
```

---

## Ignore Config

Create `.envguardignore`:

```txt
tests
mocks
generated
scripts
```

---

## GitHub Action

```yaml
name: Check Environment Variables

on: [pull_request]

jobs:
  envguard:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - run: npx @akshitaa011/envguard check . --fail-on missing
```

---

## API Usage

```ts
import { analyze } from '@akshitaa011/envguard';

const result = await analyze({
  root: './my-project',
  framework: 'nextjs',
});

console.log(result.dead);
console.log(result.missing);
```

---

## Detection Patterns

```js
process.env.API_KEY
process.env['API_KEY']
process.env[dynamicVar]

const { API_KEY } = process.env

import.meta.env.VITE_API_URL

const key = "API_KEY";
process.env[key]
```

---

## All Options

| Option | Description | Default |
|---|---|---|
| `--env-file` | Path to `.env` file | Auto-detected |
| `--env-example` | Path to `.env.example` | `.env.example` |
| `--framework` | Framework override | Auto-detected |
| `--output` | `table` \| `json` \| `sarif` | `table` |
| `--fail-on` | Issue types that fail CI | `missing` |
| `--include` | Glob patterns to scan | All JS/TS files |
| `--exclude` | Dirs to skip | `node_modules,dist` |
| `--monorepo` | Scan workspace packages | `false` |
| `--quiet` | Hide healthy variables | `false` |

---

## Contributing

```bash
git clone https://github.com/akshitaa011/envguard

cd envguard

npm install
npm test
npm run build
```

PRs are welcome.

---

## License

MIT © Akshita