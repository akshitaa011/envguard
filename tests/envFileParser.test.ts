// tests/envFileParser.test.ts
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseEnvFile } from '../src/parser/envFileParser';

function writeTempEnv(content: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'envguard-test-'));
  const filePath = path.join(tmpDir, '.env');
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe('parseEnvFile', () => {
  test('parses basic KEY=VALUE pairs', () => {
    const file = writeTempEnv('DATABASE_URL=postgres://localhost/db\nAPI_KEY=abc123');
    const { vars } = parseEnvFile(file);
    expect(vars).toHaveLength(2);
    expect(vars[0]).toMatchObject({ key: 'DATABASE_URL', value: 'postgres://localhost/db' });
    expect(vars[1]).toMatchObject({ key: 'API_KEY', value: 'abc123' });
  });

  test('skips blank lines and comments', () => {
    const file = writeTempEnv('# This is a comment\n\nAPI_KEY=hello\n# another comment');
    const { vars } = parseEnvFile(file);
    expect(vars).toHaveLength(1);
    expect(vars[0].key).toBe('API_KEY');
  });

  test('handles quoted values', () => {
    const file = writeTempEnv('SECRET="my secret value"\nOTHER=\'single quoted\'');
    const { vars } = parseEnvFile(file);
    expect(vars[0].value).toBe('my secret value');
    expect(vars[1].value).toBe('single quoted');
  });

  test('handles keys with no value (.env.example style)', () => {
    const file = writeTempEnv('DATABASE_URL\nAPI_KEY');
    const { vars } = parseEnvFile(file);
    expect(vars).toHaveLength(2);
    expect(vars[0]).toMatchObject({ key: 'DATABASE_URL', value: undefined });
  });

  test('handles empty values', () => {
    const file = writeTempEnv('EMPTY_VAR=');
    const { vars } = parseEnvFile(file);
    expect(vars[0]).toMatchObject({ key: 'EMPTY_VAR', value: '' });
  });

  test('strips inline comments', () => {
    const file = writeTempEnv('PORT=3000 # default port');
    const { vars } = parseEnvFile(file);
    expect(vars[0].value).toBe('3000');
  });

  test('records line numbers', () => {
    const file = writeTempEnv('# comment\nFIRST=1\nSECOND=2');
    const { vars } = parseEnvFile(file);
    expect(vars[0].line).toBe(2);
    expect(vars[1].line).toBe(3);
  });

  test('returns empty array for nonexistent file', () => {
    const { vars } = parseEnvFile('/nonexistent/.env');
    expect(vars).toHaveLength(0);
  });
});
