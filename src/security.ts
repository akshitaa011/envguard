// src/security.ts
// Security checks: .gitignore validation + secret value exposure detection.

import * as fs from 'fs';
import * as path from 'path';
import { EnvVar, SecurityIssue } from './types';

// Patterns that suggest a value is a real secret (not a placeholder)
const SECRET_VALUE_PATTERNS = [
  /^sk-[a-zA-Z0-9]{20,}/,          // OpenAI keys: sk-...
  /^sk-or-[a-zA-Z0-9]{20,}/,       // OpenRouter: sk-or-...
  /^ghp_[a-zA-Z0-9]{36}/,          // GitHub PAT: ghp_...
  /^ghs_[a-zA-Z0-9]{36}/,          // GitHub App: ghs_...
  /^xox[bpoas]-[0-9]{10,}/,        // Slack tokens
  /^AKIA[0-9A-Z]{16}/,             // AWS Access Key
  /^[a-zA-Z0-9+/]{40}$/,           // Generic 40-char base64 (likely a secret)
  /^[a-f0-9]{32,64}$/,             // Hex secrets (MD5/SHA hashes used as keys)
  /^ey[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/, // JWT tokens
];

// Key name patterns that suggest the var holds a secret
const SECRET_KEY_PATTERNS = [
  'SECRET', 'PRIVATE', 'PASSWORD', 'PASSWD', 'PASS',
  'TOKEN', 'API_KEY', 'APIKEY', 'ACCESS_KEY', 'AUTH_KEY',
  'CREDENTIALS', 'CERT', 'PRIVATE_KEY', 'CLIENT_SECRET',
];

/**
 * Check if .env is listed in .gitignore.
 * Returns a SecurityIssue if it's not protected.
 */
export function checkGitignore(root: string, envFile: string): SecurityIssue | null {
  const gitignorePath = path.join(root, '.gitignore');

  if (!fs.existsSync(gitignorePath)) {
    return {
      type: 'gitignore',
      severity: 'critical',
      message: `No .gitignore file found. Your .env file (${path.basename(envFile)}) may be committed to git — this exposes all your secrets.`,
      file: envFile,
    };
  }

  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  const lines = gitignoreContent
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const envFileName = path.basename(envFile); // e.g. ".env" or ".env.local"

  // Check if any gitignore line covers this env file
  const isCovered = lines.some((line) => {
    // Direct match: ".env"
    if (line === envFileName) return true;
    // Wildcard: ".env*" covers .env, .env.local, etc.
    if (line === '.env*' || line === '*.env') return true;
    // Pattern like ".env*.local"
    if (line.startsWith('.env') && envFileName.startsWith('.env')) return true;
    return false;
  });

  if (!isCovered) {
    return {
      type: 'gitignore',
      severity: 'critical',
      message: `"${envFileName}" is NOT in your .gitignore. If committed to git, your secrets will be exposed. Add ".env*" to .gitignore immediately.`,
      file: gitignorePath,
    };
  }

  return null;
}

/**
 * Scan declared env vars for values that look like real secrets.
 * Warns about high-entropy or pattern-matched values.
 */
export function detectExposedSecrets(vars: EnvVar[]): SecurityIssue[] {
  const issues: SecurityIssue[] = [];

  for (const v of vars) {
    if (!v.value || v.value.length < 8) continue;

    const keyLooksLikeSecret = SECRET_KEY_PATTERNS.some((p) =>
      v.key.toUpperCase().includes(p)
    );
    const valueLooksLikeSecret = SECRET_VALUE_PATTERNS.some((r) => r.test(v.value!));

    // Only flag if BOTH the key name AND value pattern suggest a secret
    // This reduces false positives
    if (keyLooksLikeSecret && valueLooksLikeSecret) {
      issues.push({
        type: 'exposed-secret',
        severity: 'warning',
        message: `"${v.key}" appears to contain a real secret value (${describePattern(v.value!)}). Ensure this file is gitignored and never committed.`,
        key: v.key,
        file: v.file,
        line: v.line,
      });
    }
  }

  return issues;
}

function describePattern(value: string): string {
  if (/^sk-[a-zA-Z0-9]{20,}/.test(value)) return 'looks like an OpenAI key';
  if (/^sk-or-/.test(value)) return 'looks like an OpenRouter key';
  if (/^ghp_/.test(value)) return 'looks like a GitHub PAT';
  if (/^AKIA/.test(value)) return 'looks like an AWS Access Key';
  if (/^xox/.test(value)) return 'looks like a Slack token';
  if (/^ey.*\..*\./.test(value)) return 'looks like a JWT token';
  if (/^[a-f0-9]{32,64}$/.test(value)) return 'high-entropy hex string';
  return 'high-entropy value';
}
