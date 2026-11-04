/**
 * reglesDeConfiance.js — LA RÈGLE DE CONFIANCE DE L'ÉTAPE 38 (lot 1a, 03-04/11/2026 ; conception §2).
 * -----------------------------------------------------------------------
 * Une étiquette « sur / fragile » posée AVANT le match sur chaque ligne (match × marché × choix), faite de FAITS
 * d'avant-match : d'où vient la cote juste (A), la compo (C), la couverture des statistiques (D), le contrôle « à
 * vérifier » (E), la calibration de la tranche pour CETTE version du moteur (F), l'accord des estimations (G). B (la
 * fraîcheur des cotes) n'est JAMAIS un degré : une explication seulement (critique, constat 1).
 * RÈGLE « HORS DU CHIFFRE » (T-C2) : aucune fonction d'ici ne lit `probability` ni `distribution` ; F reçoit le VERDICT de
 * sa case (version × marché × dixième), jamais la probabilité. Le mot « sûr » n'est jamais écrit : l'étiquette interne
 * est « sur », et l'écran ne la montre pas avant un verdict de sa famille (T-E1, lot 1b).
 * Pur : ni horloge, ni hasard, ni base, ni fichier.
 * -----------------------------------------------------------------------
 */

import { REGLE_DE_CONFIANCE, MARCHES_DE_LA_FAMILLE } from './reglagesCombinaison.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** La famille d'un marché du moteur ('1n2', 'buts', 'corners', 'tirs', 'cadres', 'cartons', 'joueurs'), ou null. */
export function familleDe(marketId) {
  for (const [famille, marches] of Object.entries(MARCHES_DE_LA_FAMILLE)) if (marches.includes(marketId)) return famille;
  return null;
}

/** Le degré de A : l'ancre (régime de la cote juste). Une ancre inconnue vaut 2. */
export function degreDeA(ancre) {
  const d = REGLE_DE_CONFIANCE.degreDeLAncre[ancre];
  return d === undefined ? 2 : d;
}

/** Le degré de C : la compo ('publiee', 'derniere-alignee' → 0 ; 'pas-publiee', 'inconnue' → 1). 1N2 ancré sur un prix : 0 forcé. */
export function degreDeC(compo, { famille = null, ancreSurUnPrix = false } = {}) {
  if (famille === '1n2' && ancreSurUnPrix) return 0;
  return compo === 'publiee' || compo === 'derniere-alignee' ? 0 : 1;
}

/**
 * Le degré de D : la couverture des statistiques. nMin ≥ 8 (et, pour les corners, au moins 6 relevés) → 0 ; nMin 1-7, ou
 * les buts sans cote → 1 ; nMin 0 ou « moyennes seules » → 2. Une ligne du SERVICE (ancien modèle) : un pronostic
 * présent veut dire « relevés suffisants » → 0.
 */
export function degreDeD({ nMin = null, cornersReleves = null, regime = null, service = false, famille = null } = {}) {
  if (service) return 0;
  if (regime === 'moyennes-seules' || nMin === 0) return 2;
  const s = REGLE_DE_CONFIANCE.seuils;
  if (famille === 'corners' && fini(cornersReleves) && cornersReleves < s.cornersReleves) return 1;
  if (regime === 'buts-sans-cote') return 1;
  if (fini(nMin) && nMin < s.nMinPlein) return 1;
  return 0;
}

/** Le degré de E : le contrôle « à vérifier » en vigueur à recorded_at ('rien' 0, 'fotmob-en-panne' 1, 'constat-rouge' 2, 'inconnu' 0 et compté). */
export function degreDeE(etat) {
  if (etat === 'constat-rouge') return 2;
  if (etat === 'fotmob-en-panne') return 1;
  return 0;
}

/** Le degré de F : le verdict de la case (version × marché × dixième) — jamais la probabilité elle-même. */
export function degreDeF(verdictDeLaCase) {
  const d = REGLE_DE_CONFIANCE.degreDeLaCase[verdictDeLaCase];
  return d === undefined ? 0 : d;
}

/** Le degré de G : l'accord des estimations (1N2 : dispersion en part ; buts : |ln λM − ln λS| + |ln μM − ln μS|). */
export function degreDeG(accord, famille) {
  if (!fini(accord)) return 0;
  const s = REGLE_DE_CONFIANCE.seuils;
  if (famille === '1n2') return accord > s.accord1n2Points ? 1 : 0;
  if (famille === 'buts' || famille === 'joueurs') return accord > s.accordButsLog ? 1 : 0;
  return 0;
}

/**
 * LES DEGRÉS D'UNE LIGNE : { A, C, D, E, F, G } — null pour un ingrédient que la famille ne lit pas. `ingredients` : ce
 * que rend ingredientsDe (ingredientsDUneLigne.js).
 */
export function degresDUneLigne(ingredients, famille) {
  const lit = REGLE_DE_CONFIANCE.lectures[famille] ?? [];
  const i = ingredients ?? {};
  const famBase = famille === 'joueurs' ? 'buts' : famille;
  const d = {
    A: degreDeA(i.ancre),
    C: degreDeC(i.compo, { famille, ancreSurUnPrix: Boolean(i.ancreSurUnPrix) }),
    D: degreDeD({ nMin: i.nMin ?? null, cornersReleves: i.cornersReleves ?? null, regime: i.regimeButs ?? null, service: Boolean(i.service), famille }),
    E: degreDeE(i.aVerifier?.etat ?? 'inconnu'),
    F: degreDeF(i.caseF ?? null),
    G: degreDeG(i.accord ?? null, famBase)
  };
  const out = {};
  for (const k of REGLE_DE_CONFIANCE.ingredients) out[k] = lit.includes(k) ? d[k] : null;
  return out;
}

/** L'ÉTIQUETTE : « fragile » si un degré vaut 2 ou si la somme vaut 2 ou plus ; « sur » sinon (T-C1). */
export function etiquetteDe(degres) {
  const v = Object.values(degres ?? {}).filter((x) => fini(x));
  const max = v.length ? Math.max(...v) : 0;
  const somme = v.reduce((s, x) => s + x, 0);
  return max >= REGLE_DE_CONFIANCE.fragileSiUnDegre || somme >= REGLE_DE_CONFIANCE.fragileSiSomme ? 'fragile' : 'sur';
}

const NOMS_DES_ANCRES = {
  pinnacle: 'Pinnacle',
  palier2: 'le palier 2',
  palier3: 'le palier 3',
  repli: 'une moyenne de repli',
  'sans-cote': 'aucune cote',
  'buts-plusmoins': 'les cotes plus/moins',
  'buts-1n2': 'les seules cotes 1N2',
  'buts-stats-seules': 'les seules statistiques',
  'buts-service': 'l’ancien modèle des buts',
  'corners-releves': 'les relevés'
};

/** Une heure ISO en « le 02/11 à 23 h 12 » (heure de Paris) ; null sans heure. */
export function heureDite(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const f = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).formatToParts(new Date(t));
  const v = Object.fromEntries(f.map((x) => [x.type, x.value]));
  return `le ${v.day}/${v.month} à ${v.hour} h ${v.minute}`;
}

/** Une durée en minutes, dite simplement (« 45 min », « 26 h », « 3 jours »). */
export function dureeDite(minutes) {
  if (!fini(minutes)) return null;
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 72 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} jours`;
}

/**
 * « CE QUI MANQUE » : les ingrédients au degré ≥ 1, chacun avec sa phrase, sa provenance et son heure ; puis B (la
 * fraîcheur) en EXPLICATION seulement (degre null), jamais un degré. Liste vide = « Rien ne manque à ce pronostic ».
 */
export function manquesDe(degres, ingredients) {
  const i = ingredients ?? {};
  const out = [];
  if (degres.A >= 1) {
    const nom = NOMS_DES_ANCRES[i.ancre] ?? 'une source inconnue';
    const detail = fini(i.ancreDetail?.lignes) ? ` (moyenne de ${i.ancreDetail.lignes} lignes${i.ancreDetail.releveA ? `, relevé ${heureDite(i.ancreDetail.releveA)}` : ''})` : '';
    const phrase = i.ancre === 'sans-cote' ? 'aucune cote : le pourcentage vient des seules statistiques' : `la cote juste ne vient ni de Pinnacle ni du palier 2 : ${nom}${detail}`;
    out.push({ code: 'A', degre: degres.A, phrase, source: i.ancreDetail?.source ?? 'relevés des cotes', heure: i.ancreDetail?.releveA ?? null });
  }
  if (degres.C >= 1) out.push({ code: 'C', degre: degres.C, phrase: 'composition pas encore publiée', source: 'FotMob', heure: i.compoA ?? null });
  if (degres.D >= 1) out.push({ code: 'D', degre: degres.D, phrase: fini(i.nMin) ? `peu de matchs relevés pour une des deux équipes (${i.nMin})` : 'statistiques incomplètes', source: 'magasin FotMob', heure: null });
  if (degres.E >= 1) out.push({ code: 'E', degre: degres.E, phrase: i.aVerifier?.etat === 'fotmob-en-panne' ? 'FotMob était en panne au contrôle du jour' : 'un constat « à vérifier » touche ce match', source: 'contrôle du jour', heure: i.aVerifier?.du ?? null });
  if (degres.F >= 1) out.push({ code: 'F', degre: degres.F, phrase: i.caseF === 'trop-haut' ? 'dans cette tranche, ce moteur a annoncé trop haut' : 'dans cette tranche, ce moteur a annoncé trop bas', source: 'pronostics gelés de cette version', heure: null });
  if (degres.G >= 1) out.push({ code: 'G', degre: degres.G, phrase: 'les estimations ne sont pas d’accord entre elles', source: 'cotes et modèle de buts', heure: null });
  if (fini(i.fraicheur?.ageMinutes)) out.push({ code: 'B', degre: null, phrase: `cotes relevées il y a ${dureeDite(i.fraicheur.ageMinutes)}`, source: i.fraicheur.source ?? 'relevé des cotes', heure: i.fraicheur.releveA ?? null });
  return out;
}
