/**
 * PARTIE 0 DES LOTS 2 (sommaire des lots 2, § 2 point 3 et § 7 ; décidé le 13/11/2026) — un seul endroit pour ce que les essais
 * comparaient en dur. Fichier IDENTIQUE dans le dépôt, le bac et les pistes (hors de SCR46\deploiement\liste-1.txt).
 *
 * (A) EMPREINTE_EN_SERVICE : l'empreinte du code du moteur EN SERVICE, celle de la candidate du code (elle CONTIENT la première :
 *     engineVersions.js, empreinteDeLaCandidate, « code: empreinteDuCode(...) ») et les comptes de MODULES_DU_MOTEUR. Le lot qui
 *     en change une réécrit EMPREINTE_EN_SERVICE dans le même lot (valeurs, depuis, lot, raison) et range l'ancienne en tête de
 *     EMPREINTES_PASSEES. Aucun essai ne remet une valeur écrite en dur.
 * (B) DECLARATIONS : la preuve historique. Chaque fichier ÉPINGLÉ (manifeste de la 46, test/fixtures/direct-gel-46.json, ou
 *     EPINGLES_HORS_MANIFESTE) qu'un lot 2 modifie, retire ou recrée : une ligne par fichier et par lot, AJOUTÉE en fin de liste,
 *     jamais retouchée. sha1 des octets bruts, sauf server/src/bench/lancements.js : sans l'ajout de la 46 (aides/ajouts46.mjs,
 *     octetsSansLesAjoutsDe46), c'est-à-dire le sha1 du dépôt tant que la 46 n'y est pas en service. Un fichier déclaré n'est plus
 *     comparé à sa valeur épinglée (vraie au jour de son étape) : declarationsLots2.test.mjs (D1-D3) tient la chaîne et le sha1 du
 *     jour ; directFrontiere.test.mjs (T-X3) vérifie que la chaîne part du manifeste du 11/11.
 * (R0) Sans candidate en essai (CANDIDATE_EN_ESSAI = null), empreinteDeLaCandidate(null) lève : empreinteDeLaCandidateOuNull rend
 *     null sans l'appeler, et le lot R0 met EMPREINTE_EN_SERVICE.candidate à null (declarationsLots2.test.mjs, D4 et D5).
 * (V) Vérification du 14/11/2026 (verification-partie0-36.md, P0-1 à P0-6) :
 *     - relaisEtape27.test.mjs saute ses trois rejeux de l’essai 27 (les deux « T-EV1 réduit » et « partie B — pendant l’essai de
 *       la 27 ») dès que EMPREINTE_EN_SERVICE quitte EMPREINTE_AVANT_LOTS_2 (moteur ou candidate DÉCLARÉS ici, jamais relus par le code) ;
 *     - retireParUnLot2 : miseFrontiere.test.mjs (T-X2) ôte de ses racines un fichier dont la DERNIÈRE ligne dit « retire » ;
 *     - EPINGLES_HORS_MANIFESTE porte le sha1 de DÉPART de chaque fichier : D2 compare la première ligne déclarée à ce sha1
 *       partout, dépôt compris (le manifeste de la 46 peut y manquer) ;
 *     - D4 bis : une empreinte en service qui a quitté le départ range l’ancienne dans EMPREINTES_PASSEES (la dernière entrée est
 *       le départ). Un lot qui ne devait créer aucune version (26, 35 1c, 36) et voit D4 rougir : ARRÊT, rien à mettre à jour ;
 *     - server/src/data/roadmap/historique.js ne se déclare pas avant la mise en service de la 46 ((b bis) point 6 des consignes) :
 *       D3 compare ses octets bruts, et le bac porte l’entrée 46 que le dépôt n’a pas encore.
 *     Procédure, sans essai (le bac n’a pas de .git) : à chaque lot, au dépôt, « git diff -U0 » de ce fichier ne montre AUCUNE ligne
 *     retirée dans DECLARATIONS (seulement des ajouts en fin de liste) ; seul le bloc EMPREINTE_EN_SERVICE change, l’ancienne valeur
 *     rangée en tête de EMPREINTES_PASSEES.
 */
export const EMPREINTE_AVANT_LOTS_2 = Object.freeze({
  moteur: '16f2459db183a99576365047da98b7777687ef05',
  fichiersDuMoteur: 37,
  candidate: 'f01dd8496f56a415',
  modules: Object.freeze({ dossiers: 7, fichiers: 6 })
});

export const EMPREINTE_EN_SERVICE = Object.freeze({
  ...EMPREINTE_AVANT_LOTS_2,
  depuis: '2026-11-11',
  lot: 'partie 0 des lots 2',
  raison: 'départ : l’empreinte du manifeste de la 46 (11/11/2026, 21 h 05), inchangée depuis'
});

/** Les empreintes remplacées, la plus récente en tête (même forme que EMPREINTE_EN_SERVICE) ; la dernière est le départ, EMPREINTE_AVANT_LOTS_2 (D4 bis). */
export const EMPREINTES_PASSEES = Object.freeze([]);

/**
 * Les fichiers épinglés HORS du manifeste de la 46 (un essai compare leur sha1), chacun avec son sha1 de DÉPART : le même au dépôt,
 * au bac et dans les pistes (relevé le 14/11/2026, vérification P0-3). La première ligne déclarée d’un de ces fichiers part de ce
 * sha1 (D2, dans toutes les copies, dépôt compris).
 */
export const EPINGLES_HORS_MANIFESTE = Object.freeze({
  'server/src/core/ai/compactContext.js': 'd948305e88c86445e8b19fc6fb38c779a046708c', // ficheDuPronosticFrontiere.test.mjs, T-G3
  'server/src/core/ai/bulletinFiches.js': '924bb3f7481d219034d354a8cbd8980a933cdc52', // miseFrontiere.test.mjs, T-X14
  'server/src/data/opportunities.js': '35c7932e4390f9b13e46e494de628d8f4a13ebfe' // miseFrontiere.test.mjs, T-X14
});

/**
 * Une ligne : Object.freeze({ chemin: 'server/src/…', avant: '<sha1>' | 'absent', apres: '<sha1>' | 'retire', lot: '39 lot 2',
 *   date: 'AAAA-MM-JJ', raison: '…' }). Exemple (39) : Object.freeze({ chemin: 'server/src/core/risk/staking.js',
 *   avant: '6522d9ea3662ea39fb1eb45afe11bf3f2ce20080', apres: 'retire', lot: '39 lot 2', date: '2026-11-17',
 *   raison: 'remplacé par core/engine/stakeSizing.js (une seule règle de mise)' }),
 */
export const DECLARATIONS = Object.freeze([]);

/** Le chemin depuis le dossier du code (« server/… » ou « ui/… ») ; accepte « core/x.js » (depuis server/src) et « src/x.js » (depuis server/). */
export function cheminDuCode(f) {
  const c = String(f).split('\\').join('/');
  if (c.startsWith('server/') || c.startsWith('ui/')) return c;
  if (c.startsWith('src/') || c.startsWith('scripts/')) return `server/${c}`;
  return `server/src/${c}`;
}

/** Les lignes d'un fichier, dans l'ordre de la liste. */
export const declarationsDe = (f) => DECLARATIONS.filter((d) => d.chemin === cheminDuCode(f));

/** (B) Vrai si un lot 2 a déclaré ce fichier : sa valeur épinglée est historique, l'essai ne la compare plus au code du jour. */
export const declareParUnLot2 = (f) => declarationsDe(f).length > 0;

/** (B) Vrai si la DERNIÈRE ligne de ce fichier le déclare retiré (apres === 'retire') : D3 tient qu’il est absent ; T-X2 de miseFrontiere ne le prend plus pour racine. */
export const retireParUnLot2 = (f) => declarationsDe(f).at(-1)?.apres === 'retire';

/**
 * (R0) L'empreinte de la candidate du code, ou null s'il n'y a pas de candidate en essai — SANS appeler empreinteDeLaCandidate
 * sur null (elle lit candidate.id et lève : engineVersions.js, empreinteDeLaCandidate). La fonction est passée par l'essai :
 * cette aide n'importe rien.
 */
export function empreinteDeLaCandidateOuNull(empreinteDeLaCandidate, candidate) {
  if (candidate === null || candidate === undefined) return null;
  return empreinteDeLaCandidate(candidate);
}

const SHA1 = /^[0-9a-f]{40}$/;
/** Les fautes de forme et de chaîne de la liste (pure : ni fichier, ni horloge). */
export function fautesDesDeclarations(liste = DECLARATIONS) {
  const fautes = [];
  const derniere = new Map();
  const vues = new Set();
  liste.forEach((d, i) => {
    const ou = `ligne ${i + 1} (${d?.chemin ?? '?'})`;
    if (!d || typeof d.chemin !== 'string' || cheminDuCode(d.chemin) !== d.chemin) fautes.push(`${ou} : chemin depuis le dossier du code (server/… ou ui/…)`);
    if (!(SHA1.test(d?.avant ?? '') || d?.avant === 'absent')) fautes.push(`${ou} : avant = un sha1 ou 'absent'`);
    if (!(SHA1.test(d?.apres ?? '') || d?.apres === 'retire')) fautes.push(`${ou} : apres = un sha1 ou 'retire'`);
    if (d?.avant === d?.apres) fautes.push(`${ou} : avant = apres`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.date ?? '')) fautes.push(`${ou} : date AAAA-MM-JJ`);
    if (!String(d?.lot ?? '').trim() || !String(d?.raison ?? '').trim()) fautes.push(`${ou} : lot et raison obligatoires`);
    if (vues.has(`${d?.chemin}|${d?.lot}`)) fautes.push(`${ou} : deux lignes du même lot pour ce fichier`);
    vues.add(`${d?.chemin}|${d?.lot}`);
    const p = derniere.get(d?.chemin);
    if (p) {
      if (d.avant !== (p.apres === 'retire' ? 'absent' : p.apres)) fautes.push(`${ou} : son « avant » n’est pas l’« après » de ${p.lot}`);
      if (String(d.date) < String(p.date)) fautes.push(`${ou} : datée avant ${p.lot}`);
    } else if (d?.avant === 'absent') fautes.push(`${ou} : un fichier épinglé ne commence pas « absent »`);
    derniere.set(d?.chemin, d);
  });
  return fautes;
}
