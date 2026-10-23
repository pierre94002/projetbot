/**
 * Le décor des essais du BULLETIN DU JOUR et du BILAN DE LA SEMAINE (étape 42) — ce n'est PAS un fichier de test.
 * Chargé par test/aides/script-bulletins-*.mjs, exécutés dans une copie isolée (isolement.mjs : réseau coupé, heure figée au
 * 05/10/2026 12 h UTC, base d'essai).
 *
 *   - des ENTRÉES fabriquées à la main (celles que rendent les lecteurs de bulletinFiches.js) : une journée avec ses paris, ses
 *     favoris, ses compositions, son contrôle ; une semaine avec ses pronostics, ses paris, son IA — pour les essais du service,
 *     qui n'ont pas besoin de relire la base ;
 *   - un FAUX CLAUDE : la réponse du CLI est fabriquée (claudeCodeClient.__testing.simulerClaude, refusé hors d'une copie d'essai),
 *     tout le reste de callClaudeCode — contrôles, JOURNAL — tourne pour de vrai. AUCUN vrai appel : le test refuse de
 *     s'installer si un jeton Claude est présent ou si l'exécutable configuré existe. Le faux Claude écrit son texte à partir des
 *     nombres de la fiche qu'il reçoit (jamais d'un autre) ; ses « fautes » sont programmées une par une.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { usageSimule, coutSimule } from './claudeSimule.mjs';

export const importeur = (serveur) => (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

// ------------------------------------------------------------------ les entrées du jour
const ligneDuRepérage = (home, away, league, heureUtc, pari, cote, bookmakerTitle, probabilite, coteJuste, pourcent, vert, extra = {}) => ({
  cle: `${home}-${away}|${pari}`,
  matchId: `essai-${home}-${away}`,
  league,
  home,
  away,
  commenceTime: `2026-10-05T${heureUtc}:00.000Z`,
  exactKickoff: true,
  pari,
  probabilite,
  coteJuste,
  verdict: { etat: vert ? 'value' : 'sans-value', vert, pourcent, cote, bookmakerTitle, fraicheur: { etat: 'fraiche', ageMinutes: 12 } },
  chute: false,
  mouvement: null,
  carte: { couleur: 'gris', mot: 'Pas prouvé' },
  ...extra
});

/**
 * Une journée du 05/10/2026 (jour de Paris) : trois paris repérés (deux value vertes et une chute de cote), deux matchs de vos
 * favoris, une composition publiée, un contrôle orange. `maintenant` : l'instant de la lecture.
 */
export function entreesDuJour({ maintenant = Date.parse('2026-10-05T04:10:00Z'), opportunites = 'pret', favoris = true, vide = false, jour = '2026-10-05' } = {}) {
  // `jour` : un autre jour de Paris — toutes les dates de la fiche glissent du même nombre de jours.
  const decalage = Math.round((Date.parse(`${jour}T12:00:00Z`) - Date.parse('2026-10-05T12:00:00Z')) / 86_400_000);
  const dec = (iso) => new Date(Date.parse(iso) + decalage * 86_400_000).toISOString();
  const lignes = vide
    ? []
    : [
        ligneDuRepérage('Arsenal', 'Chelsea', 'EPL', '19:00', 'Arsenal gagne', 2.2, 'Unibet', 0.48, 2.08, 6.1, true),
        ligneDuRepérage('Lyon', 'Nice', 'Ligue 1', '19:45', 'Plus de 2,5 buts', 1.95, 'Betclic', 0.55, 1.82, 7.1, true, { carte: { couleur: 'vert', mot: 'Prouvé' } }),
        ligneDuRepérage('Roma', 'Lazio', 'Serie A', '18:45', 'Match nul', 3.4, 'Winamax', 0.27, 3.7, 1.2, false, { chute: true, mouvement: { dropPct: 8.4 } })
      ].map((l) => ({ ...l, commenceTime: dec(l.commenceTime) }));
  const matchs = vide
    ? []
    : [
        { cle: `EPL|Arsenal|Chelsea|${jour}`, home: 'Arsenal', away: 'Chelsea', league: 'EPL', commenceTime: dec('2026-10-05T19:00:00.000Z'), heureSure: true, favori: favoris ? { championnat: false, equipes: ['Arsenal'] } : null, compo: null },
        { cle: `Ligue 1|Lyon|Nice|${jour}`, home: 'Lyon', away: 'Nice', league: 'Ligue 1', commenceTime: dec('2026-10-05T19:45:00.000Z'), heureSure: true, favori: favoris ? { championnat: true, equipes: [] } : null, compo: { source: 'FotMob', minutesBeforeKickoff: 45, home: { startXI: [], unavailable: [{ name: 'Tolisso' }] }, away: { startXI: [], unavailable: [] } } },
        { cle: `Serie A|Roma|Lazio|${jour}`, home: 'Roma', away: 'Lazio', league: 'Serie A', commenceTime: dec('2026-10-05T18:45:00.000Z'), heureSure: true, favori: null, compo: { source: 'magasin' } }
      ];
  const etat = opportunites;
  return {
    maintenant,
    jour,
    opportunites:
      etat === 'pret'
        ? { etat: 'pret', generatedAt: dec('2026-10-05T03:58:00.000Z'), carte: { mois: '2026-10', aJour: true }, resume: { vertes: 3 }, erreur: null, lignes, enRecalcul: false }
        : { etat, generatedAt: null, carte: null, resume: {}, erreur: etat === 'erreur' ? 'le Repérage est tombé' : null, lignes: [], enRecalcul: etat === 'en-calcul' },
    matchs,
    favoris: { equipes: favoris ? 2 : 0, ligues: favoris ? 1 : 0, illisible: false },
    controle: { etat: 'pret', feu: 'orange', le: dec('2026-10-05T01:10:00.000Z'), compte: { vert: 27, orange: 2, rouge: 1, nonFait: 0, erreur: 0 }, enEchecTotal: 3, enEchec: [{ libelle: 'Score différent de football-data', statut: 'rouge', total: 2 }, { libelle: 'Zéros « non relevé »', statut: 'orange', total: 14 }] },
    nombreDeMatchsDuJour: matchs.length,
    problemes: []
  };
}

// ------------------------------------------------------------------ les entrées de la semaine
const pred = (id, status, marketId, market, league, settledAt) => ({ id, status, marketId, market, league, settledAt, homeName: 'A', awayName: 'B' });
const pari = (id, status, stake, odds, league, pick, settledAt, p = null) => ({
  id,
  status,
  stake,
  odds,
  createdAt: '2026-09-28T10:00:00.000Z',
  settledAt,
  legs: [{ matchId: `m${id}`, homeName: 'Lyon', awayName: 'Nice', league, market: 'Résultat', marketId: 'result', pick, odds, status, ...(p ? { probabiliteMoteur: p } : {}) }],
  bookmaker: 'winamax_fr',
  bookmakerTitle: 'Winamax (FR)'
});
const revue = (market, marketId, aiVerdict, aiWasRight, outcome) => ({ market, marketId, pick: `pronostic ${market}`, aiVerdict, aiConfidence: 'moyenne', aiWasRight, outcome, minOdds: 1.2 });

/**
 * Une semaine, par défaut du 28/09 au 04/10/2026 (la semaine écoulée à la date du 05/10/2026). `lundi` : le lundi d'une autre semaine —
 * toutes les dates de la fiche (règlements, matchs, revues) glissent du même nombre de jours.
 */
export function entreesDeLaSemaine({ maintenant = Date.parse('2026-10-05T07:10:00Z'), vide = false, lundi = '2026-09-28' } = {}) {
  const JOUR_MS = 86_400_000;
  const decalage = Math.round((Date.parse(`${lundi}T12:00:00Z`) - Date.parse('2026-09-28T12:00:00Z')) / JOUR_MS);
  const dec = (iso) => (iso ? new Date(Date.parse(iso) + decalage * JOUR_MS).toISOString() : iso);
  const jours = Array.from({ length: 7 }, (_, k) => new Date(Date.parse(`${lundi}T12:00:00Z`) + k * JOUR_MS).toISOString().slice(0, 10));
  const semaine = { cle: jours[0], du: jours[0], au: jours[6], jours };
  const pronostics = vide
    ? []
    : [
        pred('1', 'correct', 'result', 'Résultat', 'EPL', dec('2026-09-29T22:00:00.000Z')),
        pred('2', 'incorrect', 'result', 'Résultat', 'EPL', dec('2026-09-30T22:00:00.000Z')),
        pred('3', 'correct', 'totalGoals', 'Total buts', 'Ligue 1', dec('2026-10-01T22:00:00.000Z')),
        pred('4', 'correct', 'totalGoals', 'Total buts', 'EPL', dec('2026-10-03T22:00:00.000Z')),
        pred('5', 'incorrect', 'bothTeamsScore', 'Les 2 équipes marquent', 'Serie A', dec('2026-10-04T10:00:00.000Z')),
        // Réglé la veille de la semaine à 22 h (Paris) : écarté.
        pred('6', 'correct', 'result', 'Résultat', 'EPL', dec('2026-09-27T20:00:00.000Z')),
        pred('7', 'pending', 'result', 'Résultat', 'EPL', null)
      ];
  const paris = vide
    ? []
    : [
        pari('1', 'won', 10, 2.1, 'Ligue 1', 'Lyon gagne', dec('2026-09-30T21:00:00.000Z'), 0.5),
        pari('2', 'lost', 5, 1.9, 'EPL', 'Plus de 2.5 buts', dec('2026-10-01T21:00:00.000Z'), 0.55),
        pari('3', 'lost', 8, 2.4, 'EPL', 'Chelsea gagne', dec('2026-10-03T21:00:00.000Z')),
        pari('4', 'pending', 5, 2, 'EPL', 'Match nul', null)
      ];
  const analyses = vide
    ? []
    : [
        {
          homeName: 'Lyon',
          awayName: 'Nice',
          league: 'Ligue 1',
          commenceTime: dec('2026-09-30T19:00:00.000Z'),
          postMatchReview: { createdAt: dec('2026-09-30T23:00:00.000Z'), marketReviews: [revue('Résultat', 'result', 'confirme', true, 'juste'), revue('Total buts', 'totalGoals', 'confirme', false, 'faux'), revue('Résultat', 'result', 'nuance', null, 'juste')] }
        }
      ];
  return {
    maintenant,
    jour: '2026-10-05',
    semaine,
    pronostics,
    paris,
    cloture: { disponible: true, mesures: vide ? [] : [{ id: '1#0', valueAtClosePct: 3.2 }, { id: '2#0', valueAtClosePct: -1.5 }], manques: [] },
    analyses,
    carnet: { etat: 'lu', carnet: { calculeLe: '2026-10-05T03:10:00.000Z', depuis: { jour: '2026-09-30' }, analyses: { reglees: 240 }, total: { bilan: { aiVerdicts: 716, aiRight: 394 } }, types: [{ marketType: 'result', label: 'Résultat', bilan: { aiVerdicts: 300, aiRight: 170 } }, { marketType: 'totalGoals', label: 'Total buts', bilan: { aiVerdicts: 200, aiRight: 110 } }] } },
    carte: { mois: '2026-10', aJour: true, resume: { cases: 949, vertes: 1, rouges: 19, grises: 929 }, index: new Map([['EPL|result', { league: 'EPL', colonne: 'result', couleur: 'vert', matchs: 412 }]]) },
    problemes: []
  };
}

// ------------------------------------------------------------------ le faux Claude
/**
 * Installe le faux Claude. `programme` : la liste des issues des appels suivants, dans l'ordre — 'ok' (par défaut quand elle est vide),
 * 'panne' (ClaudeCodeIndisponible), 'erreur' (is_error), 'sans-sortie' (schéma non respecté), 'forme' (sortie sans sections),
 * 'chiffres' (un texte qui cite un nombre absent de la fiche), 'lettres' (un nombre écrit en lettres absent de la fiche).
 * Chaque appel reçu est noté : type, mode, modèle, effort, longueurs, texte de la fiche, issue. Rend { appels, programmer, arreter }.
 */
export async function installerFauxClaude(serveur, { tokens = () => 4_000 } = {}) {
  const imp = importeur(serveur);
  const { env } = await imp('config/env.js');
  if (env.claudeCode.oauthToken) throw new Error('Un jeton Claude est présent dans l’environnement du test : refus.');
  if (env.claudeCode.bin && fs.existsSync(env.claudeCode.bin)) throw new Error(`L'exécutable Claude configuré existe (${env.claudeCode.bin}) : refus.`);
  const cc = await imp('core/ai/claudeCodeClient.js');
  const garde = await imp('core/ai/gardeDesChiffres.js');
  const appels = [];
  const programme = [];
  cc.__testing.simulerClaude(async ({ args, userMessage, model, effort, appel }) => {
    const i = appels.length;
    const issue = programme.shift() ?? 'ok';
    const total = tokens(appel, i);
    const schema = JSON.parse(args[args.indexOf('--json-schema') + 1]);
    const genre = schema.properties?.sections?.items?.properties?.cle?.enum?.includes('opportunites') ? 'bulletin' : 'bilan';
    const nombres = garde.nombresEnChiffres(userMessage.split('\n\nRAPPEL')[0]).map((n) => n.texte);
    appels.push({ i, type: appel?.type ?? null, detail: appel?.detail ?? null, mode: appel?.mode ?? null, taille: appel?.taille ?? null, model, effort, issue, genre, total: issue === 'panne' ? null : total, userMessage, aRappel: userMessage.includes('RAPPEL'), tools: args[args.indexOf('--tools') + 1] });
    if (issue === 'panne') throw new cc.ClaudeCodeIndisponible("Claude Code (headless) n'a pas répondu : panne simulée");
    const usage = usageSimule(total);
    const cout = coutSimule(total);
    if (issue === 'erreur') return { is_error: true, result: 'quota simulé épuisé', usage, total_cost_usd: cout };
    if (issue === 'sans-sortie') return { is_error: false, usage, total_cost_usd: cout };
    const n = (k) => nombres[k] ?? '0';
    const cles = genre === 'bulletin' ? ['opportunites', 'favoris'] : ['marche', 'perdu'];
    const titre = genre === 'bulletin' ? `Bulletin : ${n(0)} pari(s) repéré(s)` : `Bilan : ${n(0)} pronostic(s) réglé(s)`;
    let sortie = {
      titre,
      resume: `Résumé de l'IA qui reprend ${n(1)} et ${n(2)}, tels quels.`,
      sections: cles.map((cle, k) => ({ cle, titre: `Section ${k + 1}`, texte: `Phrase de l'IA qui cite ${n(3 + k)} puis ${n(5 + k)}, des nombres de la fiche.` })),
      ...(genre === 'bulletin' ? { aRetenir: 'Une value est une estimation, pas une promesse.' } : {})
    };
    if (issue === 'forme') sortie = { titre, resume: 'x', sections: [] };
    if (issue === 'chiffres') sortie.sections[0].texte = `Phrase de l'IA qui invente une cote de 4321,7 et un score de ${n(3)}.`;
    if (issue === 'lettres') sortie.resume = 'Il y a quarante-sept paris, cinq autres matchs et trois chutes.';
    return { is_error: false, structured_output: sortie, usage, total_cost_usd: cout };
  });
  return { cc, appels, programmer: (...issues) => programme.push(...issues), arreter: () => cc.__testing.simulerClaude(null) };
}

/** Lit le journal des appels Claude d'un jour (le fichier écrit par le serveur), sans passer par le code testé. */
export function lireLeJournal(serveur, jour, suffixe = '') {
  const f = path.join(serveur, 'data', 'runtime', 'journal-claude', `${jour}${suffixe}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

/** Le compteur du plafond d'un jour (le fichier écrit par le serveur). */
export function lireLeCompteur(serveur) {
  const f = path.join(serveur, 'data', 'runtime', 'auto-ai-analysis-status.json');
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}
