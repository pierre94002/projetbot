/**
 * comparateur.js — LE COMPARATEUR DE VOS BOOKMAKERS, côté écran (étape 10 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Un tableau par marché : une ligne par issue, une colonne par bookmaker, et
 * dans chaque case la cote, l'heure de son relevé (ou de sa saisie) et son
 * verdict ; au bout de chaque ligne, la cote minimale à prendre pour qu'il
 * reste de la value. Ce fichier ASSEMBLE ce que le serveur a déjà calculé — il
 * ne calcule aucune value :
 *   - le 1 / N / 2 : `comparateur` de l'analyse (server/src/core/engine/
 *     verdictPari.js, comparateurDuMatch) — chaque case est le verdict du moteur
 *     pour ce bookmaker, dont seule la fraîcheur est réévaluée à l'horloge
 *     (etatVerdict, comme partout) ;
 *   - les autres marchés : les pronostics du moteur (`comparateur.marches`, avec
 *     leurs bornes) et les cotes saisies à la main (GET /api/odds/saisies, chacune
 *     avec sa value, sa fraîcheur et ses bornes) — The Odds API ne relève que le
 *     1 / N / 2 ;
 *   - à part, les cotes de RÉFÉRENCE (gratuites, GET /api/odds/fixture, et celles
 *     du relevé payant qui ne sont pas de vos bookmakers, comme Pinnacle) : jamais
 *     jouables, jamais de value.
 * Une cote, une heure ou une cote minimale qui n'existe pas est DITE.
 * JavaScript pur, sans Vue ni navigateur : les tests du serveur le rejouent.
 * -----------------------------------------------------------------------
 */

import { etatVerdict, etatValue, fraicheurVivante, ilYA } from './langageParis.js';
import { FAMILLES_DU_VERDICT, memeSelection } from './verdictParMarche.js';

const nombre = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const cote2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '—');

/**
 * La cote minimale (et maximale) en mots, d'après les bornes du serveur
 * (core/engine/coteMinimale.js). `court` : ce que dit la ligne ; `detail` : le survol.
 */
export function texteDesBornes(bornes) {
  const b = bornes ?? null;
  switch (b?.code) {
    case 'value-possible':
      return {
        court: `à prendre à ${cote2(b.coteMinimale)} minimum`,
        detail: `À ${cote2(b.coteMinimale)} ou plus, c'est une value au seuil du moteur. Au-delà de ${cote2(b.coteMaximale)}, elle serait trop belle pour être vraie (cote périmée ou erreur) ou au-dessus de la cote maximale de ${cote2(b.coteMax ?? null)} : le moteur ne la conseillerait pas.`,
        minimum: b.coteMinimale,
        maximum: b.coteMaximale
      };
    case 'au-dela-cote-max':
      return {
        court: 'aucune value possible',
        detail: `Il faudrait une cote d'au moins ${cote2(b.minimumTheorique)}, au-delà de la cote maximale de ${cote2(b.coteMax)} du moteur : aucune cote ne donne de value sur cette issue.`,
        minimum: null,
        maximum: null
      };
    case 'pas-de-reference':
      return { court: 'pas de cote minimale', detail: "Pas de cote juste sûre pour ce match (pas assez de bookmakers de référence) : pas de cote minimale.", minimum: null, maximum: null };
    case 'pas-de-cote':
      return { court: 'pas de cote minimale', detail: 'Pas de cote de marché pour ce match : la probabilité vient des statistiques, aucune value ne se lit face à elle.', minimum: null, maximum: null };
    case 'seuils-inconnus':
    case 'seuils-incoherents':
      return { court: 'seuils du moteur inconnus', detail: 'Les seuils du moteur (Réglages) ne sont pas lisibles : pas de cote minimale.', minimum: null, maximum: null };
    default:
      return { court: 'pas de cote minimale', detail: "Le moteur n'a pas de probabilité pour cette issue : pas de cote minimale, pas de value.", minimum: null, maximum: null };
  }
}

/** La valeur d'avant-match d'une cote de référence relevée (jamais un point du direct) : clôture, dernier relevé, pré-clôture, ouverture. */
const avantMatch = (sel) => sel?.close ?? sel?.snapshots?.at(-1) ?? sel?.preclose ?? sel?.open ?? null;

// ---------------------------------------------------------------- les cases

/** Une case du 1 / N / 2 : le verdict du moteur pour CE bookmaker, sa fraîcheur réévaluée à l'horloge. */
function caseDuVerdict(cellule, maintenant) {
  if (!cellule || nombre(cellule.cote) === null) return null;
  const etat = etatVerdict(cellule, maintenant);
  return {
    cote: cellule.cote,
    bookmaker: cellule.bookmaker,
    bookmakerTitle: cellule.bookmakerTitle,
    releveAt: cellule.releveAt ?? null,
    releve: cellule.releveAt ? `relevée ${ilYA(cellule.releveAt, maintenant)}` : 'heure du relevé inconnue',
    source: 'the-odds-api',
    verdict: cellule,
    saisie: null,
    etat: etat.etat,
    vert: etat.vert,
    conseillee: Boolean(cellule.conseillee)
  };
}

/** Une case d'un autre marché : la cote saisie à la main, sa value et sa fraîcheur (la règle de la pastille, etatValue). */
function caseDeLaSaisie(s, regle, maintenant) {
  const fraicheur = s.fraicheur ? fraicheurVivante(s.fraicheur, maintenant) : null;
  const etat = etatValue({ pourcent: nombre(s.pourcent), jouable: Boolean(s.jouable), cote: nombre(s.cote), regle, fraicheur });
  return {
    cote: s.cote,
    bookmaker: s.bookmaker,
    bookmakerTitle: s.bookmakerTitre ?? s.bookmaker,
    releveAt: s.releveAt ?? null,
    releve: s.releveAt ? `saisie ${ilYA(s.releveAt, maintenant)}` : 'heure de la saisie inconnue',
    source: 'saisie',
    verdict: null,
    saisie: s,
    etat: etat.etat,
    vert: etat.vert,
    conseillee: false
  };
}

/**
 * La colonne de la meilleure cote d'une ligne, parmi vos bookmakers qui ne sont pas juges ni incohérents — seulement
 * quand il y a de quoi comparer (deux cotes au moins) : un bookmaker seul n'est pas « la meilleure cote ».
 */
function meilleureColonne(cases) {
  let meilleure = null;
  let comparees = 0;
  for (const [cle, k] of Object.entries(cases)) {
    if (!k || ['juge', 'incoherente', 'non-jouable'].includes(k.etat)) continue;
    comparees++;
    if (!meilleure || k.cote > cases[meilleure].cote) meilleure = cle;
  }
  return comparees >= 2 ? meilleure : null;
}

// ---------------------------------------------------------------- les tables

function tableDuResultat(c, maintenant) {
  const colonnes = c.livres.map((l) => ({
    cle: l.cle,
    titre: l.titre,
    releveAt: l.releveAt ?? null,
    releve: l.releveAt ? `relevée ${ilYA(l.releveAt, maintenant)}` : 'heure du relevé inconnue',
    fraicheur: l.fraicheur ? fraicheurVivante(l.fraicheur, maintenant) : null,
    juge: Boolean(l.juge),
    source: 'the-odds-api'
  }));
  const lignes = c.issues.map((i) => {
    const cases = Object.fromEntries(c.livres.map((l) => [l.cle, caseDuVerdict(l.cellules?.[i.issue], maintenant)]));
    return {
      cle: `result:${i.issue}`,
      libelle: i.libelle,
      marche: 'Résultat',
      issue: i.issue,
      camp: i.issue === 'draw' ? null : i.issue,
      probabilite: nombre(i.probabilite),
      coteJuste: nombre(i.coteJuste),
      origineProbabilite: c.probabiliteSource ?? null,
      bornes: i.bornes ?? null,
      bornesTexte: texteDesBornes(i.bornes),
      retenue: Boolean(i.retenue),
      pronostic: false,
      pari: { market: 'Résultat', pick: i.libelle, marketId: 'result', params: { outcome: i.issue } },
      cases,
      meilleure: meilleureColonne(cases)
    };
  });
  const heures = colonnes.map((x) => x.releveAt).filter(Boolean).sort();
  return {
    cle: 'resultat',
    titre: 'Résultat',
    soustitre: '1 / N / 2 · relevé The Odds API',
    provenance: { source: 'The Odds API', releveAt: heures.at(-1) ?? null, payant: true },
    colonnes,
    lignes
  };
}

/** La clé d'une sélection saisie (sans le bookmaker) : marché, équipe, issue, ligne. */
const cleDeLaSaisie = (s) => `${s.marketId}|${s.equipe ?? ''}|${s.sens}|${s.ligne ?? ''}|${s.joueur ?? ''}`;

function colonnesDesSaisies(saisies, ordre, maintenant) {
  const vues = new Map();
  for (const s of saisies) if (!vues.has(s.bookmaker)) vues.set(s.bookmaker, s);
  const rang = (cle) => {
    const i = ordre.indexOf(cle);
    return i === -1 ? ordre.length : i;
  };
  return [...vues.values()]
    .sort((a, b) => rang(a.bookmaker) - rang(b.bookmaker))
    .map((s) => ({ cle: s.bookmaker, titre: s.bookmakerTitre ?? s.bookmaker, releveAt: null, releve: null, fraicheur: null, juge: false, source: 'saisie' }));
}

function ligneDeSaisies(memes, regle, maintenant, colonnes, { pronostic = null } = {}) {
  const s0 = memes[0] ?? null;
  const cases = Object.fromEntries(colonnes.map((col) => [col.cle, null]));
  for (const s of memes) cases[s.bookmaker] = caseDeLaSaisie(s, regle, maintenant);
  if (pronostic) {
    return {
      cle: pronostic.cle,
      libelle: pronostic.libelle,
      marche: pronostic.market,
      issue: null,
      camp: pronostic.params?.team ?? null,
      probabilite: nombre(pronostic.probabilite),
      coteJuste: nombre(pronostic.coteJuste),
      origineProbabilite: pronostic.origine ?? null,
      bornes: pronostic.bornes ?? null,
      bornesTexte: texteDesBornes(pronostic.bornes),
      retenue: false,
      pronostic: true,
      pari: { market: pronostic.market, pick: pronostic.libelle, marketId: pronostic.marketId, params: pronostic.params ?? null },
      cases,
      meilleure: meilleureColonne(cases)
    };
  }
  return {
    cle: `saisie:${cleDeLaSaisie(s0)}`,
    libelle: s0.libelle,
    marche: s0.marche,
    issue: null,
    camp: s0.equipe ?? null,
    probabilite: nombre(s0.moteur?.probabilite),
    coteJuste: nombre(s0.moteur?.coteJuste),
    origineProbabilite: s0.moteur?.origine ?? null,
    raisonSansProbabilite: nombre(s0.moteur?.probabilite) === null ? (s0.moteur?.raison ?? "Le moteur n'a pas de probabilité pour cette issue.") : null,
    bornes: s0.bornes ?? null,
    bornesTexte: texteDesBornes(s0.bornes),
    retenue: false,
    pronostic: false,
    pari: s0.pari ?? { market: s0.marche, pick: s0.libelle, marketId: s0.marketId, params: null },
    cases,
    meilleure: meilleureColonne(cases)
  };
}

function tablesDesAutresMarches(c, saisies, ordre, regle, maintenant) {
  const tables = [];
  const dites = new Set();
  const familles = [...FAMILLES_DU_VERDICT, { cle: 'autres', titre: 'Autres marchés', ids: null }];
  for (const f of familles) {
    const dansLaFamille = (id) => (f.ids ? f.ids.includes(id) : !FAMILLES_DU_VERDICT.some((x) => x.ids.includes(id)));
    const pronostics = c.marches.filter((m) => dansLaFamille(m.marketId)).sort((a, b) => (f.ids ? f.ids.indexOf(a.marketId) - f.ids.indexOf(b.marketId) : 0));
    const sesSaisies = saisies.filter((s) => dansLaFamille(s.marketId));
    const colonnes = colonnesDesSaisies(sesSaisies, ordre, maintenant);
    const lignes = pronostics.map((p) => {
      const memes = sesSaisies.filter((s) => memeSelection(s, { marketId: p.marketId, params: p.params }));
      for (const s of memes) dites.add(s.cle);
      return ligneDeSaisies(memes, regle, maintenant, colonnes, { pronostic: p });
    });
    // Les cotes saisies sur une autre ligne ou une autre issue que le pronostic du moteur : une ligne par issue.
    const groupes = new Map();
    for (const s of sesSaisies.filter((x) => !dites.has(x.cle))) {
      const cle = cleDeLaSaisie(s);
      groupes.set(cle, [...(groupes.get(cle) ?? []), s]);
      dites.add(s.cle);
    }
    for (const memes of groupes.values()) lignes.push(ligneDeSaisies(memes, regle, maintenant, colonnes));
    if (!lignes.length) continue;
    const heures = sesSaisies.map((s) => s.releveAt).filter(Boolean).sort();
    tables.push({
      cle: f.cle,
      titre: f.titre,
      soustitre: sesSaisies.length ? 'cotes saisies à la main' : 'aucune cote saisie : The Odds API ne relève que le 1 / N / 2',
      provenance: sesSaisies.length ? { source: 'Saisie à la main', releveAt: heures.at(-1) ?? null, payant: false } : null,
      colonnes,
      lignes
    });
  }
  return tables;
}

// ------------------------------------------------------------ les références

function referencesDuResultat(c, cotes, maintenant) {
  const colonnes = [];
  const valeurs = { home: {}, draw: {}, away: {} };
  for (const r of c?.references ?? []) {
    const cle = `payant|${r.cle}`;
    colonnes.push({ cle, titre: r.titre, source: r.gratuite ? 'cote de référence gratuite' : 'The Odds API, pas un de vos bookmakers', juge: Boolean(r.juge), releveAt: r.releveAt ?? null });
    for (const issue of ['home', 'draw', 'away']) valeurs[issue][cle] = { cote: nombre(r.cotes?.[issue]), releveAt: r.releveAt ?? null };
  }
  for (const s of cotes?.sources ?? []) {
    for (const b of s.bookmakers ?? []) {
      const m = (b.markets ?? []).find((x) => x.market === '1x2');
      if (!m) continue;
      const cle = `${s.source}|${b.bookmaker}`;
      colonnes.push({ cle, titre: b.bookmaker, source: s.name ?? s.source, juge: false, echange: Boolean(s.exchange), releveAt: null });
      for (const issue of ['home', 'draw', 'away']) {
        const v = avantMatch((m.selections ?? []).find((x) => x.selection === issue));
        const cote = nombre(v?.price) ?? (nombre(v?.prob) > 0 ? 1 / v.prob : null);
        valeurs[issue][cle] = { cote, releveAt: v?.releveAt ?? null };
      }
    }
  }
  return { colonnes, valeurs };
}

function referencesDesAutres(cotes) {
  const parMarche = new Map();
  for (const s of cotes?.sources ?? []) {
    for (const b of s.bookmakers ?? []) {
      for (const m of b.markets ?? []) {
        if (m.market !== 'ou' && m.market !== 'btts') continue;
        const cle = `${m.market}|${m.line}`;
        const t = parMarche.get(cle) ?? { market: m.market, line: m.line, colonnes: [], valeurs: {} };
        const col = `${s.source}|${b.bookmaker}`;
        t.colonnes.push({ cle: col, titre: b.bookmaker, source: s.name ?? s.source, juge: false, echange: Boolean(s.exchange) });
        for (const sel of m.selections ?? []) {
          const v = avantMatch(sel);
          t.valeurs[sel.selection] = { ...(t.valeurs[sel.selection] ?? {}), [col]: { cote: nombre(v?.price) ?? (nombre(v?.prob) > 0 ? 1 / v.prob : null), releveAt: v?.releveAt ?? null } };
        }
        parMarche.set(cle, t);
      }
    }
  }
  const libelle = (market, line, issue) =>
    market === 'ou' ? `${issue === 'over' ? 'Plus' : 'Moins'} de ${String(line).replace('.', ',')} buts` : issue === 'yes' ? 'Les 2 équipes marquent : Oui' : 'Les 2 équipes marquent : Non';
  return [...parMarche.values()]
    .sort((a, b) => (a.market === b.market ? Number(a.line) - Number(b.line) : a.market === 'ou' ? -1 : 1))
    .map((t) => ({
      cle: `ref:${t.market}:${t.line}`,
      titre: t.market === 'ou' ? `Plus/moins de ${String(t.line).replace('.', ',')} buts` : 'Les 2 équipes marquent',
      colonnes: t.colonnes,
      lignes: (t.market === 'ou' ? ['over', 'under'] : ['yes', 'no']).map((issue) => ({ cle: issue, libelle: libelle(t.market, t.line, issue), valeurs: t.valeurs[issue] ?? {} }))
    }));
}

function lesReferences(c, cotes, match, maintenant) {
  const tables = [];
  const r = referencesDuResultat(c, cotes, maintenant);
  if (r.colonnes.length) {
    const libelles = { home: `${match?.home ?? 'Domicile'} gagne`, draw: 'Match nul', away: `${match?.away ?? 'Extérieur'} gagne` };
    tables.push({ cle: 'ref:1x2', titre: 'Résultat', colonnes: r.colonnes, lignes: ['home', 'draw', 'away'].map((issue) => ({ cle: issue, libelle: libelles[issue], valeurs: r.valeurs[issue] })) });
  }
  tables.push(...referencesDesAutres(cotes));
  // L'heure de chaque cote de référence, en mots.
  for (const t of tables) {
    for (const l of t.lignes) {
      for (const v of Object.values(l.valeurs)) if (v) v.releve = v.releveAt ? `relevée ${ilYA(v.releveAt, maintenant)}` : 'heure inconnue';
    }
  }
  return tables;
}

// ------------------------------------------------------------- le comparateur

/**
 * LE COMPARATEUR d'un match, prêt à dessiner.
 * @param {object} p
 * @param {object} p.result     l'analyse (GET /api/analysis/match/:id), avec `comparateur` (étape 10)
 * @param {object|null} p.saisies  GET /api/odds/saisies?matchId= (ou null)
 * @param {object|null} p.cotes    GET /api/odds/fixture (ou null)
 * @param {{matchId?, home?, away?, league?, commenceTime?}} p.match
 * @param {number} p.maintenant
 */
export function lireLeComparateur({ result, saisies = null, cotes = null, match = {}, maintenant = Date.now() } = {}) {
  const c = result?.comparateur ?? null;
  if (!c) {
    return { present: false, raison: "Le serveur n'a pas rendu de comparateur (version d'avant l'étape 10) : relancez demarrer-cotemaster.bat.", tables: [], references: [], resume: { colonnes: 0, vertes: 0, cases: 0 } };
  }
  const lesSaisies = saisies?.saisies ?? [];
  const regle = saisies?.regle ?? c.regle ?? null;
  const ordre = (c.vosBookmakers ?? []).map((b) => b.cle);
  const tables = [];
  if (c.disponible || c.livres.length) tables.push(tableDuResultat(c, maintenant));
  tables.push(...tablesDesAutresMarches(c, lesSaisies, ordre, regle, maintenant));
  const cases = tables.flatMap((t) => t.lignes.flatMap((l) => Object.values(l.cases).filter(Boolean)));
  return {
    present: true,
    disponible: Boolean(c.disponible),
    calculeLe: c.calculeLe ?? null,
    source: c.source ?? null,
    juges: c.juges ?? null,
    regle,
    vosBookmakers: c.vosBookmakers ?? [],
    sansCoteDeMarche: !c.disponible,
    tables,
    references: lesReferences(c, cotes, match, maintenant),
    resume: {
      colonnes: new Set(tables.flatMap((t) => t.colonnes.map((x) => x.cle))).size,
      cases: cases.length,
      vertes: cases.filter((k) => k.vert).length
    }
  };
}
