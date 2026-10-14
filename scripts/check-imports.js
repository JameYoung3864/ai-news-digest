/**
 * 静态校验前端 ES Module 依赖：
 * 1. import 的相对路径是否真实存在
 * 2. 具名导入是否在目标模块中被导出
 * 3. 是否导入了不存在的视图文件
 * 用法: node scripts/check-imports.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsRoot = path.join(root, 'public', 'js');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : full.endsWith('.js') ? [full] : [];
  });
}

const files = walk(jsRoot);
const exportsCache = new Map();

function exportsOf(file) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  const source = fs.readFileSync(file, 'utf8');
  const names = new Set();
  const add = (name) => names.add(name.trim().split(/\s+as\s+/).pop().trim());

  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) add(match[1]);
  for (const match of source.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) add(match[1]);
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) match[1].split(',').forEach(add);
  if (/export\s+default/.test(source)) names.add('default');

  exportsCache.set(file, names);
  return names;
}

let problems = 0;
let checkedImports = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const importRe = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRe.exec(source))) {
    const clause = match[1].trim();
    const specifier = match[2];
    if (!specifier.startsWith('.')) continue;

    const target = path.resolve(path.dirname(file), specifier);
    const rel = path.relative(root, file);
    checkedImports += 1;

    if (!fs.existsSync(target)) {
      console.log(`BROKEN  ${rel} → ${specifier} (文件不存在)`);
      problems += 1;
      continue;
    }

    const available = exportsOf(target);
    const requested = [];

    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      braces[1]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => requested.push(item.split(/\s+as\s+/)[0].trim()));
    }
    if (/^[A-Za-z0-9_$]+\s*(,|$)/.test(clause) && !clause.startsWith('{')) {
      requested.push('default');
    }

    for (const name of requested) {
      if (!available.has(name)) {
        console.log(`MISSING ${rel} → ${specifier} 未导出 "${name}"`);
        problems += 1;
      }
    }
  }
}

console.log(`\n检查 ${files.length} 个模块 / ${checkedImports} 条相对导入，问题 ${problems} 个`);
process.exit(problems === 0 ? 0 : 1);
