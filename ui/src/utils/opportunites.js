/**
 * opportunites.js — les règles de la page « Opportunités du jour » (étape 8 du plan, 06/10/2026).
 * -----------------------------------------------------------------------
 * Ce que la page FAIT des lignes que le serveur prépare
 * (server/src/data/opportunities.js) : les filtrer (championnat, marché,
 * value minimale, période), les trier par value — la value verte d'abord,
 * telle que le verdict du moteur la donne À L'HEURE QU'IL EST (une value qui
 * vieillit passe « à rafraîchir » et descend) —, et choisir quelles nouvelles
 * opportunités vertes méritent une notification du navigateur (une par
 * opportunité, jamais deux fois, jamais un flot).
 *
 * Aucun calcul de pari : le verdict vient du serveur (verdictPari.js), sa
 * lecture de etatVerdict (langageParis.js). JavaScript pur, sans Vue ni
 * navigateur : les tests du serveur rejouent ces règles
 * (server/test/opportunites.test.mjs). Toute fonction qui dépend de l'heure
 * reçoit `maintenant` (ms).
 * -----------------------------------------------------------------------
 */

import { etatVerdict, pourcentSigne } from './langageParis.js';

/** Les états d'un verdict qui portent une vraie lecture de value (un avantage chez l'un de vos bookmakers). */
const VALUE_LISIBLE = new Set(['value', 'value-secondaire', 'a-rafraichir', 'sous-seuil', 'sans-value', 'trop-beau', 'cote-haute']);

/** Le filtre « value minimale ». `min` : l'avantage minimal en % ; « seuil » : celui du moteur (Réglages). */
export const VALEURS_MINIMALES = Object.freeze([
  Object.freeze({ value: 'toutes', label: 'Toutes les lignes', hint: 'chutes comprises' }),
  Object.freeze({ value: 'positive', label: 'Value positive', hint: '> 0 %' }),
  Object.freeze({ value: 'seuil', label: 'Au-dessus du seuil du moteur', hint: 'Réglages' }),
  Object.freeze({ value: '5', label: '5 % et plus', hint: '≥ 5 %' }),
  Object.freeze({ value: '10', label: '10 % et plus', hint: '≥ 10 %' })
]);

/** Les périodes, comme le Repérage : aujourd'hui, les 3 ou les 7 prochains jours (tout le calcul). */
export const PERIODES = Object.freeze([
  Object.freeze({ value: 'today', label: "Aujourd'hui", jusqua: 0 }),
  Object.freeze({ value: '3', label: '3 prochains jours', jusqua: 2 }),
  Object.freeze({ value: '7', label: '7 prochains jours', jusqua: Infinity })
]);

const pad = (n) => String(n).padStart(2, '0');
const jourLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Le jour d'un match : celui de l'heure locale quand le coup d'envoi est connu, celui du calendrier sinon. */
const jourDuMatch = (l) => (l.exactKickoff ? jourLocal(new Date(l.commenceTime)) : String(l.commenceTime ?? '').slice(0, 10));
const ecartJours = (jour, aujourdhui) => Math.round((Date.parse(`${jour}T00:00:00Z`) - Date.parse(`${aujourdhui}T00:00:00Z`)) / 86_400_000);

/** La ligne entre-t-elle dans la période (« today », « 3 », « 7 ») ? */
export function dansLaPeriode(ligne, periode, maintenant) {
  const p = PERIODES.find((x) => x.value === periode);
  if (!p || p.jusqua === Infinity) return true;
  return ecartJours(jourDuMatch(ligne), jourLocal(new Date(maintenant))) <= p.jusqua;
}

/**
 * La value d'une ligne pour le filtre « value minimale » : l'avantage du
 * verdict quand il porte une vraie lecture (jamais celui d'un bookmaker « juge
 * et partie », qui n'est pas une value) ; null sinon.
 */
export function valueDeLaLigne(ligne) {
  const v = ligne?.verdict;
  return v && VALUE_LISIBLE.has(v.etat) && Number.isFinite(v.pourcent) ? v.pourcent : null;
}

/** La ligne passe-t-elle le filtre « value minimale » ? */
export function passeLaValueMinimale(ligne, choix = 'toutes') {
  if (choix === 'toutes' || !choix) return true;
  const p = valueDeLaLigne(ligne);
  if (p === null) return false;
  if (choix === 'positive') return p > 0;
  if (choix === 'seuil') {
    // Le seuil du moteur, tel que le verdict le porte ; « au-dessus », comme findValueBet (pile le seuil ne suffit pas).
    const min = ligne.verdict?.limites?.min;
    return Number.isFinite(min) && p > min;
  }
  const n = Number(choix);
  return Number.isFinite(n) ? p >= n : true;
}

/**
 * Les lignes qui passent les filtres. `competition` : un championnat (« » :
 * tous) ; `marche` : une clé de marché (home, draw, away, over25…) ou « » ;
 * `valeurMin` : un choix de VALEURS_MINIMALES ; `periode` : un choix de PERIODES.
 */
export function filtrerLesOpportunites(lignes, { competition = '', marche = '', valeurMin = 'toutes', periode = '7', maintenant = Date.now() } = {}) {
  return (lignes ?? []).filter(
    (l) =>
      (!competition || l.league === competition) &&
      (!marche || l.marche === marche) &&
      passeLaValueMinimale(l, valeurMin) &&
      dansLaPeriode(l, periode, maintenant)
  );
}

/**
 * Le rang d'une ligne, À L'HEURE QU'IL EST : 0 la value verte, 1 une lecture
 * réelle (à rafraîchir, pas retenue, sous le seuil, sans value), 2 ce que le
 * moteur écarte (trop beau, cote trop haute, juge et partie…), 3 une chute de
 * cote sans cote chez vos bookmakers.
 */
export function rangVivant(ligne, maintenant = Date.now()) {
  if (!ligne?.verdict || !ligne.avecOffre) return 3;
  const etat = etatVerdict(ligne.verdict, maintenant).etat;
  if (etat === 'value') return 0;
  if (['a-rafraichir', 'value-secondaire', 'sous-seuil', 'sans-value'].includes(etat)) return 1;
  return 2;
}

/** La case de la carte « où parier » d'une ligne (étape 23) : 0 verte, 1 grise ou sans carte, 2 rouge. */
export const rangDeLaCase = (l) => (l?.carte?.couleur === 'vert' ? 0 : l?.carte?.couleur === 'rouge' ? 2 : 1);
const estRouge = (l) => (l?.carte?.couleur === 'rouge' ? 1 : 0);

/**
 * Triées par value : les lignes des cases ROUGES de la carte « où parier » à la fin (étape 23), puis le rang
 * (vivant), puis la case (verte avant grise), puis l'avantage (le plus fort d'abord), puis la chute, puis le coup
 * d'envoi. Sans carte, toutes les lignes ont la même case : l'ordre d'avant.
 */
export function trierLesOpportunites(lignes, maintenant = Date.now()) {
  const avantage = (l) => (rangVivant(l, maintenant) <= 2 && Number.isFinite(l.verdict?.pourcent) ? l.verdict.pourcent : -Infinity);
  const chute = (l) => (l.mouvement?.chute ? l.mouvement.dropPct : -Infinity);
  return [...(lignes ?? [])].sort(
    (a, b) =>
      estRouge(a) - estRouge(b) ||
      rangVivant(a, maintenant) - rangVivant(b, maintenant) ||
      rangDeLaCase(a) - rangDeLaCase(b) ||
      avantage(b) - avantage(a) ||
      chute(b) - chute(a) ||
      String(a.commenceTime).localeCompare(String(b.commenceTime)) ||
      String(a.cle).localeCompare(String(b.cle))
  );
}

/**
 * La liste telle que la page la montre : filtrée, triée par value, puis
 * FAVORIS D'ABORD (`favoritesFirst` du magasin des favoris : les lignes qui
 * touchent une équipe favorite, puis les championnats favoris, puis le reste —
 * le tri par value gardé dans chaque bloc). Étape 23 : les lignes des cases ROUGES de la carte « où parier »
 * restent à la FIN de la liste, même pour un favori (visibles, avec leur avertissement).
 */
export function opportunitesAffichees(lignes, { filtres = {}, maintenant = Date.now(), favoritesFirst = (x) => x } = {}) {
  const triees = trierLesOpportunites(filtrerLesOpportunites(lignes, { ...filtres, maintenant }), maintenant);
  const rangees = favoritesFirst(triees, {
    league: (l) => l.league,
    teams: (l) => [
      [l.home, l.league, l.homeId ?? undefined],
      [l.away, l.league, l.awayId ?? undefined]
    ]
  });
  return [...rangees.filter((l) => !estRouge(l)), ...rangees.filter((l) => estRouge(l))];
}

// ------------------------------------------------- les notifications

/** Au plus autant de notifications par vérification ; au-delà, une seule qui résume (jamais un flot). */
export const NOTIFICATIONS_MAX_PAR_PASSE = 3;
/** Une opportunité notifiée est gardée en mémoire tant de jours (elle ne revient pas). */
export const MEMOIRE_NOTIFICATIONS_JOURS = 14;

/**
 * Ce qui fait UNE opportunité pour les notifications : le match, l'issue, le
 * bookmaker et sa cote. La même value relue à chaque vérification ne se
 * notifie qu'une fois ; une nouvelle cote (nouveau relevé) en fait une autre.
 */
export function cleDeNotification(o) {
  const v = o?.verdict ?? {};
  return `${o?.cle ?? `${o?.matchId}|${v.issue}`}|${v.bookmaker ?? ''}|${Number.isFinite(Number(v.cote)) ? Number(v.cote).toFixed(2) : ''}`;
}

/**
 * Les opportunités vertes à notifier maintenant : vertes À L'HEURE QU'IL EST
 * (etatVerdict : une cote qui a vieilli depuis le calcul ne notifie rien), et
 * jamais déjà notifiées (`dejaVues` : un Set de clés, ou un objet clé → date).
 * Les plus fortes values d'abord ; au-delà de `max`, le reste est résumé en une
 * seule notification.
 * @returns {{ individuelles: object[], resumees: object[], cles: string[] }}
 */
export function opportunitesANotifier(vertes, dejaVues, { maintenant = Date.now(), max = NOTIFICATIONS_MAX_PAR_PASSE } = {}) {
  const vue = (cle) => (dejaVues instanceof Set ? dejaVues.has(cle) : Boolean(dejaVues && Object.hasOwn(dejaVues, cle)));
  const nouvelles = (vertes ?? [])
    .filter((o) => etatVerdict(o?.verdict, maintenant).vert && !vue(cleDeNotification(o)))
    .sort((a, b) => (b.verdict?.pourcent ?? 0) - (a.verdict?.pourcent ?? 0));
  return { individuelles: nouvelles.slice(0, max), resumees: nouvelles.slice(max), cles: nouvelles.map(cleDeNotification) };
}

const HEURE = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Le contenu d'une notification : un titre court, la phrase utile, une
 * étiquette (`tag`) propre à l'opportunité — deux onglets ouverts qui la
 * notifieraient en même temps n'en montrent qu'une — et `silent` : jamais de son.
 */
export function contenuDeNotification(o) {
  const v = o.verdict ?? {};
  const t = Date.parse(o.commenceTime ?? '');
  const quand = o.exactKickoff && Number.isFinite(t) ? ` · coup d'envoi ${HEURE.format(new Date(t))}` : '';
  return {
    titre: `Value ${Number.isFinite(v.pourcent) ? pourcentSigne(v.pourcent) : ''} : ${o.pari}`.replace(/\s+:/, ' :'),
    // Étape 23 : une value dans une case rouge de la carte « où parier » le dit (la notification part quand même).
    corps: `${o.home} – ${o.away}${v.bookmakerTitle ? ` · ${v.bookmakerTitle} ${Number(v.cote).toFixed(2)}` : ''}${quand}${o.carte?.couleur === 'rouge' ? ' · case rouge de la carte « où parier »' : ''}`,
    tag: `cotemaster-opportunite|${cleDeNotification(o)}`,
    silent: true
  };
}

/** La notification qui résume ce qui dépasse le maximum d'une vérification. */
export function contenuDuResume(resumees) {
  const n = resumees.length;
  return {
    titre: `${n} autre${n > 1 ? 's' : ''} value${n > 1 ? 's' : ''} verte${n > 1 ? 's' : ''}`,
    corps: 'Page Matchs › Opportunités du jour.',
    tag: 'cotemaster-opportunites-resume',
    silent: true
  };
}

/** La mémoire des notifications, nettoyée : clé → date, sans ce qui a plus de MEMOIRE_NOTIFICATIONS_JOURS. */
export function memoireNettoyee(memoire, maintenant = Date.now()) {
  const limite = maintenant - MEMOIRE_NOTIFICATIONS_JOURS * 86_400_000;
  const propre = {};
  for (const [cle, quand] of Object.entries(memoire && typeof memoire === 'object' ? memoire : {})) {
    const t = Date.parse(quand);
    if (Number.isFinite(t) && t >= limite) propre[cle] = quand;
  }
  return propre;
}
