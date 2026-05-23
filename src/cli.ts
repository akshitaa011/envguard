#!/usr/bin/env node
// src/cli.ts

import { Command } from 'commander';
import chalk from 'chalk';
import { analyze } from './analyzer';
import { findWorkspaceRoots } from './frameworks/detector';
import { printTableReport } from './reporter/tableReporter';
import { printJsonReport } from './reporter/jsonReporter';
import { printSarifReport } from './reporter/sarifReporter';
import { Framework } from './types';

const program = new Command();

program
  .name('envguard')
  .description('Static analysis for environment variables — dead, missing, empty, duplicate, and security checks')
  .version('1.1.0');

program
  .command('check [root]', { isDefault: true })
  .description('Analyze environment variables in a project')
  .option('-e, --env-file <path>', 'Path to .env file (default: auto-detected)')
  .option('-x, --env-example <path>', 'Path to .env.example file')
  .option('-f, --framework <name>', 'Framework: nextjs|vite|react|express|nestjs|remix|nuxt|astro|node')
  .option('-o, --output <format>', 'Output format: table|json|sarif (default: table)')
  .option('--fail-on <items>', 'Comma-separated: dead,missing,empty,duplicates,security,warnings', 'missing')
  .option('--include <globs>', 'Comma-separated glob patterns to include')
  .option('--exclude <dirs>', 'Comma-separated dirs to exclude')
  .option('--monorepo', 'Scan all workspace packages')
  .option('-q, --quiet', 'Suppress healthy variable list')
  .action(async (root: string | undefined, options) => {
    const projectRoot = root || process.cwd();
    const outputFormat = (options.output ?? 'table') as 'table' | 'json' | 'sarif';
    const failOn = (options.failOn as string).split(',').map((s: string) => s.trim());

    try {
      // Monorepo: scan each workspace package
      const roots = options.monorepo
        ? findWorkspaceRoots(projectRoot)
        : [projectRoot];

      if (roots.length > 1) {
        console.log(chalk.cyan(`\n  📁 Monorepo: scanning ${roots.length} packages\n`));
      }

      let anyFailed = false;

      for (const scanRoot of roots) {
        if (roots.length > 1) {
          console.log(chalk.bold(`  📦 ${scanRoot}\n`));
        }

        const result = await analyze({
          root: scanRoot,
          envFile: options.envFile,
          envExampleFile: options.envExample,
          framework: options.framework as Framework | undefined,
          outputFormat,
          failOn: failOn as ('dead' | 'missing' | 'empty' | 'duplicates' | 'security' | 'warnings')[],
          quiet: options.quiet ?? false,
          include: options.include?.split(','),
          exclude: options.exclude?.split(','),
          monorepo: options.monorepo ?? false,
        });

        if (outputFormat === 'json') {
          printJsonReport(result);
        } else if (outputFormat === 'sarif') {
          printSarifReport(result);
        } else {
          printTableReport(result, options.quiet);
        }

        const failed =
          (failOn.includes('dead')       && result.dead.length > 0) ||
          (failOn.includes('missing')    && result.missing.length > 0) ||
          (failOn.includes('empty')      && result.empty.length > 0) ||
          (failOn.includes('duplicates') && result.duplicates.length > 0) ||
          (failOn.includes('security')   && result.securityIssues.some(s => s.severity === 'critical')) ||
          (failOn.includes('warnings')   && result.warnings.some(w => w.severity === 'error'));

        if (failed) anyFailed = true;
      }

      if (anyFailed) process.exit(1);

    } catch (err) {
      console.error(chalk.red('\n  ✖ Error running envguard:'));
      console.error(chalk.dim(`  ${(err as Error).message}\n`));
      process.exit(2);
    }
  });

program
  .command('list [root]')
  .description('List all env vars found in .env and source code')
  .option('-e, --env-file <path>', 'Path to .env file')
  .option('-f, --framework <name>', 'Framework override')
  .action(async (root: string | undefined, options) => {
    const projectRoot = root || process.cwd();
    const result = await analyze({
      root: projectRoot,
      envFile: options.envFile,
      framework: options.framework as Framework | undefined,
    });

    console.log(chalk.bold('\n  Declared in .env:'));
    for (const v of result.allDeclared) {
      const tag = v.value === '' || v.value === undefined
        ? chalk.red(' (empty)')
        : '';
      console.log(chalk.dim(`    ${v.key}`) + tag);
    }

    console.log(chalk.bold('\n  Found in source code:'));
    const uniqueUsed = [...new Set(result.allUsages.filter(u => !u.isDynamic).map(u => u.key))];
    for (const key of uniqueUsed) console.log(chalk.dim(`    ${key}`));
    console.log('');
  });

program.parse();
