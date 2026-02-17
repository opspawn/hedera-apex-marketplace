import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: ['cjs'],
  target: 'es2022',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  splitting: false,
  bundle: false,
});
