/**
 * reconductionDuDirect.js — LES RECONDUCTIONS DU JUGEMENT DU DIRECT (étape 46, § 2.7 de la vérification ; PROJET § 1 point 7 ;
 * contrat lu par le second sceau : conception du second sceau, § 6.1, § 6.2 et § 9.3). Écrit le 18/11/2026, corrigé le
 * 18/11/2026 au matin (décision O15 de l'orchestrateur, après la contre-vérification).
 * -----------------------------------------------------------------------
 * Le banc du direct juge UNE version du moteur, N (la note : noteDuDirect.js). Une version N′ venue après N garde ce jugement
 * (« reconduite ») seulement si :
 *   (a) même grille ;
 *   (b) une preuve d'identité SANS AUCUNE ISSUE de match, sur au moins 3 NUITS de dates différentes ET 300 RENCONTRES
 *       DISTINCTES (une rencontre vue deux nuits compte une fois) : mêmes λ, μ, ρ et fair (écart ≤ 1e-12), recalculés dans le
 *       bac sur une même copie restaurée de la base ;
 *   (c) aucun module scellé du calcul du direct n'a changé (ceux du sceau rangés sous src/data/direct/, src/data/simulation/,
 *       src/core/model/, src/core/engine/ et src/core/market/) ; sinon la preuve couvre aussi les LECTURES du direct aux états
 *       de l'étalonnage (0-0, 9-0, 4-4 à deux rouges de chaque côté, 12-1 ; créneaux 0, 45, 46, 91), à 1e-12 ;
 *   (d) l'inscription est faite PAR SCRIPT, ici : `node scripts/reconduction46.mjs --inscrire …`, et elle est citée dans
 *       l'historique.
 * O15 (18/11) : chaque version est dite par son IDENTITÉ COMPLÈTE, l'empreinte du code ET celle des réglages (`empreintes`),
 * lues par le code au moment de la preuve ; l'inscription porte la preuve ENTIÈRE (`preuve.contenu`, au texte exact écrit par
 * le script, à son sha1) : l'écran et l'inscription la recontrôlent (forme, nombres, « identique » recalculé) et refusent une
 * version dont le registre des versions EN SERVICE ne donne pas ces empreintes à ces numéros.
 * O16 (18/11, passe de corrections) : une rencontre est « cotée » si sa ligne porte une cote DES DEUX CÔTÉS (le texte « sans
 * cote » vient du code lui-même : sourceDesCotes(null).oddsSource, lu par le calcul) ; au moins 100 rencontres cotées, sur au
 * moins 2 nuits ; les matchs sans ligne (échecs, sans identifiant) sont les MÊMES des deux côtés et les échecs restent sous
 * 5 % des matchs de la fenêtre ; au moins 30 rencontres par nuit complète, 20 h entre deux nuits ; la voie simple pour les
 * modules : une version qui change un module scellé du direct n'est JAMAIS reconduite (nouveau banc, ou second sceau) ; la
 * preuve se fait sur une copie de la VRAIE base (au moins 1 Go, jamais la base d'essai) et garde le sha1 des données données.
 * Le code ne peut pas savoir qui a écrit une preuve qui se contrôle elle-même : il refuse une preuve RETOUCHÉE ; la garde
 * contre une preuve fabriquée de bout en bout est le rituel (inscription par script seulement, sha1 au journal, --verifier à
 * chaque mise en service).
 * Une version qui change une seule ligne n'est jamais reconduite. À l'écran, une ligne d'une version reconduite est lue comme
 * une ligne de N, et l'écran le dit (lectureDuDirect.js : `note.reconduite` ; ui/src/utils/direct.js : reconduiteDite).
 *
 * MODULE DE DONNÉES PUR : AUCUNE ligne d'import (le second sceau ne l'importe qu'à cette condition, conception § 9.3), aucune
 * horloge, aucun fichier lu, aucune base. Ce qui lit un fichier ou calcule un sha1 (la preuve, le registre, le sceau, les
 * modules) est fait par l'appelant, qui passe ses fonctions (`sha1`, `identiteDe`).
 * Tant que RECONDUCTIONS est vide, rien ne change : l'écran reste strict (« pas encore jugé pour cette version du moteur »).
 * Hors de l'empreinte du moteur (data/direct/).
 * -----------------------------------------------------------------------
 */

/** Gèle un objet et tout ce qu'il contient : une inscription ne se modifie pas en mémoire. */
const geler = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) geler(v);
  }
  return o;
};

/** Les seuils du PROJET (§ 1 point 7 (b)) : nuits de dates différentes, rencontres DISTINCTES comparées, écart le plus grand. */
export const SEUILS_DE_RECONDUCTION = Object.freeze({ nuits: 3, rencontres: 300, ecart: 1e-12, rencontresCotees: 100, nuitsCotees: 2, rencontresParNuit: 30, heuresEntreNuits: 20, partDesEchecs: 0.05, octetsDeLaBase: 1_000_000_000 });

/** Les bases d'essai (sha1) : une preuve faite sur l'une d'elles n'est jamais inscriptible (O16, I2) — test/fixtures/echantillon.db. */
export const BASES_D_ESSAI = Object.freeze(['85e82c04ee2215efd8c32fae3546d032337c40e8']);

/** Le sport dont les réglages font le numéro de version des lignes du direct (numeroDeVersion du moteur). */
export const SPORT_DES_REGLAGES = 'football';

/** Le format de la sortie de la preuve (3 : O16 — rencontres cotées des deux côtés, échecs nommés, données et script complets). */
export const FORMAT_DE_LA_PREUVE = 3;

/** Les dossiers du calcul du direct (PROJET (c) ; conception § 6.2 point 4), relatifs à server/. */
export const DOSSIERS_DU_DIRECT = Object.freeze(['src/data/direct/', 'src/data/simulation/', 'src/core/model/', 'src/core/engine/', 'src/core/market/']);

/** Décision A1 (a) du second sceau : une reconduction part TOUJOURS de la version jugée N, jamais d'une version reconduite. */
export const CHAINE_ADMISE = false;

/** La voie de la preuve (PROJET (b)) : seule « recalcul-bac » est écrite par le script. */
export const VOIES = Object.freeze(['cote-a-cote', 'recalcul-bac']);

/** Les clés d'une inscription, dans cet ordre (conception § 6.1, complétée par O15) ; seule `entreeEnService` est facultative. */
export const CLES_DE_L_INSCRIPTION = Object.freeze(['de', 'vers', 'grille', 'le', 'entreeEnService', 'nuits', 'rencontres', 'lignesComparees', 'ecartMax', 'voie', 'empreintes', 'modulesDuDirect', 'modulesDuDirectChanges', 'lectures', 'preuve', 'historique']);
export const CLES_DES_ECARTS = Object.freeze(['lambda', 'mu', 'rho', 'fair']);
export const CLES_DES_LECTURES = Object.freeze(['etats', 'creneaux', 'lignes', 'ecartMax']);
/** L'identité d'une version : l'empreinte de son code et celle de ses réglages (du sport ci-dessus), 40 caractères chacune. */
export const CLES_DE_L_IDENTITE = Object.freeze(['code', 'reglages']);

/**
 * LA LISTE FERMÉE des clés de la sortie de la preuve (conception § 6.2 point 5) : le script refuse toute autre clé. Aucune n'a
 * de place pour une issue de match (ni score, ni résultat) : la preuve compare des chiffres d'AVANT le match, rien d'autre.
 */
export const CLES_DE_LA_PREUVE = Object.freeze([
  'format', 'quoi', 'script', 'de', 'vers', 'versionsLues', 'grille', 'voie', 'faiteLe', 'nuits', 'jours', 'rencontres',
  'lignesComparees', 'nulles', 'ecartMax', 'modulesDuDirect', 'modulesDuDirectChanges', 'lectures', 'codes', 'reglages',
  'registre', 'base', 'donnees', 'cotes', 'bilans', 'echecs', 'seulementN', 'seulementNPrime', 'differences', 'identique'
]);
/** Les clés des rencontres cotées (O16, B1) : lignes et rencontres cotées DES DEUX CÔTÉS, dont payantes et gratuites, et les nuits qui en ont. */
export const CLES_DES_COTES = Object.freeze(['lignes', 'rencontres', 'payantes', 'gratuites', 'nuits']);
/** Les clés du bilan d'un côté (le calcul de la nuit, additionné sur les nuits). */
export const CLES_DU_BILAN = Object.freeze(['matchs', 'dansLaFenetre', 'analyses', 'echecs', 'sansIdentifiant']);
/** Les clés du script qui a fait la preuve : son sha1, celui du calcul, et celui de reconductionDuDirect.js à RECONDUCTIONS vide (O16, m8). */
export const CLES_DU_SCRIPT = Object.freeze(['preuve', 'calcul', 'reconduction']);

/** Les balises du SCELLEMENT de bancDuDirect.js (le sceau, relu comme TEXTE) et son bloc vide (etape46.mjs). */
export const BALISES_DU_BANC = Object.freeze(['// <SCELLEMENT rempli par script au scellement — ne pas modifier à la main>', '// </SCELLEMENT>']);
export const SCELLEMENT_VIDE = 'export const SCELLEMENT = null;';

const entierPositif = (x) => Number.isInteger(x) && x > 0;
const entierNaturel = (x) => Number.isInteger(x) && x >= 0;
const jourValide = (j) => typeof j === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j) && new Date(`${j}T12:00:00Z`).toISOString().slice(0, 10) === j;
const sha1Valide = (s) => typeof s === 'string' && /^[0-9a-f]{40}$/.test(s);
const ecartValide = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= SEUILS_DE_RECONDUCTION.ecart;
const objetSimple = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const memesCles = (o, cles) => objetSimple(o) && Object.keys(o).length === cles.length && cles.every((k) => k in o);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const instantIso = (t) => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(t) && Number.isFinite(Date.parse(t));
const memeTexte = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Le texte EXACT que le script écrit pour la preuve (et que l'écran recalcule pour son sha1). */
export const texteDeLaPreuve = (preuve) => `${JSON.stringify(preuve, null, 1)}\n`;

/** Un numéro de version STRICT : un entier positif, ou un texte de chiffres seuls (« 6 ») ; sinon null (« 0x6 », « 6.0 »…). */
export function numeroStrict(x) {
  if (entierPositif(x)) return x;
  if (typeof x === 'string' && /^[1-9][0-9]{0,8}$/.test(x)) return Number(x);
  return null;
}

/** Une identité de version bien formée ({ code, reglages }, deux sha1) ? */
export const identiteValide = (o) => memesCles(o, CLES_DE_L_IDENTITE) && sha1Valide(o.code) && sha1Valide(o.reglages);
const memeIdentite = (a, b) => identiteValide(a) && identiteValide(b) && a.code === b.code && a.reglages === b.reglages;

/** Le jour (AAAA-MM-JJ, heure de Paris) d'un instant ISO ; null s'il ne se lit pas. */
export function jourDeParis(instant) {
  const t = Date.parse(instant);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
}

/**
 * LES NUITS DE LA PREUVE (O15 point 1) : des instants ISO, chacun lisible, tous DIFFÉRENTS, de DATES (Paris) toutes
 * différentes, au moins 20 h entre deux nuits (O16, m5 : pas 24 h, l'heure de la passe glisse), tous AVANT `maintenant`
 * (millisecondes, l'heure du lancement) ; triés. Rend { ok, nuits, raisons }.
 */
export function nuitsDeLaPreuve(liste, { maintenant } = {}) {
  const raisons = [];
  const brutes = Array.isArray(liste) ? liste : [];
  if (!brutes.length) raisons.push('aucune nuit');
  const illisibles = brutes.filter((n) => !instantIso(n));
  if (illisibles.length) raisons.push(`instants illisibles (ISO, en Z) : ${illisibles.join(', ')}`);
  const nuits = brutes.filter(instantIso).map((n) => new Date(Date.parse(n)).toISOString()).sort();
  if (new Set(nuits).size !== nuits.length) raisons.push('un même instant donné deux fois');
  const jours = nuits.map(jourDeParis);
  if (new Set(jours).size !== jours.length) raisons.push(`deux nuits du même jour (${jours.join(', ')}) : des dates différentes sont exigées`);
  const proches = nuits.slice(1).filter((n, k) => Date.parse(n) - Date.parse(nuits[k]) < SEUILS_DE_RECONDUCTION.heuresEntreNuits * 3_600_000);
  if (proches.length) raisons.push(`deux nuits à moins de ${SEUILS_DE_RECONDUCTION.heuresEntreNuits} h l'une de l'autre (${proches.join(', ')})`);
  if (!fini(maintenant)) raisons.push("l'heure du lancement manque");
  else if (nuits.some((n) => Date.parse(n) >= maintenant)) raisons.push('une nuit dans le futur');
  return { ok: raisons.length === 0, nuits, raisons };
}

/** L'écart de deux nombres (ou null des deux côtés : 0, compté à part par l'appelant) ; un seul null, ou non fini : Infinity. */
export function ecart(a, b) {
  if (a === null && b === null) return 0;
  if (!fini(a) || !fini(b)) return Infinity;
  return Math.abs(a - b);
}

/** L'écart de deux `fair` (texte JSON, tableau ou { home, draw, away }) ; illisible ou d'une autre forme : Infinity. */
export function ecartDuFair(a, b) {
  const lire = (f) => {
    if (f === null || f === undefined) return null;
    const o = typeof f === 'string' ? JSON.parse(f) : f;
    return Array.isArray(o) ? o : [o.home, o.draw, o.away];
  };
  let x;
  let y;
  try {
    x = lire(a);
    y = lire(b);
  } catch {
    return Infinity;
  }
  if (x === null && y === null) return 0;
  if (x === null || y === null || x.length !== y.length) return Infinity;
  return Math.max(0, ...x.map((v, k) => ecart(v, y[k])));
}

/** L'identifiant d'une rencontre (O16, m7) : celui du match s'il est non vide et différent de 0 (l'identifiant 0 partagé de FotMob), sinon null. */
export function identifiantDuMatch(matchId) {
  if (matchId === null || matchId === undefined) return null;
  const s = String(matchId).trim();
  return s === '' || s === '0' ? null : s;
}

/**
 * LA COMPARAISON DES DEUX CÔTÉS, nuit par nuit (la preuve (b) et (c)) — pure : `nuits` = [{ instant, a, b }], `a` et `b` les
 * calculs de N et de N′ (reconduction46-calcul.mjs : { mode, lignes: [{ cle, matchId, grille, engineVersion, lambda, mu, rho,
 * fair, avecCotes, typeCotes }], lectures: { etats, creneaux, parLigne } }). Une RENCONTRE = l'identifiant du match (s'il est
 * non vide et ≠ 0, sinon la clé de la ligne), comptée UNE fois sur toutes les nuits ; on garde le plus petit des deux comptes
 * (par identifiant, par clé) ; les lignes sans λ ou μ fini (« nulles ») sont comptées à part et n'en font pas. Une rencontre
 * est COTÉE si sa ligne porte une cote DES DEUX CÔTÉS (`avecCotes`, rendu par le calcul face au texte « sans cote » de son
 * propre code) ; payante ou gratuite si les deux côtés le disent. Une nuit est complète si les deux côtés ont exactement les
 * mêmes lignes, aucun « reporté », et au moins 30 rencontres.
 */
export function comparerLesNuits(nuits, { avecLectures = false } = {}) {
  const S = SEUILS_DE_RECONDUCTION;
  const ecartMax = { lambda: 0, mu: 0, rho: 0, fair: 0 };
  const lect = { etats: null, creneaux: null, lignes: 0, ecartMax: 0, formes: new Set() };
  const differences = [];
  const noter = (d) => {
    if (differences.length < 20) differences.push(d);
  };
  const versions = { n: new Set(), nPrime: new Set() };
  const grilles = new Set();
  const compte = () => ({ id: new Set(), cle: new Set() });
  const ajouter = (c, l) => {
    c.id.add(identifiantDuMatch(l.matchId) ?? `cle:${l.cle}`);
    c.cle.add(l.cle);
  };
  const taille = (c) => Math.min(c.id.size, c.cle.size);
  const rencontres = compte();
  const cotees = compte();
  const payantes = compte();
  const gratuites = compte();
  let nuitsCotees = 0;
  let lignesComparees = 0;
  let lignesAvecCote = 0;
  let seulementN = 0;
  let seulementNPrime = 0;
  let nulles = 0;
  let nuitsCompletes = 0;
  for (const { instant, a, b } of Array.isArray(nuits) ? nuits : []) {
    const la = Array.isArray(a?.lignes) ? a.lignes : [];
    const lb = Array.isArray(b?.lignes) ? b.lignes : [];
    const parCle = new Map(lb.map((l) => [l.cle, l]));
    const vues = new Set();
    const deLaNuit = compte();
    const coteesDeLaNuit = compte();
    for (const l of la) {
      versions.n.add(l.engineVersion ?? null);
      grilles.add(l.grille ?? null);
      const m = parCle.get(l.cle);
      if (!m) {
        seulementN++;
        noter({ nuit: instant, cle: l.cle, champ: 'seulement-N', ecart: null });
        continue;
      }
      vues.add(l.cle);
      lignesComparees++;
      if (l.grille !== m.grille) noter({ nuit: instant, cle: l.cle, champ: 'grille', ecart: null });
      const e = { lambda: ecart(l.lambda, m.lambda), mu: ecart(l.mu, m.mu), rho: ecart(l.rho, m.rho), fair: ecartDuFair(l.fair, m.fair) };
      for (const k of CLES_DES_ECARTS) {
        ecartMax[k] = Math.max(ecartMax[k], e[k]);
        if (!(e[k] <= S.ecart)) noter({ nuit: instant, cle: l.cle, champ: k, ecart: fini(e[k]) ? e[k] : null });
      }
      if (!fini(l.lambda) || !fini(l.mu) || !fini(m.lambda) || !fini(m.mu)) nulles++;
      else {
        ajouter(rencontres, l);
        ajouter(deLaNuit, l);
        if (l.avecCotes === true && m.avecCotes === true) {
          lignesAvecCote++;
          ajouter(cotees, l);
          ajouter(coteesDeLaNuit, l);
          if (l.typeCotes === 'payant' && m.typeCotes === 'payant') ajouter(payantes, l);
          if (l.typeCotes === 'gratuit' && m.typeCotes === 'gratuit') ajouter(gratuites, l);
        }
      }
      if (avecLectures) {
        for (const c of [a?.lectures, b?.lectures]) lect.formes.add(`${c?.etats ?? null}x${c?.creneaux ?? null}`);
        lect.etats = a?.lectures?.etats ?? null;
        lect.creneaux = a?.lectures?.creneaux ?? null;
        const x = a?.lectures?.parLigne?.[l.cle];
        const y = b?.lectures?.parLigne?.[l.cle];
        let em = !Array.isArray(x) || !Array.isArray(y) || x.length !== y.length || x.length === 0 ? Infinity : 0;
        if (em === 0) for (let k = 0; k < x.length; k++) em = Math.max(em, ecart(x[k], y[k]));
        lect.lignes++;
        lect.ecartMax = Math.max(lect.ecartMax, em);
        if (!(em <= S.ecart)) noter({ nuit: instant, cle: l.cle, champ: 'lectures', ecart: fini(em) ? em : null });
      }
    }
    for (const l of lb) {
      versions.nPrime.add(l.engineVersion ?? null);
      grilles.add(l.grille ?? null);
      if (!vues.has(l.cle)) {
        seulementNPrime++;
        noter({ nuit: instant, cle: l.cle, champ: 'seulement-N′', ecart: null });
      }
    }
    const complete = la.length > 0 && la.length === lb.length && la.every((l) => parCle.has(l.cle)) && a?.mode !== 'reporte' && b?.mode !== 'reporte' && taille(deLaNuit) >= S.rencontresParNuit;
    if (complete) nuitsCompletes++;
    if (taille(coteesDeLaNuit) > 0) nuitsCotees++;
  }
  const finiOuNull = (x) => (fini(x) ? x : null);
  const formeUnique = lect.formes.size <= 1;
  return {
    nuits: nuitsCompletes,
    rencontres: taille(rencontres),
    lignesComparees,
    nulles,
    cotes: { lignes: lignesAvecCote, rencontres: taille(cotees), payantes: taille(payantes), gratuites: taille(gratuites), nuits: nuitsCotees },
    seulementN,
    seulementNPrime,
    ecartMax: Object.fromEntries(CLES_DES_ECARTS.map((k) => [k, finiOuNull(ecartMax[k])])),
    lectures: avecLectures ? { etats: formeUnique ? lect.etats : null, creneaux: formeUnique ? lect.creneaux : null, lignes: lect.lignes, ecartMax: finiOuNull(lect.ecartMax) } : null,
    differences,
    grille: grilles.size === 1 ? [...grilles][0] : null,
    versions: { n: [...versions.n], nPrime: [...versions.nPrime] }
  };
}

/**
 * « IDENTIQUE », recalculé depuis les seuls nombres de la preuve : au moins une rencontre, aucune ligne d'un seul côté, aucune
 * différence nommée, une seule grille, les quatre écarts ≤ 1e-12, et — si un module du direct a changé, ou si des lectures
 * sont données — leurs états complets et leur écart ≤ 1e-12.
 */
export function identiqueSelonLesNombres(p) {
  const S = SEUILS_DE_RECONDUCTION;
  if (!objetSimple(p)) return false;
  const lecturesOk = (l) => objetSimple(l) && entierPositif(l.etats) && entierPositif(l.creneaux) && entierPositif(l.lignes) && ecartValide(l.ecartMax);
  const lecturesExigees = Array.isArray(p.modulesDuDirectChanges) && p.modulesDuDirectChanges.length > 0;
  return (
    entierPositif(p.rencontres) &&
    p.seulementN === 0 &&
    p.seulementNPrime === 0 &&
    Array.isArray(p.differences) &&
    p.differences.length === 0 &&
    typeof p.grille === 'string' &&
    p.grille !== '' &&
    objetSimple(p.ecartMax) &&
    CLES_DES_ECARTS.every((k) => ecartValide(p.ecartMax[k])) &&
    (p.lectures === null ? !lecturesExigees : lecturesOk(p.lectures))
  );
}

/**
 * LE CONTRÔLE D'UNE PREUVE (O15 point 3) — sa forme exacte (liste fermée, format, types) et sa cohérence : « identique » se
 * recalcule depuis ses nombres ; les nuits sont des instants distincts, de dates différentes, avant `faiteLe` ; les versions
 * lues sont celles que le registre de la preuve donne aux identités calculées. Rend { ok, raisons } ; jamais d'erreur levée.
 */
export function controlerUnePreuve(p) {
  if (!objetSimple(p)) return { ok: false, raisons: ['preuve illisible'] };
  const raisons = [];
  const cles = Object.keys(p);
  const horsListe = cles.filter((k) => !CLES_DE_LA_PREUVE.includes(k));
  const manquantes = CLES_DE_LA_PREUVE.filter((k) => !cles.includes(k));
  if (horsListe.length || manquantes.length) return { ok: false, raisons: [`preuve : clés hors de la liste fermée (${horsListe.join(', ') || '-'}) ou manquantes (${manquantes.join(', ') || '-'})`] };
  if (p.format !== FORMAT_DE_LA_PREUVE) raisons.push(`preuve : format ${p.format} (attendu ${FORMAT_DE_LA_PREUVE})`);
  if (p.voie !== 'recalcul-bac') raisons.push('preuve : voie « recalcul-bac » (la seule que le script écrit)');
  if (!memesCles(p.script, CLES_DU_SCRIPT) || !CLES_DU_SCRIPT.every((k) => sha1Valide(p.script[k]))) raisons.push('preuve : script { preuve, calcul, reconduction } (trois sha1)');
  if (!instantIso(p.faiteLe)) raisons.push('preuve : faiteLe');
  const jours = Array.isArray(p.jours) && p.jours.every(instantIso) ? p.jours : null;
  if (!jours) raisons.push('preuve : jours (instants ISO)');
  else {
    const n = nuitsDeLaPreuve(jours, { maintenant: Date.parse(p.faiteLe) });
    if (!n.ok) raisons.push(`preuve : jours — ${n.raisons.join(' ; ')}`);
    else if (n.nuits.join() !== jours.join()) raisons.push('preuve : jours non triés');
  }
  for (const k of ['nuits', 'rencontres', 'lignesComparees', 'nulles', 'seulementN', 'seulementNPrime']) if (!entierNaturel(p[k])) raisons.push(`preuve : ${k} (un entier)`);
  if (jours && entierNaturel(p.nuits) && p.nuits > jours.length) raisons.push('preuve : plus de nuits complètes que de nuits données');
  if (entierNaturel(p.rencontres) && entierNaturel(p.lignesComparees) && entierNaturel(p.nulles) && p.rencontres + p.nulles > p.lignesComparees) raisons.push('preuve : plus de rencontres que de lignes comparées');
  if (!memesCles(p.ecartMax, CLES_DES_ECARTS) || !CLES_DES_ECARTS.every((k) => p.ecartMax[k] === null || (fini(p.ecartMax[k]) && p.ecartMax[k] >= 0))) raisons.push('preuve : ecartMax');
  if (!objetSimple(p.modulesDuDirect) || !Object.values(p.modulesDuDirect).every((s) => s === null || sha1Valide(s))) raisons.push('preuve : modulesDuDirect');
  if (!Array.isArray(p.modulesDuDirectChanges)) raisons.push('preuve : modulesDuDirectChanges');
  if (p.lectures !== null && !memesCles(p.lectures, CLES_DES_LECTURES)) raisons.push('preuve : lectures');
  const cote = (o, cles, test) => memesCles(o, cles) && cles.every((k) => test(o[k], k));
  const paire = (o, test) => memesCles(o, ['n', 'nPrime']) && test(o.n) && test(o.nPrime);
  const codesLisibles = paire(p.codes, (c) => cote(c, ['serveur', 'empreinte'], (v, k) => (k === 'serveur' ? typeof v === 'string' && v !== '' : sha1Valide(v))));
  if (!codesLisibles) raisons.push('preuve : codes { n, nPrime } { serveur, empreinte }');
  const reglagesLisibles = paire(p.reglages, (r) => cote(r, ['fichier', 'empreinte'], (v) => sha1Valide(v)));
  if (!reglagesLisibles) raisons.push('preuve : reglages { n, nPrime } { fichier, empreinte } (sha1 du fichier donné, empreinte lue par le code)');
  const registreLisible = memesCles(p.registre, ['sha1', 'de', 'vers']) && sha1Valide(p.registre.sha1) && ['de', 'vers'].every((k) => p.registre[k] === null || identiteValide(p.registre[k]));
  if (!registreLisible) raisons.push('preuve : registre { sha1, de, vers }');
  if (!memesCles(p.base, ['sha1', 'octets']) || !sha1Valide(p.base.sha1) || !entierPositif(p.base.octets)) raisons.push('preuve : base { sha1, octets > 0 }');
  // Les données données à la preuve (O16, I2) : le sha1 de chaque fichier (chemin relatif à server/data/) et leur empreinte.
  if (!memesCles(p.donnees, ['empreinte', 'fichiers']) || !sha1Valide(p.donnees.empreinte) || !objetSimple(p.donnees.fichiers) || Object.keys(p.donnees.fichiers).length === 0 || !Object.values(p.donnees.fichiers).every(sha1Valide)) raisons.push('preuve : donnees { empreinte, fichiers { chemin: sha1 } } (au moins un fichier)');
  // Les rencontres cotées DES DEUX CÔTÉS (O16, B1) : jamais plus que les rencontres ; payantes et gratuites en sont une part.
  const cotesLisibles = memesCles(p.cotes, CLES_DES_COTES) && CLES_DES_COTES.every((k) => entierNaturel(p.cotes[k]));
  if (!cotesLisibles || (entierNaturel(p.rencontres) && p.cotes.rencontres > p.rencontres) || p.cotes.payantes + p.cotes.gratuites > p.cotes.rencontres || p.cotes.rencontres > p.cotes.lignes || (jours && p.cotes.nuits > jours.length)) raisons.push(`preuve : cotes { ${CLES_DES_COTES.join(', ')} } (des entiers ; cotées ≤ rencontres et ≤ lignes cotées ; payantes + gratuites ≤ cotées)`);
  const bilan = (b) => cote(b, CLES_DU_BILAN, (v) => entierNaturel(v));
  if (!paire(p.bilans, bilan)) raisons.push(`preuve : bilans { n, nPrime } { ${CLES_DU_BILAN.join(', ')} } (des entiers)`);
  else if (entierNaturel(p.lignesComparees) && entierNaturel(p.seulementN) && entierNaturel(p.seulementNPrime)) {
    // Le recoupement des bilans (O16, I4) : chaque ligne d'un côté vient d'une analyse de ce côté, et les matchs sans identifiant
    // ont été analysés sans donner de ligne : analyses ≥ lignes + sans identifiant. Une preuve bâclée à la main ne le tient pas.
    if (p.bilans.n.analyses < p.lignesComparees + p.seulementN + p.bilans.n.sansIdentifiant) raisons.push('preuve : bilans de N — moins d’analyses que de lignes et de matchs sans identifiant');
    if (p.bilans.nPrime.analyses < p.lignesComparees + p.seulementNPrime + p.bilans.nPrime.sansIdentifiant) raisons.push('preuve : bilans de N′ — moins d’analyses que de lignes et de matchs sans identifiant');
  }
  // Les matchs de la fenêtre restés sans ligne (échecs, sans identifiant), nommés « instant|identifiant », triés, sans doublon.
  const listeTriee = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string' && s !== '') && [...x].sort().join('\n') === x.join('\n') && new Set(x).size === x.length;
  if (!memesCles(p.echecs, ['n', 'nPrime']) || !listeTriee(p.echecs.n) || !listeTriee(p.echecs.nPrime)) raisons.push('preuve : echecs { n, nPrime } (les matchs de la fenêtre sans ligne, triés, sans doublon)');
  if (!Array.isArray(p.differences)) raisons.push('preuve : differences');
  if (typeof p.identique !== 'boolean' || p.identique !== identiqueSelonLesNombres(p)) raisons.push('preuve : « identique » ne se recalcule pas depuis ses nombres');
  // Les versions lues : un numéro de chaque côté, et le registre de la preuve leur donne les identités calculées par le code
  // (jugées sur les seules parties lisibles : un autre défaut de la preuve est dit à part, sans entraîner celui-ci).
  const lisibles = codesLisibles && reglagesLisibles && registreLisible;
  const identiteN = lisibles ? { code: p.codes.n.empreinte, reglages: p.reglages.n.empreinte } : null;
  const identiteNP = lisibles ? { code: p.codes.nPrime.empreinte, reglages: p.reglages.nPrime.empreinte } : null;
  const lues = identiteN !== null && entierPositif(p.de) && entierPositif(p.vers) && memeIdentite(p.registre.de, identiteN) && memeIdentite(p.registre.vers, identiteNP);
  if (!(p.de === null || entierPositif(p.de)) || !(p.vers === null || entierPositif(p.vers))) raisons.push('preuve : de et vers (entiers, ou null)');
  if (p.versionsLues !== lues) raisons.push('preuve : « versionsLues » ne redit pas les numéros et les identités du registre');
  return { ok: raisons.length === 0, raisons };
}

/** Ce qui empêche une preuve BIEN FORMÉE d'être inscrite (identité, seuils) ; [] si rien. */
export function raisonsDeNePasInscrire(p) {
  const S = SEUILS_DE_RECONDUCTION;
  const raisons = [];
  if (p.identique !== true) raisons.push("la preuve ne conclut pas à l'identité : une version qui change une seule ligne n'est jamais reconduite");
  if (p.versionsLues !== true) raisons.push('la preuve ne dit pas les versions lues sur les lignes, avec leurs identités au registre : inscription impossible');
  else {
    if (!(p.vers > p.de)) raisons.push(`la version reconduite (${p.vers}) doit venir après la version jugée (${p.de})`);
    if (p.codes.n.empreinte === p.codes.nPrime.empreinte && p.reglages.n.empreinte === p.reglages.nPrime.empreinte) raisons.push('N et N′ ont la même identité (même code, mêmes réglages) : rien à reconduire');
  }
  if (!(p.nuits >= S.nuits)) raisons.push(`nuits : au moins ${S.nuits} nuits complètes, de dates différentes`);
  if (!(p.rencontres >= S.rencontres)) raisons.push(`rencontres : au moins ${S.rencontres} rencontres distinctes`);
  // O16 (b) : des rencontres COTÉES des deux côtés (la branche « avec cotes » du moteur a tourné), sur plusieurs nuits.
  if (!(p.cotes?.rencontres >= S.rencontresCotees)) raisons.push(`rencontres cotées : au moins ${S.rencontresCotees} rencontres cotées des deux côtés (ici ${p.cotes?.rencontres ?? 0})`);
  if (!(p.cotes?.nuits >= S.nuitsCotees)) raisons.push(`rencontres cotées : sur au moins ${S.nuitsCotees} nuits (ici ${p.cotes?.nuits ?? 0})`);
  // O16 (I1) : les matchs restés sans ligne sont les MÊMES des deux côtés, et les échecs restent sous 5 % de la fenêtre.
  if (JSON.stringify(p.echecs?.n ?? null) !== JSON.stringify(p.echecs?.nPrime ?? null)) raisons.push('échecs : les matchs restés sans ligne ne sont pas les mêmes des deux côtés');
  for (const [k, qui] of [['n', 'N'], ['nPrime', 'N′']]) {
    const b = p.bilans?.[k];
    if (!b || !(b.echecs <= Math.floor(S.partDesEchecs * b.dansLaFenetre))) raisons.push(`échecs de ${qui} : ${b?.echecs ?? '?'} sur ${b?.dansLaFenetre ?? '?'} matchs de la fenêtre (au plus ${Math.round(S.partDesEchecs * 100)} %)`);
  }
  // O16 (I5, la voie simple) : une version qui change un module scellé du direct n'est jamais reconduite.
  if (!Array.isArray(p.modulesDuDirectChanges) || p.modulesDuDirectChanges.length > 0) raisons.push(`un module scellé du direct a changé (${(p.modulesDuDirectChanges ?? []).join(', ')}) : jamais reconduite — un nouveau banc, ou le second sceau`);
  // O16 (I2) : la preuve est faite sur une copie de la VRAIE base, jamais sur une base d'essai.
  if (BASES_D_ESSAI.includes(p.base?.sha1)) raisons.push("base : c'est une base d'essai (echantillon.db), jamais une preuve");
  if (!(p.base?.octets >= S.octetsDeLaBase)) raisons.push(`base : ${p.base?.octets ?? 0} octets — une copie de la vraie base en fait au moins ${S.octetsDeLaBase}`);
  return raisons;
}

/** Le texte de reconductionDuDirect.js à RECONDUCTIONS VIDE (O16, m8 : son sha1 entre dans la preuve) ; null sans balises. */
export function texteAReconductionsVides(texte) {
  const t = String(texte ?? '');
  // Les balises écrites en deux morceaux : ce module ne doit les porter qu'UNE fois (le bloc ci-dessous).
  const ouvre = ['// <RECONDUCTIONS', 'inscrites par script (node scripts/reconduction46.mjs --inscrire) — ne pas modifier à la main>'].join(' ');
  const ferme = ['// </RECONDUCTIONS', '>'].join('');
  const i = t.indexOf(ouvre);
  const j = t.indexOf(ferme);
  if (i < 0 || j < i || t.indexOf(ouvre, i + 1) >= 0) return null;
  const fin = String.fromCharCode(10);
  return `${t.slice(0, i + ouvre.length)}${fin}export const RECONDUCTIONS = Object.freeze([${fin}]);${fin}${t.slice(j)}`;
}

/** Les modules du sceau (SCELLEMENT.modules) rangés sous les dossiers du direct : la liste (c), triée. */
export function modulesDuDirectDuSceau(modulesScelles) {
  return Object.keys(modulesScelles ?? {})
    .filter((f) => DOSSIERS_DU_DIRECT.some((d) => f.startsWith(d)))
    .sort();
}

/** Le SCELLEMENT d'un bancDuDirect.js relu comme TEXTE (jamais importé) : l'objet, null s'il est vide ; lève sinon. */
export function scellementDuTexte(texte) {
  const t = String(texte ?? '');
  const i = t.indexOf(BALISES_DU_BANC[0]);
  const j = t.indexOf(BALISES_DU_BANC[1]);
  if (i < 0 || j < i || t.indexOf(BALISES_DU_BANC[0], i + 1) >= 0) throw new Error('bancDuDirect.js : balises du SCELLEMENT absentes ou en double');
  const bloc = t.slice(i + BALISES_DU_BANC[0].length, j).trim();
  if (bloc === SCELLEMENT_VIDE) return null;
  const m = bloc.match(/^export const SCELLEMENT = geler\(([\s\S]*)\);$/);
  if (!m) throw new Error("bancDuDirect.js : SCELLEMENT d'une forme inconnue");
  return JSON.parse(m[1]);
}

/** Le texte de bancDuDirect.js « à scellement vide » (son sha1 est celui que le sceau note, etape46.mjs) ; null sans balises. */
export function texteAScellementVide(texte) {
  const t = String(texte ?? '');
  const i = t.indexOf(BALISES_DU_BANC[0]);
  const j = t.indexOf(BALISES_DU_BANC[1]);
  if (i < 0 || j < i) return null;
  return `${t.slice(0, i + BALISES_DU_BANC[0].length)}\n${SCELLEMENT_VIDE}\n${t.slice(j)}`;
}

/**
 * Les identités d'un registre des versions du moteur (data/runtime/engine-versions.json, déjà lu) : { numéro: { code,
 * reglages } } (réglages du sport du direct), gelé ; null si sa forme ne se lit pas.
 */
export function identitesDuRegistre(brut) {
  if (!objetSimple(brut) || !Array.isArray(brut.versions) || !brut.versions.length) return null;
  const sortie = {};
  for (const v of brut.versions) {
    if (!objetSimple(v) || !entierPositif(v.numero) || sortie[v.numero]) return null;
    const identite = { code: v.code?.empreinte, reglages: v.empreinteReglages?.[SPORT_DES_REGLAGES] };
    sortie[v.numero] = identiteValide(identite) ? identite : null;
  }
  return geler(sortie);
}

/** Les nombres de l'inscription redits par sa preuve (conception § 6.2 point 5 ; identités : O15). */
export function memesNombres(i, p) {
  const raisons = [];
  for (const k of ['de', 'vers', 'grille', 'voie', 'nuits', 'rencontres', 'lignesComparees', 'ecartMax', 'modulesDuDirect', 'modulesDuDirectChanges', 'lectures']) {
    if (!memeTexte(i[k], p[k])) raisons.push(`${k} : l'inscription ne redit pas la preuve`);
  }
  const attendues = objetSimple(p.codes) && objetSimple(p.reglages) ? { de: { code: p.codes.n?.empreinte, reglages: p.reglages.n?.empreinte }, vers: { code: p.codes.nPrime?.empreinte, reglages: p.reglages.nPrime?.empreinte } } : null;
  if (!memeTexte(i.empreintes, attendues)) raisons.push("empreintes : l'inscription ne redit pas les identités de la preuve");
  return raisons;
}

/**
 * LE CONTRÔLE D'UNE INSCRIPTION (conception § 6.2, points 1 à 6, et O15). Options : `scellement` (SCELLEMENT de
 * bancDuDirect.js : la grille et les modules du sceau), `versionJugee` (N), `aujourdhui` ('AAAA-MM-JJ', Paris), `toutes` (la
 * liste entière : une seule inscription par version), `identiteDe` (numéro → { code, reglages } | null : le registre des
 * versions EN SERVICE), `sha1` (texte → sha1 : la preuve recontrôlée à son sha1). Sans une option, le contrôle qu'elle permet
 * est sauté (l'écran, reconductionPour, les exige toutes). Rend { ok, raisons } ; jamais d'erreur levée.
 */
export function controlerUneInscription(i, { scellement = null, versionJugee = null, aujourdhui = null, toutes = null, identiteDe = null, sha1 = null } = {}) {
  if (!objetSimple(i)) return { ok: false, raisons: ['inscription illisible'] };
  const raisons = [];
  const S = SEUILS_DE_RECONDUCTION;
  const inconnues = Object.keys(i).filter((k) => !CLES_DE_L_INSCRIPTION.includes(k));
  if (inconnues.length) raisons.push(`clés inconnues : ${inconnues.join(', ')}`);
  for (const k of CLES_DE_L_INSCRIPTION) if (k !== 'entreeEnService' && !(k in i)) raisons.push(`clé absente : ${k}`);
  // (1) N et N′
  if (!entierPositif(i.de) || !entierPositif(i.vers)) raisons.push('de et vers : deux entiers positifs');
  else if (i.vers <= i.de) raisons.push(`la version reconduite (${i.vers}) doit venir après la version jugée (${i.de})`);
  if (versionJugee !== null && !CHAINE_ADMISE && i.de !== versionJugee) raisons.push(`de (${i.de}) n'est pas la version jugée (${versionJugee})`);
  // (2) la grille (a)
  if (typeof i.grille !== 'string' || !i.grille) raisons.push('grille absente');
  else if (scellement && i.grille !== scellement.declaration?.modele?.grille) raisons.push(`grille ${i.grille} : ce n'est pas celle du sceau (${scellement.declaration?.modele?.grille})`);
  // (6) les jours
  if (!jourValide(i.le)) raisons.push('le : un jour AAAA-MM-JJ');
  else if (aujourdhui !== null && i.le > aujourdhui) raisons.push(`le (${i.le}) est après aujourd'hui (${aujourdhui})`);
  if ('entreeEnService' in i) {
    if (!jourValide(i.entreeEnService)) raisons.push('entreeEnService : un jour AAAA-MM-JJ');
    else if (jourValide(i.le) && i.entreeEnService > i.le) raisons.push(`entreeEnService (${i.entreeEnService}) est après le jour de l'inscription (${i.le})`);
  }
  // (3) la preuve d'identité (b) : nuits de dates différentes, rencontres DISTINCTES (les lignes à part)
  if (!Number.isInteger(i.nuits) || i.nuits < S.nuits) raisons.push(`nuits : au moins ${S.nuits} nuits complètes`);
  if (!Number.isInteger(i.rencontres) || i.rencontres < S.rencontres) raisons.push(`rencontres : au moins ${S.rencontres} rencontres distinctes`);
  if (!Number.isInteger(i.lignesComparees) || !(i.lignesComparees >= i.rencontres)) raisons.push('lignesComparees : un entier, au moins le nombre de rencontres');
  if (!memesCles(i.ecartMax, CLES_DES_ECARTS)) raisons.push(`ecartMax : ${CLES_DES_ECARTS.join(', ')}`);
  else for (const k of CLES_DES_ECARTS) if (!ecartValide(i.ecartMax[k])) raisons.push(`ecartMax.${k} : au plus ${S.ecart}`);
  if (!VOIES.includes(i.voie)) raisons.push(`voie : ${VOIES.join(' ou ')}`);
  // O15 (2) : l'identité COMPLÈTE de chaque version, et celle que le registre en service donne à ces numéros
  const e = i.empreintes;
  if (!memesCles(e, ['de', 'vers']) || !identiteValide(e.de) || !identiteValide(e.vers)) raisons.push('empreintes : { de, vers } { code, reglages } (quatre sha1)');
  else {
    if (memeIdentite(e.de, e.vers)) raisons.push('empreintes : N et N′ ont la même identité');
    if (identiteDe !== null) {
      for (const k of ['de', 'vers']) {
        let lue = null;
        try {
          lue = typeof identiteDe === 'function' ? identiteDe(i[k]) : null;
        } catch {
          lue = null;
        }
        if (!memeIdentite(lue, e[k])) raisons.push(`registre en service : la version ${i[k]} n'a pas les empreintes inscrites (code ${e[k].code.slice(0, 7)}…, réglages ${e[k].reglages.slice(0, 7)}…)`);
      }
    }
  }
  // (4) les modules du direct (c)
  const modules = i.modulesDuDirect;
  const changes = i.modulesDuDirectChanges;
  const changesLisibles = Array.isArray(changes) && changes.every((f) => typeof f === 'string') && [...changes].sort().join('\n') === changes.join('\n') && new Set(changes).size === changes.length;
  if (!changesLisibles) raisons.push('modulesDuDirectChanges : une liste triée de chemins, sans doublon');
  if (!objetSimple(modules) || Object.keys(modules).length === 0 || !Object.values(modules).every(sha1Valide)) raisons.push('modulesDuDirect : { chemin: sha1 }, non vide');
  else {
    if (changesLisibles && changes.some((f) => !(f in modules))) raisons.push('modulesDuDirectChanges : un module hors de modulesDuDirect');
    if (scellement) {
      const attendus = modulesDuDirectDuSceau(scellement.modules);
      const donnes = Object.keys(modules).sort();
      if (donnes.join('\n') !== attendus.join('\n')) raisons.push(`modulesDuDirect : il faut exactement les ${attendus.length} modules du sceau rangés sous les dossiers du direct`);
      else {
        const vraisChanges = attendus.filter((f) => modules[f] !== scellement.modules[f]);
        if (!changesLisibles || changes.join('\n') !== vraisChanges.join('\n')) raisons.push(`modulesDuDirectChanges : exactement ${vraisChanges.join(', ') || 'aucun'} (sha1 relus face au sceau)`);
      }
    }
  }
  const l = i.lectures;
  if (l !== null && l !== undefined) {
    if (!memesCles(l, CLES_DES_LECTURES)) raisons.push(`lectures : ${CLES_DES_LECTURES.join(', ')}`);
    else {
      if (!entierPositif(l.etats) || !entierPositif(l.creneaux)) raisons.push("lectures : les états et les créneaux de l'étalonnage, comptés par le calcul");
      if (!Number.isInteger(l.lignes) || l.lignes < S.rencontres) raisons.push(`lectures.lignes : au moins ${S.rencontres}`);
      if (!ecartValide(l.ecartMax)) raisons.push(`lectures.ecartMax : au plus ${S.ecart}`);
    }
  } else if (changesLisibles && changes.length > 0) raisons.push("un module du direct a changé : les lectures aux états de l'étalonnage sont exigées");
  // (d) la preuve, ENTIÈRE, au texte exact du script et à son sha1, recontrôlée (O15 point 3) ; l'historique
  const pr = i.preuve;
  if (!memesCles(pr, ['fichier', 'sha1', 'contenu']) || typeof pr.fichier !== 'string' || !pr.fichier || !sha1Valide(pr.sha1) || !objetSimple(pr.contenu)) raisons.push('preuve : { fichier, sha1, contenu }');
  else {
    if (typeof sha1 === 'function') {
      let calcule = null;
      try {
        calcule = sha1(texteDeLaPreuve(pr.contenu));
      } catch {
        calcule = null;
      }
      if (calcule !== pr.sha1) raisons.push('preuve : son texte ne redonne pas son sha1 (preuve retouchée)');
    }
    const c = controlerUnePreuve(pr.contenu);
    if (!c.ok) raisons.push(...c.raisons);
    else {
      raisons.push(...raisonsDeNePasInscrire(pr.contenu));
      raisons.push(...memesNombres(i, pr.contenu));
    }
  }
  if (typeof i.historique !== 'string' || !i.historique.trim()) raisons.push("historique : la référence de l'entrée d'historique qui la cite");
  if (Array.isArray(toutes) && toutes.filter((x) => x?.vers === i.vers).length !== 1) raisons.push(`plusieurs inscriptions pour la version ${i.vers} : aucune ne vaut`);
  return { ok: raisons.length === 0, raisons };
}

// <RECONDUCTIONS inscrites par script (node scripts/reconduction46.mjs --inscrire) — ne pas modifier à la main>
export const RECONDUCTIONS = Object.freeze([
]);
// </RECONDUCTIONS>

/**
 * LA RECONDUCTION QUI VAUT pour une ligne d'avant-match (l'écran) : l'UNIQUE inscription de la version `vers` de la ligne,
 * partie de la version jugée `de` (celle de la note), de la même grille, et qui passe controlerUneInscription AVEC le sceau,
 * le registre des versions en service (`identiteDe`) et le sha1 de sa preuve (`sha1`) ; `aujourdhui` en plus s'il est donné.
 * Sans l'une de ces trois options, ou pour un numéro de version qui n'est pas un entier strict : null — l'écran reste strict.
 * `liste` : RECONDUCTIONS par défaut (un essai passe la sienne ; null ou [] : aucune).
 */
export function reconductionPour({ grille, de, vers } = {}, liste = RECONDUCTIONS, { scellement = null, identiteDe = null, sha1 = null, aujourdhui = null } = {}) {
  if (!Array.isArray(liste) || liste.length === 0) return null;
  if (!objetSimple(scellement) || typeof identiteDe !== 'function' || typeof sha1 !== 'function') return null;
  const n = numeroStrict(de);
  const np = numeroStrict(vers);
  if (n === null || np === null || n === np) return null;
  const deCetteVersion = liste.filter((x) => x?.vers === np);
  if (deCetteVersion.length !== 1) return null;
  const i = deCetteVersion[0];
  if (i.de !== n || i.grille !== grille) return null;
  return controlerUneInscription(i, { scellement, versionJugee: n, toutes: liste, identiteDe, sha1, aujourdhui }).ok ? i : null;
}

/** Ce que l'écran en dit (lectureDuDirect.js, `note.reconduite`) : une copie des seuls nombres, ou null. */
export function resumeDeLaReconduction(i) {
  if (!objetSimple(i)) return null;
  return geler({ de: i.de, vers: i.vers, le: i.le, nuits: i.nuits, rencontres: i.rencontres });
}
