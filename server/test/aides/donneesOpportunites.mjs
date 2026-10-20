/**
 * Les réponses du serveur que la page « Opportunités du jour » reçoit, FABRIQUÉES à la main (étape 8 du
 * plan) — ce n'est PAS un fichier de test. Servies par un `fetch` remplacé : ni réseau, ni base. Le jour de
 * référence est celui des écrans de l'étape 6 (6 octobre 2026, 10 h, heure locale).
 */
import { MAINTENANT, iso } from './donneesEcransParis.mjs';

export { MAINTENANT, iso };
const MIN = 60_000;
const H = 3_600_000;
const JOUR = 86_400_000;
const LIMITES = { min: 2, max: 25, coteMax: 5 };

/** La fraîcheur d'une cote telle que le serveur la donne (fraicheurCote), relevée `il` y a. */
export function fraicheur(releveAt, coupDEnvoi, { etat = 'fraiche', code = 'fraiche', raison = 'Relevée il y a 10 min (délai : 3 h).' } = {}) {
  return { etat, code, raison, ageMinutes: 10, releveAt, coupDEnvoi, heureSure: true, composAnnonceesA: null, limiteMinutes: 180, reglage: { maxAgeMinutes: 180, avantCompos: true }, evalueeLe: iso(0) };
}

const verdict = (issue, etat, extra = {}) => ({
  issue,
  libelle: null,
  etat,
  vert: etat === 'value',
  raison: `Raison du serveur : ${etat}.`,
  pourcent: null,
  cote: null,
  coteNette: null,
  bookmaker: null,
  bookmakerTitle: null,
  coteJuste: null,
  probabilite: null,
  releveAt: null,
  origineReleve: 'archive',
  fraicheur: null,
  exclusion: null,
  retenue: null,
  mise: null,
  juges: { palier: 'Pinnacle', livres: ['Pinnacle'], cles: ['pinnacle'] },
  offreJuge: null,
  limites: LIMITES,
  ...extra
});

const ligne = (base) => ({
  homeId: null,
  awayId: null,
  exactKickoff: true,
  oddsSource: 'odds-api',
  probabiliteMarche: null,
  bookmakersMarche: 0,
  ecartPoints: null,
  meilleureCote: null,
  mouvement: null,
  chute: false,
  compo: null,
  confiance: null,
  avecOffre: true,
  ...base
});

const compoFotMob = (minutes) => ({
  source: 'FotMob',
  fetchedAt: iso(3 * H + 20 * MIN - minutes * MIN),
  minutesBeforeKickoff: minutes,
  home: { startXI: [{ name: 'Ars Gardien' }], unavailable: [] },
  away: { startXI: [{ name: 'Che Gardien' }], unavailable: [] }
});

/**
 * Six paris, un par cas que la page doit savoir dire :
 *   Arsenal–Chelsea  Arsenal gagne : LA value (+6,4 % chez Unibet, fraîche), cote juste en chute de 12 %, compo officielle
 *   Leeds–Everton    Match nul : au-dessus du seuil mais pas retenu (le moteur garde « Leeds gagne »)
 *   Real–Betis       Real Madrid gagne : à rafraîchir (relevée il y a 4 h)
 *   Lyon–Nice        Lyon gagne : juge et partie (Betsson a fixé la cote juste), dernière alignée
 *   Fulham–Brentford Brentford gagne : cote trop haute (7,40)
 *   Milan–Inter      Plus de 2,5 buts : une chute de 8 % sans cote chez vos bookmakers
 */
export function opportunites({ sansVosCotes = false } = {}) {
  const ko = (decalage) => iso(decalage);
  const lignes = [
    ligne({
      cle: 'odds-arsenal-chelsea|home',
      matchId: 'odds-arsenal-chelsea',
      league: 'Premier League - England',
      home: 'Arsenal',
      away: 'Chelsea',
      homeId: 'fotmob-9825',
      awayId: 'fotmob-8455',
      commenceTime: ko(3 * H + 20 * MIN),
      marche: 'home',
      groupe: 'Résultat',
      libelleMarche: 'Victoire à domicile',
      pari: 'Arsenal gagne',
      probabilite: 0.387,
      coteJuste: 2.58,
      meilleureCote: { cote: 2.75, bookmaker: 'Unibet (NL)', cle: 'unibet_nl', releveAt: iso(-10 * MIN), origine: 'archive', fraicheur: fraicheur(iso(-10 * MIN), ko(3 * H + 20 * MIN)) },
      verdict: verdict('home', 'value', {
        libelle: 'Arsenal gagne',
        pourcent: 6.4,
        cote: 2.75,
        coteNette: 2.75,
        bookmaker: 'unibet_nl',
        bookmakerTitle: 'Unibet (NL)',
        coteJuste: 2.58,
        probabilite: 0.387,
        releveAt: iso(-10 * MIN),
        fraicheur: fraicheur(iso(-10 * MIN), ko(3 * H + 20 * MIN)),
        raison: 'Value : Unibet (NL) paie 2.75 pour une cote juste de 2.58, soit un avantage de +6,4 %, au-dessus du seuil de 2 % du moteur.'
      }),
      mouvement: { dropPct: 12, deltaPoints: 4.2, fromProb: 0.35, toProb: 0.392, agreeing: 3, bookmakersCount: 3, exchangeOnly: false, fromAt: iso(-26 * H), toAt: iso(-40 * MIN), chute: true },
      chute: true,
      compo: compoFotMob(45)
    }),
    ligne({
      cle: 'odds-leeds-everton|draw',
      matchId: 'odds-leeds-everton',
      league: 'Premier League - England',
      home: 'Leeds',
      away: 'Everton',
      homeId: 'fotmob-8463',
      awayId: 'fotmob-8668',
      commenceTime: ko(JOUR + 2 * H),
      marche: 'draw',
      groupe: 'Résultat',
      libelleMarche: 'Match nul',
      pari: 'Match nul',
      probabilite: 0.28,
      coteJuste: 3.57,
      verdict: verdict('draw', 'value-secondaire', {
        pourcent: 3.0,
        cote: 3.68,
        coteNette: 3.68,
        bookmaker: 'unibet_nl',
        bookmakerTitle: 'Unibet (NL)',
        releveAt: iso(-10 * MIN),
        retenue: 'home',
        fraicheur: fraicheur(iso(-10 * MIN), ko(JOUR + 2 * H)),
        raison: "Avantage de +3,0 % chez Unibet (NL), au-dessus du seuil de 2 % : le moteur ne retient qu'un pari par match, « Leeds gagne », qui paie davantage."
      }),
      mouvement: { dropPct: -2.1, deltaPoints: -0.6, fromProb: 0.29, toProb: 0.284, agreeing: 2, bookmakersCount: 2, exchangeOnly: false, fromAt: iso(-26 * H), toAt: iso(-40 * MIN), chute: false },
      compo: null
    }),
    ligne({
      cle: 'odds-real-betis|home',
      matchId: 'odds-real-betis',
      league: 'La Liga - Spain',
      home: 'Real Madrid',
      away: 'Betis',
      homeId: 'fotmob-8633',
      awayId: 'fotmob-8603',
      commenceTime: ko(2 * JOUR),
      marche: 'home',
      groupe: 'Résultat',
      libelleMarche: 'Victoire à domicile',
      pari: 'Real Madrid gagne',
      probabilite: 0.62,
      coteJuste: 1.61,
      verdict: verdict('home', 'a-rafraichir', {
        pourcent: 5.4,
        cote: 1.7,
        coteNette: 1.7,
        bookmaker: 'williamhill',
        bookmakerTitle: 'William Hill',
        releveAt: iso(-4 * H),
        fraicheur: fraicheur(iso(-4 * H), ko(2 * JOUR), { etat: 'a-rafraichir', code: 'trop-vieille', raison: 'Relevée il y a 4 h, au-delà du délai de 3 h : à relever de nouveau avant de parier.' }),
        raison: 'Cote à rafraîchir.'
      }),
      compo: { source: 'magasin' }
    }),
    ligne({
      cle: 'odds-lyon-nice|home',
      matchId: 'odds-lyon-nice',
      league: 'Ligue 1 - France',
      home: 'Lyon',
      away: 'Nice',
      homeId: 'fotmob-9748',
      awayId: 'fotmob-9831',
      commenceTime: ko(JOUR + 3 * H),
      marche: 'home',
      groupe: 'Résultat',
      libelleMarche: 'Victoire à domicile',
      pari: 'Lyon gagne',
      probabilite: 0.426,
      coteJuste: 2.35,
      verdict: verdict('home', 'juge', {
        pourcent: 4.3,
        cote: 2.45,
        coteNette: 2.45,
        bookmaker: 'betsson',
        bookmakerTitle: 'Betsson',
        releveAt: iso(-10 * MIN),
        fraicheur: fraicheur(iso(-10 * MIN), ko(JOUR + 3 * H)),
        juges: { palier: 'palier 3', livres: ['William Hill', 'Betsson', 'Unibet (NL)'], cles: ['williamhill', 'betsson', 'unibet_nl'] },
        raison: "Betsson a servi à fixer la cote juste de ce match (palier 3 : William Hill, Betsson, Unibet (NL)) : sa cote, c'est la cote juste plus sa marge — juge et partie, jamais une value."
      }),
      compo: { source: 'magasin' }
    }),
    ligne({
      cle: 'odds-fulham-brentford|away',
      matchId: 'odds-fulham-brentford',
      league: 'Premier League - England',
      home: 'Fulham',
      away: 'Brentford',
      homeId: 'fotmob-9879',
      awayId: 'fotmob-9937',
      commenceTime: ko(JOUR + 5 * H),
      marche: 'away',
      groupe: 'Résultat',
      libelleMarche: 'Victoire à l’extérieur',
      pari: 'Brentford gagne',
      probabilite: 0.14,
      coteJuste: 7.14,
      verdict: verdict('away', 'cote-haute', {
        pourcent: 3.8,
        cote: 7.4,
        coteNette: 7.4,
        bookmaker: 'williamhill',
        bookmakerTitle: 'William Hill',
        releveAt: iso(-10 * MIN),
        fraicheur: fraicheur(iso(-10 * MIN), ko(JOUR + 5 * H)),
        offreJuge: null,
        raison: 'Avantage de +3,8 % chez William Hill, mais la cote 7.40 dépasse la cote maximale de 5 : le moteur ne recommande pas ce pari.'
      })
    }),
    ligne({
      cle: 'cal-milan-inter|over25',
      matchId: 'cal-milan-inter',
      league: 'Serie A - Italy',
      home: 'Milan',
      away: 'Inter',
      homeId: 'fotmob-8564',
      awayId: 'fotmob-8636',
      commenceTime: '2026-10-08T12:00:00Z',
      exactKickoff: false,
      oddsSource: 'gratuit',
      marche: 'over25',
      groupe: 'Buts',
      libelleMarche: 'Plus de 2,5 buts',
      pari: 'Plus de 2,5 buts',
      probabilite: 0.55,
      coteJuste: 1.82,
      probabiliteMarche: 0.57,
      verdict: null,
      avecOffre: false,
      mouvement: { dropPct: 8, deltaPoints: 4, fromProb: 0.52, toProb: 0.565, agreeing: 2, bookmakersCount: 2, exchangeOnly: false, fromAt: iso(-30 * H), toAt: iso(-2 * H), chute: true },
      chute: true,
      compo: null
    })
  ];
  const visibles = sansVosCotes ? lignes.filter((l) => !l.avecOffre) : lignes;
  return {
    status: 'ready',
    progress: null,
    error: null,
    data: {
      generatedAt: iso(-25 * MIN),
      durationMs: 80_000,
      evalueeLe: iso(0),
      days: 7,
      markets: [
        { key: 'home', group: 'Résultat', label: 'Victoire à domicile' },
        { key: 'draw', group: 'Résultat', label: 'Match nul' },
        { key: 'away', group: 'Résultat', label: 'Victoire à l’extérieur' },
        { key: 'over25', group: 'Buts', label: 'Plus de 2,5 buts' }
      ],
      freshness: { reglage: { maxAgeMinutes: 180, avantCompos: true }, evalueeLe: iso(0) },
      releve: { fichier: 'C:\\Users\\PC\\CoteMaster\\bac-a-sable\\code\\server\\data\\fixtures\\odds\\odds-snapshot.json', releveAt: sansVosCotes ? new Date(2026, 8, 21, 18, 35).toISOString() : iso(-10 * MIN) },
      lignes: visibles,
      resume: {
        matchs: 6,
        matchsAvecVosCotes: sansVosCotes ? 0 : 5,
        matchsSansVosCotes: sansVosCotes ? 6 : 1,
        lignes: visibles.length,
        vertes: sansVosCotes ? 0 : 1,
        aRafraichir: sansVosCotes ? 0 : 1,
        chutes: sansVosCotes ? 1 : 2,
        chutesSansVosCotes: 1
      },
      failures: []
    }
  };
}

/** Le calcul du Repérage qui tourne encore (premier calcul, rien à montrer). */
export const enCalcul = () => ({ status: 'computing', progress: { done: 120, total: 370 }, error: null, data: null });
