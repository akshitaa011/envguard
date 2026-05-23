// tests/features.test.ts — Tests for all v1.1 features
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { analyze } from '../src/analyzer';
import { compareEnvAndExample, parseEnvFile } from '../src/parser/envFileParser';
import { checkGitignore, detectExposedSecrets } from '../src/security';

function createProject(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-feat-'));
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

// ── Empty variable detection ───────────────────────────────────────────────

describe('Empty variable detection', () => {
  test('detects empty values: KEY=', async () => {
    const root = createProject({
      '.env': 'API_KEY=\nDB_URL=postgres://localhost',
      'src/app.js': 'const k = process.env.API_KEY; const d = process.env.DB_URL;',
    });
    const result = await analyze({ root });
    expect(result.empty.map(v => v.key)).toContain('API_KEY');
    expect(result.empty.map(v => v.key)).not.toContain('DB_URL');
  });

  test('detects vars with no value (example-style)', async () => {
    const root = createProject({
      '.env': 'JWT_SECRET\nDB_URL=postgres://localhost',
      'src/app.js': 'const j = process.env.JWT_SECRET;',
    });
    const result = await analyze({ root });
    expect(result.empty.map(v => v.key)).toContain('JWT_SECRET');
  });
});

// ── Duplicate variable detection ───────────────────────────────────────────

describe('Duplicate variable detection', () => {
  test('detects duplicate keys in .env', async () => {
    const root = createProject({
      '.env': 'API_KEY=first\nDB_URL=postgres://localhost\nAPI_KEY=second',
      'src/app.js': 'const k = process.env.API_KEY;',
    });
    const result = await analyze({ root });
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].key).toBe('API_KEY');
    expect(result.duplicates[0].occurrences).toHaveLength(2);
  });

  test('returns no duplicates when all keys are unique', async () => {
    const root = createProject({
      '.env': 'API_KEY=abc\nDB_URL=postgres://localhost',
      'src/app.js': 'const k = process.env.API_KEY;',
    });
    const result = await analyze({ root });
    expect(result.duplicates).toHaveLength(0);
  });
});

// ── .env.example mismatch detection ───────────────────────────────────────

describe('.env.example mismatch detection', () => {
  test('detects key in .env but not .env.example', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-ex-'));
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=abc\nSECRET_KEY=xyz');
    fs.writeFileSync(path.join(dir, '.env.example'), 'API_KEY=');
    const mismatches = compareEnvAndExample(
      path.join(dir, '.env'),
      path.join(dir, '.env.example')
    );
    expect(mismatches.find(m => m.key === 'SECRET_KEY' && m.presentIn === 'env')).toBeDefined();
  });

  test('detects key in .env.example but not .env', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-ex-'));
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=abc');
    fs.writeFileSync(path.join(dir, '.env.example'), 'API_KEY=\nREQUIRED_VAR=');
    const mismatches = compareEnvAndExample(
      path.join(dir, '.env'),
      path.join(dir, '.env.example')
    );
    expect(mismatches.find(m => m.key === 'REQUIRED_VAR' && m.presentIn === 'example')).toBeDefined();
  });

  test('returns no mismatches when files match', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-ex-'));
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=abc\nDB_URL=postgres://localhost');
    fs.writeFileSync(path.join(dir, '.env.example'), 'API_KEY=\nDB_URL=');
    const mismatches = compareEnvAndExample(
      path.join(dir, '.env'),
      path.join(dir, '.env.example')
    );
    expect(mismatches).toHaveLength(0);
  });
});

// ── .gitignore safety check ────────────────────────────────────────────────

describe('.gitignore safety check', () => {
  test('raises critical issue when .gitignore missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-git-'));
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=abc');
    const issue = checkGitignore(dir, path.join(dir, '.env'));
    expect(issue).not.toBeNull();
    expect(issue?.type).toBe('gitignore');
    expect(issue?.severity).toBe('critical');
  });

  test('raises critical issue when .env not in .gitignore', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-git-'));
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=abc');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/');
    const issue = checkGitignore(dir, path.join(dir, '.env'));
    expect(issue).not.toBeNull();
  });

  test('no issue when .env* is in .gitignore', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-git-'));
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=abc');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n.env*\ndist/');
    const issue = checkGitignore(dir, path.join(dir, '.env'));
    expect(issue).toBeNull();
  });

  test('no issue when .env is directly listed in .gitignore', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-git-'));
    fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=abc');
    fs.writeFileSync(path.join(dir, '.gitignore'), '.env\nnode_modules/');
    const issue = checkGitignore(dir, path.join(dir, '.env'));
    expect(issue).toBeNull();
  });
});

// ── Secret value detection ─────────────────────────────────────────────────

describe('Secret value detection', () => {
  test('detects OpenAI-style key', () => {
    const vars = [{ key: 'OPENAI_API_KEY', value: 'sk-abcdefghijklmnopqrstuvwxyz123456', file: '.env', line: 1 }];
    const issues = detectExposedSecrets(vars);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('exposed-secret');
  });

  test('detects JWT token value', () => {
    const vars = [{ key: 'JWT_SECRET', value: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123', file: '.env', line: 1 }];
    const issues = detectExposedSecrets(vars);
    expect(issues).toHaveLength(1);
  });

  test('does not flag placeholder values', () => {
    const vars = [{ key: 'API_KEY', value: 'your-api-key-here', file: '.env', line: 1 }];
    const issues = detectExposedSecrets(vars);
    expect(issues).toHaveLength(0);
  });

  test('does not flag non-secret keys even with high-entropy values', () => {
    const vars = [{ key: 'DATABASE_NAME', value: 'myapp_production', file: '.env', line: 1 }];
    const issues = detectExposedSecrets(vars);
    expect(issues).toHaveLength(0);
  });
});

// ── Framework detection expansion ─────────────────────────────────────────

describe('Framework detection', () => {
  test('detects NestJS', async () => {
    const root = createProject({
      'package.json': JSON.stringify({ dependencies: { '@nestjs/core': '^10.0.0' } }),
      '.env': 'PORT=3000',
      'src/main.ts': 'const port = process.env.PORT;',
    });
    const result = await analyze({ root });
    expect(result.framework).toBe('nestjs');
  });

  test('detects Remix', async () => {
    const root = createProject({
      'package.json': JSON.stringify({ dependencies: { '@remix-run/react': '^2.0.0', '@remix-run/node': '^2.0.0' } }),
      '.env': 'SESSION_SECRET=abc',
      'app/root.tsx': 'const s = process.env.SESSION_SECRET;',
    });
    const result = await analyze({ root });
    expect(result.framework).toBe('remix');
  });

  test('detects Astro', async () => {
    const root = createProject({
      'package.json': JSON.stringify({ dependencies: { astro: '^4.0.0' } }),
      '.env': 'PUBLIC_API_URL=https://api.example.com',
      'src/pages/index.astro': 'const url = process.env.PUBLIC_API_URL;',
    });
    const result = await analyze({ root });
    expect(result.framework).toBe('astro');
  });
});
