import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
const runtime = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).dependencies;
export default defineConfig({
  // Direct-import browser fixtures and the lazy editor must share the same
  // initial optimizer graph; late discovery otherwise reloads active test pages.
  optimizeDeps: { include: [...Object.keys(runtime).filter(name => !['svelte', 'lucide-svelte'].includes(name)), 'markdown-it/lib/token.mjs'] },
  plugins: [svelte({ compilerOptions: { css: 'injected' } }), {
    name: 'bundled-license-inventory',
    generateBundle(_, bundle) {
      const names = new Set<string>();
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') {
        for (const id of Object.keys(chunk.modules)) {
          if (!id.includes('/node_modules/')) continue;
          let path = dirname(id);
          while (path.includes('/node_modules')) {
            const file = join(path, 'package.json');
            if (existsSync(file)) { const pkg = JSON.parse(readFileSync(file, 'utf8')); if(pkg.name) {names.add(pkg.name); break;} }
            path = dirname(path);
          }
        }
      }
      this.emitFile({ type:'asset', fileName:'bundled-packages.json', source:JSON.stringify([...names].sort()) });
    },
  }],
  build: {
    lib: {
      entry: { index: 'src/index.ts', 'task-worker': 'src/taskWorker.ts' },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rollupOptions: { output: { chunkFileNames: 'chunks/[name]-[hash].js' } },
    sourcemap: false,
  },
});
