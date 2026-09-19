import { fetchFlashscoreMatches } from '../../data/providers/flashscoreClient.js';
import { curateFlashscoreTeams } from '../../data/providers/flashscoreEnrichment.js';
import { saveFlashscoreSnapshot, getFlashscoreSnapshotStatus } from '../../data/repositories/flashscoreSnapshotRepository.js';

export function getFlashscoreStatus(req, res) {
  res.json({ status: getFlashscoreSnapshotStatus() });
}

// Coût réel par appel (~0,01 $/résultat, ~250-300 matchs Football/jour, cf.
// flashscoreClient.js) — DÉCLENCHÉ UNIQUEMENT PAR CE ROUTE, à la main depuis
// Réglages > Données, jamais automatiquement ni depuis l'analyse IA. Le
// payload brut (~110 Mo/jour) n'est jamais écrit sur disque : curaté en table
// compacte par équipe avant sauvegarde (cf. flashscoreSnapshotRepository.js).
export async function postFlashscoreRefresh(req, res) {
  const { sport, days, historyFromYear, maxTotalChargeUsd } = req.body ?? {};
  const matches = await fetchFlashscoreMatches({ sport, days, historyFromYear, maxTotalChargeUsd });
  const teams = curateFlashscoreTeams(matches);
  const snapshot = saveFlashscoreSnapshot({ matchCount: matches.length, teams });
  res.status(201).json({ status: { fetchedAt: snapshot.fetchedAt, matchCount: snapshot.matchCount, teamCount: snapshot.teamCount } });
}
