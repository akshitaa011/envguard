// src/frameworks/detector.ts
// Auto-detects JS/TS framework from package.json and config files.

import * as fs from 'fs';
import * as path from 'path';
import { Framework } from '../types';

export function detectFramework(root: string): Framework {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return 'unknown';

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return 'unknown';
  }

  const deps = {
    ...((pkg.dependencies as Record<string, string>) || {}),
    ...((pkg.devDependencies as Record<string, string>) || {}),
  };
  const d = Object.keys(deps);

  // Order matters — check most specific first
  if (d.includes('next'))                                          return 'nextjs';
  if (d.includes('@remix-run/react') || d.includes('@remix-run/node')) return 'remix';
  if (d.includes('nuxt') || d.includes('nuxt3'))                  return 'nuxt';
  if (d.includes('astro'))                                         return 'astro';
  if (d.includes('@nestjs/core'))                                  return 'nestjs';

  // Vite: check dep or config file
  if (d.includes('vite') ||
      fs.existsSync(path.join(root, 'vite.config.ts')) ||
      fs.existsSync(path.join(root, 'vite.config.js')))           return 'vite';

  // Express / fastify / koa
  if (d.includes('express') || d.includes('fastify') || d.includes('koa')) return 'express';

  // React (CRA or other bundler)
  if (d.includes('react'))                                         return 'react';

  // Plain Node
  if (pkg.engines || d.includes('nodemon') || d.includes('ts-node')) return 'node';

  return 'unknown';
}

/**
 * Scan a monorepo for multiple package roots.
 * Looks for workspaces defined in root package.json
 * and returns each sub-package that has its own .env file.
 */
export function findWorkspaceRoots(root: string): string[] {
  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return [root];

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  } catch {
    return [root];
  }

  const workspaces: string[] = [];

  // npm/yarn workspaces: { "workspaces": ["packages/*", "apps/*"] }
  const ws = pkg.workspaces;
  const patterns: string[] = Array.isArray(ws)
    ? ws
    : Array.isArray((ws as Record<string, unknown>)?.packages)
      ? ((ws as Record<string, string[]>).packages)
      : [];

  for (const pattern of patterns) {
    // Expand simple glob patterns like "packages/*"
    const base = pattern.replace(/\/\*$/, '');
    const baseDir = path.join(root, base);
    if (!fs.existsSync(baseDir)) continue;

    for (const entry of fs.readdirSync(baseDir)) {
      const sub = path.join(baseDir, entry);
      if (fs.statSync(sub).isDirectory()) {
        workspaces.push(sub);
      }
    }
  }

  return workspaces.length > 0 ? workspaces : [root];
}
