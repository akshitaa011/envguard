// src/analyzer.ts
// Orchestrator: ties together env file parsing, source scanning,
// framework detection, rule application, and all new v1.1 checks.

import * as path from 'path';
import * as fs from 'fs';
import { parseEnvFile, getPrimaryEnvFile, compareEnvAndExample } from './parser/envFileParser';
import { scanSourceFiles } from './scanner/sourceScanner';
import { detectFramework } from './frameworks/detector';
import { applyFrameworkRules } from './frameworks/rules';
import { checkGitignore, detectExposedSecrets } from './security';
import { loadIgnoreList } from './utils/ignoreConfig';
import { AnalysisResult, EnvVar, EnvUsage, ScanOptions } from './types';

// True OS/shell globals — never in .env, never flag as missing
const OS_GLOBALS = new Set([
  'NODE_ENV', 'PATH', 'HOME', 'USER', 'SHELL',
  'PWD', 'TMPDIR', 'TZ', 'LANG', 'LC_ALL',
]);

// Vite build-time injected vars
const VITE_BUILTINS = new Set(['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR']);

export async function analyze(options: ScanOptions): Promise<AnalysisResult> {
  const root = path.resolve(options.root);
  const framework = options.framework ?? detectFramework(root);

  // ── 1. Parse env file ──────────────────────────────────────────────────────
  const envFilePath = getPrimaryEnvFile(root, options.envFile);
  const { vars: declaredVars, duplicates } = parseEnvFile(envFilePath);

  // ── 2. Parse .env.example and compute mismatches ───────────────────────────
  const examplePath = options.envExampleFile
    ? path.resolve(root, options.envExampleFile)
    : path.join(root, '.env.example');

  const exampleMismatches = fs.existsSync(examplePath)
    ? compareEnvAndExample(envFilePath, examplePath)
    : [];

  // Merge example vars (keys not already in declared) for analysis
  const declaredKeys = new Set(declaredVars.map((v) => v.key));
  const { vars: exampleVars } = parseEnvFile(examplePath);
  for (const ev of exampleVars) {
    if (!declaredKeys.has(ev.key)) {
      declaredVars.push({ ...ev, value: undefined });
      declaredKeys.add(ev.key);
    }
  }

  // ── 3. Detect empty variables (all frameworks) ─────────────────────────────
  const empty: EnvVar[] = declaredVars.filter(
    (v) => v.value === '' || v.value === undefined
  );

  // ── 4. Scan source files (merge .envguardignore exclusions) ───────────────
  const ignoreList = loadIgnoreList(root);
  const allUsages = await scanSourceFiles(root, options.include, [
    ...(options.exclude || []),
    ...ignoreList,
  ]);

  // ── 5. Framework rules ─────────────────────────────────────────────────────
  const warnings = applyFrameworkRules(framework, declaredVars, allUsages);

  // ── 6. Three-way diff ──────────────────────────────────────────────────────
  const usedKeys = new Set(
    allUsages
      .filter((u) => !u.isDynamic && !isBuiltinKey(u.key, framework))
      .map((u) => u.key)
  );

  const dead: EnvVar[] = declaredVars.filter(
    (v) => !usedKeys.has(v.key) && !isBuiltinKey(v.key, framework)
  );

  const missingKeys = new Set<string>();
  const missing: EnvUsage[] = [];
  for (const usage of allUsages) {
    if (
      usage.isDynamic ||
      isBuiltinKey(usage.key, framework) ||
      declaredKeys.has(usage.key) ||
      missingKeys.has(usage.key)
    ) continue;
    missingKeys.add(usage.key);
    missing.push(usage);
  }

  const healthy: EnvVar[] = declaredVars.filter((v) => usedKeys.has(v.key));
  const dynamic: EnvUsage[] = allUsages.filter((u) => u.isDynamic);

  // ── 7. Security checks ─────────────────────────────────────────────────────
  const securityIssues = [];
  const gitignoreIssue = checkGitignore(root, envFilePath);
  if (gitignoreIssue) securityIssues.push(gitignoreIssue);
  securityIssues.push(...detectExposedSecrets(declaredVars));

  return {
    framework,
    projectRoot: root,
    healthy,
    dead,
    missing,
    dynamic,
    warnings,
    allUsages,
    allDeclared: declaredVars,
    empty,
    duplicates,
    exampleMismatches,
    securityIssues,
  };
}

function isBuiltinKey(key: string, framework: string): boolean {
  if (OS_GLOBALS.has(key)) return true;
  if (framework === 'vite' && VITE_BUILTINS.has(key)) return true;
  return false;
}