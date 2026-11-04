/**
 * miseAffichee.js — LA MISE À L'ÉCRAN (étape 39 « La mise juste », lot 1a, 04/11/2026). Règle PURE de l'écran : aucun
 * import, ni Vue, ni réseau, ni horloge.
 * -----------------------------------------------------------------------
 * Le serveur rend, pour chaque pari conseillé, l'objet `mise` (server/src/data/mise/miseRead.js) : la PART du capital
 * (recalculée par la règle, jamais « mise / base »), les euros SEULEMENT sur le capital que Pierre a réglé, les raisons qui
 * ont réduit ou qualifient le conseil, et la règle candidate à blanc. Ici, les MOTS de la conception (§5) :
 *   « Mise conseillée : 0,39 % de votre capital »
 *   « soit 7,80 € sur votre capital de 2 000 € (réglé le 05/11 · suivi de vos paris : +12 € · en attente : 40 €) »
 *   « Capital non indiqué : réglez-le dans Réglages › Gestion du risque pour voir la mise en euros. »
 *   une ligne par réduction, dans l'ordre où elles ont mordu ; en gris « Règle candidate (à blanc) » quand elle diffère.
 * Le ticket « J'ai parié » n'est pré-rempli QUE sur le capital réglé, et marqué « conseil du moteur, modifiable »
 * (misePourLeTicket) ; sans capital, il reste vide.
 * Les mots fixes sont recopiés de server/src/data/mise/regleDeMise.js (MOTS_DE_LA_MISE, MENTION_FRANCAIS) et la date du
 * changement du message de l'IA de server/src/core/ai/compactContext.js : un test vérifie « écran = serveur ».
 * -----------------------------------------------------------------------
 */

export const MOTS_DE_LA_MISE = Object.freeze({
  miseConseillee: 'Mise conseillée',
  capitalNonIndique: 'Capital non indiqué : réglez-le dans Réglages › Gestion du risque pour voir la mise en euros.',
  ticket: 'conseil du moteur, modifiable',
  aBlanc: 'Règle candidate (à blanc)',
  seriesLiees: 'Cette alerte compte les paris d’un même match comme indépendants : chez vous, elle sonne trop souvent.',
  nonEnregistres:
    'Si vous n’enregistrez pas vos paris (« J’ai parié »), le capital qui les suit, les plafonds et les paris liés ne voient rien : ils calculent sur ce que vous leur dites.'
});

export const MENTION_FRANCAIS = 'jamais mesuré chez ce bookmaker (marge 11 à 15 %)';

/** Le jour où la ligne de la mise a changé dans le message de l'IA (compactContext.js) : le carnet de l'IA le dit. */
export const MISE_EN_PART_DANS_LE_MESSAGE = Object.freeze({
  etape: 39,
  le: '2026-11-04',
  texte: 'la mise du moteur est écrite à l’IA en part du capital (« 0,39 % du capital »), plus jamais en euros calculés sur une base interne'
});

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * k et s_max de la règle d'aujourd'hui (1/8 de Kelly, 2 % au plus : core/engine/engineConfig.js, réglage par défaut et en
 * vigueur, jamais changé pendant l'essai de l'étape 27) — pour la revue de l'IA, qui relit un résumé gardé sans eux ; un
 * test vérifie qu'ils sont ceux du moteur.
 */
export const REGLE_DE_MISE_AFFICHEE = Object.freeze({ kellyFraction: 0.125, maxStakePercent: 0.02 });

/**
 * La part du capital d'un conseil du moteur : min(k · avantage / (cote − 1), s_max), jamais négative — la règle du
 * serveur (partDeMise), recopiée pour la revue de l'IA, qui relit un résumé gardé (un test garde l'identité à l'octet).
 * `reglage` : { kellyFraction, maxStakePercent } du moteur. Entrées illisibles : null.
 */
export function partDuCapital({ ev, cote, reglage } = {}) {
  const k = reglage?.kellyFraction;
  const sMax = reglage?.maxStakePercent;
  if (!fini(ev) || !fini(cote) || !(cote > 1) || !fini(k) || !fini(sMax)) return null;
  const kelly = (k * ev) / (cote - 1);
  return Math.max(0, Math.min(kelly, sMax));
}

/** « 0,39 % » (deux décimales, à la française). */
export function pourcentDuCapital(f) {
  return `${(100 * (fini(f) ? f : 0)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/** « 7,80 € » (une mise : toujours au centime). */
export function eurosDeMise(x) {
  return `${(fini(x) ? x : 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** « 2 000 € », « 2 012,50 € » (un capital : les centimes seulement s'il y en a). */
export function eurosDuCapital(x) {
  const v = Math.round((fini(x) ? x : 0) * 100) / 100;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })} €`;
}

/** « +12 € », « −8,50 € ». */
export function eurosSignes(x) {
  if (!fini(x)) return '–';
  const v = Math.round(x * 100) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${eurosDuCapital(Math.abs(v))}`;
}

/** « 05/11 » : le jour d'un réglage (AAAA-MM-JJ). */
export function jourCourt(jour) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(jour ?? ''));
  return m ? `${m[3]}/${m[2]}` : 'date inconnue';
}

/** « Votre capital : 2 000 € (réglé le 05/11) » ou « Capital non indiqué ». */
export function capitalDit(capital) {
  if (!capital?.indique) return 'Capital non indiqué';
  return `Votre capital : ${eurosDuCapital(capital.montant)} (réglé le ${jourCourt(capital.le)})`;
}

/** La provenance du capital : « réglé le 05/11 · suivi de vos paris : +12 € · en attente : 40 € » (ou « fixe »). */
export function provenanceDuCapital(capital) {
  if (!capital?.indique) return '';
  const morceaux = [`réglé le ${jourCourt(capital.le)}`];
  morceaux.push(capital.suitLeCarnet ? `suivi de vos paris : ${eurosSignes(capital.gainsDepuis ?? 0)}` : 'capital fixe (ne suit pas vos paris)');
  if (fini(capital.enAttente) && capital.enAttente > 0) morceaux.push(`en attente : ${eurosDuCapital(capital.enAttente)}`);
  return morceaux.join(' · ');
}

/**
 * Les lignes d'une mise (l'objet `mise` du serveur) :
 * { conseil, titre, euros, sansCapital, raisons[], aBlanc } — `euros` seulement avec le capital réglé ; sans lui,
 * `sansCapital` le dit ; `aBlanc` (en gris) seulement quand la règle candidate diffère du conseil, jamais à sa place.
 */
export function lignesDeLaMise(mise) {
  if (!mise?.conseil) return { conseil: false, titre: null, euros: null, sansCapital: null, raisons: (mise?.raisons ?? []).map((r) => r.texte), aBlanc: null };
  const titre = `${MOTS_DE_LA_MISE.miseConseillee} : ${pourcentDuCapital(mise.fraction)} de votre capital`;
  const indique = Boolean(mise.capital?.indique) && fini(mise.euros);
  const euros = indique ? `soit ${eurosDeMise(mise.euros)} sur votre capital de ${eurosDuCapital(mise.capital.montant)} (${provenanceDuCapital(mise.capital)})` : null;
  const raisons = (mise.raisons ?? []).map((r) => r.texte);
  let aBlanc = null;
  if (mise.aBlanc?.differe) {
    const part = pourcentDuCapital(mise.aBlanc.f);
    const enEuros = indique && fini(mise.aBlanc.euros) ? ` (${eurosDeMise(mise.aBlanc.euros)})` : '';
    const pourquoi = (mise.aBlanc.raisons ?? []).filter((r) => r.avant !== r.apres).map((r) => r.texte).join(' · ');
    aBlanc = `${MOTS_DE_LA_MISE.aBlanc} : ${part} de votre capital${enEuros}${pourquoi ? ` — ${pourquoi}` : ''}`;
  }
  return { conseil: true, titre, euros, sansCapital: indique ? null : MOTS_DE_LA_MISE.capitalNonIndique, raisons, aBlanc };
}

/** Le survol d'une mise en une ligne : les euros (ou « Capital non indiqué »), les réductions, la règle à blanc. */
export function titreDeLaMise(mise) {
  const l = lignesDeLaMise(mise);
  if (!l.conseil) return null;
  return [l.titre, l.euros ?? l.sansCapital, ...l.raisons, l.aBlanc].filter(Boolean).join(' · ');
}

/** Le texte court d'une mise, en une ligne : « 0,39 % de votre capital · 7,80 € » ou « 0,39 % de votre capital ». */
export function miseEnUneLigne(mise) {
  if (!mise?.conseil) return null;
  const part = `${pourcentDuCapital(mise.fraction)} de votre capital`;
  return mise.capital?.indique && fini(mise.euros) ? `${part} · ${eurosDeMise(mise.euros)}` : part;
}

/**
 * Le ticket « J'ai parié » : pré-rempli SEULEMENT avec le capital réglé et un conseil du moteur en euros, marqué
 * « conseil du moteur, modifiable » ; sinon null (le ticket reste vide, jamais un chiffre inventé).
 */
export function misePourLeTicket(mise) {
  if (!mise?.conseil || !mise.capital?.indique || !fini(mise.euros) || !(mise.euros > 0)) return null;
  return { montant: Math.round(mise.euros * 100) / 100, marque: MOTS_DE_LA_MISE.ticket };
}

/**
 * Le ticket de la page d'un match : la mise conseillée ne le pré-remplit que pour LE pari du moteur — une seule sélection,
 * le résultat, la même issue et le même bookmaker que son conseil — et sur le capital réglé (misePourLeTicket) ; sinon null.
 */
export function misePourLaSelection({ selections = [], staking = null, mise = null } = {}) {
  if (selections.length !== 1 || staking?.action !== 'RECOMMENDED') return null;
  const s = selections[0];
  if (s?.marketId !== 'result' || s?.params?.outcome !== staking.outcome) return null;
  if ((s.bookmaker ?? null) !== (staking.bookmaker ?? null)) return null;
  return misePourLeTicket(mise);
}

/**
 * La mise d'une analyse IA gardée (la revue) : la PART recalculée par la règle depuis l'avantage et la cote du résumé
 * gardé — jamais les euros gardés (calculés sur une base interne). `reglage` : k et s_max du moteur d'aujourd'hui.
 */
export function miseDeLaRevue(staking, reglage = REGLE_DE_MISE_AFFICHEE) {
  if (!staking) return null;
  if (staking.action !== 'RECOMMENDED') return 'pas de mise';
  const f = partDuCapital({ ev: staking.ev, cote: staking.odds, reglage });
  return f === null ? 'mise recommandée (part du capital non calculée)' : `mise recommandée : ${pourcentDuCapital(f)} du capital`;
}
