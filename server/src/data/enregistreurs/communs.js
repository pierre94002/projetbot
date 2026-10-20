/**
 * communs.js — ce que partagent les enregistreurs (étape E du plan, 05/10/2026).
 * -----------------------------------------------------------------------
 * Les ENREGISTREURS gardent ce qui se perd si on ne le note pas sur le
 * moment, sans un token Claude ni un appel payant :
 *   - absents     les joueurs indisponibles de chaque match à venir (48 h),
 *                 chaque jour (absents.js) ;
 *   - direct      l'état des matchs en cours, au plus toutes les 5 min
 *                 (jobs/liveWatch.js) ;
 *   - cotes-payantes  chaque cote relevée à la main chez The Odds API, avec
 *                 l'heure du relevé (cotesPayantes.js) ;
 *   - gel         les pronostics de marché du moteur, chaque nuit et à
 *                 chaque analyse automatique (gelPronostics.js).
 * Tout s'écrit dans la base, par le seul serveur, en petites tranches, jamais
 * pendant un import (file.js). L'état que lit Réglages : etat.js.
 * -----------------------------------------------------------------------
 */

import { FOTMOB_LEAGUES, leagueKeyMatches } from '../providers/fotMobProvider.js';

export const ENREGISTREURS = [
  {
    cle: 'absents',
    nom: 'Absents du jour',
    quoi: 'les joueurs indisponibles (blessés, suspendus, en sélection) de chaque match à venir sous 48 h, une fois par jour',
    fournisseur: 'FotMob — page de chaque match (la même lecture que les compositions)',
    tables: ['unavailable_reads', 'unavailable_daily']
  },
  {
    cle: 'direct',
    nom: 'Matchs en direct',
    quoi: 'score, minute, cartons rouges et statistiques du moment (xG compris quand FotMob les donne), au plus toutes les 5 min par match',
    fournisseur: 'FotMob — liste du jour (au plus une lecture par minute, partagée) et détail du match',
    tables: ['live_snapshots']
  },
  {
    cle: 'cotes-payantes',
    nom: 'Cotes payantes archivées',
    quoi: 'chaque cote de chaque relevé fait à la main (bookmaker, marché, issue, cote) avec l’heure du relevé',
    fournisseur: 'The Odds API — instantané data/fixtures/odds/odds-snapshot.json (relevé manuel)',
    tables: ['odds_events', 'odds_quotes (source odds-api)']
  },
  {
    cle: 'gel',
    nom: 'Pronostics du moteur gelés',
    quoi: 'le pronostic de chaque marché des matchs à venir : la première valeur, jamais réécrite, puis chaque version datée',
    fournisseur: 'Moteur CôteMaster — magasin FotMob et cotes du moment, sans repli payant',
    tables: ['engine_picks']
  }
];

export const CLES_ENREGISTREURS = ENREGISTREURS.map((e) => e.cle);

const MINUTE_MS = 60_000;
export const JOUR_MS = 86_400_000;

/** Jour civil à Paris : c'est lui qui décide « une fois par jour », comme pour l'actualisation. */
export const jourParis = (instant = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date(instant));

/** Le jour de Paris d'avant. */
export const veilleParis = (instant = Date.now()) => jourParis(new Date(Date.parse(`${jourParis(instant)}T12:00:00Z`) - JOUR_MS));

/**
 * Minuit (heure de Paris) du jour de Paris `jour`, en ISO UTC. Paris est à
 * UTC+1 ou UTC+2 : l'instant cherché est l'un des deux, celui où le jour de
 * Paris commence vraiment (juste aussi les jours de changement d'heure).
 */
export function minuitParis(jour) {
  const zero = Date.parse(`${jour}T00:00:00Z`);
  for (const heures of [2, 1]) {
    const t = zero - heures * 3_600_000;
    if (jourParis(t) === jour && jourParis(t - 1) !== jour) return new Date(t).toISOString();
  }
  return new Date(zero - 3_600_000).toISOString();
}

/** Jour UTC d'un instant (la date du magasin est celle du coup d'envoi en UTC). */
export const jourUtc = (instant) => new Date(instant).toISOString().slice(0, 10);

export const iso = (instant = Date.now()) => new Date(instant).toISOString();

const LIBELLES = Object.entries(FOTMOB_LEAGUES);
/** « ENG|Premier League » -> « EPL » : la compétition suivie, ou null (même règle qu'oddsWatch.js). */
export const libelleSuivi = (leagueKey) => LIBELLES.find(([, motif]) => leagueKeyMatches(motif, leagueKey))?.[0] ?? null;

/** Un identifiant de rencontre FotMob utilisable : jamais vide ni 0 (partagé par les inconnus). */
export const idRencontreValide = (id) => id !== null && id !== undefined && /^\d+$/.test(String(id)) && String(id) !== '0';

/** Nom comparable (sans accents, casse ni ponctuation) : la clé d'un joueur sans identifiant. */
export const nomCle = (nom) =>
  String(nom ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const pause = (ms) => new Promise((fin) => (ms > 0 ? setTimeout(fin, ms) : setImmediate(fin)));

export { MINUTE_MS };
