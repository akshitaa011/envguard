// src/types.ts
export type Framework = 'nextjs' | 'vite' | 'react' | 'express' | 'node' | 'nestjs' | 'remix' | 'nuxt' | 'astro' | 'unknown';

export interface EnvVar {
  key: string;
  value?: string;
  file: string;
  line?: number;
}

export interface EnvUsage {
  key: string;
  file: string;
  line: number;
  column: number;
  isDynamic: boolean;
  accessPattern: string;
}

export interface AnalysisResult {
  framework: Framework;
  projectRoot: string;
  healthy: EnvVar[];
  dead: EnvVar[];
  missing: EnvUsage[];
  dynamic: EnvUsage[];
  warnings: FrameworkWarning[];
  allUsages: EnvUsage[];
  allDeclared: EnvVar[];

  // New in v1.1
  empty: EnvVar[];                     // declared with empty value
  duplicates: DuplicateVar[];          // declared more than once
  exampleMismatches: ExampleMismatch[]; // .env vs .env.example gaps
  securityIssues: SecurityIssue[];     // gitignore + secret value warnings
}

export interface DuplicateVar {
  key: string;
  occurrences: { file: string; line: number; value?: string }[];
}

export interface ExampleMismatch {
  key: string;
  presentIn: 'env' | 'example';  // which file has it, the other doesn't
  file: string;
  line?: number;
}

export interface SecurityIssue {
  type: 'gitignore' | 'exposed-secret';
  severity: 'critical' | 'warning';
  message: string;
  key?: string;
  file?: string;
  line?: number;
}

export interface FrameworkWarning {
  key: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  file?: string;
  line?: number;
}

export interface ScanOptions {
  root: string;
  envFile?: string;
  envExampleFile?: string;
  include?: string[];
  exclude?: string[];
  framework?: Framework;
  outputFormat?: 'table' | 'json' | 'sarif';
  failOn?: ('dead' | 'missing' | 'warnings' | 'empty' | 'duplicates' | 'security')[];
  quiet?: boolean;
  monorepo?: boolean;  // scan workspace packages
}
