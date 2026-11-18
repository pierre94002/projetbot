/**
 * confidence.js — CE QUE LE MOTEUR SAIT DIRE D'UN PRONOSTIC AVANT DE PARIER (étape 38 du plan, lot 2a, 16/11/2026).
 * -----------------------------------------------------------------------
 * Trois choses, toutes des FAITS d'avant-match, aucune ne lit une probabilité :
 *   1. LE REFUS « À VÉRIFIER » (décision de Pierre du 15/11/2026, D5) : aucun conseil de pari sur un match marqué « à
 *      vérifier ». La donnée n'est JAMAIS lue ici : l'appelant (page d'un match, Repérage, Opportunités, analyse IA, gel de
 *      la nuit) joint au match ce que le contrôle quotidien en dit (`match.aVerifier`, la même chose que le badge de
 *      l'écran) ; sans elle, rien ne change. La règle elle-même est appliquée par verdictPari.js (stakingDuMatch).
 *   2. LES TRACES gelées avec chaque pronostic (colonnes d'engine_picks) : le PALIER de la cote juste (Pinnacle, palier 2,
 *      palier 3, repli, sans cote), la CLASSE DE SEUIL (le palier, ou « à vérifier »), le SEUIL APPLIQUÉ (celui du réglage,
 *      ou null : « aucune value » / « pas de conseil ») et ce que le moteur sait de la CONFIANCE.
 *   3. LA CONFIANCE : au lot 2a, le moteur ne connaît que deux des six ingrédients de la règle mesurée (data/combinaison/
 *      reglesDeConfiance.js) — l'ancre (A) et le contrôle « à vérifier » (E). Il n'écrit donc AUCUNE étiquette (`etiquette:
 *      null`, `jugee: false`) : le mot « sûr » n'apparaît nulle part avant qu'une famille soit jugée. Les degrés de A
 *      sont ceux de la règle scellée (recopiés ; l'essai T-L2-6 tient l'égalité). Celui de E vaut 2 dès que le match est
 *      « à vérifier », quelle qu'en soit la raison : le moteur ne distingue pas « FotMob en panne » (degré 1 de la règle
 *      scellée) d'un constat rouge (degré 2) — c'est un refus, pas une note.
 * Le seuil par classe (lot 2b, pas avant 2027) : aucune classe ne change le seuil aujourd'hui — celui du réglage partout.
 * Pur : ni horloge, ni hasard, ni base, ni fichier, ni réseau. N'importe rien.
 * -----------------------------------------------------------------------
 */

/** La règle de confiance dont les degrés sont recopiés (data/combinaison/reglagesCombinaison.js, REGLE_DE_CONFIANCE). */
export const REGLE_DE_CONFIANCE_DU_MOTEUR = 'confiance-v1';

/** Les paliers de la cote juste, du plus sûr au moins sûr. */
export const PALIERS = Object.freeze(['pinnacle', 'palier2', 'palier3', 'repli', 'sans-cote']);

/** Le degré de l'ancre (ingrédient A de la règle scellée) : 0 Pinnacle et palier 2, 1 palier 3, 2 repli et sans cote. */
export const DEGRE_DE_L_ANCRE = Object.freeze({ pinnacle: 0, palier2: 0, palier3: 1, repli: 2, 'sans-cote': 2 });

const PALIER_DU_NOM = Object.freeze({ Pinnacle: 'pinnacle', 'palier 2': 'palier2', 'palier 3': 'palier3' });

/**
 * « À vérifier » : ce que l'appelant a joint au match. Vrai pour `true`, ou pour l'objet du contrôle quotidien
 * ({ raisons: [...], texte }) quand il porte au moins une raison. Tout le reste (absent, null, false, objet vide) : faux.
 */
export function estAVerifier(aVerifier) {
  if (aVerifier === true) return true;
  if (!aVerifier || typeof aVerifier !== 'object') return false;
  if (Array.isArray(aVerifier.raisons)) return aVerifier.raisons.length > 0;
  return typeof aVerifier.texte === 'string' && aVerifier.texte.trim() !== '';
}

/** La raison à dire (une phrase du contrôle quotidien), ou null. */
export function raisonAVerifier(aVerifier) {
  if (!estAVerifier(aVerifier) || aVerifier === true) return null;
  const texte = typeof aVerifier.texte === 'string' ? aVerifier.texte.trim() : '';
  if (texte) return texte;
  const premiere = aVerifier.raisons?.[0]?.texte;
  return typeof premiere === 'string' && premiere.trim() ? premiere.trim() : null;
}

/**
 * Le palier de la cote juste. `basis` : le nom du palier des bookmakers de référence (valueFinder.js,
 * fairFromBookmakers : « Pinnacle », « palier 2 », « palier 3 »), ou null ; `surCotes` : le pronostic vient-il quand même
 * de cotes (la moyenne de repli) ?
 */
export function palierDe({ basis = null, surCotes = false } = {}) {
  const p = PALIER_DU_NOM[basis];
  if (p) return p;
  return surCotes ? 'repli' : 'sans-cote';
}

/** La classe de seuil : « a-verifier » (aucun conseil, D5) avant tout, sinon le palier. */
export function classeDeSeuilDuMoteur({ palier, aVerifier = null } = {}) {
  if (estAVerifier(aVerifier)) return 'a-verifier';
  return PALIERS.includes(palier) ? palier : 'sans-cote';
}

/**
 * Le seuil de value appliqué à cette classe : `seuil`, celui du réglage, DONNÉ par l'appelant (ce fichier ne lit aucun
 * réglage de pari), quand une cote juste existe (Pinnacle, palier 2, palier 3) ; null sinon — « aucune value » (repli, sans
 * cote) ou « pas de conseil » (à vérifier).
 */
export function seuilApplique(classe, seuil) {
  if (classe !== 'pinnacle' && classe !== 'palier2' && classe !== 'palier3') return null;
  return typeof seuil === 'number' && Number.isFinite(seuil) ? seuil : null;
}

/**
 * Ce que le moteur sait de la confiance d'un pronostic : les degrés de l'ancre (A) et du contrôle (E, 2 = « à vérifier »),
 * jamais une étiquette (les quatre autres ingrédients — compo, couverture, calibration de la tranche, accord — ne sont pas
 * lus par le moteur au lot 2a).
 */
export function confianceDuMoteur({ palier, aVerifier = null } = {}) {
  return {
    regle: REGLE_DE_CONFIANCE_DU_MOTEUR,
    jugee: false,
    etiquette: null,
    degres: { A: DEGRE_DE_L_ANCRE[palier] ?? 2, E: estAVerifier(aVerifier) ? 2 : 0 },
    nonLus: ['C', 'D', 'F', 'G']
  };
}

/**
 * LES TRACES D'UN PRONOSTIC, à geler avec lui : { palier, classeSeuil, seuilApplique, confiance }. `confiance` est un
 * texte JSON (une colonne). `seuil` : le seuil de value du réglage, donné par l'appelant. Il n'a de sens que pour le marché
 * où une value se lit (le 1 / N / 2) : `avecSeuil` faux pour les autres marchés (seuil null).
 */
export function tracesDuPronostic({ basis = null, surCotes = false, aVerifier = null, seuil = null, avecSeuil = true } = {}) {
  const palier = palierDe({ basis, surCotes });
  const classeSeuil = classeDeSeuilDuMoteur({ palier, aVerifier });
  return {
    palier,
    classeSeuil,
    seuilApplique: avecSeuil ? seuilApplique(classeSeuil, seuil) : null,
    confiance: JSON.stringify(confianceDuMoteur({ palier, aVerifier }))
  };
}
