// src/index.ts — Public API
export { analyze } from './analyzer';
export { parseEnvFile, findEnvFiles, compareEnvAndExample } from './parser/envFileParser';
export { scanSourceFiles, scanFile } from './scanner/sourceScanner';
export { detectFramework, findWorkspaceRoots } from './frameworks/detector';
export { checkGitignore, detectExposedSecrets } from './security';
export { printTableReport } from './reporter/tableReporter';
export { printJsonReport } from './reporter/jsonReporter';
export { printSarifReport, generateSarifReport } from './reporter/sarifReporter';
export type {
  AnalysisResult, EnvVar, EnvUsage, Framework, FrameworkWarning,
  ScanOptions, DuplicateVar, ExampleMismatch, SecurityIssue,
} from './types';
