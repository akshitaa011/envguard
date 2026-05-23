// src/frameworks/rules.ts
// Framework-specific validation rules that produce warnings.
// Each framework has its own conventions for env var naming and scoping.

import { EnvVar, EnvUsage, Framework, FrameworkWarning } from '../types';

/**
 * Apply framework-specific rules and return warnings.
 */
export function applyFrameworkRules(
  framework: Framework,
  declared: EnvVar[],
  usages: EnvUsage[]
): FrameworkWarning[] {
  switch (framework) {
    case 'nextjs':
      return applyNextjsRules(declared, usages);
    case 'vite':
      return applyViteRules(declared, usages);
    case 'react':
      return applyReactRules(declared, usages);
    case 'express':
    case 'node':
      return applyNodeRules(declared, usages);
    default:
      return [];
  }
}

// ─── Next.js rules ───────────────────────────────────────────────────────────

function applyNextjsRules(declared: EnvVar[], usages: EnvUsage[]): FrameworkWarning[] {
  const warnings: FrameworkWarning[] = [];

  for (const decl of declared) {
    // NEXT_PUBLIC_ prefix exposes vars to the browser bundle.
    // If a var starts with NEXT_PUBLIC_ but is only accessed via process.env
    // on the server side (pages/api/**), that's a misuse.
    if (!decl.key.startsWith('NEXT_PUBLIC_')) {
      // Check if this server-only var is accessed in client-side files
      const clientUsages = usages.filter(
        (u) =>
          u.key === decl.key &&
          isClientSideFile(u.file)
      );
      if (clientUsages.length > 0) {
        warnings.push({
          key: decl.key,
          message: `"${decl.key}" is a server-only env var (no NEXT_PUBLIC_ prefix) but is accessed in a client-side file. It will be undefined in the browser.`,
          severity: 'error',
          file: clientUsages[0].file,
          line: clientUsages[0].line,
        });
      }
    }

    // NEXT_PUBLIC_ vars are embedded at build time — warn if value is a secret
    if (decl.key.startsWith('NEXT_PUBLIC_')) {
      const secretIndicators = ['SECRET', 'PRIVATE', 'PASSWORD', 'TOKEN', 'KEY', 'PASS'];
      const hasSecretName = secretIndicators.some((s) =>
        decl.key.toUpperCase().includes(s)
      );
      if (hasSecretName) {
        warnings.push({
          key: decl.key,
          message: `"${decl.key}" has NEXT_PUBLIC_ prefix, making it visible in the browser bundle. The name suggests it may be a secret — remove the prefix to keep it server-only.`,
          severity: 'warning',
          file: decl.file,
          line: decl.line,
        });
      }
    }
  }

  // Warn about import.meta.env usage in Next.js (that's Vite syntax, not Next.js)
  const importMetaUsages = usages.filter((u) =>
    u.accessPattern.startsWith('import.meta.env')
  );
  for (const usage of importMetaUsages) {
    warnings.push({
      key: usage.key,
      message: `import.meta.env is Vite syntax and does NOT work in Next.js. Use process.env.${usage.key} instead.`,
      severity: 'error',
      file: usage.file,
      line: usage.line,
    });
  }

  return warnings;
}

// ─── Vite rules ──────────────────────────────────────────────────────────────

function applyViteRules(declared: EnvVar[], usages: EnvUsage[]): FrameworkWarning[] {
  const warnings: FrameworkWarning[] = [];

  for (const decl of declared) {
    // In Vite, only vars prefixed VITE_ are exposed to client code via import.meta.env
    if (!decl.key.startsWith('VITE_') && decl.key !== 'NODE_ENV') {
      // Check if accessed via import.meta.env (client-side)
      const clientAccess = usages.filter(
        (u) => u.key === decl.key && u.accessPattern.startsWith('import.meta.env')
      );
      if (clientAccess.length > 0) {
        warnings.push({
          key: decl.key,
          message: `"${decl.key}" is accessed via import.meta.env but lacks the VITE_ prefix. Vite will NOT expose it — it will be undefined. Rename to VITE_${decl.key} or access via process.env on the server.`,
          severity: 'error',
          file: clientAccess[0].file,
          line: clientAccess[0].line,
        });
      }
    }

    // Warn about secrets with VITE_ prefix (they go into the client bundle)
    if (decl.key.startsWith('VITE_')) {
      const secretIndicators = ['SECRET', 'PRIVATE', 'PASSWORD', 'TOKEN', 'KEY', 'PASS'];
      const hasSecretName = secretIndicators.some((s) =>
        decl.key.toUpperCase().includes(s)
      );
      if (hasSecretName) {
        warnings.push({
          key: decl.key,
          message: `"${decl.key}" has VITE_ prefix and will be exposed in the client bundle. The name suggests it may be a secret — do not use VITE_ prefix for secrets.`,
          severity: 'warning',
          file: decl.file,
          line: decl.line,
        });
      }
    }
  }

  // Warn about process.env usage in Vite client files (Vite doesn't polyfill process.env)
  const processEnvInVite = usages.filter(
    (u) =>
      u.accessPattern.startsWith('process.env') &&
      isClientSideFile(u.file) &&
      !u.file.includes('vite.config')
  );
  for (const usage of processEnvInVite) {
    warnings.push({
      key: usage.key,
      message: `process.env.${usage.key} is used in a client-side file. In Vite, use import.meta.env.VITE_${usage.key} for client-side env vars.`,
      severity: 'warning',
      file: usage.file,
      line: usage.line,
    });
  }

  return warnings;
}

// ─── React (CRA) rules ───────────────────────────────────────────────────────

function applyReactRules(declared: EnvVar[], usages: EnvUsage[]): FrameworkWarning[] {
  const warnings: FrameworkWarning[] = [];

  for (const decl of declared) {
    // CRA requires REACT_APP_ prefix for client-side vars
    if (!decl.key.startsWith('REACT_APP_') && decl.key !== 'NODE_ENV' && decl.key !== 'PUBLIC_URL') {
      const clientAccess = usages.filter(
        (u) =>
          u.key === decl.key &&
          isClientSideFile(u.file)
      );
      if (clientAccess.length > 0) {
        warnings.push({
          key: decl.key,
          message: `"${decl.key}" is accessed in a React component but lacks the REACT_APP_ prefix. Create React App will NOT include it in the bundle — it will be undefined.`,
          severity: 'error',
          file: clientAccess[0].file,
          line: clientAccess[0].line,
        });
      }
    }
  }

  return warnings;
}

// ─── Node/Express rules ──────────────────────────────────────────────────────

function applyNodeRules(declared: EnvVar[], _usages: EnvUsage[]): FrameworkWarning[] {
  const warnings: FrameworkWarning[] = [];

  // Warn about empty values for vars that look required
  for (const decl of declared) {
    if (decl.value === '' || decl.value === undefined) {
      const looksCritical = ['DATABASE', 'DB_', 'SECRET', 'TOKEN', 'PASSWORD', 'API_KEY'].some(
        (p) => decl.key.includes(p)
      );
      if (looksCritical) {
        warnings.push({
          key: decl.key,
          message: `"${decl.key}" appears critical but has an empty value in your .env file.`,
          severity: 'warning',
          file: decl.file,
          line: decl.line,
        });
      }
    }
  }

  return warnings;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isClientSideFile(filePath: string): boolean {
  // Normalize to forward slashes for cross-platform support (Windows uses \)
  const normalized = filePath.replace(/\\/g, '/');

  const serverPatterns = ['/api/', '/server/', '/lib/server', '.server.'];
  const clientDirPatterns = ['/components/', '/pages/', '/src/', '/app/', '/views/', '/ui/'];

  const hasServerPattern = serverPatterns.some((p) => normalized.includes(p));
  if (hasServerPattern) return false;

  // Files in known client dirs
  const hasClientDir = clientDirPatterns.some((p) => normalized.includes(p));
  if (hasClientDir) return true;

  // JSX/TSX files are almost always client-side components
  const ext = normalized.split('.').pop()?.toLowerCase();
  if (ext === 'jsx' || ext === 'tsx') return true;

  return false;
}
