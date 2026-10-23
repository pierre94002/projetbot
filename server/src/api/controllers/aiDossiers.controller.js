/**
 * aiDossiers.controller.js — la MÉMOIRE DE L'IA vue de l'interface (étape 44 du plan, 23/10/2026).
 * -----------------------------------------------------------------------
 * GET /api/match-ai-analysis/dossiers?club=fotmob-9825   le dossier d'une équipe (par son IDENTIFIANT FotMob, jamais par
 *                                                         son nom) et celui de son championnat, avec le bloc que l'IA en
 *                                                         lirait (mots, tokens estimés).
 * GET /api/match-ai-analysis/dossiers?league=EPL          le dossier d'un championnat (la page « Bulletin » de l'étape 45).
 * GET /api/match-ai-analysis/dossiers/apercu?home=&away=&league=&matchId=
 *                                                         le texte que l'IA recevrait pour ce match (300 à 500 mots), sans
 *                                                         la composition du jour (l'analyse la lit au moment de partir).
 * LECTURE SEULE : data/runtime/ai-dossiers.json, écrit par l'actualisation (étape « dossiersIA »). Ne lance rien, n'écrit
 * rien, n'appelle jamais Claude. Pas encore calculé : 200 avec `dossier: null` (l'écran garde toute sa structure et le
 * dit). Illisible : 503, jamais pris pour vide.
 * -----------------------------------------------------------------------
 */

import { lireLesDossiers } from '../../data/repositories/aiDossiersRepository.js';
import { memoireDuMatch } from '../../data/aiDossiers.js';
import { ETATS_LECON, REGLES_LECONS, MOTS_POUR_IA, PROVENANCE_DOSSIERS, CARACTERES_PAR_TOKEN, texteDUneEquipePourIA, phrasesDuDossier, phrasesDuChampionnat } from '../../core/ai/aiMemory.js';
import { requireStringParam } from '../middlewares/errorHandler.js';

const CLUB = /^fotmob-\d+$/;

function communs(lu) {
  return {
    etat: lu.etat,
    calculeLe: lu.donnees?.calculeLe ?? null,
    bilan: lu.donnees?.bilan ?? null,
    regles: REGLES_LECONS,
    mots: MOTS_POUR_IA,
    caracteresParToken: CARACTERES_PAR_TOKEN,
    etats: ETATS_LECON,
    provenance: PROVENANCE_DOSSIERS,
    fichier: 'data/runtime/ai-dossiers.json'
  };
}

function illisible(res, lu) {
  res.status(503).json({ ...communs(lu), error: `Les dossiers de l’IA sont illisibles pour l’instant : ${String(lu.erreur ?? 'fichier illisible, rien n’est réécrit tant qu’il ne l’est pas').replace(/\.\s*$/, '')}.` });
}

export function getDossiers(req, res) {
  const club = typeof req.query.club === 'string' ? req.query.club.trim() : '';
  const league = typeof req.query.league === 'string' ? req.query.league.trim() : '';
  if (!club && !league) {
    res.status(400).json({ error: 'Il faut un club (son identifiant FotMob, « fotmob-… ») ou un championnat.' });
    return;
  }
  if (club && !CLUB.test(club)) {
    res.status(400).json({ error: `Identifiant de club illisible : « ${club} » — un dossier se lit par l’identifiant FotMob (« fotmob-… »), jamais par le nom.` });
    return;
  }
  const lu = lireLesDossiers();
  if (lu.etat === 'illisible') {
    illisible(res, lu);
    return;
  }
  const d = lu.donnees;
  const dossier = club ? d.equipes[club] ?? null : null;
  const ligue = league || dossier?.league || null;
  const championnat = ligue ? d.championnats[ligue] ?? null : null;
  res.json({
    ...communs(lu),
    club: club || null,
    dossier,
    phrases: phrasesDuDossier(dossier),
    texteIA: texteDUneEquipePourIA(dossier),
    championnat,
    phrasesChampionnat: phrasesDuChampionnat(championnat),
    league: ligue
  });
}

export function getApercu(req, res) {
  const home = requireStringParam(req.query.home, 'home');
  const away = requireStringParam(req.query.away, 'away');
  const league = typeof req.query.league === 'string' && req.query.league.trim() ? req.query.league.trim() : null;
  const matchId = typeof req.query.matchId === 'string' && req.query.matchId.trim() ? req.query.matchId.trim() : null;
  const lu = lireLesDossiers();
  if (lu.etat === 'illisible') {
    illisible(res, lu);
    return;
  }
  const memoire = memoireDuMatch({ matchId, home, away, league });
  res.json({ ...communs(lu), home, away, league, matchId, memoire, sansComposition: true });
}
