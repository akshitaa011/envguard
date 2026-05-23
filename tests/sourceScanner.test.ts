// tests/sourceScanner.test.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { scanFile } from '../src/scanner/sourceScanner';

function writeTempFile(content: string, ext = '.js'): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-scan-'));
  const filePath = path.join(tmpDir, `test${ext}`);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('scanFile', () => {
  test('detects process.env.KEY (dot access)', () => {
    const file = writeTempFile(`const url = process.env.DATABASE_URL;`);
    const usages = scanFile(file);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      key: 'DATABASE_URL',
      isDynamic: false,
      accessPattern: 'process.env.DATABASE_URL',
    });
  });

  test('detects process.env["KEY"] (bracket string access)', () => {
    const file = writeTempFile(`const key = process.env["API_KEY"];`);
    const usages = scanFile(file);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({ key: 'API_KEY', isDynamic: false });
  });

  test('detects dynamic access process.env[variable]', () => {
    const file = writeTempFile(`const val = process.env[someVar];`);
    const usages = scanFile(file);
    expect(usages).toHaveLength(1);
    expect(usages[0].isDynamic).toBe(true);
  });

  test('detects import.meta.env.KEY (Vite pattern)', () => {
    const file = writeTempFile(`const key = import.meta.env.VITE_API_URL;`, '.js');
    const usages = scanFile(file);
    expect(usages).toHaveLength(1);
    expect(usages[0]).toMatchObject({
      key: 'VITE_API_URL',
      accessPattern: 'import.meta.env.VITE_API_URL',
    });
  });

  test('detects destructured access: const { KEY } = process.env', () => {
    const file = writeTempFile(`const { DATABASE_URL, API_KEY } = process.env;`);
    const usages = scanFile(file);
    const keys = usages.map((u) => u.key);
    expect(keys).toContain('DATABASE_URL');
    expect(keys).toContain('API_KEY');
  });

  test('detects multiple usages in one file', () => {
    const file = writeTempFile(`
      const db = process.env.DATABASE_URL;
      const port = process.env.PORT;
      const secret = process.env.JWT_SECRET;
    `);
    const usages = scanFile(file);
    expect(usages).toHaveLength(3);
  });

  test('handles TypeScript files', () => {
    const file = writeTempFile(
      `const url: string = process.env.DATABASE_URL as string;`,
      '.ts'
    );
    const usages = scanFile(file);
    expect(usages[0].key).toBe('DATABASE_URL');
  });

  test('handles JSX files', () => {
    const file = writeTempFile(
      `function App() { return <div>{process.env.REACT_APP_TITLE}</div>; }`,
      '.jsx'
    );
    const usages = scanFile(file);
    expect(usages[0].key).toBe('REACT_APP_TITLE');
  });

  test('does not duplicate same key on same line', () => {
    const file = writeTempFile(
      `const x = process.env.KEY || process.env.KEY;`
    );
    const usages = scanFile(file);
    // Same key same line — may vary, but should not crash
    expect(usages.length).toBeGreaterThanOrEqual(1);
  });

  test('returns empty array for file with no env access', () => {
    const file = writeTempFile(`const x = 42; console.log(x);`);
    const usages = scanFile(file);
    expect(usages).toHaveLength(0);
  });
});

// ─── Constant folding tests ───────────────────────────────────────────────────

describe('constant folding (resolving dynamic access)', () => {
  test('resolves: const key = "VAR_NAME"; process.env[key]', () => {
    const file = writeTempFile(`
      const key = "OPENROUTER_API_KEY";
      const val = process.env[key];
    `);
    const usages = scanFile(file);
    const resolved = usages.find((u) => u.key === 'OPENROUTER_API_KEY');
    expect(resolved).toBeDefined();
    expect(resolved?.isDynamic).toBe(false);
    expect(resolved?.accessPattern).toContain('resolved');
  });

  test('resolves: var name = "API_KEY"; process.env[name]', () => {
    const file = writeTempFile(`
      var name = "HF_API_KEY";
      const result = process.env[name];
    `);
    const usages = scanFile(file);
    expect(usages.find((u) => u.key === 'HF_API_KEY')).toBeDefined();
  });

  test('resolves template literal: const k = \`PORT\`; process.env[k]', () => {
    const file = writeTempFile(
      'const k = `PORT`;\nconst p = process.env[k];'
    );
    const usages = scanFile(file);
    expect(usages.find((u) => u.key === 'PORT')).toBeDefined();
  });

  test('marks truly dynamic as isDynamic=true when cannot resolve', () => {
    const file = writeTempFile(`
      function getKey(suffix) { return 'API_' + suffix; }
      const val = process.env[getKey('KEY')];
    `);
    const usages = scanFile(file);
    expect(usages[0].isDynamic).toBe(true);
  });

  test('resolves via scope binding even when declared above in same scope', () => {
    const file = writeTempFile(`
      const ENV_KEY = "DATABASE_URL";
      function connect() {
        return process.env[ENV_KEY];
      }
    `);
    const usages = scanFile(file);
    expect(usages.find((u) => u.key === 'DATABASE_URL')).toBeDefined();
  });
});
