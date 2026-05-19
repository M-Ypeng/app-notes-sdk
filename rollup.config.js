import path from 'node:path';
import { fileURLToPath } from 'node:url';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(__dirname, 'packages/client');
const production = process.env.NODE_ENV === 'production';

/** @type {import('rollup').RollupOptions} */
export default {
  input: path.join(clientDir, 'index.ts'),
  output: {
    file: path.join(clientDir, 'dist/app-notes-sdk.js'),
    format: 'iife',
    name: 'AppNotesSDK',
    sourcemap: true,
    exports: 'named'
  },
  plugins: [
    resolve({ browser: true }),
    typescript({
      tsconfig: path.join(clientDir, 'tsconfig.json'),
      sourceMap: true,
      inlineSources: !production
    }),
    production && terser()
  ],
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY') return;
    warn(warning);
  }
};
