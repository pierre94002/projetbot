/**
 * toursDeCoupe.js — LES TOURS D'UNE COUPE, et la NATURE de chacun (étape 36 du plan, lot 1, 09/11/2026).
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge, aucun hasard ; un seul import, les constantes (reglagesCoupes.js).
 *
 *   - COUCHE 1 (`blocsCommeCupBracket`) : les blocs de `cupBracket` (data/db/matchStatsRead.js:964-1053) refaits À
 *     L'IDENTIQUE, sans base ni annuaire (jamais ensureRegistries) : les rencontres d'une compétition-saison lues par
 *     date, groupées par intitulé BRUT (« Tour inconnu » s'il manque), chaque intitulé coupé en blocs EN CHAÎNE (une
 *     rencontre ouvre un bloc si elle est à plus de 40 jours de la DERNIÈRE du bloc). T-T1 compare les deux.
 *   - COUCHE 2 (`blocsDeLaCoupe`) : le tour NORMALISÉ (`tourNormalise` : « Quarter-finals » et « 1/4 » sont le même
 *     tour ; un intitulé inconnu reste `brut:` et n'est jamais fusionné avec un autre) et la FAMILLE de la phase
 *     (groupes, qualification, autre) ; un bloc qui mêle deux familles est COUPÉ (la qualification « 3 » de mars et la
 *     3e journée de groupe d'avril de la Libertadores), deux blocs de même code et de même famille qui se chaînent à
 *     40 jours sont FUSIONNÉS (l'aller « 1/4 », le retour « Quarter-finals »).
 *   - LA NATURE d'un bloc (`naturesDesBlocs`, le passé, la saison entière ; critique de l'étape 36, constat 4 — l'ordre
 *     corrigé) : groupe → aller-retour → un-match-rejouages → troisieme-place → finale → un-match → ambigu. Un tour se
 *     reconnaît à sa FORME (taille, paires inversées, équipes qui continuent), jamais à son intitulé : « final » est le
 *     dernier tour de qualification en août et en mars.
 *   - LES PAIRES (`pairesDuBloc`) : deux rencontres du même bloc, identifiants inversés, aller avant retour à 40 jours au
 *     plus, les deux identifiants connus — JAMAIS un nom (piège Port / Portsmouth / Porto) ; chaque équipe dans une seule
 *     paire du bloc (la plus proche dans le temps ; les autres comptées).
 * Une rencontre : { matchKey, fotmobId, date, league, home, away (numéros FotMob ou null), tour (intitulé brut), phase
 * (meta.leagueKey), hg, ag, fin, ... } — la forme de lectureDesCoupes.js.
 * -----------------------------------------------------------------------
 */

import { TOURS, TOURS_NUMEROTES, FAMILLES, ECART_MAX_JOURS, NATURES } from './reglagesCoupes.js';

const JOUR_MS = 86_400_000;
/** Les jours entre deux dates AAAA-MM-JJ (b − a), la règle de cupBracket (Date.parse des dates). */
export const joursEntre = (a, b) => (Date.parse(b) - Date.parse(a)) / JOUR_MS;

/** Un texte sans casse ni accents, espaces réduits (la clé de la table des tours). */
export function cleDuTexte(t) {
  return String(t ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Un intitulé ramené à une forme stable (NFC, espaces réduits) — le `brut:` d'un intitulé inconnu. */
const stable = (t) => String(t ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');

/** L'intitulé de la couche 1 : celui de cupBracket (« Tour inconnu » quand FotMob n'en donne pas). */
export const intituleDeCupBracket = (round) => (round === null || round === undefined ? 'Tour inconnu' : String(round));

/**
 * LE TOUR NORMALISÉ d'un intitulé FotMob : un code de TOURS (« 1/4 », « final », « 3e-place »…), `tour-N`, `groupe-N`,
 * ou `brut:<intitulé>` (jamais fusionné avec un autre ; « brut:Tour inconnu » quand FotMob n'en donne pas).
 */
export function tourNormalise(intitule) {
  if (intitule === null || intitule === undefined || stable(intitule) === '') return 'brut:Tour inconnu';
  const cle = cleDuTexte(intitule);
  for (const t of TOURS) if (t.exacts.includes(cle)) return t.code;
  for (const n of TOURS_NUMEROTES) {
    const m = n.motif.exec(cle);
    if (m) return `${n.prefixe}-${Number(m[1])}`;
  }
  return `brut:${stable(intitule)}`;
}

/**
 * LE LIBELLÉ d'un tour, en français : la table TOURS, « 1er tour », « 3e tour », « Phase de groupes, journée 3 » ; le code
 * `final` se dit « Finale » si son bloc a au plus 2 rencontres, « Dernier tour de qualification » sinon (les « final »
 * d'août et de mars) ; un `brut:` reste tel quel (jamais deviné). `rencontres` : la taille du bloc (null : inconnue).
 */
export function libelleDuTour(code, { rencontres = null } = {}) {
  const c = String(code ?? '');
  if (c === 'final') return Number.isFinite(rencontres) && rencontres > 2 ? 'Dernier tour de qualification' : 'Finale';
  const t = TOURS.find((x) => x.code === c);
  if (t) return t.libelle;
  let m = /^tour-(\d+)$/.exec(c);
  if (m) return Number(m[1]) === 1 ? '1er tour' : `${Number(m[1])}e tour`;
  m = /^groupe-(\d+)$/.exec(c);
  if (m) return `Phase de groupes, journée ${Number(m[1])}`;
  if (c.startsWith('brut:')) return c.slice(5);
  return c || null;
}

/** La FAMILLE d'une phase (meta.leagueKey) : 'groupes', 'qualification' ou 'autre'. */
export function familleDeLaPhase(leagueKey) {
  const k = String(leagueKey ?? '');
  if (FAMILLES.groupes.test(k)) return 'groupes';
  if (FAMILLES.qualification.test(k)) return 'qualification';
  return 'autre';
}

/** Les rencontres triées par date, l'ordre d'arrivée gardé à date égale (le tri de cupBracket, ORDER BY date). */
const parDate = (rencontres) => rencontres.map((r, i) => [r, i]).sort((a, b) => (a[0].date < b[0].date ? -1 : a[0].date > b[0].date ? 1 : a[1] - b[1])).map(([r]) => r);

/** Des rencontres EN CHAÎNE : un bloc s'ouvre quand une rencontre est à plus de 40 jours de la DERNIÈRE du bloc. */
function enChaine(rencontres, fabriquer) {
  const blocs = [];
  let bloc = null;
  for (const r of rencontres) {
    const ecart = bloc ? joursEntre(bloc.last, r.date) : Infinity;
    if (!bloc || ecart > ECART_MAX_JOURS) blocs.push((bloc = fabriquer(r)));
    bloc.last = r.date;
    bloc.rencontres.push(r);
  }
  return blocs;
}

/**
 * COUCHE 1 — les blocs de cupBracket, à l'identique : { intitule, from, last, rencontres } ; rangés par date de début puis
 * par intitulé (cupBracket départage deux blocs du même jour par son barème ; T-T1 compare des ensembles).
 */
export function blocsCommeCupBracket(rencontres) {
  const parIntitule = new Map();
  for (const r of parDate(rencontres)) {
    const cle = intituleDeCupBracket(r.tour);
    if (!parIntitule.has(cle)) parIntitule.set(cle, []);
    parIntitule.get(cle).push(r);
  }
  const blocs = [];
  for (const [intitule, liste] of parIntitule) blocs.push(...enChaine(liste, (r) => ({ intitule, from: r.date, last: r.date, rencontres: [] })));
  return blocs.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.intitule < b.intitule ? -1 : a.intitule > b.intitule ? 1 : 0));
}

/**
 * COUCHE 2 — les blocs de la coupe-saison : la couche 1 COUPÉE par famille de phase, puis les blocs de même code et de
 * même famille FUSIONNÉS s'ils se chaînent à 40 jours (la règle de la couche 1 appliquée à leur union). Rend
 * [{ id, code, famille, intitule (le plus fréquent), intitules, from, last, rencontres }] rangés par date de début.
 */
export function blocsDeLaCoupe(rencontres) {
  const morceaux = [];
  for (const b of blocsCommeCupBracket(rencontres)) {
    const parFamille = new Map();
    for (const r of b.rencontres) {
      const f = familleDeLaPhase(r.phase);
      if (!parFamille.has(f)) parFamille.set(f, []);
      parFamille.get(f).push(r);
    }
    for (const [famille, liste] of parFamille) morceaux.push({ code: tourNormalise(b.intitule === 'Tour inconnu' ? null : b.intitule), famille, rencontres: liste });
  }
  const groupes = new Map();
  for (const m of morceaux) {
    const cle = JSON.stringify([m.code, m.famille]);
    if (!groupes.has(cle)) groupes.set(cle, { code: m.code, famille: m.famille, rencontres: [] });
    groupes.get(cle).rencontres.push(...m.rencontres);
  }
  const blocs = [];
  for (const g of groupes.values()) {
    for (const b of enChaine(parDate(g.rencontres), (r) => ({ code: g.code, famille: g.famille, from: r.date, last: r.date, rencontres: [] }))) {
      const compte = new Map();
      for (const r of b.rencontres) {
        const i = intituleDeCupBracket(r.tour);
        compte.set(i, (compte.get(i) ?? 0) + 1);
      }
      const intitules = [...compte.keys()].sort();
      const intitule = [...compte.entries()].sort((a, c) => c[1] - a[1] || (a[0] < c[0] ? -1 : 1))[0][0];
      blocs.push({ id: `${b.code}@${b.from}`, code: b.code, famille: b.famille, intitule, intitules, from: b.from, last: b.last, rencontres: b.rencontres });
    }
  }
  return blocs.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const connu = (x) => x !== null && x !== undefined && x !== '';

/**
 * LES PAIRES INVERSÉES d'un bloc : { paires: [{ aller, retour, ecartJours }], rejetees } — par identifiants seulement,
 * aller avant retour à 40 jours au plus, chaque équipe dans une seule paire (la plus proche dans le temps d'abord).
 */
export function pairesDuBloc(bloc) {
  const liste = parDate(bloc.rencontres);
  const candidats = [];
  for (let i = 0; i < liste.length; i++) {
    const a = liste[i];
    if (!connu(a.home) || !connu(a.away) || a.home === a.away) continue;
    for (let j = i + 1; j < liste.length; j++) {
      const r = liste[j];
      if (r.home !== a.away || r.away !== a.home) continue;
      const e = joursEntre(a.date, r.date);
      if (e > 0 && e <= ECART_MAX_JOURS) candidats.push({ aller: a, retour: r, ecartJours: e, i, j });
    }
  }
  candidats.sort((x, y) => x.ecartJours - y.ecartJours || x.i - y.i || x.j - y.j);
  const prises = new Set();
  const equipes = new Set();
  const paires = [];
  let rejetees = 0;
  for (const c of candidats) {
    if (prises.has(c.aller) || prises.has(c.retour) || equipes.has(c.aller.home) || equipes.has(c.aller.away)) {
      rejetees++;
      continue;
    }
    prises.add(c.aller);
    prises.add(c.retour);
    equipes.add(c.aller.home);
    equipes.add(c.aller.away);
    paires.push({ aller: c.aller, retour: c.retour, ecartJours: c.ecartJours });
  }
  return { paires: paires.sort((x, y) => (x.retour.date < y.retour.date ? -1 : x.retour.date > y.retour.date ? 1 : 0)), rejetees };
}

/** Les blocs PLUS TARDIFS qu’un bloc (ils commencent après lui) : là où se lit « la suite » et le tour suivant. */
export const blocsPlusTardifs = (blocs, b) => blocs.filter((x) => x.id !== b.id && x.from > b.from);

/** Un premier match NUL (le score final de l'aller, jamais prolongé) : le signe des rejouages. */
const nul = (r) => Number.isFinite(r?.hg) && Number.isFinite(r?.ag) && r.hg === r.ag;

/**
 * LA SUITE d'un bloc : pour chaque rencontre, ses deux équipes rejouent-elles dans un bloc PLUS TARDIF de la
 * compétition-saison (le bloc de la 3e place ne compte pas), sous 120 jours après la rencontre ? Rend { deux, une,
 * aucune, n, connue } (`connue` : au moins un bloc plus tardif existe). `apres` : les blocs plus tardifs.
 */
export function suiteDuBloc(bloc, apres) {
  const suivants = apres.filter((b) => b.code !== '3e-place');
  let deux = 0;
  let une = 0;
  let aucune = 0;
  for (const r of bloc.rencontres) {
    const rejoue = (club) => connu(club) && suivants.some((b) => b.rencontres.some((s) => (s.home === club || s.away === club) && s.date > r.date && joursEntre(r.date, s.date) <= NATURES.suiteJours));
    const h = rejoue(r.home);
    const a = rejoue(r.away);
    if (h && a) deux++;
    else if (h || a) une++;
    else aucune++;
  }
  const n = bloc.rencontres.length;
  return { deux: n ? deux / n : 0, une: n ? une / n : 0, aucune: n ? aucune / n : 0, n, connue: suivants.length > 0 };
}

/**
 * LES NATURES des blocs d'une compétition-saison (le passé ; la saison entière). `blocs` : blocsDeLaCoupe (rencontres
 * DÉDOUBLONNÉES) ; `saisonTerminee` : la fin de la saison (seasonBounds) est avant le dernier jour lu ; `dernierJourLu`.
 * Rend une Map id → { nature, part, paires, suite, raison } avec nature ∈ groupe | aller-retour | un-match-rejouages |
 * troisieme-place | finale | un-match | ambigu | ambigu-fin-des-donnees.
 */
export function naturesDesBlocs(blocs, { saisonTerminee = false, dernierJourLu = null } = {}) {
  const tries = [...blocs].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  // La finale : le DERNIER bloc d'une rencontre parmi les blocs ni « qualification » ni « 3e place » (constat 4 : le match
  // pour la 3e place joué le jour de la finale, les tours préliminaires de fin juin, jamais pris pour elle), dont les deux
  // équipes ont joué le bloc précédent ; seulement dans une saison terminée.
  const principaux = tries.filter((b) => b.famille !== 'qualification' && b.code !== '3e-place');
  let finale = null;
  if (saisonTerminee && principaux.length) {
    const dernier = principaux[principaux.length - 1];
    const precedent = principaux.filter((b) => b.from < dernier.from).at(-1) ?? null;
    const r = dernier.rencontres.length === 1 ? dernier.rencontres[0] : null;
    const ontJoue = (club) => connu(club) && precedent?.rencontres.some((s) => s.home === club || s.away === club);
    if (r && precedent && ontJoue(r.home) && ontJoue(r.away)) finale = dernier.id;
  }
  const out = new Map();
  for (const b of tries) {
    const n = b.rencontres.length;
    const { paires, rejetees } = pairesDuBloc(b);
    const part = n ? (2 * paires.length) / n : 0;
    const apres = blocsPlusTardifs(tries, b);
    const suite = suiteDuBloc(b, apres);
    const groupes = b.rencontres.filter((r) => familleDeLaPhase(r.phase) === 'groupes').length;
    const base = { part, paires, rejetees, suite };
    let nature;
    let raison = null;
    if (groupes * 2 > n) nature = 'groupe';
    else if (part >= NATURES.partAllerRetour) nature = 'aller-retour';
    else if (paires.length >= NATURES.rejouagesMin && paires.every((p) => nul(p.aller))) nature = 'un-match-rejouages';
    else if (b.code === '3e-place') nature = 'troisieme-place';
    else if (b.id === finale) nature = 'finale';
    else if (part > NATURES.partUnMatch) {
      nature = 'ambigu';
      raison = 'paires-partielles';
    } else if (!suite.connue) {
      // Rien après ce bloc : une saison finie → ambigu ; sinon, sa suite n'est pas encore jouée au dernier jour lu.
      nature = saisonTerminee ? 'ambigu' : 'ambigu-fin-des-donnees';
      raison = saisonTerminee ? 'sans-suite' : 'suite-pas-encore-jouee';
    } else if (suite.deux >= NATURES.groupeDeux) nature = 'groupe';
    else if (suite.une >= NATURES.unMatchUne) nature = 'un-match';
    else if (!saisonTerminee && dernierJourLu && joursEntre(b.last, dernierJourLu) < NATURES.suiteJours) {
      nature = 'ambigu-fin-des-donnees';
      raison = 'suite-incomplete';
    } else {
      nature = 'ambigu';
      raison = 'suite-ni-groupe-ni-un-match';
    }
    out.set(b.id, { nature, raison, ...base });
  }
  return out;
}

/**
 * LA NATURE VISIBLE AU JOUR J d'un match passé (critique, constat 6 : les observations du format se rangent sans lire
 * l'avenir) : `retour` si son bloc a son match inversé AVANT lui (une paire complète) ; `finale` pour l'intitulé « final »
 * d'un bloc d'au plus deux rencontres jusqu'à lui ; `match-unique` sinon. `bloc` : son bloc de la couche 2.
 */
export function natureVisible(r, bloc) {
  const avant = bloc.rencontres.filter((s) => s.date <= r.date);
  const aller = avant.some((s) => s !== r && connu(r.home) && connu(r.away) && s.home === r.away && s.away === r.home && s.date < r.date && joursEntre(s.date, r.date) <= ECART_MAX_JOURS);
  if (aller) return 'retour';
  if (bloc.code === 'final' && avant.length <= 2) return 'finale';
  return 'match-unique';
}
