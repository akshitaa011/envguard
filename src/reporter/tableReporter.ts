// src/reporter/tableReporter.ts
// Full terminal output with all v1.1 sections.

import chalk from 'chalk';
import { table, getBorderCharacters } from 'table';
import * as path from 'path';
import { AnalysisResult } from '../types';

export function printTableReport(result: AnalysisResult, quiet: boolean = false): void {
  const { framework, projectRoot, healthy, dead, missing, dynamic,
          warnings, empty, duplicates, exampleMismatches, securityIssues } = result;

  console.log('');
  console.log(chalk.bold.cyan('  ⚡ envguard') + chalk.dim(' — environment variable analysis'));
  console.log(chalk.dim(`  Framework: ${chalk.white(framework)} | Root: ${chalk.white(path.relative(process.cwd(), projectRoot) || '.')}`));
  console.log('');

  // ── Security issues first (most critical) ───────────────────────────────────
  if (securityIssues.length > 0) {
    for (const issue of securityIssues) {
      const icon = issue.severity === 'critical' ? chalk.red.bold('🚨 SECURITY') : chalk.yellow('🛡️  Security');
      console.log(`  ${icon}: ${issue.message}`);
      if (issue.file) {
        console.log(chalk.dim(`    at ${path.relative(projectRoot, issue.file)}${issue.line ? ':' + issue.line : ''}`));
      }
      console.log('');
    }
  }

  // ── Summary bar ────────────────────────────────────────────────────────────
  const summary = [
    chalk.green(`✅ ${healthy.length} healthy`),
    chalk.red(`🗑️  ${dead.length} dead`),
    chalk.yellow(`⚠️  ${missing.length} missing`),
    chalk.magenta(`🚨 ${empty.length} empty`),
    chalk.blue(`🔁 ${duplicates.length} duplicate`),
    chalk.dim(`❓ ${dynamic.length} dynamic`),
  ].join(chalk.dim('  │  '));
  console.log(`  ${summary}`);
  console.log('');

  const totalIssues = dead.length + missing.length + empty.length + duplicates.length +
    warnings.filter(w => w.severity === 'error').length + securityIssues.filter(s => s.severity === 'critical').length;

  if (totalIssues === 0 && warnings.length === 0 && exampleMismatches.length === 0) {
    console.log(chalk.green.bold('  ✓ All good! No issues found.\n'));
    return;
  }

  // ── Missing variables ⚠️ ───────────────────────────────────────────────────
  if (missing.length > 0) {
    console.log(chalk.yellow.bold(`  ⚠️  Missing Variables (${missing.length})`));
    console.log(chalk.dim('  Used in source code but NOT declared in .env — will be undefined at runtime'));
    console.log('');
    const rows = missing.map((u) => [
      chalk.yellow.bold(u.key),
      chalk.dim(u.accessPattern),
      chalk.dim(rel(projectRoot, u.file)),
      chalk.dim(String(u.line)),
    ]);
    printTable(
      [['Key', 'Access Pattern', 'File', 'Line'], ...rows]
    );
  }

  // ── Dead variables 🗑️ ──────────────────────────────────────────────────────
  if (dead.length > 0) {
    console.log(chalk.red.bold(`  🗑️  Dead Variables (${dead.length})`));
    console.log(chalk.dim('  Declared in .env but never referenced in source code'));
    console.log('');
    const rows = dead.map((v) => [
      chalk.red(v.key),
      chalk.dim(v.value ? maskValue(v.value) : '(no value)'),
      chalk.dim(rel(projectRoot, v.file)),
      chalk.dim(String(v.line ?? '?')),
    ]);
    printTable([['Key', 'Value', 'File', 'Line'], ...rows]);
  }

  // ── Empty variables 🚨 ─────────────────────────────────────────────────────
  if (empty.length > 0) {
    console.log(chalk.magenta.bold(`  🚨 Empty Variables (${empty.length})`));
    console.log(chalk.dim('  Declared but have no value — may cause runtime errors'));
    console.log('');
    const rows = empty.map((v) => [
      chalk.magenta(v.key),
      chalk.dim(rel(projectRoot, v.file)),
      chalk.dim(String(v.line ?? '?')),
    ]);
    printTable([['Key', 'File', 'Line'], ...rows]);
  }

  // ── Duplicates 🔁 ──────────────────────────────────────────────────────────
  if (duplicates.length > 0) {
    console.log(chalk.blue.bold(`  🔁 Duplicate Variables (${duplicates.length})`));
    console.log(chalk.dim('  Declared more than once — last value wins, which may be unintentional'));
    console.log('');
    for (const dup of duplicates) {
      console.log(`  ${chalk.blue.bold(dup.key)} — declared ${dup.occurrences.length}x:`);
      for (const occ of dup.occurrences) {
        console.log(chalk.dim(`    line ${occ.line}: ${occ.value ? maskValue(occ.value) : '(empty)'}`));
      }
      console.log('');
    }
  }

  // ── .env vs .env.example mismatches 📄 ────────────────────────────────────
  if (exampleMismatches.length > 0) {
    console.log(chalk.cyan.bold(`  📄 .env.example Mismatches (${exampleMismatches.length})`));
    console.log('');

    const inEnvOnly = exampleMismatches.filter((m) => m.presentIn === 'env');
    const inExampleOnly = exampleMismatches.filter((m) => m.presentIn === 'example');

    if (inEnvOnly.length > 0) {
      console.log(chalk.dim('  In .env but missing from .env.example (teammates won\'t know about these):'));
      for (const m of inEnvOnly) {
        console.log(`    ${chalk.cyan(m.key)} ${chalk.dim(`(line ${m.line})`)}`);
      }
      console.log('');
    }
    if (inExampleOnly.length > 0) {
      console.log(chalk.dim('  In .env.example but missing from .env (required var not set locally):'));
      for (const m of inExampleOnly) {
        console.log(`    ${chalk.yellow(m.key)} ${chalk.dim(`(line ${m.line})`)}`);
      }
      console.log('');
    }
  }

  // ── Framework warnings 🔧 ──────────────────────────────────────────────────
  if (warnings.length > 0) {
    console.log(chalk.magenta.bold(`  🔧 Framework Warnings (${warnings.length})`));
    console.log('');
    for (const w of warnings) {
      const icon = w.severity === 'error' ? chalk.red('✖') : w.severity === 'warning' ? chalk.yellow('⚠') : chalk.blue('ℹ');
      console.log(`  ${icon} ${chalk.bold(w.key)}`);
      console.log(`    ${w.message}`);
      if (w.file && w.line) console.log(chalk.dim(`    at ${rel(projectRoot, w.file)}:${w.line}`));
      console.log('');
    }
  }

  // ── Dynamic access ❓ ──────────────────────────────────────────────────────
  if (dynamic.length > 0 && !quiet) {
    console.log(chalk.dim(`  ❓ ${dynamic.length} dynamic env access(es) — cannot be statically resolved:`));
    for (const d of dynamic.slice(0, 3)) {
      console.log(chalk.dim(`    ${rel(projectRoot, d.file)}:${d.line} — ${d.accessPattern}`));
    }
    if (dynamic.length > 3) console.log(chalk.dim(`    ... and ${dynamic.length - 3} more`));
    console.log('');
  }

  // ── Healthy ✅ ─────────────────────────────────────────────────────────────
  if (healthy.length > 0 && !quiet) {
    console.log(chalk.green(`  ✅ ${healthy.length} variable(s) healthy`));
    for (const v of healthy) console.log(chalk.dim(`    ${v.key}`));
    console.log('');
  }

  // ── Exit summary ───────────────────────────────────────────────────────────
  const hasErrors = missing.length > 0 || dead.length > 0 || empty.length > 0 ||
    duplicates.length > 0 || securityIssues.some(s => s.severity === 'critical') ||
    warnings.some(w => w.severity === 'error');

  if (hasErrors) {
    console.log(chalk.red.bold('  ✖ Issues found. See above for details.\n'));
  } else {
    console.log(chalk.green.bold('  ✓ No critical issues found.\n'));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function printTable(rows: string[][]): void {
  const [header, ...body] = rows;
  const styledRows = [
    header.map((h) => chalk.bold(h)),
    ...body,
  ];
  const out = table(styledRows, {
    border: getBorderCharacters('norc'),
    columnDefault: { paddingLeft: 2, paddingRight: 2 },
    drawHorizontalLine: (i, total) => i === 0 || i === 1 || i === total,
  });
  console.log(out.replace(/^/gm, '  '));
}

function rel(root: string, filePath: string): string {
  return path.relative(root, filePath) || filePath;
}

function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return value.substring(0, 3) + '****';
}
