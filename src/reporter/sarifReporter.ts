// src/reporter/sarifReporter.ts
// SARIF (Static Analysis Results Interchange Format) output.
// GitHub's Code Scanning natively understands SARIF — upload results and they
// appear as inline annotations on your PR diffs.

import { AnalysisResult, EnvVar, EnvUsage, FrameworkWarning } from '../types';
import * as path from 'path';

const TOOL_NAME = 'envguard';
const TOOL_VERSION = '1.0.0';
const TOOL_URI = 'https://github.com/akshitaa011/envguard';

export function generateSarifReport(result: AnalysisResult): object {
  const results: object[] = [];

  // Dead variables
  for (const v of result.dead) {
    results.push(makeDeadVarResult(v, result.projectRoot));
  }

  // Missing variables
  for (const u of result.missing) {
    results.push(makeMissingVarResult(u, result.projectRoot));
  }

  // Framework warnings
  for (const w of result.warnings) {
    results.push(makeWarningResult(w, result.projectRoot));
  }

  return {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: TOOL_VERSION,
            informationUri: TOOL_URI,
            rules: [
              {
                id: 'ENVGUARD001',
                name: 'DeadEnvVariable',
                shortDescription: { text: 'Dead environment variable' },
                fullDescription: {
                  text: 'An environment variable is declared in .env but never referenced in source code.',
                },
                helpUri: `${TOOL_URI}#ENVGUARD001`,
                properties: { tags: ['correctness', 'maintainability'] },
              },
              {
                id: 'ENVGUARD002',
                name: 'MissingEnvVariable',
                shortDescription: { text: 'Missing environment variable' },
                fullDescription: {
                  text: 'An environment variable is referenced in source code but not declared in .env.',
                },
                helpUri: `${TOOL_URI}#ENVGUARD002`,
                properties: { tags: ['correctness', 'reliability'] },
              },
              {
                id: 'ENVGUARD003',
                name: 'FrameworkMisconfiguration',
                shortDescription: { text: 'Framework env var misconfiguration' },
                fullDescription: {
                  text: 'An environment variable is used in a way that violates framework conventions.',
                },
                helpUri: `${TOOL_URI}#ENVGUARD003`,
                properties: { tags: ['correctness', 'security'] },
              },
            ],
          },
        },
        results,
        originalUriBaseIds: {
          SRCROOT: { uri: `file://${result.projectRoot}/` },
        },
      },
    ],
  };
}

export function printSarifReport(result: AnalysisResult): void {
  console.log(JSON.stringify(generateSarifReport(result), null, 2));
}

function makeDeadVarResult(v: EnvVar, projectRoot: string): object {
  return {
    ruleId: 'ENVGUARD001',
    level: 'warning',
    message: {
      text: `"${v.key}" is declared in .env but never used in source code. Consider removing it.`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: path.relative(projectRoot, v.file),
            uriBaseId: 'SRCROOT',
          },
          region: {
            startLine: v.line ?? 1,
          },
        },
      },
    ],
  };
}

function makeMissingVarResult(u: EnvUsage, projectRoot: string): object {
  return {
    ruleId: 'ENVGUARD002',
    level: 'error',
    message: {
      text: `"${u.key}" is accessed via ${u.accessPattern} but is not declared in .env. This will be undefined at runtime.`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: path.relative(projectRoot, u.file),
            uriBaseId: 'SRCROOT',
          },
          region: {
            startLine: u.line,
            startColumn: u.column + 1,
          },
        },
      },
    ],
  };
}

function makeWarningResult(w: FrameworkWarning, projectRoot: string): object {
  return {
    ruleId: 'ENVGUARD003',
    level: w.severity === 'error' ? 'error' : 'warning',
    message: { text: w.message },
    locations: w.file
      ? [
          {
            physicalLocation: {
              artifactLocation: {
                uri: path.relative(projectRoot, w.file),
                uriBaseId: 'SRCROOT',
              },
              region: { startLine: w.line ?? 1 },
            },
          },
        ]
      : [],
  };
}
