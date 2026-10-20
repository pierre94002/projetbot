#!/usr/bin/env node
/**
 * verifier-interface.mjs — l'interface compile et se construit, sans rien
 * écrire à côté d'elle.
 * -----------------------------------------------------------------------
 * Étape 3 du plan CôteMaster (tests automatiques). Lancé par le test
 * server/test/interface.test.mjs, ou à la main depuis ui/ :
 *
 *   node scripts/verifier-interface.mjs                 compile + construit
 *   node scripts/verifier-interface.mjs --avant <src>   en plus : rien de perdu
 *                                                       face à une autre copie de src/
 *
 * 1. COMPILATION de chaque composant .vue de src/ (script setup, gabarit,
 *    styles) et des composants employés dans un gabarit sans être importés
 *    — le contrôle check-vue.cjs de la refonte visuelle (01-02/10/2026),
 *    étendu à tous les fichiers.
 * 2. CONSTRUCTION par Vite dans un dossier TEMPORAIRE du système, effacé
 *    ensuite — jamais ui/dist. La configuration de l'appli (vite.config.js)
 *    est importée telle quelle et passée à Vite sans qu'il relise le fichier :
 *    la ligne de commande `vite build` écrirait sinon un fichier temporaire
 *    (vite.config.js.timestamp-….mjs) À CÔTÉ de la configuration, donc dans
 *    le dépôt, sous OneDrive, pendant que l'interface de Pierre tourne. Le
 *    cache de Vite va lui aussi dans le dossier temporaire, et aucun .env
 *    n'est lu (envDir = dossier temporaire vide).
 * 3. Avec --avant <dossier src> : pour chaque .vue présent des deux côtés et
 *    différent, aucune expression du gabarit ni ligne de script ne doit
 *    avoir disparu — le contrôle check-data.cjs de la refonte visuelle. Utile
 *    quand une étape restyle des écrans : comparer le src du bac à celui du
 *    dépôt.
 *
 * Sortie : une ligne JSON ; code 0 si tout va bien, 1 sinon.
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(UI, 'src');

function lireArgs(argv) {
  const args = { avant: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--avant') {
      args.avant = argv[++i];
      if (!args.avant) throw new Error("L'option --avant attend le dossier src à comparer.");
    } else throw new Error(`Option inconnue : ${argv[i]}. Option : --avant <dossier src>.`);
  }
  return args;
}

const fichiersVue = (dossier) =>
  fs.readdirSync(dossier, { recursive: true }).filter((f) => f.endsWith('.vue')).map((f) => f.split(path.sep).join('/')).sort();

// ------------------------------------------------------- 1. compilation

const GLOBAUX = new Set(['RouterLink', 'RouterView', 'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense', 'Component']);

function compiler(sfc, rel) {
  const fichier = path.join(SRC, rel);
  const { descriptor, errors } = sfc.parse(fs.readFileSync(fichier, 'utf8'), { filename: fichier });
  if (errors.length) return [`${rel} : lecture — ${errors.map((e) => e.message).join(' | ')}`];
  const erreurs = [];
  const id = `v${crypto.createHash('sha1').update(rel).digest('hex').slice(0, 8)}`;
  try {
    if (descriptor.scriptSetup || descriptor.script) {
      const script = sfc.compileScript(descriptor, { id, inlineTemplate: Boolean(descriptor.scriptSetup) });
      if (descriptor.scriptSetup) {
        const utilises = new Set([...(descriptor.template?.content ?? '').matchAll(/<([A-Z][A-Za-z0-9]+)/g)].map((m) => m[1]));
        const importes = new Set(Object.keys(script.bindings ?? {}));
        const manquants = [...utilises].filter((c) => !importes.has(c) && !GLOBAUX.has(c));
        if (manquants.length) erreurs.push(`${rel} : composants non importés — ${manquants.join(', ')}`);
      }
    }
    if (descriptor.template && !descriptor.scriptSetup) {
      const t = sfc.compileTemplate({ source: descriptor.template.content, filename: fichier, id });
      if (t.errors.length) erreurs.push(`${rel} : gabarit — ${t.errors.map((e) => (typeof e === 'string' ? e : e.message)).join(' | ')}`);
    }
  } catch (e) {
    erreurs.push(`${rel} : script — ${String(e.message).split('\n')[0]}`);
  }
  for (const style of descriptor.styles) {
    const r = sfc.compileStyle({ source: style.content, filename: fichier, id, scoped: style.scoped });
    if (r.errors.length) erreurs.push(`${rel} : styles — ${r.errors.map((e) => e.message).join(' | ')}`);
  }
  return erreurs;
}

// ------------------------------------- 3. rien de perdu (check-data.cjs)

const norm = (t) => t.replace(/\s+/g, ' ').trim();
function partie(src, balise) {
  const debut = src.search(new RegExp(`^<${balise}(\\s[^>]*)?>`, 'm'));
  if (debut === -1) return '';
  const fin = src.search(new RegExp(`^<\\/${balise}>\\s*$`, 'm'));
  if (fin === -1 || fin < debut) return '';
  return src.slice(src.indexOf('>', debut) + 1, fin);
}
function expressionsGabarit(tpl) {
  const set = new Set();
  for (const m of tpl.matchAll(/\{\{([\s\S]*?)\}\}/g)) set.add(`{{ ${norm(m[1])} }}`);
  for (const m of tpl.matchAll(/\s(?::[\w.-]+|v-(?:if|else-if|for|show|model|bind|html|text)(?:[:.][\w.-]+)?|@[\w.:-]+)="([^"]*)"/g)) {
    const attr = m[0].trim().split('=')[0];
    if (/^(:class|:style|:key|:title|:size|:aria-[\w-]+|:data-[\w-]+|:tabindex|:role)$/.test(attr)) continue;
    set.add(`${attr}=${norm(m[1])}`);
  }
  return set;
}
function lignesScript(js) {
  const set = new Set();
  for (const brute of js.split('\n')) {
    const l = norm(brute);
    if (!l || l.startsWith('//') || l.startsWith('/*') || l.startsWith('*') || l.startsWith('import ')) continue;
    if (/^[{}()[\];,]*$/.test(l)) continue;
    set.add(l);
  }
  return set;
}
function pertes(avantSrc) {
  const out = [];
  for (const rel of fichiersVue(SRC)) {
    const fAvant = path.join(avantSrc, rel);
    if (!fs.existsSync(fAvant)) continue;
    const avant = fs.readFileSync(fAvant, 'utf8');
    const apres = fs.readFileSync(path.join(SRC, rel), 'utf8');
    if (avant === apres) continue;
    const expB = expressionsGabarit(partie(apres, 'template'));
    const jsB = lignesScript(partie(apres, 'script'));
    const perdues = [
      ...[...expressionsGabarit(partie(avant, 'template'))].filter((e) => !expB.has(e)),
      ...[...lignesScript(partie(avant, 'script'))].filter((e) => !jsB.has(e))
    ];
    if (perdues.length) out.push({ fichier: rel, disparues: perdues.slice(0, 40), total: perdues.length });
  }
  return out;
}

// --------------------------------------------------------- 2. construction

async function construire() {
  const { build } = await import('vite');
  const config = (await import(pathToFileURL(path.join(UI, 'vite.config.js')).href)).default;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-interface-'));
  const sortie = path.join(temp, 'dist');
  const debut = Date.now();
  try {
    await build({
      ...config,
      configFile: false,
      root: UI,
      mode: 'production',
      logLevel: 'error',
      envDir: temp,
      cacheDir: path.join(temp, 'cache'),
      build: { ...(config.build ?? {}), outDir: sortie, emptyOutDir: true, reportCompressedSize: false }
    });
    const fichiers = fs.readdirSync(sortie, { recursive: true }).filter((f) => fs.statSync(path.join(sortie, f)).isFile());
    const octets = fichiers.reduce((s, f) => s + fs.statSync(path.join(sortie, f)).size, 0);
    const html = fs.existsSync(path.join(sortie, 'index.html')) ? fs.readFileSync(path.join(sortie, 'index.html'), 'utf8') : '';
    const scripts = fichiers.filter((f) => f.endsWith('.js'));
    return {
      ok: Boolean(html.includes('<div id="app">') && scripts.length),
      ms: Date.now() - debut,
      fichiers: fichiers.length,
      scripts: scripts.length,
      octets
    };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

// ------------------------------------------------------------------ main

async function main() {
  const args = lireArgs(process.argv.slice(2));
  const racineAvant = fs.readdirSync(UI).sort();
  const sfc = await import('vue/compiler-sfc');
  const vues = fichiersVue(SRC);
  const erreurs = vues.flatMap((rel) => compiler(sfc, rel));
  const rapport = { ok: false, vue: { fichiers: vues.length, erreurs } };
  if (args.avant) rapport.pertes = pertes(path.resolve(args.avant));
  try {
    rapport.build = await construire();
  } catch (e) {
    rapport.build = { ok: false, erreur: String(e.message).split('\n').slice(0, 5).join(' / ') };
  }
  // Rien ne doit être apparu ni avoir disparu à côté de l'interface.
  const racineApres = fs.readdirSync(UI).sort();
  rapport.dossierIntact = JSON.stringify(racineAvant) === JSON.stringify(racineApres);
  rapport.ok = !erreurs.length && rapport.build.ok && rapport.dossierIntact && !(rapport.pertes?.length);
  console.log(JSON.stringify(rapport));
  process.exitCode = rapport.ok ? 0 : 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, erreur: e.message }));
  process.exitCode = 1;
});
