// src/scanner/sourceScanner.ts
// AST-based scanning of JS/TS source files to find every env var access pattern.
// Includes constant folding: resolves process.env[variable] when the variable
// is assigned a string literal in the same or outer scope.

import * as fs from 'fs';
import * as path from 'path';
import { parse, ParserPlugin } from '@babel/parser';
import traverse, { NodePath, Scope } from '@babel/traverse';
import * as t from '@babel/types';
import { glob } from 'glob';
import { EnvUsage } from '../types';

const SOURCE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];

const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '__pycache__',
];

/**
 * Scan all source files in a directory and return every env var usage.
 */
export async function scanSourceFiles(
  root: string,
  include?: string[],
  exclude?: string[]
): Promise<EnvUsage[]> {
  const patterns = include?.length
    ? include
    : SOURCE_EXTENSIONS.map((ext) => `**/*${ext}`);

  const excludeDirs = [...DEFAULT_EXCLUDE_DIRS, ...(exclude || [])];
  const ignorePattern = excludeDirs.map((d) => `**/${d}/**`);

  const allUsages: EnvUsage[] = [];

  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: root,
      ignore: ignorePattern,
      absolute: true,
    });

    for (const file of files) {
      try {
        const usages = scanFile(file);
        allUsages.push(...usages);
      } catch {
        // Silently skip files that can't be parsed
      }
    }
  }

  return allUsages;
}

/**
 * Scan a single file using Babel's AST parser.
 *
 * Detects all patterns:
 *   - process.env.KEY                          → static
 *   - process.env['KEY']                       → static
 *   - process.env[variable]                    → try constant fold, else dynamic
 *   - const key = 'KEY'; process.env[key]      → resolved via constant folding ✨
 *   - import.meta.env.KEY                      → static (Vite)
 *   - const { KEY } = process.env              → static (destructuring)
 */
export function scanFile(filePath: string): EnvUsage[] {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ext = path.extname(filePath).toLowerCase();
  const plugins = getBabelPlugins(ext);

  let ast: t.File;
  try {
    ast = parse(code, { sourceType: 'module', plugins, errorRecovery: true });
  } catch {
    try {
      ast = parse(code, { sourceType: 'script', plugins, errorRecovery: true });
    } catch {
      return [];
    }
  }

  // ── Pass 1: Build a constant string map for this file ──────────────────────
  // Finds all: const KEY = "VALUE" and var KEY = "VALUE" declarations
  // so we can resolve process.env[KEY] → "VALUE" in Pass 2.
  const constantStrings = buildConstantStringMap(ast);

  // ── Pass 2: Traverse AST and collect env usages ────────────────────────────
  const usages: EnvUsage[] = [];

  traverse(ast, {
    MemberExpression(nodePath) {
      const node = nodePath.node;

      // Pattern 1: process.env.KEY or process.env['KEY'] or process.env[var]
      if (isProcessEnvAccess(node)) {
        const usage = extractProcessEnvUsage(node, filePath, nodePath, constantStrings);
        if (usage) usages.push(usage);
        return;
      }

      // Pattern 2: import.meta.env.KEY (Vite)
      if (isImportMetaEnvAccess(node)) {
        const usage = extractImportMetaEnvUsage(node, filePath, nodePath, constantStrings);
        if (usage) usages.push(usage);
        return;
      }
    },

    // Pattern 3: const { KEY } = process.env (destructuring)
    VariableDeclarator(nodePath) {
      const node = nodePath.node;
      if (
        t.isObjectPattern(node.id) &&
        t.isMemberExpression(node.init) &&
        isProcessEnvObject(node.init)
      ) {
        for (const prop of node.id.properties) {
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
            usages.push({
              key: prop.key.name,
              file: filePath,
              line: prop.loc?.start.line ?? 0,
              column: prop.loc?.start.column ?? 0,
              isDynamic: false,
              accessPattern: `const { ${prop.key.name} } = process.env`,
            });
          }
        }
      }
    },
  });

  return deduplicateUsages(usages);
}

// ─── Constant folding ─────────────────────────────────────────────────────────

/**
 * Build a map of { variableName → "string literal value" } for the entire file.
 * Covers:
 *   const key = "OPENROUTER_API_KEY"
 *   var name = 'HF_API_KEY'
 *   let k = `PORT`  (template literal with no expressions)
 */
function buildConstantStringMap(ast: t.File): Map<string, string> {
  const constants = new Map<string, string>();

  traverse(ast, {
    VariableDeclarator(nodePath) {
      const { id, init } = nodePath.node;
      if (!t.isIdentifier(id) || !init) return;

      // const key = "STRING"
      if (t.isStringLiteral(init)) {
        constants.set(id.name, init.value);
        return;
      }

      // const key = `STRING` (no-expression template literal)
      if (t.isTemplateLiteral(init) && init.expressions.length === 0) {
        constants.set(id.name, init.quasis[0].value.cooked ?? '');
        return;
      }
    },
  });

  return constants;
}

/**
 * Try to resolve a dynamic identifier to a constant string.
 * Checks (in order):
 *   1. File-level constant map (built above)
 *   2. Babel scope binding — walks up the scope chain looking for
 *      a string literal initializer
 */
function resolveIdentifierToString(
  name: string,
  nodePath: NodePath,
  constantStrings: Map<string, string>
): string | null {
  // Check file-level constants first (fast path)
  if (constantStrings.has(name)) {
    return constantStrings.get(name)!;
  }

  // Walk Babel's scope chain
  try {
    const binding = nodePath.scope.getBinding(name);
    if (!binding) return null;

    const bindingPath = binding.path;

    // const/let/var x = "VALUE"
    if (
      t.isVariableDeclarator(bindingPath.node) &&
      t.isStringLiteral((bindingPath.node as t.VariableDeclarator).init)
    ) {
      return ((bindingPath.node as t.VariableDeclarator).init as t.StringLiteral).value;
    }

    // Template literal with no expressions: const x = `VALUE`
    if (
      t.isVariableDeclarator(bindingPath.node) &&
      t.isTemplateLiteral((bindingPath.node as t.VariableDeclarator).init)
    ) {
      const tpl = (bindingPath.node as t.VariableDeclarator).init as t.TemplateLiteral;
      if (tpl.expressions.length === 0) {
        return tpl.quasis[0].value.cooked ?? null;
      }
    }
  } catch {
    // scope walking can fail on malformed ASTs — safe to ignore
  }

  return null;
}

// ─── Pattern matchers ─────────────────────────────────────────────────────────

function isProcessEnvAccess(node: t.MemberExpression): boolean {
  return (
    t.isMemberExpression(node.object) &&
    t.isIdentifier((node.object as t.MemberExpression).object, { name: 'process' }) &&
    t.isIdentifier((node.object as t.MemberExpression).property, { name: 'env' })
  );
}

function isProcessEnvObject(node: t.MemberExpression): boolean {
  return (
    t.isIdentifier(node.object, { name: 'process' }) &&
    t.isIdentifier(node.property, { name: 'env' })
  );
}

function isImportMetaEnvAccess(node: t.MemberExpression): boolean {
  return (
    t.isMemberExpression(node.object) &&
    t.isMetaProperty((node.object as t.MemberExpression).object as t.Node) &&
    t.isIdentifier((node.object as t.MemberExpression).property, { name: 'env' })
  );
}

function extractProcessEnvUsage(
  node: t.MemberExpression,
  filePath: string,
  nodePath: NodePath,
  constantStrings: Map<string, string>
): EnvUsage | null {
  const line = node.loc?.start.line ?? 0;
  const column = node.loc?.start.column ?? 0;

  // process.env.KEY — direct dot access
  if (t.isIdentifier(node.property) && !node.computed) {
    return {
      key: node.property.name,
      file: filePath,
      line,
      column,
      isDynamic: false,
      accessPattern: `process.env.${node.property.name}`,
    };
  }

  // process.env['KEY'] — bracket string literal
  if (node.computed && t.isStringLiteral(node.property)) {
    return {
      key: node.property.value,
      file: filePath,
      line,
      column,
      isDynamic: false,
      accessPattern: `process.env['${node.property.value}']`,
    };
  }

  // process.env[variable] — try to resolve via constant folding ✨
  if (node.computed && t.isIdentifier(node.property)) {
    const resolved = resolveIdentifierToString(
      node.property.name,
      nodePath,
      constantStrings
    );

    if (resolved) {
      // Successfully resolved! Treat as static.
      return {
        key: resolved,
        file: filePath,
        line,
        column,
        isDynamic: false,
        accessPattern: `process.env[${node.property.name}] → "${resolved}" (resolved)`,
      };
    }

    // Could not resolve — genuinely dynamic
    return {
      key: '__dynamic__',
      file: filePath,
      line,
      column,
      isDynamic: true,
      accessPattern: `process.env[${node.property.name}] (unresolvable)`,
    };
  }

  // process.env[expression] — complex expression, truly dynamic
  if (node.computed) {
    return {
      key: '__dynamic__',
      file: filePath,
      line,
      column,
      isDynamic: true,
      accessPattern: `process.env[<expression>]`,
    };
  }

  return null;
}

function extractImportMetaEnvUsage(
  node: t.MemberExpression,
  filePath: string,
  nodePath: NodePath,
  constantStrings: Map<string, string>
): EnvUsage | null {
  const line = node.loc?.start.line ?? 0;
  const column = node.loc?.start.column ?? 0;

  // import.meta.env.KEY
  if (t.isIdentifier(node.property) && !node.computed) {
    return {
      key: node.property.name,
      file: filePath,
      line,
      column,
      isDynamic: false,
      accessPattern: `import.meta.env.${node.property.name}`,
    };
  }

  // import.meta.env['KEY']
  if (node.computed && t.isStringLiteral(node.property)) {
    return {
      key: node.property.value,
      file: filePath,
      line,
      column,
      isDynamic: false,
      accessPattern: `import.meta.env['${node.property.value}']`,
    };
  }

  // import.meta.env[variable] — try constant folding
  if (node.computed && t.isIdentifier(node.property)) {
    const resolved = resolveIdentifierToString(
      node.property.name,
      nodePath,
      constantStrings
    );
    if (resolved) {
      return {
        key: resolved,
        file: filePath,
        line,
        column,
        isDynamic: false,
        accessPattern: `import.meta.env[${node.property.name}] → "${resolved}" (resolved)`,
      };
    }
    return {
      key: '__dynamic__',
      file: filePath,
      line,
      column,
      isDynamic: true,
      accessPattern: `import.meta.env[${node.property.name}] (unresolvable)`,
    };
  }

  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBabelPlugins(ext: string): ParserPlugin[] {
  const base: ParserPlugin[] = [
    'decorators-legacy',
    'classProperties',
    'optionalChaining',
    'nullishCoalescingOperator',
    'importMeta',
    'dynamicImport',
    'exportDefaultFrom',
    'exportNamespaceFrom',
  ];
  if (ext === '.ts' || ext === '.tsx') base.push('typescript');
  else base.push('flow');
  if (ext === '.jsx' || ext === '.tsx') base.push('jsx');
  return base;
}

function deduplicateUsages(usages: EnvUsage[]): EnvUsage[] {
  const seen = new Set<string>();
  return usages.filter((u) => {
    const sig = `${u.key}:${u.file}:${u.line}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
}
