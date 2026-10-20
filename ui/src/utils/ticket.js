/**
 * ticket.js — LE TICKET et « J'ai parié » (étape 10 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Un seul ticket, une seule façon d'enregistrer un pari, que Pierre le prenne
 * dans Mes paris (le bordereau d'avant, étendu) ou sur la page d'un match (le
 * comparateur de ses bookmakers). Ce fichier décide, en JavaScript pur (les
 * tests du serveur le rejouent : server/test/ticket.test.mjs) :
 *   - la NATURE du ticket : simple, combiné de plusieurs matchs, ou combiné du
 *     même match (ses sélections sont liées : sa cote est celle que donne le
 *     bookmaker, jamais le produit) — la même règle que le serveur
 *     (betsRepository.js, natureDuPari) ;
 *   - ce qu'on prend et ce qu'on remplace (deux issues d'un même marché
 *     s'excluent ; « un seul pari par match » reste la règle tant que le
 *     combiné du même match n'est pas demandé) ;
 *   - ce qui manque avant de pouvoir dire « J'ai parié » (bookmaker, cote
 *     prise, cote du combiné) ;
 *   - le corps de POST /api/bets : la cote prise, le bookmaker, la PROBABILITÉ
 *     DU MOTEUR au moment du pari (et quand il l'a calculée), l'heure et la
 *     source de la cote — ce qu'il faut pour la valeur de clôture
 *     (server/src/data/closingValue.js) et le gain attendu ;
 *   - le gain potentiel et le gain attendu (pari simple seulement).
 * Aucun prix n'est inventé : le prix juste d'un combiné (sélections liées) viendra
 * avec la simulation complète (étape 28 du plan) ; d'ici là, ni value ni gain
 * attendu pour un combiné. Aucune règle de value n'est refaite ici : la cote
 * minimale et la cote maximale viennent du serveur (core/engine/coteMinimale.js).
 * Toute fonction qui dépend de l'heure reçoit `maintenant` (ms).
 * -----------------------------------------------------------------------
 */

/** Les natures d'un ticket, en mots. */
export const NATURES = Object.freeze({
  vide: 'Aucune sélection',
  simple: 'Pari simple',
  combine: 'Combiné de plusieurs matchs',
  'combine-meme-match': 'Combiné du même match'
});

/** D'où vient la cote prise (les mêmes valeurs que le serveur, bets.controller.js). */
export const SOURCES_DE_COTE = Object.freeze({
  'the-odds-api': 'relevé The Odds API',
  saisie: 'saisie à la main',
  'au-pari': 'vue chez le bookmaker au moment du pari'
});

/** Ce qu'on dit d'un combiné : pas de prix juste avant l'étape 28 — jamais un prix inventé. */
export const PRIX_JUSTE_COMBINE =
  "Prix juste : pas encore calculé. Les sélections d'un combiné ne se multiplient pas simplement (deux sélections d'un même match sont liées) : son prix juste viendra avec la simulation complète, étape 28 du plan. D'ici là, ni value ni gain attendu sur un combiné.";

const nombre = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const cote2 = (x) => (Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '—');
const euros = (x) => `${(Math.round(x * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Le match d'une sélection : son identifiant, à défaut les deux clubs et l'heure (la même clé que le serveur). */
export const cleDeMatch = (s) => s?.matchId ?? `${s?.homeName ?? ''}|${s?.awayName ?? ''}|${s?.commenceTime ?? ''}`;
/** La clé d'une sélection : celle des paris de Mes paris (legKey) — match, marché, issue. */
export const cleDeSelection = (s) => `${s?.matchId}|${s?.market}|${s?.pick}`;
/** Le marché d'une sélection dans son match : deux issues d'un même marché (et d'une même équipe) s'excluent ou se répètent. */
export const cleDeMarche = (s) => `${cleDeMatch(s)}#${s?.marketId ?? s?.market}#${s?.params?.team ?? ''}`;

/** La nature d'un ticket — la règle du serveur (natureDuPari) : un match en double = combiné du même match. */
export function natureDuTicket(selections = []) {
  if (!selections.length) return 'vide';
  if (selections.length === 1) return 'simple';
  return new Set(selections.map(cleDeMatch)).size < selections.length ? 'combine-meme-match' : 'combine';
}

/**
 * Prendre une sélection (une case du comparateur, une ligne d'une liste de Mes paris) :
 *   - la même sélection chez le même bookmaker : elle est retirée (un deuxième clic défait le premier) ;
 *   - la même sélection chez un autre bookmaker, ou à une autre cote : elle est mise à jour ;
 *   - une autre issue du même marché du même match : elle remplace l'autre (elles s'excluent) ;
 *   - une sélection d'un autre marché d'un match déjà sur le ticket : ajoutée seulement si `memeMatch`
 *     (combiné du même match demandé) ; sinon elle remplace celle de ce match — un seul pari par match ;
 *   - sinon elle s'ajoute.
 * @returns {{ selections: object[], action: 'ajoutee'|'retiree'|'mise-a-jour'|'remplacee', remplacees: object[], message: string|null }}
 */
export function prendre(selections = [], selection, { memeMatch = false } = {}) {
  const cle = cleDeSelection(selection);
  const deja = selections.find((s) => cleDeSelection(s) === cle);
  if (deja) {
    if ((deja.bookmaker ?? null) === (selection.bookmaker ?? null) && nombre(deja.cote) === nombre(selection.cote)) {
      return { selections: selections.filter((s) => s !== deja), action: 'retiree', remplacees: [deja], message: null };
    }
    return { selections: selections.map((s) => (s === deja ? selection : s)), action: 'mise-a-jour', remplacees: [deja], message: null };
  }
  const memeMarche = selections.filter((s) => cleDeMarche(s) === cleDeMarche(selection));
  const memeMatchSansCombine = memeMatch ? [] : selections.filter((s) => cleDeMatch(s) === cleDeMatch(selection));
  const remplacees = [...new Set([...memeMarche, ...memeMatchSansCombine])];
  if (remplacees.length) {
    const message = memeMarche.length
      ? `Deux issues d'un même marché s'excluent : « ${remplacees.map((s) => s.pick).join(' », « ')} » remplacé par « ${selection.pick} ».`
      : `Un seul pari par match sur le ticket : « ${remplacees.map((s) => s.pick).join(' », « ')} » remplacé. Pour un combiné du même match, cochez « Combiner les paris d'un même match ».`;
    return { selections: [...selections.filter((s) => !remplacees.includes(s)), selection], action: 'remplacee', remplacees, message };
  }
  return { selections: [...selections, selection], action: 'ajoutee', remplacees: [], message: null };
}

// ------------------------------------------------------------- les sélections

/**
 * Une sélection depuis une ligne du comparateur (utils/comparateur.js) et, si
 * Pierre a cliqué une case, la cote d'un de ses bookmakers (relevé ou saisie).
 * Sans case : la sélection n'a ni bookmaker ni cote — à taper.
 */
export function selectionDeLaLigne({ match, ligne, case: k = null, calculeLe = null }) {
  return {
    matchId: match?.matchId ?? null,
    homeName: match?.home ?? null,
    awayName: match?.away ?? null,
    league: match?.league ?? null,
    commenceTime: match?.commenceTime ?? null,
    market: ligne.pari.market,
    pick: ligne.pari.pick,
    marketId: ligne.pari.marketId ?? null,
    params: ligne.pari.params ?? null,
    cote: nombre(k?.cote),
    bookmaker: k?.bookmaker ?? null,
    bookmakerTitle: k?.bookmakerTitle ?? null,
    coteReleveeA: k?.releveAt ?? null,
    coteSource: k ? k.source : null,
    probabiliteMoteur: nombre(ligne.probabilite),
    probabiliteSource: ligne.origineProbabilite ?? null,
    probabiliteLueA: calculeLe,
    coteJuste: nombre(ligne.coteJuste),
    bornes: ligne.bornes ?? null
  };
}

/**
 * Une sélection depuis un pari d'une liste de Mes paris (value bets, paris les
 * plus probables, tous les paris). Un value bet porte le verdict du moteur : son
 * bookmaker, sa cote relevée et la probabilité juste. Les autres portent la cote
 * JUSTE du moteur (`odds`), qui n'est pas un prix de bookmaker : la cote prise
 * est à taper ; la probabilité du moteur est 1 / cette cote juste.
 */
export function selectionDuCandidat(c) {
  const v = c?.verdict ?? null;
  const coteJuste = v ? nombre(c.modelOdds) ?? nombre(v.coteJuste) : nombre(c?.odds);
  return {
    matchId: c?.matchId ?? null,
    homeName: c?.homeName ?? null,
    awayName: c?.awayName ?? null,
    league: c?.league ?? null,
    commenceTime: c?.commenceTime ?? null,
    market: c?.market,
    pick: c?.pick,
    marketId: c?.marketId ?? null,
    params: c?.params ?? null,
    cote: v ? nombre(c.odds) : null,
    bookmaker: v?.bookmaker ?? null,
    bookmakerTitle: v?.bookmakerTitle ?? null,
    coteReleveeA: v?.releveAt ?? null,
    coteSource: v ? 'the-odds-api' : null,
    probabiliteMoteur: v ? nombre(v.probabilite) : coteJuste && coteJuste > 1 ? 1 / coteJuste : null,
    // La même phrase que le comparateur du serveur : « (Pinnacle) » quand Pinnacle seul fixe la cote juste.
    probabiliteSource: v
      ? `cote juste des bookmakers de référence${v.juges?.palier ? ` (${v.juges.palier}${v.juges.livres?.length && v.juges.livres.join(', ') !== v.juges.palier ? ` : ${v.juges.livres.join(', ')}` : ''})` : ''}, marge retirée`
      : coteJuste
        ? 'cote juste du moteur (1 / probabilité)'
        : null,
    probabiliteLueA: c?.lueA ?? null,
    coteJuste,
    bornes: c?.bornes ?? null
  };
}

// --------------------------------------------------------- ce que Pierre a pris

/** La cote prise d'une sélection : celle que Pierre a tapée, sinon celle de la case (relevé ou saisie), sinon rien. */
export function cotePriseDe(selection, cotes = {}) {
  const tapee = nombre(cotes?.[cleDeSelection(selection)]);
  if (tapee !== null && tapee > 1) return tapee;
  const lue = nombre(selection?.cote);
  return lue !== null && lue > 1 ? lue : null;
}

/**
 * L'heure et la source de la cote prise : celles du relevé (ou de la saisie)
 * quand Pierre a pris CETTE cote chez CE bookmaker ; sinon la cote a été vue au
 * moment du pari (« au-pari », l'heure du pari).
 */
export function heureDeLaCote(selection, cotePrise, bookmaker, maintenant) {
  const memePrix = nombre(selection?.cote) !== null && Math.abs(selection.cote - cotePrise) < 1e-9;
  const memeLivre = (selection?.bookmaker ?? null) === (bookmaker ?? null);
  if (memePrix && memeLivre && selection?.coteReleveeA && selection?.coteSource) return { coteReleveeA: selection.coteReleveeA, coteSource: selection.coteSource };
  return { coteReleveeA: new Date(maintenant).toISOString(), coteSource: 'au-pari' };
}

/** Le bookmaker proposé pour un ticket : celui de la dernière sélection qui en a un. */
export function bookmakerPropose(selections = []) {
  return [...selections].reverse().find((s) => s.bookmaker)?.bookmaker ?? null;
}

/**
 * Ce qui empêche de dire « J'ai parié », en phrases (vide : tout est là).
 * @param {object} p
 * @param {object[]} p.selections
 * @param {{ bookmaker: string|null, cotes: object, coteCombinee: number|null }} p.edition
 * @param {number} p.mise
 * @param {{cle: string, titre: string}[]} p.bookmakers  vos bookmakers
 */
export function controleDuTicket({ selections = [], edition = {}, mise = null, bookmakers = [] } = {}) {
  const manques = [];
  if (!selections.length) return ['Aucune sélection sur le ticket.'];
  if (!(nombre(mise) > 0)) manques.push('La mise doit être un nombre positif.');
  if (!edition.bookmaker) manques.push('Choisissez le bookmaker chez qui vous avez parié.');
  else if (bookmakers.length && !bookmakers.some((b) => b.cle === edition.bookmaker)) manques.push(`« ${edition.bookmaker} » n'est pas un de vos bookmakers (Réglages › Paramètres du moteur).`);
  for (const s of selections) {
    if (cotePriseDe(s, edition.cotes) === null) manques.push(`Cote prise de « ${s.pick} » : la cote que vous avez eue chez le bookmaker (un nombre supérieur à 1).`);
  }
  if (natureDuTicket(selections) === 'combine-meme-match' && !(nombre(edition.coteCombinee) > 1)) {
    manques.push("Combiné du même match : tapez la cote que donne le bookmaker pour le combiné — ce n'est pas le produit des cotes, ses sélections sont liées.");
  }
  return manques;
}

/**
 * Le corps de POST /api/bets pour « J'ai parié ». Chaque sélection garde le
 * format d'avant (match, marché, issue, cote) et y ajoute le bookmaker, la
 * probabilité du moteur au moment du pari, l'heure et la source de la cote.
 */
export function pariAEnregistrer({ selections = [], edition = {}, mise, origine, maintenant = Date.now(), bookmakers = [] } = {}) {
  const titre = bookmakers.find((b) => b.cle === edition.bookmaker)?.titre ?? selections.find((s) => s.bookmaker === edition.bookmaker)?.bookmakerTitle ?? null;
  const nature = natureDuTicket(selections);
  const corps = {
    stake: mise,
    legs: selections.map((s) => {
      const cote = cotePriseDe(s, edition.cotes);
      const h = heureDeLaCote(s, cote, edition.bookmaker, maintenant);
      return {
        matchId: s.matchId,
        homeName: s.homeName,
        awayName: s.awayName,
        league: s.league,
        commenceTime: s.commenceTime ?? null,
        market: s.market,
        marketId: s.marketId ?? null,
        params: s.params ?? null,
        pick: s.pick,
        odds: cote,
        bookmaker: edition.bookmaker ?? null,
        bookmakerTitle: titre,
        probabiliteMoteur: nombre(s.probabiliteMoteur),
        probabiliteSource: s.probabiliteSource ?? null,
        probabiliteLueA: s.probabiliteLueA ?? null,
        coteReleveeA: h.coteReleveeA,
        coteSource: h.coteSource
      };
    }),
    origine
  };
  if (nature !== 'simple' && nombre(edition.coteCombinee) > 1) corps.cotePrise = edition.coteCombinee;
  return corps;
}

/**
 * Ce que rapporterait le ticket : la cote (la cote prise d'un simple ; la cote
 * du combiné tapée, sinon le produit pour des matchs différents), le gain
 * potentiel, et le gain attendu d'un pari SIMPLE dont la probabilité du moteur
 * est connue — mise × (probabilité × cote − 1), la formule du serveur
 * (gainAttenduDuPari). Jamais pour un combiné (étape 28).
 */
export function gainsDuTicket({ selections = [], edition = {}, mise = null } = {}) {
  const nature = natureDuTicket(selections);
  const cotes = selections.map((s) => cotePriseDe(s, edition.cotes));
  const produit = cotes.every((c) => c !== null) && cotes.length ? cotes.reduce((p, c) => p * c, 1) : null;
  let cote = null;
  if (nature === 'simple') cote = cotes[0];
  else if (nature === 'combine') cote = nombre(edition.coteCombinee) > 1 ? edition.coteCombinee : produit;
  else if (nature === 'combine-meme-match') cote = nombre(edition.coteCombinee) > 1 ? edition.coteCombinee : null;
  const m = nombre(mise);
  const potentiel = cote !== null && m > 0 ? m * cote : null;
  let attendu = null;
  let raisonAttendu = null;
  if (nature === 'simple') {
    const p = nombre(selections[0].probabiliteMoteur);
    if (p === null || !(p > 0 && p < 1)) raisonAttendu = "Gain attendu inconnu : le moteur n'a pas de probabilité pour cette sélection.";
    else if (cote === null || !(m > 0)) raisonAttendu = 'Gain attendu : la cote prise et la mise d’abord.';
    else attendu = { montant: Math.round(m * (p * cote - 1) * 100) / 100, pourcent: Math.round((p * cote - 1) * 100 * 100) / 100 };
  } else if (nature !== 'vide') raisonAttendu = PRIX_JUSTE_COMBINE;
  return { nature, cote, produit, potentiel, attendu, raisonAttendu };
}

/** Une cote face aux bornes du serveur (core/engine/coteMinimale.js, faceAuxBornes) : 'value', 'sous-minimum', 'au-dessus', 'inconnu'. */
export function faceAuxBornes(cote, bornes) {
  if (!Number.isFinite(cote) || !bornes || !Number.isFinite(bornes.coteMinimale)) return 'inconnu';
  if (cote < bornes.coteMinimale) return 'sous-minimum';
  if (cote > bornes.coteMaximale) return 'au-dessus';
  return 'value';
}

/** Ce que dit une cote prise face aux bornes, en une phrase (jamais en vert : ce n'est pas la pastille de value). */
export function phraseFaceAuxBornes(cote, bornes) {
  switch (faceAuxBornes(cote, bornes)) {
    case 'value':
      return `${cote2(cote)} : au moins ${cote2(bornes.coteMinimale)}, encore une value au seuil du moteur.`;
    case 'sous-minimum':
      return `${cote2(cote)} : sous ${cote2(bornes.coteMinimale)}, plus de value à ce prix au seuil du moteur.`;
    case 'au-dessus':
      return `${cote2(cote)} : au-delà de ${cote2(bornes.coteMaximale)}, trop belle pour être vraie (cote périmée ou erreur) ou au-dessus de la cote maximale du moteur.`;
    default:
      return null;
  }
}

/** Le gain attendu d'un pari du carnet, tel que le serveur le donne (`gainAttendu`), en mots. */
export function gainAttenduDit(bet) {
  const g = bet?.gainAttendu ?? null;
  if (g && Number.isFinite(g.montant)) return `${g.montant >= 0 ? '+' : '−'}${euros(Math.abs(g.montant))} (${g.pourcent >= 0 ? '+' : '−'}${Math.abs(g.pourcent).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %)`;
  if (g?.raison === 'combine') return 'pas encore (combiné : étape 28)';
  return 'non noté';
}
