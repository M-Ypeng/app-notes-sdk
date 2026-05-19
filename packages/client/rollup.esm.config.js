import path from 'node:path';
import { fileURLToPath } from 'node:url';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('rollup').RollupOptions} */
export default {
  input: path.join(__dirname, 'index.ts'),
  output: {
    file: path.join(__dirname, 'dist/app-notes-sdk.esm.js'),
    format: 'esm',
    sourcemap: true
  },
  plugins: [
    resolve({ browser: true }),
    typescript({
      tsconfig: path.join(__dirname, 'tsconfig.json'),
      sourceMap: true,
      inlineSources: true
    })
  ]
};
