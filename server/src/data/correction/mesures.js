/**
 * mesures.js — LES MESURES ET LA DÉCISION d'une case du tri (étape 26 du plan, 27/10/2026).
 * -----------------------------------------------------------------------
 * Pur : ni base, ni fichier, ni horloge, ni hasard. Les règles sont dans regles.js ; ici, leur application :
 *   - ce qu'UNE ligne (un pronostic gelé, sa distribution complète, l'issue arrivée) apporte aux deux mesures de
 *     sa famille : niveau (l'issue de référence) et confiance (l'issue la plus probable de la distribution) ;
 *   - la décision d'une case sur sa fenêtre (malchance, petit écart, à surveiller, vrai défaut…) ;
 *   - la règle « confiance d'abord » ;
 *   - le sens d'un écart, dit en mots.
 * Une ligne apporte a = la probabilité annoncée de l'issue mesurée, b = 1 si elle est arrivée, 0 sinon ; l'écart
 * d'une case = moyenne de (b − a) par ligne : négatif = le moteur annonce trop haut.
 * -----------------------------------------------------------------------
 */

import { familleDe, ISSUES_DE_LA_FAMILLE, STATUTS, SEUIL_D_AMPLEUR, MATCHS_MIN_PAR_MOIS, MOIS_MIN_DE_LA_FENETRE, estDeButs, lireLaCase } from './regles.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const probabilite = (x) => fini(x) && x >= 0 && x <= 1;
const signe = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * La distribution gelée d'un pronostic (texte JSON d'engine_picks.distribution, ou objet), lisible pour sa
 * famille : { issues, ligne, equipe, provenance } avec TOUTES les issues de la famille, chacune une probabilité
 * de [0 ; 1] — sinon null (jamais une distribution à moitié lue).
 */
export function lireDistribution(familleId, brute) {
  const cles = ISSUES_DE_LA_FAMILLE[familleId];
  if (!cles || brute === null || brute === undefined || brute === '') return null;
  let d;
  try {
    d = typeof brute === 'string' ? JSON.parse(brute) : brute;
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || !d.issues || typeof d.issues !== 'object') return null;
  const issues = {};
  for (const k of cles) {
    if (!probabilite(d.issues[k])) return null;
    issues[k] = d.issues[k];
  }
  return {
    issues,
    ligne: fini(d.ligne) ? d.ligne : null,
    equipe: d.equipe === 'home' || d.equipe === 'away' ? d.equipe : null,
    provenance: typeof d.provenance === 'string' && d.provenance ? d.provenance : null
  };
}

/** L'issue de RÉFÉRENCE (niveau) : { cle, p } — pour « Résultat + total buts », les trois issues « plus de » ensemble. */
export function issueCanonique(familleId, issues) {
  const f = familleDe(familleId);
  if (!f || !issues) return null;
  if (familleId === 'resultAndTotal') return { cle: 'plus', p: issues.homeOver + issues.drawOver + issues.awayOver };
  return { cle: f.canonique.cle, p: issues[f.canonique.cle] };
}

/** L'issue de référence est-elle arrivée ? */
export function canoniqueArrivee(familleId, issue) {
  if (familleId === 'resultAndTotal') return typeof issue === 'string' && issue.endsWith('Over');
  return issue === familleDe(familleId)?.canonique.cle;
}

/**
 * L'issue LA PLUS PROBABLE de la distribution (confiance) : { cle, p } ; à égalité, la première dans l'ordre fixe
 * de la famille (regles.js, ISSUES_DE_LA_FAMILLE). Jamais le choix gelé du moteur (sa ligne est choisie sous la
 * cote minimale de 1,20 : le juger lui ferait voir la « malédiction du vainqueur » au lieu d'un défaut).
 */
export function issueFavorite(familleId, issues) {
  const cles = ISSUES_DE_LA_FAMILLE[familleId];
  if (!cles || !issues) return null;
  let meilleure = null;
  for (const k of cles) if (meilleure === null || issues[k] > meilleure.p) meilleure = { cle: k, p: issues[k] };
  return meilleure;
}

/**
 * Ce qu'une ligne apporte aux deux mesures de sa famille : { niveau: { a, b }, confiance: { a, b, favori } }, ou
 * { raison } (une clé de RAISONS_DU_TRI) : marché inconnu, distribution illisible, issue arrivée absente de la
 * distribution. `distribution` : lue par lireDistribution ; `issue` : la clé arrivée (issueDeLaLigne).
 */
export function contributions(familleId, distribution, issue) {
  if (!familleDe(familleId)) return { raison: 'marcheInconnu' };
  if (!distribution?.issues) return { raison: 'sansDistribution' };
  if (typeof issue !== 'string' || !ISSUES_DE_LA_FAMILLE[familleId].includes(issue) || !Object.hasOwn(distribution.issues, issue)) return { raison: 'issueAbsente' };
  const c = issueCanonique(familleId, distribution.issues);
  const f = issueFavorite(familleId, distribution.issues);
  return {
    niveau: { a: c.p, b: canoniqueArrivee(familleId, issue) ? 1 : 0 },
    confiance: { a: f.p, b: issue === f.cle ? 1 : 0, favori: f.cle }
  };
}

/** L'écart d'un mois (ou d'une fenêtre) à partir de ses sommes : (Σb − Σa) / lignes, null sans ligne. */
export const ecartDesSommes = ({ lignes, sa, sb }) => (lignes > 0 ? (sb - sa) / lignes : null);

/**
 * LA DÉCISION d'une case, dans l'ordre des statuts (regles.js) :
 *   `courant`  le mois trié M pour cette case : { mois, lignes, matchs, ecart, partiel } ;
 *   `fenetre`  les mois comptés, du plus ancien à M (tri.js, fenetreDeLaCase) : chacun ≥ MATCHS_MIN_PAR_MOIS
 *              matchs, de la même lignée, consécutifs ; vide si M lui-même ne compte pas ;
 *   `juge`     le verdict du juge de l'étape 16 sur la fenêtre (2 mois au moins) : { verdict, gain, fourchette… } ;
 *   `enEssai`  la candidate qui occupe la place, si la famille est parmi ses marchés.
 * Rend { statut, sens } — `sens` : 'trop-haut' (le réalisé est sous l'annoncé), 'trop-bas', ou null.
 */
export function decisionDeLaCase({ courant, fenetre = [], juge = null, enEssai = null }) {
  const gain = fini(juge?.gain) ? juge.gain : fini(courant?.ecart) ? courant.ecart : null;
  const sens = gain === null || gain === 0 ? null : gain < 0 ? 'trop-haut' : 'trop-bas';
  const rendre = (statut) => ({ statut, sens });
  if (enEssai) return rendre('en-essai');
  if (!courant || !(courant.matchs >= MATCHS_MIN_PAR_MOIS)) return rendre(courant?.partiel ? 'mois-de-changement' : 'trop-peu');
  if (fenetre.length < MOIS_MIN_DE_LA_FENETRE) return rendre('trop-tot');
  if (!juge || juge.verdict === 'pas-assez-de-matchs' || !fini(juge.gain)) return rendre('trop-peu');
  if (juge.verdict !== 'retenu' && juge.verdict !== 'moins-bon') return rendre('dans-la-marge');
  if (Math.abs(juge.gain) < SEUIL_D_AMPLEUR) return rendre('petit-ecart');
  const [avantDernier, dernier] = fenetre.slice(-2);
  const s = signe(juge.gain);
  if (signe(avantDernier.ecart) !== s || signe(dernier.ecart) !== s) return rendre('a-surveiller');
  return rendre('vrai-defaut');
}

/** Les mots d'un statut (regles.js). */
export const statutDit = (statut) => STATUTS[statut]?.dit ?? statut;

/** Le sens d'un écart en mots, pour une case (« annonce trop souvent « plus de buts » », « trop sûr de lui »…). */
export function sensDit(cas, ecart) {
  const { famille: familleId, mesure } = lireLaCase(cas);
  const f = familleDe(familleId);
  if (!f || !fini(ecart) || ecart === 0) return null;
  if (mesure === 'niveau') return ecart < 0 ? `annonce trop souvent « ${f.canonique.dit} »` : `n’annonce pas assez souvent « ${f.canonique.dit} »`;
  return ecart < 0 ? 'trop sûr de lui : ses issues favorites arrivent moins souvent qu’annoncé' : 'pas assez sûr de lui : ses issues favorites arrivent plus souvent qu’annoncé';
}

/** Une case est-elle un vrai défaut « trop sûr » (la confiance annoncée trop haut) ? */
const tropSur = (c) => c.mesure === 'confiance' && c.statut === 'vrai-defaut' && c.sens === 'trop-haut';

/**
 * CONFIANCE D'ABORD (constat 6 de la critique) : quand la confiance d'une famille de buts est un vrai défaut « trop
 * sûr », le NIVEAU des familles de buts en vrai défaut ce mois-là est « à revoir après la correction de la
 * confiance » (aucun réglage de niveau proposé : un moteur trop sûr de lui déplace aussi le niveau) ; pour une
 * autre famille, sa propre confiance « trop sûr » met son niveau en attente de la même façon. Rend des cases
 * NEUVES (`aRevoir: 'apres-la-confiance'` posé), jamais les mêmes objets modifiés.
 */
export function confianceDAbord(cases) {
  const butsTropSurs = cases.some((c) => estDeButs(c.famille) && tropSur(c));
  return cases.map((c) => {
    if (c.mesure !== 'niveau' || c.statut !== 'vrai-defaut') return { ...c, aRevoir: c.aRevoir ?? null };
    const attendre = estDeButs(c.famille) ? butsTropSurs : cases.some((x) => x.famille === c.famille && tropSur(x));
    return { ...c, aRevoir: attendre ? 'apres-la-confiance' : null };
  });
}
