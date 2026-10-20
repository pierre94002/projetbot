/**
 * Une revue d'après-match FABRIQUÉE sur un match RÉEL de la base d'essai
 * (étape 43) — ce n'est PAS un fichier de test.
 *
 * `priorPour` rend l'analyse d'avant-match enregistrée (« prior ») d'un match :
 * l'avis, le moteur et les issues viennent de la revue de référence de l'étape 41
 * (fiche-ia-etape-41.json, Girona – Mallorca, 16 marchés), les équipes, la
 * compétition et le coup d'envoi de ceux du match choisi. Seuls les FAITS
 * changent d'un match à l'autre, et ils sont lus dans la base d'essai par les
 * vraies fonctions de l'appli : c'est ce que l'étape 43 fait varier.
 *
 * `MATCHS` : les matchs réels de test/fixtures/deroules-etape-43.json (événements
 * stockés, penalties de la carte des tirs, cadre) ; la même liste sert à figer
 * l'ancienne forme (revue-ancienne-etape-43.json) et à essayer la nouvelle.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(FIXTURES, nom), 'utf8'));

export const MATCHS = lire('deroules-etape-43.json');
const REFERENCE = lire('fiche-ia-etape-41.json').apres.entree;

export function priorPour(m) {
  return {
    matchId: `ref-${m.cle}`,
    homeName: m.home,
    awayName: m.away,
    league: m.league,
    commenceTime: `${m.date}T18:00:00.000Z`,
    timing: 'coup-d-envoi',
    analysedAt: `${m.date}T16:55:00.000Z`,
    createdAt: `${m.date}T16:55:00.000Z`,
    engineSnapshot: REFERENCE.engineSummary,
    analysis: REFERENCE.priorAnalysis
  };
}

export const resultatPour = (m) => ({ homeGoals: m.score.home, awayGoals: m.score.away, date: m.date, homeName: m.home });
