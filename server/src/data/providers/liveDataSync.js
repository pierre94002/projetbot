import { getSportOddsRaw } from './oddsApiClient.js';
import { getCompetitionsRaw } from './footballDataClient.js';
import { saveOddsMatches, saveCompetitions } from '../repositories/fixturesRepository.js';
import { TRACKED_SPORT_KEYS } from './oddsApiCompetitions.js';
import { bilanDuReleve, noterRelevePayant } from '../repositories/relevePayantRepository.js';

/**
 * Championnats suivis par CôteMaster côté The Odds API : la liste vit dans
 * oddsApiCompetitions.js (constantes seulement, depuis l'étape 7 du plan),
 * reprise ici pour les appelants d'avant.
 *
 * Chaque entrée consomme AU PLUS un crédit PAR ACTUALISATION (1 région × 1
 * marché ; plan "Starter" : 500/mois) — 37 clés depuis le 21/09/2026, donc au
 * plus 37 crédits à chaque clic sur "Actualiser". Aucun rafraîchissement
 * automatique ailleurs dans l'appli (cf. oddsApiClient.js) : c'est toujours
 * une action explicite. Le conseil de relevé (data/conseilReleve.js) dit
 * quand un relevé vaut le coup ; il n'en lance jamais.
 */
export { TRACKED_SPORT_KEYS };

/**
 * Récupère les cotes en direct pour chaque championnat suivi et remplace
 * l'instantané local (server/data/fixtures/odds/odds-snapshot.json). Ne se
 * déclenche jamais automatiquement : uniquement sur action explicite de
 * l'utilisateur, pour préserver le quota mensuel. Une compétition en échec
 * (coupe entre deux tours, clé hors saison) n'annule pas les autres : on
 * sauvegarde ce qui a répondu et on remonte la liste des échecs.
 *
 * Étape 7 du plan : le bilan du relevé (crédits restants et consommés, coût
 * de chaque requête) est gardé dans data/runtime/releve-payant.json — le
 * conseil de relevé dit ainsi les crédits restants s'ils sont connus. Ce
 * bilan ne fait jamais échouer le relevé.
 */
export async function refreshLiveOdds() {
  const allMatches = [];
  const sportsRefreshed = [];
  const failures = [];
  const reponses = [];
  let lastQuota = null;

  for (const sportKey of TRACKED_SPORT_KEYS) {
    try {
      const { matches, quota } = await getSportOddsRaw(sportKey);
      allMatches.push(...matches);
      sportsRefreshed.push(sportKey);
      lastQuota = quota ?? lastQuota;
      reponses.push({ sportKey, ok: true, matchs: matches.length, quota: quota ?? null });
    } catch (error) {
      failures.push({ sportKey, message: error.message });
      // Une réponse en erreur porte son quota (oddsApiClient.js) ; une panne réseau n'en a pas : coût inconnu.
      reponses.push({ sportKey, ok: false, matchs: 0, quota: error.quota ?? null, message: error.message });
    }
  }

  if (!sportsRefreshed.length) {
    throw new Error(`Aucune compétition n'a pu être rafraîchie : ${failures.map((f) => `${f.sportKey} (${f.message})`).join(' ; ')}`);
  }

  saveOddsMatches(allMatches);
  const bilan = bilanDuReleve({ at: new Date().toISOString(), reponses });
  noterRelevePayant(bilan);
  return { matchesFetched: allMatches.length, sportsRefreshed, failures, quota: lastQuota, cout: bilan.cout };
}

/** Récupère la liste des compétitions en direct et remplace l'instantané local. */
export async function refreshLiveCompetitions() {
  const competitions = await getCompetitionsRaw();
  saveCompetitions(competitions);
  return { competitionsFetched: competitions.length };
}
