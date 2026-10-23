/**
 * marketKnowledge.controller.js — CONNAÎTRE LE MARCHÉ vu de l'interface (étape 31 du plan, 22/10/2026 : la page
 * « Bookmakers »). Ce que l'étape 22 calcule chaque nuit (data/marketKnowledge.js) et range dans les tables
 * market_knowledge_runs et market_knowledge : la justesse de chaque bookmaker, qui bouge le premier, ses biais, sa
 * marge, et le meilleur moment pour parier, par championnat.
 * -----------------------------------------------------------------------
 * GET /api/market-knowledge[?championnat=…]   LECTURE SEULE, jamais un calcul, jamais une écriture, jamais un appel
 *                        payant : le dernier calcul FINI et, pour UN championnat (par défaut « * » : tous réunis), ses
 *                        lignes de justesse, de vitesse, de biais, de marge et de moments. Pourquoi un seul
 *                        championnat à la fois : toutes les lignes du calcul pèsent 5,6 Mo, celles d'un championnat
 *                        0,2 à 0,3 Mo — la page change de championnat en relisant.
 *
 * La réponse a toujours la même forme (la page garde ses tableaux) :
 *   etat           'jamais' (aucun calcul fini), 'pret', 'championnat-inconnu' (le calcul existe, pas ce championnat)
 *                  ou 'pas-a-jour' (un calcul d'une autre forme : refait à la prochaine nuit) ;
 *   calcul         { id, finiLe, version, ou, empreinte } du dernier calcul fini, ou null ;
 *   portee         le championnat lu (« * » : tous) ; nom : son nom en clair ;
 *   championnats   [{ portee, nom, horsAppli, lignes }] — ceux que le calcul a mesurés (« fd:EC » : un championnat de
 *                  football-data que le magasin ne suit pas, nommé en clair) ;
 *   livres         les bookmakers et bourses mesurés (titre, type, commission, prix jouable ou non) ;
 *   resume         le résumé lisible du calcul (le plus juste, le premier, les biais, les marges, le meilleur moment
 *                  de chaque championnat, le 23/09 retrouvé) ;
 *   lignes         { justesse, vitesse, biais, marges, moments } — celles du championnat lu ;
 *   bilan          ce que le calcul a lu (cotes, matchs) et comment (tirages, minimum de matchs) ;
 *   regles         les mots : les moments, les biais, le minimum de matchs.
 * -----------------------------------------------------------------------
 */

import { openDb, resolveDbPath } from '../../data/db/matchStatsDb.js';
import { dernierCalcul, lireConnaissanceDuMarche, MOMENTS, CATEGORIES_DE_BIAIS, MIN_MATCHS, VERSION_CONNAISSANCE } from '../../data/marketKnowledge.js';
import { nomDuCode } from '../../data/providers/footballDataHistory.js';
import { ApiError, optionalStringParam } from '../middlewares/errorHandler.js';

/** D'où viennent les chiffres : dit tel quel, avec le vrai fournisseur de chaque morceau. */
export const PROVENANCE = Object.freeze({
  cotes: 'Cotes archivées dans la base SQLite de ce PC (table odds_quotes) : football-data.co.uk (fichiers CSV gardés sur ce PC, depuis 2000), ESPN, 365Scores, Kalshi et Smarkets (relevés gratuits, depuis le 04/10/2026) et The Odds API (vos bookmakers, relevés payants faits à la main).',
  resultats: 'Résultats à la 90e minute : le magasin FotMob de la base SQLite (table du jour J) et les scores de football-data.co.uk.',
  calcul: 'Calculé chaque nuit par l’actualisation (étape « connaitreMarche »), dans un processus à part ; rangé dans les tables market_knowledge_runs et market_knowledge. Rien n’est calculé en ouvrant la page.',
  regle: 'Mesuré seulement : le moteur ne lit rien de cette page, aucun de ses chiffres n’en dépend.'
});

/** Les mots du calcul, pour l'écran : ce que veut dire chaque moment et chaque biais. */
export const REGLES = Object.freeze({
  moments: MOMENTS,
  biais: CATEGORIES_DE_BIAIS,
  minimumDeMatchs: MIN_MATCHS,
  version: VERSION_CONNAISSANCE,
  methode:
    'Chaque bookmaker est comparé aux autres sur les MÊMES matchs (un bookmaker absent d’un match n’avantage personne) : la marge de chaque cote est retirée par la méthode puissance, puis la probabilité juste est jugée face au résultat. Les bourses (Kalshi, Smarkets, Betfair Exchange) n’ont pas de marge mais une commission : leurs prix sont ramenés à 100 %.',
  juge: `Toute comparaison passe par le juge de la mesure (étape 16) : il tient compte du nombre de comparaisons essayées et refuse de conclure sous ${MIN_MATCHS} matchs.`
});

const PORTEE_TOUS = '*';
const PORTEE_REPRODUCTION = '23-09';

/** Le nom en clair d'un championnat : celui du magasin, ou, pour un championnat de football-data hors de l'appli (« fd:EC »), le sien. */
export function nomDuChampionnat(portee) {
  if (portee === PORTEE_TOUS) return 'Tous les championnats';
  if (typeof portee === 'string' && portee.startsWith('fd:')) return nomDuCode(portee.slice(3));
  return portee;
}

/** Les championnats que le calcul a mesurés (hors « * » et la ligne du 23/09), avec leur nombre de lignes. */
function championnatsDuCalcul(database, calcul) {
  if (!calcul) return [];
  return database
    .prepare('SELECT portee, COUNT(*) AS lignes FROM market_knowledge WHERE calcul = ? AND portee NOT IN (?, ?) GROUP BY portee')
    .all(calcul, PORTEE_TOUS, PORTEE_REPRODUCTION)
    .map((r) => ({ portee: r.portee, nom: nomDuChampionnat(r.portee), horsAppli: r.portee.startsWith('fd:'), lignes: r.lignes }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

const SANS_LIGNES = () => ({ justesse: [], vitesse: [], biais: [], marges: [], moments: [] });

/** Le bilan du calcul, réduit à ce que l'écran dit (les livres et le détail des durées restent au serveur). */
function bilanPourLEcran(bilan) {
  if (!bilan) return null;
  const r = bilan.releves ?? {};
  return {
    options: { minMatchs: bilan.options?.minMatchs ?? MIN_MATCHS, tirages: bilan.options?.tirages ?? null },
    releves: {
      rencontres: r.rencontres ?? null,
      cotes: r.cotes ?? null,
      lignesDeCotes: r.lignesDeCotes ?? null,
      lignesFd: r.lignesFd ?? null,
      rencontresDuMagasin: r.rencontresDuMagasin ?? null,
      cotesRefusees: r.cotesRefusees ?? null
    },
    comptes: bilan.comptes ?? null,
    dureeMs: bilan.dureeMs ?? null
  };
}

/** La page, assemblée (pure à la base près : lit, n'écrit jamais). Exportée pour les tests. */
export function assemblerLaConnaissance({ database, championnat = PORTEE_TOUS }) {
  const commun = { regles: REGLES, provenance: PROVENANCE, portee: championnat, nom: nomDuChampionnat(championnat), base: resolveDbPath(), generatedAt: new Date().toISOString() };
  const calcul = dernierCalcul({ database });
  if (!calcul) {
    return { ...commun, etat: 'jamais', calcul: null, championnats: [], livres: [], resume: null, lignes: SANS_LIGNES(), bilan: null, aJour: false, versionAttendue: VERSION_CONNAISSANCE };
  }
  const championnats = championnatsDuCalcul(database, calcul.id);
  const connue = championnat === PORTEE_TOUS || championnats.some((c) => c.portee === championnat);
  const lu = connue ? lireConnaissanceDuMarche({ database, championnat }) : null;
  const aJour = calcul.version === VERSION_CONNAISSANCE;
  return {
    ...commun,
    etat: !connue ? 'championnat-inconnu' : aJour ? 'pret' : 'pas-a-jour',
    calcul: { id: calcul.id, finiLe: calcul.finiLe, version: calcul.version, ou: calcul.ou, empreinte: calcul.empreinte },
    championnats,
    livres: calcul.bilan?.livres ?? [],
    resume: calcul.resume ?? null,
    lignes: lu ? { justesse: lu.justesse, vitesse: lu.vitesse, biais: lu.biais, marges: lu.marges, moments: lu.moments } : SANS_LIGNES(),
    bilan: bilanPourLEcran(calcul.bilan),
    aJour,
    versionAttendue: VERSION_CONNAISSANCE
  };
}

export function getMarketKnowledge(req, res) {
  const championnat = optionalStringParam(req.query.championnat, 'championnat') ?? PORTEE_TOUS;
  // La demande est contrôlée AVANT d'ouvrir la base : une demande refusée ne lit rien.
  if (championnat.length > 120) throw new ApiError(400, 'Le paramètre "championnat" est trop long (120 caractères au plus).');
  if (championnat === PORTEE_REPRODUCTION) throw new ApiError(400, 'Le paramètre "championnat" ne désigne pas un championnat : « 23-09 » est la reproduction de la mesure du 23/09, dans le résumé.');
  res.json(assemblerLaConnaissance({ database: openDb(), championnat }));
}
