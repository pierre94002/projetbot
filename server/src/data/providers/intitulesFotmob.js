/**
 * -----------------------------------------------------------------------
 * Intitulés de compétition RENOMMÉS chez FotMob (liste du jour).
 * -----------------------------------------------------------------------
 * La table des compétitions suivies (FOTMOB_LEAGUES, fotMobProvider.js)
 * reconnaît une compétition de la liste du jour (`matches?date=`) par son
 * intitulé « pays|nom ». FotMob publie peu à peu certaines compétitions sous
 * de nouveaux identifiants (en 1000001…) et de nouveaux intitulés, y compris
 * dans les listes des journées passées (relevé du 21/11/2026, mêmes en-têtes
 * que l'appli, 15 journées et toutes les compétitions suivies) :
 *  - la première division turque, depuis le 08/11/2026 au soir :
 *    « TUR|Super Lig » est devenu « TUR|Süper Lig » (identifiant 71) ;
 *  - les phases finales, écrites « Compétition - Phase - Tour » :
 *    « ARG|Liga Profesional - Clausura - 8th Finals » (depuis le 20/11),
 *    « MEX|Liga MX - Apertura - Quarter-finals » (à partir du 25/11) ; la
 *    table attend « … Clausura Playoff », « … Apertura Playoff ».
 * Rien de cela n'était reconnu : le calendrier et les résultats — donc le
 * règlement des pronostics — s'arrêtaient pour la Turquie au 08/11 à
 * 18 h 52 (UTC) ; Beşiktaş – Gençlerbirliği (3-0, ce soir-là) restait « à
 * venir », ses 12 pronostics en attente ; Vélez Sarsfield – Belgrano (2-2,
 * 20/11) n'était pas enregistré ; les cotes gratuites autour du coup d'envoi
 * et les absents de ces matchs n'étaient plus relevés. Le magasin, lui,
 * recevait encore les rencontres par l'étape des omissions, qui lit la page
 * de la compétition par son identifiant (fotMobFixtureGaps.js).
 *
 * fotMobProvider.js est GELÉ pendant l'essai n° 3 (liste gelée) : sa table
 * garde les anciens intitulés, et la traduction se fait ICI, de l'intitulé
 * publié vers celui de la table, juste avant la comparaison. Des
 * correspondances NOMMÉES, compétition par compétition — jamais une
 * comparaison sans accents ni une règle commune à toutes, qui pourraient
 * réunir deux compétitions distinctes. Un intitulé que la table écarte
 * (féminines, jeunes, réserves : EXCLUDED_LEAGUE_KEY, par leagueKeyMatches)
 * n'est JAMAIS traduit : traduit, il perdrait le mot qui l'écarte
 * (« … - Clausura - U23 Final » deviendrait « … Clausura Playoff »).
 * Seul ce qui a été VU est traduit (une phase régulière en
 * « Compétition - Phase », jamais vue, ne l'est pas).
 *
 * APRÈS L'ESSAI : porter les nouveaux intitulés dans FOTMOB_LEAGUES, puis
 * retirer leurs lignes d'ici (traduits vers un intitulé que la table
 * n'aurait plus, ils cesseraient d'être reconnus).
 *
 * Lu par : fotMobCalendar.js (calendrier et résultats), jobs/oddsWatch.js
 * (cotes gratuites), enregistreurs/absents.js (absents annoncés) et
 * core/ai/autoMatchAiTrigger.js (le match FotMob d'un match coté). PAS ENCORE
 * par jobs/liveWatch.js (le direct), que l'étape 46 modifie : à faire après
 * sa mise en service. Ni par les fichiers gelés (fotMobRefresh.js : l'étape
 * « nouvelles » et matchEntry de refreshFromFotMob ; enregistreurs/communs.js ;
 * db/dataHealth.js, qui signale ces rencontres du magasin).
 * -----------------------------------------------------------------------
 */

import { leagueKeyMatches } from './fotMobProvider.js';

const JOUR_MS = 86_400_000;
const nfc = (texte) => String(texte ?? '').normalize('NFC');
const jourUtc = (t) => new Date(t).toISOString().slice(0, 10);

/**
 * fotmob : l'intitulé publié — un texte exact, ou le motif d'UNE compétition
 * dont chaque tour est publié à part ; intitule : celui que la table
 * reconnaît — un texte, ou une fonction des groupes du motif ; league : la
 * compétition suivie (clé de FOTMOB_LEAGUES) ; depuis : la première journée
 * (UTC) que le renommage a fait, ou ferait, manquer au calendrier.
 */
export const RENOMMAGES = Object.freeze(
  [
    { fotmob: 'TUR|Süper Lig', intitule: 'TUR|Super Lig', league: 'Turkey Super League', depuis: '2026-11-08' },
    {
      fotmob: /^ARG\|Liga Profesional - (Apertura|Clausura) - [^|]+$/,
      intitule: (phase) => `ARG|Liga Profesional ${phase} Playoff`,
      league: 'Primera División - Argentina',
      depuis: '2026-11-20'
    },
    {
      fotmob: /^MEX\|Liga MX - (Apertura|Clausura) - [^|]+$/,
      intitule: (phase) => `MEX|Liga MX ${phase} Playoff`,
      league: 'Liga MX',
      depuis: '2026-11-25'
    }
  ].map((r) => Object.freeze({ ...r, fotmob: typeof r.fotmob === 'string' ? nfc(r.fotmob) : r.fotmob }))
);

/** L'intitulé tel que la table des compétitions l'attend ; tout autre intitulé est rendu tel quel. */
export function intituleDeLaTable(leagueKey) {
  if (typeof leagueKey !== 'string') return leagueKey;
  const cle = nfc(leagueKey);
  // Écarté par la table (féminines, jeunes, réserves) : rendu tel quel, la comparaison l'écartera encore.
  if (!leagueKeyMatches(/[\s\S]/, cle)) return leagueKey;
  for (const r of RENOMMAGES) {
    if (typeof r.fotmob === 'string') {
      if (cle === r.fotmob) return r.intitule;
      continue;
    }
    const trouve = r.fotmob.exec(cle);
    if (trouve) return r.intitule(...trouve.slice(1));
  }
  return leagueKey;
}

/** Un renommage plus ancien n'est plus rattrapé : la passe normale (7 jours, 60 après une absence) l'a couvert. */
export const RATTRAPAGE_MAX_JOURS = 60;

/**
 * Journées à relire EN PLUS, pour rattraper ce qu'un renommage a fait
 * manquer au calendrier : de la première journée manquée à la veille de
 * `debut` (la première journée que la passe relit de toute façon), sur
 * RATTRAPAGE_MAX_JOURS au plus avant `aujourdHui`. `suivies` : les
 * compétitions que la passe relève (noms de FOTMOB_LEAGUES), null pour
 * toutes. Rend une Map journée -> [compétitions], vide s'il n'y a rien à
 * rattraper.
 */
export function journeesARattraper(debut, aujourdHui, suivies = null) {
  const out = new Map();
  const finJour = Date.parse(`${aujourdHui}T12:00:00Z`);
  if (typeof debut !== 'string' || !Number.isFinite(finJour) || !Number.isFinite(Date.parse(`${debut}T12:00:00Z`))) return out;
  const plancher = jourUtc(finJour - RATTRAPAGE_MAX_JOURS * JOUR_MS);
  for (const { league, depuis } of RENOMMAGES) {
    if (suivies && !suivies.includes(league)) continue;
    if (!(depuis < debut) || depuis < plancher) continue;
    for (let t = Date.parse(`${depuis}T12:00:00Z`); jourUtc(t) < debut; t += JOUR_MS) {
      const jour = jourUtc(t);
      out.set(jour, [...(out.get(jour) ?? []), league]);
    }
  }
  return out;
}
