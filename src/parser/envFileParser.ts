// src/parser/envFileParser.ts
// Parses .env and .env.example files.
// Now also detects: empty values, duplicate keys, example mismatches.

import * as fs from 'fs';
import * as path from 'path';
import { EnvVar, DuplicateVar, ExampleMismatch } from '../types';

export interface ParsedEnvFile {
  vars: EnvVar[];
  duplicates: DuplicateVar[];
}

/**
 * Parse a .env-style file. Returns vars AND any duplicate keys found.
 */
export function parseEnvFile(filePath: string): ParsedEnvFile {
  if (!fs.existsSync(filePath)) {
    return { vars: [], duplicates: [] };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const vars: EnvVar[] = [];

  // Track all occurrences for duplicate detection
  const occurrenceMap = new Map<string, { file: string; line: number; value?: string }[]>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      const key = trimmed.trim();
      if (!isValidEnvKey(key)) continue;
      vars.push({ key, value: undefined, file: filePath, line: i + 1 });
      addOccurrence(occurrenceMap, key, filePath, i + 1, undefined);
      continue;
    }

    const key = trimmed.substring(0, eqIndex).trim();
    if (!isValidEnvKey(key)) continue;

    let value = trimmed.substring(eqIndex + 1).trim();
    value = stripInlineComment(value);
    value = stripQuotes(value);

    vars.push({ key, value, file: filePath, line: i + 1 });
    addOccurrence(occurrenceMap, key, filePath, i + 1, value);
  }

  // Build duplicates list
  const duplicates: DuplicateVar[] = [];
  for (const [key, occurrences] of occurrenceMap.entries()) {
    if (occurrences.length > 1) {
      duplicates.push({ key, occurrences });
    }
  }

  return { vars, duplicates };
}

/**
 * Compare .env and .env.example to find mismatches.
 * Returns keys present in one but not the other.
 */
export function compareEnvAndExample(
  envPath: string,
  examplePath: string
): ExampleMismatch[] {
  const mismatches: ExampleMismatch[] = [];

  const { vars: envVars } = parseEnvFile(envPath);
  const { vars: exampleVars } = parseEnvFile(examplePath);

  const envKeys = new Map(envVars.map((v) => [v.key, v]));
  const exampleKeys = new Map(exampleVars.map((v) => [v.key, v]));

  // In .env but NOT in .env.example (team won't know this var exists)
  for (const [key, v] of envKeys.entries()) {
    if (!exampleKeys.has(key)) {
      mismatches.push({
        key,
        presentIn: 'env',
        file: envPath,
        line: v.line,
      });
    }
  }

  // In .env.example but NOT in .env (required var is missing locally)
  for (const [key, v] of exampleKeys.entries()) {
    if (!envKeys.has(key)) {
      mismatches.push({
        key,
        presentIn: 'example',
        file: examplePath,
        line: v.line,
      });
    }
  }

  return mismatches;
}

export function findEnvFiles(root: string): string[] {
  const patterns = [
    '.env', '.env.local', '.env.development', '.env.production',
    '.env.test', '.env.staging', '.env.example', '.env.sample', '.env.template',
  ];
  return patterns
    .map((p) => path.join(root, p))
    .filter((p) => fs.existsSync(p));
}

export function getPrimaryEnvFile(root: string, override?: string): string {
  if (override) return path.resolve(root, override);
  const priority = ['.env.local', '.env.development', '.env'];
  for (const f of priority) {
    const full = path.join(root, f);
    if (fs.existsSync(full)) return full;
  }
  return path.join(root, '.env');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addOccurrence(
  map: Map<string, { file: string; line: number; value?: string }[]>,
  key: string,
  file: string,
  line: number,
  value: string | undefined
) {
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push({ file, line, value });
}

function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

function stripInlineComment(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) return value;
  const commentIdx = value.indexOf(' #');
  if (commentIdx !== -1) return value.substring(0, commentIdx).trim();
  return value;
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}
