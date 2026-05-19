import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(rootDir, 'release');
const npmCacheDir = path.join(rootDir, '.npm-cache');
const packages = [
  path.join(rootDir, 'packages/client'),
  path.join(rootDir, 'packages/server'),
];

function run(command, args, cwd = rootDir) {
  execFileSync(command, args, {
    cwd,
    stdio: 'inherit',
  });
}

function readPackageName(packageDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf-8'));
  return pkg.name;
}

fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });
fs.mkdirSync(npmCacheDir, { recursive: true });

console.log('[app-notes] building packages...');
run('pnpm', ['build:all']);

for (const packageDir of packages) {
  const packageName = readPackageName(packageDir);
  console.log(`[app-notes] packing ${packageName}...`);
  const before = new Set(fs.readdirSync(packageDir));
  run('npm', ['pack', `--cache=${npmCacheDir}`], packageDir);
  const after = fs.readdirSync(packageDir);
  const tgz = after.find((file) => file.endsWith('.tgz') && !before.has(file));
  if (!tgz) {
    throw new Error(`No tarball generated for ${packageName}`);
  }
  const from = path.join(packageDir, tgz);
  const to = path.join(releaseDir, tgz);
  fs.renameSync(from, to);
  console.log(`[app-notes] wrote ${path.relative(rootDir, to)}`);
}

console.log('\nRelease files:');
for (const file of fs.readdirSync(releaseDir).filter((name) => name.endsWith('.tgz')).sort()) {
  console.log(`- ${path.join(releaseDir, file)}`);
}
