import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
export default defineConfig({
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
  build: { lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' }, sourcemap: false },
});
