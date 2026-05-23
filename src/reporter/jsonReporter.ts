// src/reporter/jsonReporter.ts
import { AnalysisResult } from '../types';
import * as path from 'path';

export function printJsonReport(result: AnalysisResult): void {
  const r = result.projectRoot;
  const output = {
    summary: {
      framework: result.framework,
      projectRoot: r,
      healthy: result.healthy.length,
      dead: result.dead.length,
      missing: result.missing.length,
      empty: result.empty.length,
      duplicates: result.duplicates.length,
      dynamic: result.dynamic.length,
      warnings: result.warnings.length,
      securityIssues: result.securityIssues.length,
      exampleMismatches: result.exampleMismatches.length,
      passed: result.dead.length === 0 && result.missing.length === 0 &&
              result.empty.length === 0 && result.duplicates.length === 0,
    },
    dead: result.dead.map((v) => ({ key: v.key, file: path.relative(r, v.file), line: v.line })),
    missing: result.missing.map((u) => ({
      key: u.key, file: path.relative(r, u.file), line: u.line, accessPattern: u.accessPattern,
    })),
    empty: result.empty.map((v) => ({ key: v.key, file: path.relative(r, v.file), line: v.line })),
    duplicates: result.duplicates.map((d) => ({
      key: d.key,
      occurrences: d.occurrences.map((o) => ({ file: path.relative(r, o.file), line: o.line })),
    })),
    exampleMismatches: result.exampleMismatches.map((m) => ({
      key: m.key, presentIn: m.presentIn, file: path.relative(r, m.file), line: m.line,
    })),
    securityIssues: result.securityIssues.map((s) => ({
      type: s.type, severity: s.severity, message: s.message, key: s.key,
      file: s.file ? path.relative(r, s.file) : undefined, line: s.line,
    })),
    warnings: result.warnings.map((w) => ({
      key: w.key, severity: w.severity, message: w.message,
      file: w.file ? path.relative(r, w.file) : undefined, line: w.line,
    })),
    dynamic: result.dynamic.map((u) => ({
      file: path.relative(r, u.file), line: u.line, accessPattern: u.accessPattern,
    })),
  };
  console.log(JSON.stringify(output, null, 2));
}
