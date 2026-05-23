import * as fs from 'fs';
import * as path from 'path';

export function loadIgnoreList(root: string): string[] {
  const ignorePath = path.join(root, '.envguardignore');
  if (!fs.existsSync(ignorePath)) return [];
  return fs.readFileSync(ignorePath, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}