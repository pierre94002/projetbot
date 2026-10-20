/**
 * courbeDesCotes.js — les cotes d'un match « de l'ouverture à maintenant » (étape 9 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Le graphique de la page d'un match ne calcule rien de nouveau : il dessine
 * les MOUVEMENTS que le serveur mesure déjà pour l'onglet Cotes et la page
 * Chutes de cotes (GET /api/odds/fixture → `movement`, cf. server/src/data/
 * marketMovement.js, `mouvements`) — pour chaque issue d'un marché, la cote
 * JUSTE (marge retirée par la méthode puissance, moyenne des bookmakers qui ont
 * bougé) à l'ouverture et au dernier relevé, avec l'heure de chacun et le
 * nombre de bookmakers qui vont dans le même sens. C'est la même mesure, aux
 * mêmes chiffres, que « Ce qui a bougé depuis l'ouverture » de l'onglet Cotes.
 *
 * Ces cotes sont des cotes de RÉFÉRENCE relevées gratuitement (ESPN,
 * football-data.co.uk, 365Scores, Kalshi, Smarkets) : elles disent où va le
 * marché, jamais ce que paient vos bookmakers. Rien ici n'est donc vert ni
 * « jouable ».
 *
 * Un graphique sans relevé le DIT : pas de relevé du tout, un seul relevé (un
 * mouvement se mesure entre deux), un serveur d'avant les mouvements.
 *
 * JavaScript pur, sans Vue ni navigateur : les tests du serveur le rejouent
 * (server/test/pageMatchDecision.test.mjs), sur des mouvements produits par la
 * vraie fonction du serveur.
 * -----------------------------------------------------------------------
 */

/** Les issues de chaque marché mesuré, dans l'ordre où on les lit (comme server/src/data/marketMovement.js). */
export const ISSUES_DU_MARCHE = Object.freeze({ '1x2': ['home', 'draw', 'away'], ou: ['over', 'under'], btts: ['yes', 'no'] });

/** L'ordre des marchés dans le sélecteur : le résultat d'abord, puis les plus/moins de buts, puis les deux équipes marquent. */
const RANG_DU_MARCHE = Object.freeze({ '1x2': 0, ou: 1, btts: 2 });

const nombre = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const virgule = (x) => String(x).replace('.', ',');

/** La cote juste d'une probabilité : 1 / p — la même lecture que l'onglet Cotes (« coteJuste »). */
export const coteJusteDe = (probabilite) => (nombre(probabilite) !== null && probabilite > 0 ? 1 / probabilite : null);

/** La clé d'un marché mesuré : « 1x2|0 », « ou|2.5 ». */
export const cleDuMarche = (m) => `${m.market}|${Number(m.line ?? 0)}`;

/** « Résultat », « Plus/moins de 2,5 buts » : le libellé que donne le serveur, sinon le nôtre. */
function libelleDuMarche(m) {
  return m.marketLabel ?? (m.market === '1x2' ? 'Résultat' : m.market === 'ou' ? `Plus/moins de ${virgule(m.line)} buts` : m.market === 'btts' ? 'Les deux équipes marquent' : m.market);
}

/**
 * Les mouvements de la réponse de /api/odds/fixture, rangés par marché.
 * @returns {Map<string, { cle, market, line, libelle, mouvements: object[] }>}
 */
function parMarche(mouvements) {
  const marches = new Map();
  for (const m of mouvements) {
    const cle = cleDuMarche(m);
    const g = marches.get(cle) ?? { cle, market: m.market, line: Number(m.line ?? 0), libelle: libelleDuMarche(m), mouvements: [] };
    g.mouvements.push(m);
    marches.set(cle, g);
  }
  return marches;
}

/** Les marchés qui ont une courbe, le résultat d'abord, puis les lignes par ordre croissant. */
function marchesTries(marches) {
  return [...marches.values()].sort((a, b) => (RANG_DU_MARCHE[a.market] ?? 9) - (RANG_DU_MARCHE[b.market] ?? 9) || a.line - b.line);
}

/** Une issue : ses deux cotes justes (ouverture, dernier relevé), son mouvement et le détail par bookmaker. */
function issueDuMouvement(m) {
  const de = coteJusteDe(m.fromProb);
  const vers = coteJusteDe(m.toProb);
  return {
    issue: m.issue,
    libelle: m.label,
    de,
    vers,
    deProb: nombre(m.fromProb),
    versProb: nombre(m.toProb),
    // Positif : la cote juste a BAISSÉ (l'issue est davantage jouée) — comme « dropPct » de l'onglet Cotes et des Chutes de cotes.
    dropPct: nombre(m.dropPct),
    // La variation de la cote : le contraire (négatif quand elle baisse), celle que dessine la flèche.
    pourcent: nombre(m.dropPct) === null ? null : -m.dropPct,
    accord: nombre(m.agreeing) ?? 0,
    nbLivres: nombre(m.bookmakersCount) ?? 0,
    bourses: Boolean(m.exchangeOnly),
    deAt: m.fromAt ?? null,
    versAt: m.toAt ?? null,
    livres: (m.bookmakers ?? []).map((b) => ({
      bookmaker: b.bookmaker,
      source: b.source,
      bourse: Boolean(b.exchange),
      deCote: nombre(b.fromOdds),
      versCote: nombre(b.toOdds),
      deAt: b.fromAt ?? null,
      versAt: b.toAt ?? null
    }))
  };
}

/**
 * Ce que le graphique doit montrer d'un match, à partir de la réponse de
 * GET /api/odds/fixture.
 *
 * `etat` :
 *   - 'indisponible'   : la réponse n'est pas arrivée (chargement, erreur) ;
 *   - 'sans-cotes'     : aucune cote relevée gratuitement pour ce match ;
 *   - 'serveur-ancien' : le serveur ne mesure pas encore les mouvements (à relancer) ;
 *   - 'un-seul-releve' : des cotes, mais un seul relevé par bookmaker : rien à tracer ;
 *   - 'ok'             : une courbe par issue du marché choisi.
 *
 * @param {object|null} donnees  la réponse de /api/odds/fixture
 * @param {{ marche?: string|null }} options  `marche` : une clé de marché (« 1x2|0 ») ; sinon le premier
 */
export function courbeDesCotes(donnees, { marche = null } = {}) {
  const base = { etat: 'indisponible', marches: [], marche: null, issues: [], debut: null, fin: null, sources: [], manques: [], raison: null };
  if (!donnees || typeof donnees !== 'object') return { ...base, raison: 'Les cotes de ce match ne sont pas arrivées.' };
  const sources = (donnees.sources ?? []).map((s) => ({ nom: s.name ?? s.source, source: s.source, dernier: s.lastReleveAt ?? null, bourse: Boolean(s.exchange) }));
  const manques = Array.isArray(donnees.missing) ? donnees.missing : [];
  const commun = { ...base, sources, manques };
  if (!donnees.count) {
    return { ...commun, etat: 'sans-cotes', raison: "Aucune cote n'a été relevée gratuitement pour ce match (ESPN, football-data.co.uk, 365Scores, Kalshi, Smarkets) : il n'y a pas de courbe à tracer." };
  }
  // `undefined` (et non une liste vide) : un serveur d'avant les mouvements.
  if (donnees.movement === undefined) {
    return { ...commun, etat: 'serveur-ancien', raison: 'Le serveur ne mesure pas encore les mouvements de cotes : relancez demarrer-cotemaster.bat pour activer cette fonction.' };
  }
  const marches = parMarche(donnees.movement ?? []);
  if (!marches.size) {
    return {
      ...commun,
      etat: 'un-seul-releve',
      raison: "Un seul relevé pour l'instant : un mouvement se mesure entre deux relevés, la courbe se tracera au suivant (toutes les 5 minutes dans les 2 heures avant le coup d'envoi, plus rarement avant)."
    };
  }
  const liste = marchesTries(marches);
  const choisi = liste.find((m) => m.cle === marche) ?? liste[0];
  const ordre = ISSUES_DU_MARCHE[choisi.market] ?? [];
  const rang = (m) => (ordre.indexOf(m.issue) === -1 ? 99 : ordre.indexOf(m.issue));
  const issues = [...choisi.mouvements].sort((a, b) => rang(a) - rang(b)).map(issueDuMouvement);
  const debuts = issues.map((i) => i.deAt).filter(Boolean).sort();
  const fins = issues.map((i) => i.versAt).filter(Boolean).sort();
  return {
    ...commun,
    etat: 'ok',
    marches: liste.map(({ cle, market, line, libelle }) => ({ cle, market, line, libelle })),
    marche: { cle: choisi.cle, market: choisi.market, line: choisi.line, libelle: choisi.libelle },
    issues,
    debut: debuts[0] ?? null,
    fin: fins.at(-1) ?? null
  };
}

// ----------------------------------------------------------- la géométrie

/** Un pas « rond » pour les repères de l'axe des cotes : au plus `maxTicks` repères dans l'intervalle. */
export function pasRond(etendue, maxTicks = 4) {
  const bruts = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50, 100];
  return bruts.find((p) => etendue / p <= maxTicks) ?? bruts.at(-1);
}

/**
 * Où tracer chaque issue : deux colonnes (l'ouverture à gauche, le dernier relevé
 * à droite), l'axe des cotes entre les deux — une cote plus haute est plus haut
 * dans le dessin. Une issue dont la cote a baissé descend de gauche à droite.
 * Les repères de l'axe sont des multiples d'un pas rond ; la hauteur couvre toutes
 * les cotes tracées avec une marge de 8 %.
 *
 * @param {object[]} issues  `issues` de courbeDesCotes
 * @returns {{ largeur, hauteur, gauche, droite, haut, bas, xDe, xVers, ticks: {y: number, valeur: number}[],
 *             series: { issue: string, libelle: string, yDe: number, yVers: number, de: number, vers: number }[] } | null}
 */
export function geometrieDeLaCourbe(issues, { largeur = 340, hauteur = 190, marges = { gauche: 44, droite: 16, haut: 14, bas: 14 } } = {}) {
  const valeurs = (issues ?? []).flatMap((i) => [i.de, i.vers]).filter((v) => nombre(v) !== null);
  if (!valeurs.length) return null;
  let bas = Math.min(...valeurs);
  let haut = Math.max(...valeurs);
  const etendue = haut - bas;
  const marge = etendue > 0 ? etendue * 0.08 : 0.25;
  bas -= marge;
  haut += marge;
  const pas = pasRond(haut - bas);
  const premier = Math.ceil(bas / pas - 1e-9) * pas;
  const yDe = (v) => marges.haut + ((haut - v) / (haut - bas)) * (hauteur - marges.haut - marges.bas);
  const ticks = [];
  for (let v = premier; v <= haut + 1e-9; v += pas) ticks.push({ valeur: Number(v.toFixed(4)), y: Number(yDe(v).toFixed(2)) });
  const xDe = marges.gauche + 18;
  const xVers = largeur - marges.droite - 18;
  return {
    largeur,
    hauteur,
    gauche: marges.gauche,
    droite: largeur - marges.droite,
    haut: marges.haut,
    bas: hauteur - marges.bas,
    xDe,
    xVers,
    ticks,
    series: issues
      .filter((i) => nombre(i.de) !== null && nombre(i.vers) !== null)
      .map((i) => ({ issue: i.issue, libelle: i.libelle, de: i.de, vers: i.vers, yDe: Number(yDe(i.de).toFixed(2)), yVers: Number(yDe(i.vers).toFixed(2)) }))
  };
}

/** La phrase d'accord de l'onglet Cotes : « 2 bookmakers sur 3 vont dans ce sens » (des bourses quand seules elles cotent ce marché). */
export function accordDit(issue) {
  const nom = issue.bourses ? 'bourse' : 'bookmaker';
  const n = issue.accord ?? 0;
  return `${n} ${nom}${n > 1 ? 's' : ''} sur ${issue.nbLivres} ${n > 1 ? 'vont' : 'va'} dans ce sens`;
}

/** La phrase qu'un lecteur d'écran lit pour le dessin : chaque issue, de sa cote d'ouverture à celle du dernier relevé. */
export function descriptionDeLaCourbe(courbe) {
  if (courbe?.etat !== 'ok') return courbe?.raison ?? '';
  const f = (x) => (nombre(x) === null ? 'inconnue' : x.toFixed(2));
  return `${courbe.marche.libelle}, cote juste de l'ouverture au dernier relevé : ${courbe.issues.map((i) => `${i.libelle} ${f(i.de)} puis ${f(i.vers)}`).join(' ; ')}.`;
}
