import { saveSampleMatches } from '../data/repositories/fixturesRepository.js';

const SAMPLE_TEAMS = [
  'Paris SG', 'Marseille', 'Monaco', 'Lille', 'Lens', 'Rennes', 'Lyon',
  'Bordeaux', 'Metz', 'Auxerre', 'Lorient', 'Saint-Etienne',
  'Real Madrid', 'Man City', 'Bayern Munich', 'Arsenal', 'Inter Milan'
];

function randomFloat(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function pickOpponent(teams, excludeIndex) {
  let index;
  do {
    index = Math.floor(Math.random() * teams.length);
  } while (index === excludeIndex);
  return index;
}

function generateMatch(index) {
  const homeIndex = Math.floor(Math.random() * SAMPLE_TEAMS.length);
  const awayIndex = pickOpponent(SAMPLE_TEAMS, homeIndex);

  return {
    matchId: `sim_${1000 + index}`,
    home: SAMPLE_TEAMS[homeIndex],
    away: SAMPLE_TEAMS[awayIndex],
    xgHomeBrut: randomFloat(0.5, 3.5),
    xgAwayBrut: randomFloat(0.3, 2.8),
    providerSource: Math.random() > 0.5 ? 'Opta' : 'StatsBomb',
    facteursContextuels: {
      avantageTerrain: 1.15,
      fatigueHome: randomFloat(0.9, 1.1),
      fatigueAway: randomFloat(0.9, 1.1)
    },
    cotesMarche: {
      cote1: randomFloat(1.3, 4.5),
      coteN: randomFloat(3.0, 4.5),
      cote2: randomFloat(1.8, 6.5),
      coteOver25: randomFloat(1.6, 2.4),
      coteBTTS: randomFloat(1.7, 2.2)
    }
  };
}

/** Génère un jeu de matchs fictifs pour tester le moteur sans dépendre d'une source de données externe. */
export function generateSampleMatches(count = 60) {
  const matches = Array.from({ length: count }, (_, i) => generateMatch(i + 1));
  saveSampleMatches(matches);
  return matches;
}
