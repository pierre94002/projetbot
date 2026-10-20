/**
 * Les réponses que la page d'un match à venir reçoit (étape 9 du plan) — ce n'est PAS un fichier de test.
 *
 * Deux sources, jamais mêlées sans le dire :
 *   - le VRAI serveur : `payloadsDuServeur()` lance test/aides/script-page-match.mjs dans une copie
 *     isolée (base d'essai, heure figée au 05/10/2026 12 h UTC, réseau coupé) et rend ce que ses routes
 *     répondent — la liste des matchs, l'analyse de chacun, les cotes relevées et leurs mouvements, les
 *     cotes saisies à la main, le conseil de relevé. Lancé UNE fois par processus de test.
 *   - ce que le serveur n'a pas sous la main (FotMob, le magasin de statistiques, l'avis de l'IA) :
 *     fabriqué ici, à la main, avec la forme que la page lit.
 * Servies à la page par un `fetch` remplacé : ni réseau, ni vraie base, ni data/runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR, MANIFESTE_ECHANTILLON, MAINTENANT_FIGE } from './isolement.mjs';

export const MAINTENANT = Date.parse(MAINTENANT_FIGE);
export const MIN = 60_000;
export const H = 3_600_000;
export const iso = (t) => new Date(t).toISOString();

let enCache = null;
/** Les réponses du vrai serveur, une fois (≈ 3 s). Lève si le script échoue : jamais de réponse inventée à la place. */
export function payloadsDuServeur() {
  if (enCache) return enCache;
  const copie = preparerCopie({});
  try {
    // L'application complète charge scripts/ (cf. opportunites.test.mjs).
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-page-match.mjs'), { args: ['payloads', MANIFESTE_ECHANTILLON], timeout: 300_000 });
    if (r.code !== 0 || !r.json) throw new Error(`script-page-match.mjs : code ${r.code}\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    if (r.reseau) throw new Error('script-page-match.mjs : un appel réseau a été tenté');
    enCache = r.json;
    return enCache;
  } finally {
    copie.nettoyer();
  }
}

// ------------------------------------------------------- ce que FotMob et le magasin donneraient

const joueur = (n, name, position, extra = {}) => ({ id: `fotmob-${n}`, name, number: n, position, x: null, y: null, countryCode: 'ENG', countryName: 'Angleterre', stats: { rating: 7.1 }, ...extra });
const POSTES = ['Goalkeeper', 'Defender', 'Defender', 'Defender', 'Defender', 'Midfielder', 'Midfielder', 'Midfielder', 'Forward', 'Forward', 'Forward'];
const onze = (prefixe, base) => POSTES.map((poste, i) => joueur(base + i, `${prefixe} Joueur ${i + 1}`, poste));
const equipe = (team, teamId, prefixe, base, extra = {}) => ({
  team,
  teamId,
  formation: '4-3-3',
  coach: null,
  startXI: onze(prefixe, base),
  bench: [joueur(base + 20, `${prefixe} Remplaçant`, 'Midfielder')],
  usualStartersMissing: [],
  unavailable: [],
  ...extra
});

/** La composition de Man City – Liverpool, lue `minutes` minutes avant le coup d'envoi (18 h 30 UTC). */
export function compositionPubliee(minutes) {
  return {
    source: 'FotMob',
    fotmobMatchId: '4400001',
    fetchedAt: iso(Date.parse('2026-10-05T18:30:00Z') - minutes * MIN),
    minutesBeforeKickoff: minutes,
    home: equipe('Man City', 'fotmob-8456', 'City', 100),
    away: equipe('Liverpool', 'fotmob-8650', 'Liverpool', 200, { unavailable: [{ id: 'fotmob-299', name: 'Liverpool Blessé', reason: 'Blessure au genou', expectedReturn: null }] })
  };
}

/** La dernière composition alignée de chaque équipe (magasin FotMob), faute de composition publiée. */
export function derniereComposition() {
  const dernier = (home, away, hg, ag) => ({ date: '2026-10-03', league: 'Premier League - England', home, away, homeGoals: hg, awayGoals: ag });
  return {
    source: 'magasin',
    home: { ...equipe('Man City', 'fotmob-8456', 'City', 100), lastMatch: dernier('Man City', 'Brighton', 2, 0) },
    away: { ...equipe('Liverpool', 'fotmob-8650', 'Liverpool', 200), lastMatch: dernier('Liverpool', 'Everton', 1, 1) }
  };
}

/** La page FotMob du match (GET /api/match-stats/preview) : cadre, arbitre, météo, composition. */
export function apercu({ lineups = null, lastLineups = derniereComposition() } = {}) {
  return {
    available: true,
    fotmobMatchId: '4400001',
    kickoff: '2026-10-05T18:30:00.000Z',
    meta: {
      stadium: 'Etihad Stadium',
      city: 'Manchester',
      capacity: 53400,
      surface: 'grass',
      temperature: 14,
      weather: 'Cloudy',
      windSpeed: 12,
      round: '8',
      referee: { name: 'Arbitre Essai', country: 'ENG', yellowCardsPerMatch: 3.6, foulsPerMatch: 22.4, leagueYellowCardsPerMatch: 3.9, leagueFoulsPerMatch: 23.1 }
    },
    lineups,
    lastLineups: lineups ? null : lastLineups
  };
}

/** Les moyennes par match de chaque équipe (GET /api/match-stats/team-averages) : les clés de TEAM_STAT_GROUPS. */
export function moyennes(nom) {
  const base = { 'Ball Possession': 58, expected_goals: 1.84, 'Total Shots': 15.2, 'Shots on Goal': 5.6, touches_opponent_box: 31, big_chances: 2.4, 'Passes accurate': 512, 'Yellow Cards': 1.4, 'Corner Kicks': 6.1 };
  return { name: nom, stats: { homeAverages: base, awayAverages: { ...base, 'Ball Possession': 52, expected_goals: 1.5 }, averages: base } };
}

/** Les cinq derniers matchs d'une équipe (GET /api/match-stats/team). */
export function forme(nom) {
  const adversaires = ['Brighton', 'Everton', 'Arsenal', 'Wolves', 'Fulham'];
  return {
    matches: adversaires.map((adv, i) => ({ matchId: `${nom}-${i}`.replace(/\s+/g, '-'), date: `2026-09-${String(28 - i * 4).padStart(2, '0')}`, league: 'Premier League - England', home: i % 2 === 0, teamName: nom, opponent: adv, score: i % 2 ? '1-1' : '2-0' }))
  };
}

/** Les absents et le changement d'entraîneur (GET /api/team-stats/team-news). */
export const actualites = () => ({ home: { teamId: 'fotmob-8456', longTermAbsences: [], coachChange: null }, away: { teamId: 'fotmob-8650', longTermAbsences: [{ id: 'fotmob-299', name: 'Liverpool Blessé', type: 'blessure', expectedReturn: null }], coachChange: null } });

/** L'analyse de l'IA d'avant-match de Man City – Liverpool, avec un avis sur trois des pronostics du moteur. */
export function avisIA(analyse) {
  const pronostics = analyse?.marketPredictions ?? [];
  const avis = (p, verdict, texte) => ({ market: p.market, pick: p.predictedLabel, probability: Math.round(100 / p.predictedOdds), verdict, confidence: 'moyenne', explanation: texte, reasoning: texte });
  const choisis = [pronostics[0], pronostics[1], pronostics[2]].filter(Boolean);
  return {
    matchId: 'essai-a',
    homeName: 'Man City',
    awayName: 'Liverpool',
    league: 'EPL',
    timing: 'veille',
    analysedAt: iso(MAINTENANT - 2 * H),
    lineupSnapshot: derniereComposition(),
    analysis: {
      summary: "Man City reçoit un Liverpool amoindri : le moteur et le marché s'accordent sur un léger avantage des locaux.",
      keyFactors: [{ factor: 'Forme récente', observation: 'Man City sur une série de trois victoires.', evidence: '3 victoires sur les 3 derniers matchs.' }],
      lineupImpact: 'Aucune composition publiée : la dernière alignée sert de base.',
      marketViews: choisis.map((p, i) => avis(p, ['confirme', 'nuance', 'confirme'][i], `${Math.round(100 / p.predictedOdds)} % : le moteur voit ce pari comme le plus probable de son marché.`)),
      alignmentWithModel: 'Alignée sur le moteur.',
      caveats: 'Aucune composition officielle au moment de la lecture.'
    },
    engineSnapshot: { marketPredictions: pronostics }
  };
}

/** Ce que renvoie une route que la page appelle sans que son contenu compte pour le test. */
export const neutre = (u) => {
  if (/\/api\/match-ai-analysis\/status/.test(u)) return { connected: false };
  if (/\/api\/match-notes\//.test(u)) return { text: '', updatedAt: null };
  if (/\/api\/match-stats\/team-ids/.test(u)) return { ids: {} };
  return null;
};
