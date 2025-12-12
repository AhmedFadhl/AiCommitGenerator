const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  target: 'node18',
}).catch(() => process.exit(1));
