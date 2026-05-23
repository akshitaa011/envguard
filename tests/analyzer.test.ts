// tests/analyzer.test.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { analyze } from '../src/analyzer';

function createTestProject(files: Record<string, string>): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-proj-'));
  for (const [name, content] of Object.entries(files)) {
    const fullPath = path.join(tmpDir, name);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return tmpDir;
}

describe('analyze()', () => {
  test('identifies dead variables', async () => {
    const root = createTestProject({
      '.env': 'DATABASE_URL=postgres://localhost/db\nUNUSED_VAR=something',
      'src/index.js': 'const db = process.env.DATABASE_URL;',
    });

    const result = await analyze({ root });

    const deadKeys = result.dead.map((v) => v.key);
    expect(deadKeys).toContain('UNUSED_VAR');
    expect(deadKeys).not.toContain('DATABASE_URL');
  });

  test('identifies missing variables', async () => {
    const root = createTestProject({
      '.env': 'DATABASE_URL=postgres://localhost/db',
      'src/index.js': `
        const db = process.env.DATABASE_URL;
        const key = process.env.MISSING_API_KEY;
      `,
    });

    const result = await analyze({ root });

    const missingKeys = result.missing.map((u) => u.key);
    expect(missingKeys).toContain('MISSING_API_KEY');
    expect(missingKeys).not.toContain('DATABASE_URL');
  });

  test('marks healthy variables correctly', async () => {
    const root = createTestProject({
      '.env': 'API_KEY=abc123\nDB_URL=postgres://localhost',
      'src/app.js': `
        const key = process.env.API_KEY;
        const db = process.env.DB_URL;
      `,
    });

    const result = await analyze({ root });

    const healthyKeys = result.healthy.map((v) => v.key);
    expect(healthyKeys).toContain('API_KEY');
    expect(healthyKeys).toContain('DB_URL');
    expect(result.dead).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  test('detects dynamic access', async () => {
    const root = createTestProject({
      '.env': 'SOME_VAR=value',
      'src/app.js': `const val = process.env[someVariable];`,
    });

    const result = await analyze({ root });
    expect(result.dynamic.length).toBeGreaterThan(0);
  });

  test('does not flag NODE_ENV as missing even when used without declaration', async () => {
    const root = createTestProject({
      '.env': 'API_KEY=abc',
      'src/app.js': `if (process.env.NODE_ENV === 'production') {}`,
    });

    const result = await analyze({ root });
    const missingKeys = result.missing.map((u) => u.key);
    expect(missingKeys).not.toContain('NODE_ENV');
  });

  test('auto-detects Next.js framework', async () => {
    const root = createTestProject({
      'package.json': JSON.stringify({ dependencies: { next: '^14.0.0', react: '^18.0.0' } }),
      '.env': 'NEXT_PUBLIC_API_URL=https://api.example.com',
      'pages/index.js': 'const url = process.env.NEXT_PUBLIC_API_URL;',
    });

    const result = await analyze({ root });
    expect(result.framework).toBe('nextjs');
  });

  test('applies Next.js warning for server var used in client', async () => {
    const root = createTestProject({
      'package.json': JSON.stringify({ dependencies: { next: '^14.0.0' } }),
      '.env': 'DB_SECRET=supersecret',
      'components/MyComponent.jsx': `
        export default function MyComponent() {
          return <div>{process.env.DB_SECRET}</div>;
        }
      `,
    });

    const result = await analyze({ root });
    const warningKeys = result.warnings.map((w) => w.key);
    expect(warningKeys).toContain('DB_SECRET');
  });

  test('counts PORT as healthy when declared in .env and used in code', async () => {
    // Regression test: PORT was previously in STDLIB_ENV_KEYS and wrongly excluded
    const root = createTestProject({
      '.env': 'PORT=3000\nAPI_KEY=abc123',
      'src/app.js': `
        const PORT = process.env.PORT || 3000;
        const key = process.env.API_KEY;
        app.listen(PORT);
      `,
    });

    const result = await analyze({ root });
    const healthyKeys = result.healthy.map((v) => v.key);
    expect(healthyKeys).toContain('PORT');
    expect(healthyKeys).toContain('API_KEY');
    expect(result.dead).toHaveLength(0);
  });

  test('real-world scenario: IntelliChat-style project', async () => {
    // Mirrors the exact bug found when running against IntelliChat AI:
    //   PORT was counted as healthy=2 instead of healthy=3
    //   GEMINI_API_KEY correctly detected as dead
    const root = createTestProject({
      '.env': [
        'OPENROUTER_API_KEY=sk-or-abc',
        'HF_API_KEY=hf-xyz',
        'PORT=3000',
        'GEMINI_API_KEY=gemini-unused', // dead — never referenced in source
      ].join('\n'),
      'src/chatController.js': `const key = process.env.OPENROUTER_API_KEY;`,
      'src/generateController.js': `const hf = process.env.HF_API_KEY;`,
      'src/app.js': `const PORT = process.env.PORT || 3000; app.listen(PORT);`,
    });

    const result = await analyze({ root });
    const healthyKeys = result.healthy.map((v) => v.key);
    const deadKeys = result.dead.map((v) => v.key);

    expect(healthyKeys).toContain('OPENROUTER_API_KEY');
    expect(healthyKeys).toContain('HF_API_KEY');
    expect(healthyKeys).toContain('PORT');        // was the bug — now fixed
    expect(deadKeys).toContain('GEMINI_API_KEY'); // correctly detected
    expect(result.healthy).toHaveLength(3);
    expect(result.dead).toHaveLength(1);
  });
});
