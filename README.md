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

## Installation

```bash
# Global install
npm install -g @akshitaa11/envguard

# Local install
npm install --save-dev @akshitaa11/envguard
```

---

## Quick Start

```bash
# Scan current directory
npx @akshitaa11/envguard check .

# Scan a specific project
npx @akshitaa11/envguard check ./my-app

# Framework override
npx @akshitaa11/envguard check . --framework nextjs
```

---

## Example Output

### Missing, dead, empty and duplicate variable detection

![envguard output](./assets/output-1.png)

### Duplicate and healthy variable reporting

![envguard output](./assets/output-2.png)

---

## Usage

### Output Formats

```bash
envguard check . --output table
envguard check . --output json
envguard check . --output sarif > results.sarif
```

### CI Integration

```bash
envguard check . --fail-on missing
```

### Monorepo Support

```bash
envguard check . --monorepo
```

---

## Framework Support

| Framework | Supported |
|---|---|
| Next.js | ✅ |
| Vite | ✅ |
| React CRA | ✅ |
| Express | ✅ |
| NestJS | ✅ |
| Remix | ✅ |
| Astro | ✅ |

---

## Security Checks

Detects:
- OpenAI keys
- OpenRouter keys
- GitHub PATs
- AWS Access Keys
- Slack tokens
- JWT-like secrets
- `.env` exposure through missing `.gitignore`

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

      - run: npx @akshitaa11/envguard check . --fail-on missing
```

---

## API Usage

```ts
import { analyze } from '@akshitaa11/envguard';

const result = await analyze({
  root: './project',
  framework: 'nextjs',
});

console.log(result.dead);
console.log(result.missing);
```

---

## Contributing

```bash
git clone https://github.com/akshitaa011/envguard

cd envguard

npm install
npm run build
```

---

## License

MIT © Akshita
