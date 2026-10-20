/**
 * Pronostics figés : calcul (dans une copie isolée) et comparaison — partagé
 * par test/pronostics-figes.test.mjs et scripts/test-figer.mjs. Ce n'est PAS
 * un fichier de test.
 */

import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, FIXTURES, ECHANTILLON, MANIFESTE_ECHANTILLON, MAINTENANT_FIGE, sha1Fichier } from './isolement.mjs';

export const FICHIER_FIGES = path.join(FIXTURES, 'pronostics-figes.json');
const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-pronostics.mjs');

/** Calcule les pronostics de toutes les cibles de la base d'essai avec le code actuel. */
export function calculerPronostics() {
  if (!fs.existsSync(ECHANTILLON) || !fs.existsSync(MANIFESTE_ECHANTILLON)) {
    throw new Error("Base d'essai absente : node scripts/test-echantillon.mjs");
  }
  const copie = preparerCopie();
  try {
    const debut = Date.now();
    // La copie de la base est lue AVANT le calcul : le code ouvre sa copie en
    // écriture (index recréés), jamais l'original.
    const r = executer(copie, SCRIPT, { args: [MANIFESTE_ECHANTILLON], maintenant: MAINTENANT_FIGE });
    if (r.code !== 0 || !r.json?.ok) {
      throw new Error(`Calcul des pronostics impossible (code ${r.code}) :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1000)}`);
    }
    return { ...r.json, dureeMs: Date.now() - debut, reseau: r.reseau, erreurs: r.erreurs };
  } finally {
    copie.nettoyer();
  }
}

/** Ce qui identifie un marché dans un match : son identifiant, et l'équipe pour les marchés par équipe. */
const cleMarche = (m) => `${m.id}${m.params?.team ? `:${m.params.team}` : ''}`;
const libelleMarche = (m) => `${m.id}${m.params?.team ? ` (${m.params.team === 'home' ? 'domicile' : 'extérieur'})` : ''}`;
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objet = (v) => v !== null && typeof v === 'object';

/** Les chemins qui diffèrent entre deux valeurs (« coteJuste.over25 », « resultat.p.0 »…). */
function chemins(a, b, prefixe, out) {
  if (egal(a, b)) return out;
  if (objet(a) && objet(b) && Array.isArray(a) === Array.isArray(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])]) chemins(a[k], b[k], `${prefixe}.${k}`, out);
    return out;
  }
  out.push({ quoi: prefixe, avant: a === undefined ? 'absent' : a, apres: b === undefined ? 'absent' : b });
  return out;
}

/**
 * Différences entre les pronostics figés et ceux d'aujourd'hui, une ligne
 * par match et par marché (ou par champ hors marchés).
 * @returns {{ match: string, cle: string, quoi: string, avant: any, apres: any }[]}
 */
export function comparer(figes, actuels) {
  const diffs = [];
  const parCle = new Map(actuels.map((r) => [r.cle, r]));
  const vus = new Set();
  for (const f of figes) {
    const a = parCle.get(f.cle);
    const match = `${f.home} - ${f.away} (${f.date}, ${f.league})`;
    if (!a) {
      diffs.push({ match, cle: f.cle, quoi: 'match', avant: 'pronostiqué', apres: 'absent' });
      continue;
    }
    vus.add(f.cle);
    for (const champ of ['cotes', 'resultat', 'buts', 'coteJuste', 'score', 'stats', 'pari']) {
      for (const d of chemins(f[champ], a[champ], champ, [])) diffs.push({ match, cle: f.cle, ...d });
    }
    const avant = new Map(f.marches.map((m) => [cleMarche(m), m]));
    const apres = new Map(a.marches.map((m) => [cleMarche(m), m]));
    for (const [k, m] of avant) {
      const n = apres.get(k);
      if (!n) diffs.push({ match, cle: f.cle, quoi: `marché ${libelleMarche(m)}`, avant: `${m.libelle} @ ${m.cote}`, apres: 'plus de pronostic' });
      else if (!egal(m, n)) diffs.push({ match, cle: f.cle, quoi: `marché ${libelleMarche(m)}`, avant: `${m.libelle} @ ${m.cote}`, apres: `${n.libelle} @ ${n.cote}` });
    }
    for (const [k, n] of apres) {
      if (!avant.has(k)) diffs.push({ match, cle: f.cle, quoi: `marché ${libelleMarche(n)}`, avant: 'pas de pronostic', apres: `${n.libelle} @ ${n.cote}` });
    }
    // Même liste, autre ordre : signalé aussi (l'ordre est celui de l'affichage).
    if (avant.size === apres.size && [...avant.keys()].every((k) => apres.has(k)) && !egal([...avant.keys()], [...apres.keys()])) {
      diffs.push({ match, cle: f.cle, quoi: 'ordre des marchés', avant: [...avant.keys()].join(', '), apres: [...apres.keys()].join(', ') });
    }
  }
  for (const a of actuels) {
    if (!vus.has(a.cle)) diffs.push({ match: `${a.home} - ${a.away} (${a.date}, ${a.league})`, cle: a.cle, quoi: 'match', avant: 'absent', apres: 'pronostiqué' });
  }
  return diffs;
}

const court = (v) => (typeof v === 'string' ? v : JSON.stringify(v));

/** Texte lisible des différences (les `max` premières). */
export function decrire(diffs, max = 40) {
  const lignes = diffs.slice(0, max).map((d) => `  - ${d.match} · ${d.quoi} : ${court(d.avant)} → ${court(d.apres)}`);
  const matchs = new Set(diffs.map((d) => d.cle)).size;
  if (diffs.length > max) lignes.push(`  … et ${diffs.length - max} autre(s)`);
  return `${diffs.length} différence(s) sur ${matchs} match(s) :\n${lignes.join('\n')}`;
}

/** Le fichier figé, ou null. */
export function lireFiges() {
  if (!fs.existsSync(FICHIER_FIGES)) return null;
  return JSON.parse(fs.readFileSync(FICHIER_FIGES, 'utf8'));
}

/** Contenu du fichier figé pour ces résultats (écrit seulement par test-figer.mjs --refiger). */
export function contenuFiges(calcul) {
  return {
    version: 1,
    note: "Pronostics du moteur sur la base d'essai, figés VOLONTAIREMENT. Ne se refigent qu'à la main : node scripts/test-figer.mjs --refiger. Un test qui casse ici veut dire que le moteur donne autre chose qu'avant : vérifier que c'est voulu AVANT de refiger.",
    figeLe: new Date().toISOString(),
    maintenant: calcul.maintenant,
    node: process.version,
    echantillon: { sha1: sha1Fichier(ECHANTILLON), cibles: calcul.resultats.length },
    pronostics: calcul.resultats
  };
}

/**
 * Texte du fichier figé : l'en-tête lisible, puis UN MATCH PAR LIGNE — une
 * différence se lit match par match (et un `git diff` aussi), et le fichier
 * reste deux fois plus petit qu'indenté. Toujours du JSON valide.
 */
export function serialiserFiges(contenu) {
  const { pronostics, ...entete } = contenu;
  const tete = JSON.stringify(entete, null, 1).replace(/\n}$/, '');
  return `${tete},\n "pronostics": [\n${pronostics.map((p) => `  ${JSON.stringify(p)}`).join(',\n')}\n ]\n}\n`;
}

/** Résumé chiffré d'une liste de pronostics (pour le compte rendu). */
export function resumer(pronostics) {
  const marches = pronostics.flatMap((p) => p.marches);
  const parId = {};
  for (const m of marches) parId[m.id] = (parId[m.id] ?? 0) + 1;
  return {
    matchs: pronostics.length,
    marches: marches.length,
    parMarche: parId,
    surCotes: pronostics.filter((p) => p.resultat.source === 'cotes').length,
    surStatistiques: pronostics.filter((p) => p.resultat.source === 'statistiques').length,
    avecStats: pronostics.filter((p) => p.stats).length,
    avecScore: pronostics.filter((p) => p.score).length
  };
}
