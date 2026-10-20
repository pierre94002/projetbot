import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Bac à sable (docs/bac-a-sable.md) : node_modules y est une JONCTION vers
// celui du dépôt. Vite range son cache de dépendances dans node_modules/.vite :
// sans ceci, l'interface du bac l'écrirait DANS le dépôt, sous l'interface de
// Pierre qui tourne en même temps — et comme la racine du projet entre dans
// l'empreinte de ce cache, chacune invaliderait celui de l'autre à chaque
// démarrage. Le cache reste donc à côté du code quand node_modules est un lien
// (ou avec CM_BAC_A_SABLE). Hors bac, rien ne change.
const ICI = fileURLToPath(new URL('.', import.meta.url));
const modulesPartages = (() => {
  try {
    return fs.lstatSync(path.join(ICI, 'node_modules')).isSymbolicLink();
  } catch {
    return false;
  }
})();
const cacheAPart = modulesPartages || /^\s*(1|true|oui|yes|on)\s*$/i.test(process.env.CM_BAC_A_SABLE ?? '');

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  ...(cacheAPart ? { cacheDir: path.join(ICI, '.vite-cache') } : {}),
  server: {
    port: 5173,
    strictPort: true
  }
});
