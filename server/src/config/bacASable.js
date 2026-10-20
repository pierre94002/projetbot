/**
 * -----------------------------------------------------------------------
 * Bac à sable officiel (étape 2 du plan) — le garde-fou.
 * -----------------------------------------------------------------------
 * Le bac à sable vit dans C:\Users\<nom>\CoteMaster\bac-a-sable : une copie
 * du code (code\server, code\ui), une copie de la base
 * (base\match-stats.db), ses propres données d'exécution
 * (code\server\data\runtime). Mode d'emploi : docs/bac-a-sable.md.
 *
 * LE MODE BAC À SABLE est actif quand :
 *   - la variable CM_BAC_A_SABLE est posée (1, true, oui…), OU
 *   - ce code tourne depuis le dossier du bac — même lancé sans la variable :
 *     un `node scripts/….mjs` oublié dans la copie ne doit jamais écrire
 *     dans la vraie base.
 * Hors de ces deux cas, RIEN ne change : l'appli de Pierre n'est jamais gênée.
 *
 * EN MODE BAC À SABLE :
 *   - la base doit être DANS le bac et ne jamais être la vraie base.
 *     Comparaison sur les chemins résolus (« / » ou « \ », casse, « .. »),
 *     puis sur les chemins réels (une jonction qui ramènerait à
 *     C:\Users\<nom>\CoteMaster), puis sur l'identité du fichier (un lien
 *     physique vers la vraie base). Sinon le serveur refuse de démarrer
 *     (demarrageBac.js) et resolveDbPath / openDb refusent (matchStatsDb.js) ;
 *   - le code lui-même doit être dans le bac, sinon ses données d'exécution
 *     seraient celles de l'appli ;
 *   - clés des API payantes et jeton Claude vidés dans l'environnement du
 *     processus (donc de ce qu'il lance), exécutable Claude remplacé par un
 *     chemin qui n'existe pas, analyses IA automatiques coupées ; les appels
 *     Claude et Anthropic refusent en plus d'eux-mêmes (claudeCodeClient.js,
 *     anthropicClient.js) ;
 *   - actualisation automatique et cotes gratuites coupées, sauf
 *     CM_BAC_ACTUALISATION=1 / CM_BAC_COTES_GRATUITES=1 pour un essai (les
 *     cotes gratuites tournent avec l'actualisation : les deux pour elles).
 * -----------------------------------------------------------------------
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE_BAC = path.join(os.homedir(), 'CoteMaster', 'bac-a-sable');
export const VRAIE_BASE = path.join(os.homedir(), 'CoteMaster', 'match-stats.db');
const ICI = path.dirname(fileURLToPath(import.meta.url));

const WINDOWS = process.platform === 'win32';
const sansPrefixeLong = (p) => String(p).replace(/^\\\\\?\\/, '');
const cle = (p) => {
  const r = path.resolve(sansPrefixeLong(p));
  return WINDOWS ? r.toLowerCase() : r;
};
const memeChemin = (a, b) => cle(a) === cle(b);

/** `chemin` est-il STRICTEMENT dans `dossier` (le dossier lui-même ne compte pas) ? */
export function estDans(chemin, dossier) {
  const rel = path.relative(cle(dossier), cle(chemin));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** Chemin réel : jonctions et liens résolus sur la plus longue partie qui existe. */
export function cheminReel(p) {
  let existant = path.resolve(sansPrefixeLong(p));
  const reste = [];
  for (;;) {
    try {
      return path.join(sansPrefixeLong(fs.realpathSync.native(existant)), ...reste);
    } catch {
      const parent = path.dirname(existant);
      if (parent === existant) return path.resolve(sansPrefixeLong(p));
      reste.unshift(path.basename(existant));
      existant = parent;
    }
  }
}

/** Même fichier sur le disque (lien physique compris) ? */
function memeFichier(a, b) {
  try {
    const x = fs.statSync(a, { bigint: true });
    const y = fs.statSync(b, { bigint: true });
    return x.ino !== 0n && x.ino === y.ino && x.dev === y.dev;
  } catch {
    return false;
  }
}

/** CM_BAC_A_SABLE : tout sauf vide, 0, false, non, no, off active le mode (mieux vaut trop que pas assez). */
export const drapeauBac = (v) => v !== undefined && v !== null && !/^\s*(|0|false|non|no|off)\s*$/i.test(String(v));
/** Rallumage pour un essai : seulement un oui explicite. */
export const drapeauOui = (v) => /^\s*(1|true|oui|yes|on)\s*$/i.test(String(v ?? ''));

/**
 * Le dossier du bac qui contient CE code (…\bac-a-sable, ou
 * …\bac-a-sable\pistes\<nom> pour une piste parallèle), sinon null.
 * Disposition attendue : <bac>\code\server\src\config.
 */
export function dossierDuBac(ici = ICI, racine = RACINE_BAC) {
  const reel = cheminReel(ici);
  const racineReelle = cheminReel(racine);
  if (!estDans(reel, racineReelle)) return null;
  const code = path.resolve(reel, '..', '..', '..');
  return path.basename(code).toLowerCase() === 'code' ? path.dirname(code) : racineReelle;
}

const DOSSIER_BAC_DU_CODE = dossierDuBac();

/** Le mode bac à sable est-il actif pour ce processus ? */
export function modeBacASable(env = process.env) {
  return drapeauBac(env.CM_BAC_A_SABLE) || DOSSIER_BAC_DU_CODE !== null;
}

/** La copie de la base qui revient à ce code : <bac>\base\match-stats.db. */
export const baseParDefautDuBac = (dossier = DOSSIER_BAC_DU_CODE) => path.join(dossier ?? RACINE_BAC, 'base', 'match-stats.db');

/**
 * La base `cheminBase` est-elle acceptable pour le bac à sable ?
 * @returns {{ ok: true, chemin: string } | { ok: false, raison: string }}
 */
export function verifierBaseDuBac(cheminBase, { racineBac = RACINE_BAC, vraieBase = VRAIE_BASE } = {}) {
  if (cheminBase === undefined || cheminBase === null || !String(cheminBase).trim()) {
    return { ok: false, raison: `aucune base désignée ; le bac travaille sur sa copie, ${baseParDefautDuBac(racineBac)}` };
  }
  const chemin = path.resolve(sansPrefixeLong(String(cheminBase).trim()));
  const vraie = path.resolve(vraieBase);
  const reel = cheminReel(chemin);
  const annexes = [vraie, `${vraie}-wal`, `${vraie}-shm`, `${vraie}-journal`];
  if (annexes.some((f) => memeChemin(chemin, f) || memeChemin(reel, cheminReel(f)))) {
    return { ok: false, raison: `${chemin} est la VRAIE base de l'appli (${vraie}) ou l'un de ses fichiers` };
  }
  if (memeFichier(chemin, vraie)) {
    return { ok: false, raison: `${chemin} est un autre nom (lien physique) de la VRAIE base (${vraie})` };
  }
  if (!estDans(chemin, racineBac)) {
    return { ok: false, raison: `${chemin} n'est pas dans le bac à sable (${racineBac})` };
  }
  if (!estDans(reel, cheminReel(racineBac))) {
    return { ok: false, raison: `${chemin} sort du bac à sable par une jonction ou un lien (chemin réel : ${reel})` };
  }
  return { ok: true, chemin };
}

/** Pour resolveDbPath en mode bac à sable : la base du bac, contrôlée ; lève sinon. */
export function cheminBaseDuBac(env = process.env) {
  const v = verifierBaseDuBac(env.MATCH_STATS_DB || baseParDefautDuBac(), { racineBac: DOSSIER_BAC_DU_CODE ?? RACINE_BAC });
  if (!v.ok) throw new Error(`Bac à sable : base refusée — ${v.raison}. Mode d'emploi : docs/bac-a-sable.md.`);
  return v.chemin;
}

/** Pour openDb en mode bac à sable : un fichier passé explicitement passe le même contrôle. */
export function assertFichierDuBac(fichier) {
  const v = verifierBaseDuBac(fichier, { racineBac: DOSSIER_BAC_DU_CODE ?? RACINE_BAC });
  if (!v.ok) throw new Error(`Bac à sable : ouverture refusée — ${v.raison}.`);
}

// Clés des API payantes et jeton Claude, plus tout ce qui y ressemble (variables
// héritées d'une session Claude Code, par exemple). Exportés aussi pour les
// sauvegardes (étape 1) : un fichier qui contiendrait l'une de ces valeurs
// n'entre jamais dans une archive.
export const SECRETS = ['ODDS_API_KEY', 'API_FOOTBALL_KEY', 'FOOTBALL_DATA_API_KEY', 'SPORTMONKS_API_KEY', 'APIFY_API_TOKEN', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'];
export const MOTIF_SECRET = /^(ANTHROPIC_|CLAUDE_CODE_OAUTH)|(_API_KEY|_API_TOKEN|_OAUTH_TOKEN|_ACCESS_TOKEN|_AUTH_TOKEN|_SECRET)$/i;

/**
 * Nettoie l'environnement du processus pour le bac à sable. Idempotent ;
 * renvoie les NOMS des variables vidées (jamais leur valeur).
 */
export function preparerEnvironnementBac(env = process.env, dossier = DOSSIER_BAC_DU_CODE) {
  const videes = [];
  for (const nom of new Set([...SECRETS, ...Object.keys(env).filter((k) => MOTIF_SECRET.test(k))])) {
    if (env[nom]) videes.push(nom);
    // Vidée plutôt que supprimée : dotenv ne remplit jamais une variable déjà présente.
    env[nom] = '';
  }
  const actualisation = drapeauOui(env.CM_BAC_ACTUALISATION);
  const cotesGratuites = drapeauOui(env.CM_BAC_COTES_GRATUITES);
  env.CM_BAC_A_SABLE = '1';
  env.AUTO_AI_ANALYSIS = 'false';
  env.MATCH_STATS_AUTO_REFRESH = actualisation ? 'true' : 'false';
  env.FREE_ODDS = cotesGratuites ? 'true' : 'false';
  // Un exécutable qui n'existe pas : même sans jeton, le CLI Claude pourrait
  // trouver une connexion enregistrée sur la machine.
  env.CLAUDE_CODE_BIN = path.join(dossier ?? RACINE_BAC, 'ia-coupee', 'claude-introuvable-dans-le-bac.exe');
  return { videes, actualisation, cotesGratuites };
}

/**
 * Garde-fou du démarrage du serveur (appelé par demarrageBac.js, premier
 * import de server.js). Hors bac : ne fait rien. En bac : refuse de démarrer
 * (message clair, sortie immédiate) ou nettoie l'environnement.
 */
export function gardeDemarrage({ env = process.env, sortir = (code) => process.exit(code), journal = console, dossierCode = DOSSIER_BAC_DU_CODE, cwd = process.cwd() } = {}) {
  const parDrapeau = drapeauBac(env.CM_BAC_A_SABLE);
  if (!parDrapeau && dossierCode === null) return { actif: false };
  const refuser = (raison) => {
    journal.error(`[bac à sable] DÉMARRAGE REFUSÉ — ${raison}. Rien n'a été ouvert. Mode d'emploi : docs/bac-a-sable.md.`);
    sortir(1);
    return { actif: true, refuse: true, raison };
  };
  if (dossierCode === null) {
    return refuser(
      `CM_BAC_A_SABLE est posé, mais ce code tourne hors du bac (${ICI}) : ses données d'exécution (data/runtime) seraient ` +
        `celles de l'appli. Lancez le serveur depuis la copie du bac (${path.join(RACINE_BAC, 'code', 'server')})`
    );
  }
  const v = verifierBaseDuBac(env.MATCH_STATS_DB || baseParDefautDuBac(dossierCode), { racineBac: dossierCode });
  if (!v.ok) return refuser(`base refusée : ${v.raison}`);
  if (!fs.existsSync(v.chemin)) {
    return refuser(`la copie de la base n'existe pas (${v.chemin}) : préparez le bac depuis le dépôt avec node server/scripts/sandbox-prepare.mjs`);
  }
  env.MATCH_STATS_DB = v.chemin;
  const nettoyage = preparerEnvironnementBac(env, dossierCode);
  const coupes = ['analyses IA (automatiques et au clic)', `clés payantes et jeton Claude (${nettoyage.videes.length} variable(s) vidée(s))`];
  journal.log(`[bac à sable] MODE BAC À SABLE${parDrapeau ? '' : ' (code lancé depuis le bac)'} — base : ${v.chemin} ; la vraie base (${VRAIE_BASE}) est refusée.`);
  journal.log(
    `[bac à sable] Coupés : ${coupes.join(', ')}. Actualisation automatique : ${nettoyage.actualisation ? 'RALLUMÉE pour un essai (CM_BAC_ACTUALISATION=1)' : 'coupée'}. ` +
      `Cotes gratuites : ${nettoyage.cotesGratuites ? 'RALLUMÉES pour un essai (CM_BAC_COTES_GRATUITES=1)' : 'coupées'}.`
  );
  if (fs.existsSync(path.join(cwd, '.env'))) journal.log('[bac à sable] Un fichier .env est présent dans la copie : ses clés et son jeton sont vidés quand même.');
  return { actif: true, base: v.chemin, ...nettoyage };
}

/**
 * AUTORISATION COMPTÉE D'ANALYSES IA RÉELLES — PRÉVUE, PAS BRANCHÉE.
 * Correction 6 du plan : les étapes 41 à 44 (et le résumé mensuel de la 26)
 * se jugent sur de vraies analyses faites DANS le bac, environ 10 à 15 appels
 * (~250 000 tokens). Forme prévue : CM_BAC_IA_MAX=12 donne au plus 12 appels
 * Claude réels sur la vie du bac, comptés dans <bac>\compteur-ia.json (hors
 * de code\ : gardé quand on re-prépare le bac). Le jeton n'existe pas dans le
 * bac ; la façon de l'y amener et le budget (étape 4) se décident avec Pierre.
 * L'étape 41 (fiche compacte, 06/10/2026) a été construite SANS appel réel :
 * Pierre n'a pas encore décidé, et sa mesure réelle se lira dans le journal
 * des appels Claude (étape 4) après la mise en service. IA_COMPTEE_BRANCHEE
 * reste donc false : toute analyse demandée dans le bac est refusée.
 */
export const IA_COMPTEE_BRANCHEE = false;
export const fichierCompteurIa = (dossier = DOSSIER_BAC_DU_CODE) => path.join(dossier ?? RACINE_BAC, 'compteur-ia.json');

/** Appelé avant chaque appel Claude réel (claudeCodeClient.js). Hors bac : toujours accordé. */
export function autorisationIaBac({ env = process.env, branchee = IA_COMPTEE_BRANCHEE, fichier = fichierCompteurIa() } = {}) {
  if (!modeBacASable(env)) return { ok: true };
  if (!branchee) {
    return { ok: false, raison: "analyses IA coupées dans le bac à sable (l'autorisation comptée CM_BAC_IA_MAX n'est pas branchée : Pierre ne l'a pas encore décidée ; l'étape 41 se mesure par le journal après la mise en service)" };
  }
  return compterAnalyseIa({ max: Number(env.CM_BAC_IA_MAX), fichier });
}

/** Prend une analyse sur l'autorisation, ou refuse si elle est absente ou épuisée. */
export function compterAnalyseIa({ max, fichier, maintenant = new Date() }) {
  if (!Number.isInteger(max) || max <= 0) return { ok: false, raison: 'CM_BAC_IA_MAX absent ou nul : aucune analyse IA réelle autorisée dans le bac' };
  let etat = { utilisees: 0, appels: [] };
  try {
    etat = { ...etat, ...JSON.parse(fs.readFileSync(fichier, 'utf8')) };
  } catch (error) {
    if (error.code !== 'ENOENT') return { ok: false, raison: `compteur illisible (${fichier}) : refus par prudence` };
  }
  if (etat.utilisees >= max) return { ok: false, raison: `autorisation épuisée : ${etat.utilisees} analyse(s) sur ${max}` };
  etat.utilisees += 1;
  etat.appels = [...(etat.appels ?? []), maintenant.toISOString()];
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const brouillon = `${fichier}.${process.pid}.tmp`;
  fs.writeFileSync(brouillon, `${JSON.stringify(etat, null, 2)}\n`);
  fs.renameSync(brouillon, fichier);
  return { ok: true, utilisees: etat.utilisees, restantes: max - etat.utilisees };
}
