/**
 * runner.js — LE REJEU du banc d'essai (étape 19 du plan, 13/10/2026).
 * -----------------------------------------------------------------------
 * Une seule passe CHRONOLOGIQUE, jour UTC par jour UTC, sur l'union des deux
 * sources (le magasin et les lignes football-data `lien = 0`) — dans une
 * journée, le magasin avant football-data, puis par clé. Pour chaque
 * rencontre : ses entrées « avant J » (entrees.js), ses prix d'avant le coup
 * d'envoi (prix.js), le MOTEUR TEL QUEL (analyzeMatch, réglages explicites,
 * coupe-circuit neutre), une ligne par marché (27), le règlement à la 90e
 * minute (settlementRules.js), les paris de la règle (simulateBets.js). En
 * FIN de journée seulement, les faits football-data du jour entrent dans
 * l'histoire et le repère courant de chaque championnat avance : un match ne
 * voit jamais son jour. Les faits de la rencontre (buts, statistiques) ne
 * servent qu'à régler, APRÈS le calcul, dans une fonction à part.
 *
 * Marché par marché (conception §3.3, amendements A16-A19) :
 * | Marché (marketKey)            | Ce que rend le moteur                 | Face au marché                            | Face au repère courant                     | Mesures |
 * |-------------------------------|---------------------------------------|-------------------------------------------|--------------------------------------------|---------|
 * | result (1N2)                  | distributions.result, prediction      | removeMargin de la moyenne du jeu (Pinnacle face à la moyenne) ; clôture en témoin | fréquences 1N2 avant J | perte log, Brier, RPS, % de justes, calibration (FIABILITE) |
 * | totalGoals 0,5 … 3,5          | distributions.totalGoals[ligne]       | 2,5 seulement (moyenne d'avant-match)     | part de +X avant J                         | perte log, Brier ; pronostic retenu : % de justes |
 * | bothTeamsScore                | distributions.bothTeamsScore          | aucun                                     | part « les deux marquent »                 | idem |
 * | teamGoals:home|away           | distributions.teamGoals               | aucun                                     | part de +X de l'équipe                     | idem |
 * | resultAndTotal 1,5 / 2,5 / 3,5 | distributions.resultAndTotal (aligné) | aucun                                     | produit 1N2 × +X                           | idem |
 * | scoreExact                    | grilleDesScores (81 cases)            | aucun                                     | grille de Dixon-Coles aux buts moyens ; « 1-1 partout » | perte log (9-0 : hors grille, PROBA_MIN), % exact, top 3, calibration (FIABILITE_SCORE) |
 * | corners, tirs, tirs cadrés    | statExpectations + loiDesComptes      | aucun                                     | binomiale négative à la moyenne du championnat | perte log du compte, pronostic retenu : % de justes, calibration |
 * | cartons                       | — (étape 33 : ni marché, ni règlement)                                                                                     |
 *
 * Mémoire : aucune ligne gardée (surLigne reçoit chaque ligne, pour un
 * export) ; des sommes et des Float32Array par case (resume.js) ; les faits
 * football-data en mémoire une fois par rejeu (quand une période demandée a
 * la source football-data). La main est rendue toutes les ~25 ms
 * (creerPauses) : dans le serveur ET dans le script (sans elle, le battement
 * du verrou se tait et le verrou est perdu au bout de 10 minutes).
 * Aucun import de providers/ ; aucune base ouverte ici (`database` vient de
 * l'appelant) ; aucun hasard (le seul est celui, à graine, du juge).
 * -----------------------------------------------------------------------
 */

import { analyzeMatch } from '../core/engine/oddsEngine.js';
import { lireReglagesDuMoteur } from '../core/engine/engineConfig.js';
import { etatDuMoteur, numeroDeVersion } from '../core/engine/engineVersions.js';
import { fairFromBookmakers, fairFromAllValid } from '../core/engine/valueFinder.js';
import { removeMargin } from '../core/market/marginRemoval.js';
import { grilleDesScores } from '../core/engine/scorePrediction.js';
import { probabilitesLigne } from '../sports/football/statMarkets.js';
import { getSport } from '../sports/index.js';
import { deriveActualOutcome } from '../core/settlement/settlementRules.js';
import { creerPauses } from '../utils/travailCooperatif.js';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { perteLog, brier, rps, PROBA_MIN, ajouterACalibration } from './metrics.js';
import {
  VERSION_BANC, FORMAT_LIGNES, PERIODES, BORNES_DES_TRANCHES, JEUX_DE_PRIX, SANS_COTE, MARCHES_DU_BANC, FAMILLES_DU_BANC, PERIODES_PAR_DEFAUT, PRIX_PAR_DEFAUT,
  trancheDuResume, sourceDeLaPeriode, regleDuLien, estHuisClos, coupureDe, fenetresDuBanc, fenetresDuJour, cleDeLigne, DECISIONS_DE_PIERRE
} from './periodes.js';
import { prixFd, prixGratuits, prixVosBookmakers, lectureDirecte, plusMoins25, temoinsDeCloture } from './prix.js';
import {
  LecteurDuMagasin, MemoireFd, ReperesCourants, matchDuBanc, faitsDuMagasin, faitsDuFd, reglementDuMatch, contributionAuRepere, distributionsDuRepere,
  loiDuCompte, dispersionDe, cleDuMagasin, cleDuFd, ligueDuCode, TILT_NEUTRE, COLONNES_FD, ForcesCourantes
} from './entrees.js';
import { reglagesDuModeleDeButs } from '../core/engine/goalModel.js';
import { decisionsDesVariantes, parisDUnMatch } from './simulateBets.js';
import { Accumulateurs, resumer, nouvelleReproduction } from './resume.js';

/** Une option inconnue, une période ou un jeu de prix inconnu, des bornes illisibles : rien n'est rejoué. */
export class OptionsDuBancInvalides extends Error {}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
// `surAnalyse` (étape 27, pour l'oracle de la copie tronquée des tests) : reçoit chaque analyse rejouée, telle quelle
// ({ jeu, match, analyse, rencontre }) — le match porte les entrées du modèle de buts posées par le banc.
const OPTIONS = Object.freeze(['periodes', 'prix', 'marches', 'de', 'a', 'config', 'vues', 'coupure', 'database', 'rendreLaMain', 'journal', 'avancement', 'surLigne', 'surAnalyse', 'graine', 'tirages', 'minBlocs', 'reproduction', 'declaration']);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const copie = (v) => JSON.parse(JSON.stringify(v));

function joursAvant(iso, jours) {
  const t = new Date(`${iso}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - jours);
  return t.toISOString().slice(0, 10);
}
function moisSuivant(iso) {
  const [y, m] = iso.slice(0, 7).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** Les options, contrôlées : rien d'ignoré en silence. */
function lireOptions(options) {
  const inconnues = Object.keys(options).filter((k) => !OPTIONS.includes(k));
  if (inconnues.length) throw new OptionsDuBancInvalides(`Option inconnue : ${inconnues.join(', ')}.`);
  const periodes = options.periodes ?? PERIODES_PAR_DEFAUT;
  const tranches = [];
  for (const p of periodes) {
    if (p === 'P4') tranches.push('P4a', 'P4b');
    else if (['P1', 'P2', 'P3', 'P4a', 'P4b', 'P5'].includes(p)) tranches.push(p);
    else throw new OptionsDuBancInvalides(`Période inconnue : « ${String(p)} » (P1 à P5, P4a, P4b).`);
  }
  const prix = options.prix ?? PRIX_PAR_DEFAUT;
  for (const j of prix) if (!JEUX_DE_PRIX[j]) throw new OptionsDuBancInvalides(`Jeu de prix inconnu : « ${String(j)} » (${Object.keys(JEUX_DE_PRIX).join(', ')}).`);
  const marches = options.marches ?? FAMILLES_DU_BANC;
  for (const m of marches) if (!FAMILLES_DU_BANC.includes(m)) throw new OptionsDuBancInvalides(`Marché inconnu : « ${String(m)} » (${FAMILLES_DU_BANC.join(', ')}).`);
  for (const b of ['de', 'a']) if (options[b] != null && !JOUR.test(options[b])) throw new OptionsDuBancInvalides(`--${b} : un jour AAAA-MM-JJ est attendu (${String(options[b])}).`);
  if (options.coupure != null && options.coupure !== 'H-60') throw new OptionsDuBancInvalides('La coupure du rejeu est « H-60 » (une heure avant le coup d’envoi) ; « gel » ne sert qu’à apparier des pronostics gelés.');
  if (!options.database) throw new OptionsDuBancInvalides('La base est obligatoire : le banc n’en ouvre jamais.');
  const vues = options.vues ?? [];
  for (const f of vues) if (!JOUR.test(f?.de ?? '') || !JOUR.test(f?.a ?? '') || f.de > f.a) throw new OptionsDuBancInvalides('Une fenêtre vue sans jours AAAA-MM-JJ valides (de ≤ a).');
  // La déclaration de la candidate rejouée (étape 25 ou 27) : ses vues étiquettent les lignes « candidate:… » (portée de la candidate).
  const declaration = options.declaration ?? null;
  if (declaration !== null && (typeof declaration !== 'object' || (declaration.vues !== undefined && !Array.isArray(declaration.vues)))) throw new OptionsDuBancInvalides('La déclaration de la candidate : un objet { etape, version | id, vues: [...] }.');
  for (const f of declaration?.vues ?? []) if (!JOUR.test(f?.de ?? '') || !JOUR.test(f?.a ?? '') || f.de > f.a) throw new OptionsDuBancInvalides('Une fenêtre de la candidate sans jours AAAA-MM-JJ valides (de ≤ a).');
  return {
    tranches: [...new Set(tranches)],
    prix: [...new Set(prix)],
    marches,
    de: options.de ?? null,
    a: options.a ?? null,
    config: options.config ?? null,
    vues,
    declaration,
    database: options.database,
    rendreLaMain: options.rendreLaMain ?? null,
    journal: options.journal ?? null,
    avancement: options.avancement ?? null,
    surLigne: options.surLigne ?? null,
    surAnalyse: options.surAnalyse ?? null,
    graine: options.graine ?? 1,
    tirages: options.tirages ?? 1000,
    minBlocs: options.minBlocs ?? undefined,
    reproduction: options.reproduction ?? true
  };
}

/** L'identité du moteur rejoué : empreinte (réglages + code, engineVersions.js) et numéro de version, s'il existe. */
export function moteurDuRejeu(config) {
  const etat = etatDuMoteur({ reglages: { football: config } });
  return { empreinte: etat.empreinte, empreinteCode: etat.code.empreinte, empreinteReglages: etat.empreinteReglages, version: numeroDeVersion(config, 'football') };
}

// ------------------------------------------------------------ la référence (A16)

/**
 * La probabilité 1N2 que le moteur a prise, recalculée avec SES fonctions (valueFinder.js) : les paliers
 * (fairFromBookmakers), sinon la moyenne des lignes saines (fairFromAllValid, « moyenne-saine »), sinon la
 * moyenne transmise si elle est cohérente ; null sans cote utilisable. C'est aussi le `fair` du score exact.
 */
export function referenceDuBanc(marketOdds, config) {
  const dispo = [marketOdds?.odds1, marketOdds?.oddsDraw, marketOdds?.odds2].every(Number.isFinite);
  if (!dispo) return null;
  const livres = marketOdds.byBookmaker ?? [];
  const ref = fairFromBookmakers(livres, config);
  if (ref) return { probabilities: ref.probabilities, cles: ref.keys, palier: ref.basis };
  if (livres.length) {
    const repli = fairFromAllValid(livres);
    return repli ? { probabilities: repli.probabilities, cles: repli.keys, palier: 'moyenne-saine' } : null;
  }
  const net = removeMargin([marketOdds.odds1, marketOdds.oddsDraw, marketOdds.odds2]);
  return net.anomaly ? null : { probabilities: net.probabilities, cles: [], palier: 'moyenne-transmise' };
}

// ------------------------------------------------------------ les lignes

const STAT_IDS = Object.freeze({ corners: ['totalCorners', 'teamCorners'], shots: ['totalShots', 'teamShots'], shotsOnTarget: ['totalShotsOnTarget', 'teamShotsOnTarget'] });
const BUTS_MAX = 8;
/** L'indice d'un score dans la grille : home × 9 + away (BUTS_MAX = 8) ; null hors grille. */
export const indiceDuScore = (h, a) => (h <= BUTS_MAX && a <= BUTS_MAX ? h * (BUTS_MAX + 1) + a : null);
const PERTE_HORS_GRILLE = -Math.log(PROBA_MIN);

/** La perte log d'une loi de comptes { pmf, queue } sur le compte réalisé k (A18) : la queue au-delà de la grille. */
export function perteLogDesComptes(loi, k) {
  if (k < loi.pmf.length) return perteLog(loi.pmf, k);
  const q = Math.max(loi.queue, PROBA_MIN);
  return { valeur: -Math.log(q), ecretee: loi.queue < PROBA_MIN };
}

function mesurer(dist, issue, { avecBrier = true, avecRps = false } = {}) {
  const pl = perteLog(dist, issue);
  return { pl: pl.valeur, ecr: pl.ecretee, brier: avecBrier ? brier(dist, issue) : null, rps: avecRps ? rps(dist, issue) : null };
}

/**
 * Les lignes d'UNE analyse (un match × un jeu de prix) : une par marché demandé, compactes (cf. resume.js).
 * `m` : le match du banc (règlement, repère, témoins, ligne football-data) ; `ctx` : le rejeu.
 */
function construireLignes({ analyse, match, mo, jeu, m, ctx }) {
  const buts = m.reglement.buts;
  const h = buts?.home;
  const a = buts?.away;
  const nonReglableButs = m.reglement.nonReglableButs;
  const d = analyse.distributions;
  const mp = analyse.marketPredictions ?? [];
  const rd = m.repere;
  const marche1N2 = mo ? lectureDirecte(mo) : null;
  const marche25 = (jeu === 'fd-avant-match' || jeu === 'fd-cloture') && m.ligneFd ? plusMoins25(m.ligneFd, { jeu }) : null;
  const statsReglees = m.reglement.stats
    ? { home: Object.fromEntries(Object.entries(m.reglement.stats).map(([k, v]) => [k, v?.home ?? null])), away: Object.fromEntries(Object.entries(m.reglement.stats).map(([k, v]) => [k, v?.away ?? null])) }
    : null;
  const ref = referenceDuBanc(mo, ctx.config);
  if (ref && analyse.prediction?.source === 'cotes' && ctx.config.weights?.market === 1) {
    const ecart = Math.max(...['home', 'draw', 'away'].map((k, i) => Math.abs(d.result[k] - ref.probabilities[i])));
    if (ecart > 1e-6) ctx.bilan.referenceDifferente++;
  }
  let grille;
  const lignes = [];
  for (const spec of ctx.specs) {
    const l = { marketKey: spec.marketKey, famille: spec.famille, ligne: spec.ligne, ligneEchange: spec.ligne, mesure: spec.mesure, pl: null, ecr: false, brier: null, rps: null, plM: null, brierM: null, rpsM: null, ecrM: false, plR: null, brierR: null, rpsR: null, ecrR: false, sourceR: rd.source, plT: null, justes: null, top3: null, un11: null, calib: null, horsGrille: false, nonReglable: null, issue: null, distribution: null, choix: null, sourceMoteur: null, retenu: null, sansMoyenneDeLigue: match.leagueGoalAverages === null };
    const mesureButs = (dist, issueFn, { marche = null, repere = null, temoin = null, avecRps = false, retenu = null, choix = null, calib = null } = {}) => {
      l.distribution = dist;
      l.retenu = retenu;
      l.choix = choix;
      if (!buts) {
        l.nonReglable = nonReglableButs;
        return;
      }
      const issue = issueFn();
      l.issue = issue;
      const mm = mesurer(dist, issue, { avecRps });
      Object.assign(l, { pl: mm.pl, ecr: mm.ecr, brier: mm.brier, rps: mm.rps });
      if (marche) {
        const x = mesurer(marche, issue, { avecRps });
        Object.assign(l, { plM: x.pl, ecrM: x.ecr, brierM: x.brier, rpsM: x.rps });
      }
      if (repere) {
        const x = mesurer(repere, issue, { avecRps });
        Object.assign(l, { plR: x.pl, ecrR: x.ecr, brierR: x.brier, rpsR: x.rps });
      }
      if (temoin) l.plT = perteLog(temoin, issue).valeur;
      if (choix !== null) {
        l.justes = choix === issue;
        if (calib) l.calib = { ...calib, realise: l.justes };
      }
    };
    const binaire = (b) => (b ? { over: b.over, under: b.under } : null);
    switch (spec.famille) {
      case 'result': {
        l.sourceMoteur = analyse.prediction.source;
        l.reference = ref ? { distribution: { home: ref.probabilities[0], draw: ref.probabilities[1], away: ref.probabilities[2] }, cles: ref.cles, palier: ref.palier } : null;
        mesureButs(d.result, () => deriveActualOutcome({ market: 'Résultat' }, h, a), {
          marche: marche1N2?.distribution ?? null,
          repere: rd.dist.result,
          temoin: m.temoins?.result?.distribution ?? null,
          avecRps: true,
          choix: analyse.prediction.outcome,
          calib: { table: analyse.prediction.source, p: analyse.prediction.confidence }
        });
        break;
      }
      case 'totalGoals': {
        const L = spec.ligne;
        const retenu = mp.find((p) => p.marketId === 'totalGoals' && Number(p.params?.line) === L) ?? null;
        const dist = d.totalGoals[L];
        mesureButs(dist, () => deriveActualOutcome({ market: '', marketId: 'totalGoals', params: { line: L } }, h, a), {
          marche: L === 2.5 ? binaire(marche25) : null,
          repere: rd.dist.totalGoals[L],
          temoin: L === 2.5 ? binaire(m.temoins?.totalGoals25) : null,
          retenu,
          choix: retenu ? retenu.params.side : null,
          calib: retenu ? { table: 'dixiemes', p: dist[retenu.params.side] } : null
        });
        break;
      }
      case 'bothTeamsScore': {
        const retenu = mp.find((p) => p.marketId === 'bothTeamsScore') ?? null;
        const dist = d.bothTeamsScore;
        mesureButs(dist, () => deriveActualOutcome({ market: 'Les 2 équipes marquent' }, h, a), {
          repere: rd.dist.bothTeamsScore,
          retenu,
          choix: retenu ? retenu.params.outcome : null,
          calib: retenu ? { table: 'dixiemes', p: dist[retenu.params.outcome] } : null
        });
        break;
      }
      case 'teamGoals': {
        const L = spec.ligne;
        const e = spec.equipe;
        const retenu = mp.find((p) => p.marketId === 'teamGoals' && p.params?.team === e && Number(p.params?.line) === L) ?? null;
        const dist = d.teamGoals[e][L];
        mesureButs(dist, () => deriveActualOutcome({ market: '', marketId: 'teamGoals', params: { team: e, line: L } }, h, a), {
          repere: rd.dist.teamGoals[e][L],
          retenu,
          choix: retenu ? retenu.params.side : null,
          calib: retenu ? { table: 'dixiemes', p: dist[retenu.params.side] } : null
        });
        break;
      }
      case 'resultAndTotal': {
        const L = spec.ligne;
        const retenu = mp.find((p) => p.marketId === 'resultAndTotal' && Number(p.params?.line) === L) ?? null;
        const dist = d.resultAndTotal[L];
        mesureButs(dist, () => deriveActualOutcome({ market: 'Résultat + Total buts', predictedLabel: `Plus de ${L} buts` }, h, a), {
          repere: rd.dist.resultAndTotal[L],
          retenu,
          choix: retenu ? retenu.params.key : null,
          calib: retenu ? { table: 'dixiemes', p: dist[retenu.params.key] } : null
        });
        break;
      }
      case 'scoreExact': {
        const sp = analyse.scorePrediction;
        if (grille === undefined) {
          const unique = d.scoreExact;
          if (unique && sp) {
            // Étape 27 : le modèle de buts unique rend LA grille du score (81 cases telles quelles, distributions.scoreExact) ;
            // contrôle : la case la plus probable est bien le score annoncé.
            let max = 0;
            for (let k = 1; k < unique.cases.length; k++) if (unique.cases[k] > unique.cases[max]) max = k;
            grille = { source: sp.source, cases: unique.cases.map((p, k) => ({ home: Math.floor(k / (BUTS_MAX + 1)), away: k % (BUTS_MAX + 1), p })) };
            if (unique.cases[max] !== unique.cases[indiceDuScore(sp.mostLikely.home, sp.mostLikely.away)]) ctx.bilan.grilleDifferente++;
          } else {
            grille = sp ? grilleDesScores({ inputs: match.scoreInputs ?? null, fair: analyse.prediction.source === 'cotes' && ref ? ref.probabilities : null }) : null;
            if (grille && sp && (Number(grille.lambda.toFixed(2)) !== sp.expectedGoals.home || Number(grille.mu.toFixed(2)) !== sp.expectedGoals.away)) ctx.bilan.grilleDifferente++;
          }
        }
        if (!grille) {
          l.nonReglable = 'sansPronostic';
          break;
        }
        const dist = grille.cases.map((c) => c.p);
        l.distribution = dist;
        l.sourceMoteur = grille.source;
        const choix = indiceDuScore(sp.mostLikely.home, sp.mostLikely.away);
        l.choix = choix;
        if (!buts) {
          l.nonReglable = nonReglableButs;
          break;
        }
        const k = indiceDuScore(h, a);
        if (k === null) {
          // Un 9-0 : réglable, hors de la grille du moteur — perte log au plancher, compté, jamais écarté.
          Object.assign(l, { issue: `${h}-${a}`, horsGrille: true, pl: PERTE_HORS_GRILLE, ecr: true, justes: false, top3: false, un11: false, plR: PERTE_HORS_GRILLE, ecrR: true });
          l.calib = { table: `score:${sp.source}`, p: sp.mostLikely.probability, realise: false };
          ctx.bilan.horsGrille++;
          break;
        }
        l.issue = k;
        const pl = perteLog(dist, k);
        Object.assign(l, { pl: pl.valeur, ecr: pl.ecretee });
        const plR = perteLog(rd.dist.scoreExact, k);
        Object.assign(l, { plR: plR.valeur, ecrR: plR.ecretee });
        l.justes = choix === k;
        l.top3 = (sp.top ?? []).slice(0, 3).some((c) => c.home === h && c.away === a);
        l.un11 = h === 1 && a === 1;
        l.calib = { table: `score:${sp.source}`, p: sp.mostLikely.probability, realise: l.justes };
        break;
      }
      default: {
        // Corners, tirs, tirs cadrés : la loi complète du compte, réglée sur le compte réalisé.
        const kind = spec.stat;
        const portee = spec.portee;
        const attendu = analyse.statExpectations?.[kind]?.[portee];
        const invK = dispersionDe(kind, portee);
        const loi = fini(attendu) ? loiDuCompte(attendu, invK) : null;
        if (!loi) {
          // Pas de pronostic : moins de 6 relevés d'un côté (fenêtre incomplète).
          l.nonReglable = 'sansPronostic';
          break;
        }
        l.distribution = { pmf: loi.pmf, queue: loi.queue, attendu };
        const [idTotal, idEquipe] = STAT_IDS[kind];
        const retenu = portee === 'total' ? mp.find((p) => p.marketId === idTotal) ?? null : mp.find((p) => p.marketId === idEquipe && p.params?.team === portee) ?? null;
        l.retenu = retenu;
        l.choix = retenu ? retenu.params.side : null;
        l.ligneEchange = retenu ? Number(retenu.params.line) : null;
        const s = m.reglement.stats?.[kind] ?? null;
        if (!s) {
          l.nonReglable = m.reglement.nonReglableStats ?? 'statNonRelevee';
          break;
        }
        const compte = portee === 'total' ? s.home + s.away : s[portee];
        l.issue = compte;
        const pl = perteLogDesComptes(loi, compte);
        Object.assign(l, { pl: pl.valeur, ecr: pl.ecretee });
        const muR = rd.dist.stats?.[kind]?.[portee];
        if (fini(muR) && muR > 0) {
          const loiR = rd.loi(kind, portee, muR, invK);
          const plR = perteLogDesComptes(loiR, compte);
          Object.assign(l, { plR: plR.valeur, ecrR: plR.ecretee });
        }
        if (retenu) {
          const issueRetenu = deriveActualOutcome({ market: '', marketId: retenu.marketId, params: retenu.params }, h ?? 0, a ?? 0, statsReglees);
          l.justes = issueRetenu === retenu.params.side;
          const pr = probabilitesLigne(attendu, invK, Number(retenu.params.line));
          if (pr) l.calib = { table: 'dixiemes', p: pr[retenu.params.side], realise: l.justes };
        }
      }
    }
    lignes.push(l);
  }
  return lignes;
}

/** La ligne d'échange (FORMAT_LIGNES) que reçoit `surLigne` : de quoi apparier deux rejeux et les relire. */
function ligneDEchange({ l, prix, m, tranche }) {
  const dist = Array.isArray(l.distribution) ? l.distribution.map((p) => Number(p.toFixed(6))) : l.distribution;
  return {
    type: 'ligne',
    format: FORMAT_LIGNES,
    cle: cleDeLigne({ fixtureKey: m.rencontre.fixtureKey, marketKey: l.marketKey, ligne: l.ligneEchange, prix }),
    periode: tranche,
    source: m.source,
    prix,
    // L'heure du relevé que le banc a pris pour ce jeu (cotes gratuites, vos bookmakers) : pour reconnaître le relevé d'un gel.
    prixReleveAt: m.prix?.[prix]?.releveAt ?? null,
    vues: m.vues,
    huisClos: m.huisClos,
    coupe: m.rencontre.coupe,
    fixtureKey: m.rencontre.fixtureKey,
    matchKey: m.rencontre.matchKey ?? null,
    date: m.rencontre.date,
    league: m.rencontre.league,
    marketKey: l.marketKey,
    ligne: l.ligneEchange,
    moteur: { distribution: dist, choix: l.choix, p: l.calib?.p ?? null, source: l.sourceMoteur, reference: l.reference ?? null, retenu: l.retenu ? { label: l.retenu.predictedLabel, predictedOdds: l.retenu.predictedOdds } : null },
    marche: fini(l.plM) ? { perteLog: l.plM } : null,
    repere: fini(l.plR) ? { perteLog: l.plR, source: l.sourceR } : null,
    issue: l.issue,
    reglable: l.pl !== null,
    nonReglable: l.nonReglable,
    horsGrille: l.horsGrille,
    mesures: { moteur: { perteLog: l.pl, brier: l.brier, rps: l.rps, ecretee: l.ecr }, marche: fini(l.plM) ? { perteLog: l.plM, brier: l.brierM, rps: l.rpsM } : null, repere: fini(l.plR) ? { perteLog: l.plR, brier: l.brierR, rps: l.rpsR } : null, temoin: fini(l.plT) ? { perteLog: l.plT } : null }
  };
}

// ------------------------------------------------------------ un match

/** Les marchés dont la distribution dépend du jeu de prix : seuls eux se comparent d'un jeu à l'autre (matchs communs). */
const DEPENDENT_DES_PRIX = new Set(['result', 'resultAndTotal', 'scoreExact']);

async function rejouerUnMatch(ctx, m) {
  const { acc } = ctx;
  const tranche = m.tranche;
  const bloc = ctx.prochainBloc++;
  acc.compter(tranche, 'rencontres');
  // Ce qui ne se règle pas, compté une fois par rencontre (jamais écarté en silence).
  if (m.reglement.nonReglableButs) acc.compter(tranche, m.reglement.nonReglableButs);
  for (const [kind, v] of Object.entries(m.reglement.stats ?? {})) if (!v) acc.compter(tranche, `${m.reglement.nonReglableStats ?? 'statNonRelevee'}:${kind}`);
  if (!m.entrees.statInputs?.home?.corners || !m.entrees.statInputs?.away?.corners) acc.compter(tranche, 'fenetreIncomplete');
  if (m.entrees.leagueGoalAverages === null) acc.compter(tranche, 'sansMoyenneDeLigue');
  const analyses = [];
  // Étape 27 : le régime du modèle de buts de chaque analyse (sa provenance), compté pour le bilan.
  const regime = (analyse) => {
    const code = analyse?.modeleDeButs?.provenance?.code;
    if (code) ctx.bilan.regimes[code] = (ctx.bilan.regimes[code] ?? 0) + 1;
    return analyse;
  };
  const observer = (x) => {
    if (ctx.surAnalyse) ctx.surAnalyse({ jeu: x.jeu, match: x.match, analyse: x.analyse, rencontre: m.rencontre });
  };
  for (const jeu of m.jeux) {
    const mo = m.prix[jeu] ?? null;
    if (!mo) {
      acc.compter(tranche, 'sansPrix', 1, jeu);
      continue;
    }
    const match = matchDuBanc({ rencontre: m.rencontre, entrees: m.entrees, marketOdds: mo, entreesButs: entreesButsDuMatch(ctx, m, mo) });
    analyses.push({ jeu, match, mo, analyse: regime(await analyzeMatch(match, ctx.config, TILT_NEUTRE, ctx.sport)) });
    ctx.bilan.analyses++;
  }
  let jeux = analyses;
  if (!analyses.length) {
    const match = matchDuBanc({ rencontre: m.rencontre, entrees: m.entrees, marketOdds: null, entreesButs: entreesButsDuMatch(ctx, m, null) });
    jeux = [{ jeu: SANS_COTE, match, mo: null, analyse: regime(await analyzeMatch(match, ctx.config, TILT_NEUTRE, ctx.sport)) }];
    ctx.bilan.analyses++;
  }
  jeux.forEach(observer);
  const parJeu = jeux.map((x) => ({ ...x, lignes: construireLignes({ analyse: x.analyse, match: x.match, mo: x.mo, jeu: x.jeu, m, ctx }) }));
  const avecCotes = parJeu.filter((p) => p.jeu !== SANS_COTE && p.analyse.prediction.source === 'cotes');
  const versees = (p, l) => {
    acc.ajouterLigne({ tranche, prix: p.jeu, bloc, l, vues: m.vues, huisClos: m.huisClos, coupe: m.rencontre.coupe });
    acc.ajouterALaCarte({ tranche, prix: p.jeu, league: m.rencontre.league, bloc, l });
    if (ctx.surLigne) ctx.surLigne(ligneDEchange({ l, prix: p.jeu, m, tranche }));
  };
  for (const p of parJeu) {
    for (const l of p.lignes) {
      // Une case de prix 1N2 ne contient que des pronostics SUR LES COTES ; une cote incohérente est comptée.
      if (l.marketKey === 'result' && p.jeu !== SANS_COTE && p.analyse.prediction.source !== 'cotes') {
        acc.compter(tranche, 'cotesIncoherentes', 1, p.jeu);
        continue;
      }
      versees(p, l);
    }
  }
  if (analyses.length && !avecCotes.length && ctx.specs.some((s) => s.famille === 'result')) {
    // Des prix, tous incohérents : le 1N2 (modèle tempéré) va UNE fois en « sans-cote », face au repère seulement.
    const l = parJeu[0].lignes.find((x) => x.marketKey === 'result');
    if (l) versees({ jeu: SANS_COTE }, { ...l, plM: null, brierM: null, rpsM: null, ecrM: false });
  }
  // Deux jeux de prix face à face, sur ce match, pour les marchés qui en dépendent.
  for (let i = 0; i < analyses.length; i++) {
    for (let j = i + 1; j < analyses.length; j++) {
      const A = parJeu[i];
      const B = parJeu[j];
      for (const lA of A.lignes) {
        if (!DEPENDENT_DES_PRIX.has(lA.famille) || lA.pl === null) continue;
        if (lA.famille === 'result' && (A.analyse.prediction.source !== 'cotes' || B.analyse.prediction.source !== 'cotes')) continue;
        const lB = B.lignes.find((x) => x.marketKey === lA.marketKey && x.ligne === lA.ligne);
        if (lB && lB.pl !== null) acc.ajouterCommun({ tranche, prixA: A.jeu, prixB: B.jeu, bloc, l: lA, plA: lA.pl, plB: lB.pl });
      }
    }
  }
  // Les paris : la décision du moteur (et, sur l'avant-match football-data, les deux variantes de prix).
  const issue1N2 = m.reglement.buts ? deriveActualOutcome({ market: 'Résultat' }, m.reglement.buts.home, m.reglement.buts.away) : null;
  for (const p of parJeu) {
    if (p.jeu === SANS_COTE || !JEUX_DE_PRIX[p.jeu].decision) continue;
    const commun = { issue: issue1N2, ligneFd: m.ligneFd, fixtureKey: m.rencontre.fixtureKey, date: m.rencontre.date, league: m.rencontre.league, nonReglable: m.reglement.nonReglableButs };
    const vos = p.jeu === 'vos-bookmakers';
    const livre = vos && p.analyse.staking?.bookmaker ? p.mo.byBookmaker.find((b) => b.key === p.analyse.staking.bookmaker) ?? null : null;
    const r = parisDUnMatch({ staking: p.analyse.staking, ...commun, prixDuLivre: livre, coupure: vos ? m.coupure : null });
    acc.ajouterDecision({ tranche, prix: p.jeu, regle: 'moteur', ...r });
    if (r.pari && ctx.surLigne) ctx.surLigne({ type: 'pari', format: FORMAT_LIGNES, periode: tranche, prix: p.jeu, regle: 'moteur', ...r.pari });
    if (p.jeu === 'fd-avant-match') {
      const variantes = decisionsDesVariantes({ match: p.match, config: ctx.config, date: m.rencontre.date });
      for (const [regle, staking] of Object.entries(variantes)) {
        if (!staking) continue;
        const rv = parisDUnMatch({ staking, ...commun });
        acc.ajouterDecision({ tranche, prix: p.jeu, regle, ...rv });
      }
    }
  }
  // La reproduction du 23/09 : P4b, moyenne de clôture (le chemin du moteur et la lecture directe).
  if (ctx.reproduction && tranche === 'P4b' && m.source === 'magasin' && m.prixReproduction) {
    const x = parJeu.find((p) => p.jeu === 'fd-cloture');
    if (x) ajouterAReproduction(ctx, m.ligneFd, x.analyse, x.mo);
    else {
      // Le jeu « fd-cloture » n'est pas rejoué : une analyse de plus, pour la seule reproduction (jamais versée aux cases).
      const match = matchDuBanc({ rencontre: m.rencontre, entrees: m.entrees, marketOdds: m.prixReproduction, entreesButs: entreesButsDuMatch(ctx, m, m.prixReproduction) });
      ajouterAReproduction(ctx, m.ligneFd, await analyzeMatch(match, ctx.config, TILT_NEUTRE, ctx.sport), m.prixReproduction);
      ctx.bilan.reproductionAnalyses++;
    }
  }
}

/**
 * Étape 27 : les entrées du modèle de buts d'un match du banc (ForcesCourantes : forces et moyennes du championnat
 * « avant J » ; le plus/moins du jeu de prix `mo`) — null quand les réglages rejoués n'ont pas le modèle : la clé
 * `entreesButs` est alors posée nulle, rien n'est calculé.
 */
function entreesButsDuMatch(ctx, m, mo) {
  if (!ctx.forces || !m.butsCles) return null;
  return ctx.forces.entrees({ ...m.butsCles, jour: m.rencontre.date, plusMoins: mo?.plusMoins ?? null });
}

/** Une rencontre de P4b dans la reproduction : la lecture directe (formule de t24), et le chemin du moteur hors anomalies. */
function ajouterAReproduction(ctx, ligneFd, analyse, mo) {
  const r = ctx.acc.reproduction;
  const direct = lectureDirecte(mo);
  if (!direct || !ligneFd) return;
  // Le score de football-data, comme t24 (le même que celui du magasin : lien = 1, même score).
  const issue = ligneFd.bd > ligneFd.be ? 'home' : ligneFd.bd === ligneFd.be ? 'draw' : 'away';
  const p = direct.distribution;
  const choix = ['home', 'draw', 'away'].reduce((m, k) => (p[k] > p[m] ? k : m), 'home');
  r.direct.n++;
  if (choix === issue) r.direct.justes++;
  r.direct.pl += perteLog(p, issue).valeur;
  r.direct.brier += brier(p, issue);
  r.direct.rps += rps(p, issue);
  if (direct.anomalie) r.direct.anomalies++;
  // Les tranches de FIABILITE.cotes sur la probabilité de l'issue choisie, comme t24.
  ajouterACalibration(r.direct.tranches, p[choix], choix === issue);
  if (analyse.prediction.source !== 'cotes') {
    r.moteur.cotesIncoherentes++;
    return;
  }
  const q = analyse.distributions.result;
  const choixM = analyse.prediction.outcome;
  r.moteur.n++;
  if (choixM === issue) r.moteur.justes++;
  const plM = perteLog(q, issue).valeur;
  r.moteur.pl += plM;
  r.moteur.brier += brier(q, issue);
  r.moteur.rps += rps(q, issue);
  const ecartP = Math.max(Math.abs(q.home - p.home), Math.abs(q.draw - p.draw), Math.abs(q.away - p.away));
  const plD = perteLog(p, issue).valeur;
  r.moteur.maxEcartP = Math.max(r.moteur.maxEcartP, ecartP);
  r.moteur.maxEcartPerteLog = Math.max(r.moteur.maxEcartPerteLog, Math.abs(plM - plD));
  r.moteur.sommeEcartPerteLog += plM - plD;
}

// ------------------------------------------------------------ la passe

/** Les fenêtres de rejeu de chaque tranche demandée (bornes de la tranche ∩ --de/--a). */
function fenetresDeRejeu(o, dernierJour) {
  const out = [];
  for (const t of o.tranches) {
    const b = BORNES_DES_TRANCHES[t];
    const de = [b.de, o.de].filter(Boolean).sort().at(-1);
    const a = [b.a ?? dernierJour, o.a ?? dernierJour, dernierJour].filter(Boolean).sort()[0];
    if (de <= a) out.push({ tranche: t, source: sourceDeLaPeriode(t), de, a });
  }
  return out;
}

/**
 * LE REJEU. Rend { bilan, resume, moteur } — `resume` null si le rejeu s'est arrêté (bilan.erreur le dit :
 * une fuite refusée par avantEquipe, une erreur du moteur… jamais attrapée en silence).
 */
export async function rejouer(options = {}) {
  const o = lireOptions(options);
  const debut = performance.now();
  const config = o.config ? copie(o.config) : copie(lireReglagesDuMoteur().football);
  const moteur = moteurDuRejeu(config);
  // Une CANDIDATE (des réglages autres que ceux du moteur en service) sans fenêtres vues déclarées : ses
  // étiquettes « jamais vues » sont incomplètes (A §6.4). Les réglages en service, passés tels quels (le
  // script et le serveur les figent ainsi), ont leurs fenêtres dans lancements.js : complètes.
  const candidate = Boolean(o.config) && JSON.stringify(moteur.empreinteReglages) !== JSON.stringify(moteurDuRejeu(copie(lireReglagesDuMoteur().football)).empreinteReglages);
  const rendre = o.rendreLaMain ? () => new Promise((fin) => o.rendreLaMain(fin)) : () => Promise.resolve();
  const pauses = creerPauses({ rendreLaMain: rendre });
  const dire = (texte) => o.journal?.(texte);
  const fenetres = fenetresDuBanc({ vues: o.vues, declaration: o.declaration });
  const bilan = {
    versionBanc: VERSION_BANC,
    debut: new Date().toISOString(),
    fin: null,
    dureeMs: null,
    parties: {},
    analyses: 0,
    // Les analyses faites pour la seule reproduction du 23/09 (moyenne de clôture), quand ce jeu n'est pas rejoué lui-même.
    reproductionAnalyses: 0,
    rencontres: { magasin: 0, fd: 0, rejouees: 0 },
    ecartees: { attribue: 0, sansLigneJourJ: 0, avantMoteur: 0, fdHorsSource: 0 },
    liensFd: {},
    referenceDifferente: 0,
    grilleDifferente: 0,
    horsGrille: 0,
    fd: 'non chargé',
    // Une candidate qui ne déclare pas ce qu'elle a vu (ni vues ni déclaration avec ses vues) : étiquettes incomplètes.
    etiquette: candidate && !o.vues.length && !Array.isArray(o.declaration?.vues) ? 'incomplete' : 'complete',
    rssMax: process.memoryUsage.rss(),
    erreur: null
  };
  const acc = new Accumulateurs({ uneCaseParLigne: DECISIONS_DE_PIERRE.uneCaseParLigne });
  // La reproduction du 23/09 (l'étalonnage du banc) dès que P4b est rejouée — même sans le jeu « fd-cloture » (correction du 19/10 :
  // le bouton « Lancer le banc » ne la calculait jamais) ; ses analyses sont comptées à part (bilan.reproductionAnalyses).
  if (o.reproduction && o.tranches.includes('P4b')) acc.reproduction = nouvelleReproduction();
  // Le retard RÉEL de la boucle d'événements du processus qui rejoue (enfant du serveur, script), à côté de blocMaxMs.
  const boucle = o.rendreLaMain ? monitorEventLoopDelay({ resolution: 10 }) : null;
  boucle?.enable();
  const retardDeLaBoucle = () => {
    if (!boucle) return { retardBoucleMaxMs: null, retardBoucleP99Ms: null };
    boucle.disable();
    return { retardBoucleMaxMs: Math.round(boucle.max / 1e6), retardBoucleP99Ms: Math.round(boucle.percentile(99) / 1e6) };
  };
  const ctx = {
    acc,
    config,
    sport: getSport('football'),
    specs: MARCHES_DU_BANC.filter((s) => o.marches.includes(s.famille)),
    surLigne: o.surLigne,
    surAnalyse: o.surAnalyse,
    bilan,
    prochainBloc: 0,
    reproduction: Boolean(acc.reproduction),
    forces: null
  };
  // Étape 27 : des réglages avec le modèle de buts unique — ses entrées, « avant J », tenues par le banc lui-même
  // (ForcesCourantes) ; des réglages fautifs arrêtent le rejeu (bilan.erreur), jamais un calcul à moitié.
  let reglagesButs = null;
  try {
    reglagesButs = reglagesDuModeleDeButs(config);
  } catch (error) {
    Object.assign(bilan, { fin: new Date().toISOString(), dureeMs: Math.round(performance.now() - debut), ...pauses.bilan(), ...retardDeLaBoucle(), erreur: error.message });
    return { bilan, resume: null, moteur };
  }
  if (reglagesButs) {
    ctx.forces = new ForcesCourantes(reglagesButs);
    bilan.regimes = {};
  }
  const database = o.database;
  const lecteur = new LecteurDuMagasin(database);
  const dernierJour = [database.prepare('SELECT MAX(date) d FROM day_matches').get()?.d, database.prepare('SELECT MAX(date) d FROM fd_history').get()?.d].filter(Boolean).sort().at(-1) ?? null;
  const fenetresR = dernierJour ? fenetresDeRejeu(o, dernierJour) : [];
  const fdRejeu = fenetresR.filter((f) => f.source === 'fd');
  const magRejeu = fenetresR.filter((f) => f.source === 'magasin');
  const tracer = (partie, t0) => (bilan.parties[partie] = (bilan.parties[partie] ?? 0) + Math.round(performance.now() - t0));
  try {
    if (!fenetresR.length) throw new OptionsDuBancInvalides('Aucun jour à rejouer : les périodes demandées et les bornes --de/--a ne se croisent pas.');
    const debutRejeu = fenetresR.map((f) => f.de).sort()[0];
    const finRejeu = fenetresR.map((f) => f.a).sort().at(-1);
    // Le repère courant a besoin des 366 jours d'avant ; les faits football-data, de toute l'histoire depuis 2000.
    const debutRepere = joursAvant(debutRejeu, 366);
    const avecFaits = fdRejeu.length > 0;
    const finFd = [finRejeu, PERIODES.P2.a].sort()[0];
    const debutFd = avecFaits ? PERIODES.P1.de : debutRepere;
    let memoire = avecFaits ? new MemoireFd({ fdTeams: database.prepare('SELECT id, nom FROM fd_teams').all() }) : null;
    if (avecFaits) bilan.fd = { faits: 0, lignes: 0 };
    // Les lignes football-data d'après juin 2023 jamais rejouées (de 2023 à 2026, seul le magasin l'est), par code : surtout des
    // championnats que le magasin ne suit pas (National League, J-League, divisions écossaises) — la page les nomme.
    const horsSource = database.prepare('SELECT code, COUNT(*) n FROM fd_history WHERE lien = 0 AND date > ? AND date <= ? AND date >= ? GROUP BY code').all(PERIODES.P2.a, finRejeu, debutRejeu);
    bilan.ecartees.fdHorsSource = horsSource.reduce((t, x) => t + x.n, 0);
    bilan.fdHorsSourceParCode = Object.fromEntries(horsSource.map((x) => [x.code, x.n]));
    const reperes = new ReperesCourants();
    const codes = database.prepare('SELECT DISTINCT code FROM fd_history').all().map((r) => r.code);
    const lireFd = codes.length ? database.prepare(`SELECT ${COLONNES_FD.join(', ')} FROM fd_history WHERE code IN (${codes.map(() => '?').join(', ')}) AND date >= ? AND date < ?`) : null;
    const t0 = performance.now();
    // Étape 27 : avec le modèle de buts, le magasin est lu dès son premier fait (2023-01) — les forces du banc sont
    // celles de la table de nuit ; les jours d'avant le repère ne nourrissent QUE les forces.
    const debutMagasin = ctx.forces ? PERIODES.P3.de : [debutRepere, PERIODES.P3.de].sort().at(-1);
    const rencontres = lecteur.rencontresEntre(debutMagasin, finRejeu);
    tracer('lecture', t0);
    const magParJour = new Map();
    for (const r of rencontres) {
      let l = magParJour.get(r.date);
      if (!l) magParJour.set(r.date, (l = []));
      l.push(r);
    }
    const dansFenetre = (liste, date) => liste.find((f) => date >= f.de && date <= f.a) ?? null;
    const vuesDuJour = new Map();
    const vues = (date) => {
      let v = vuesDuJour.get(date);
      if (!v) vuesDuJour.set(date, (v = fenetresDuJour(date, fenetres)));
      return v;
    };
    const reperesDuJour = new Map();
    const repere = (league, date, saison) => {
      const cle = `${league}|${saison}`;
      let r = reperesDuJour.get(cle);
      if (!r) {
        const brut = reperes.avant(league, date, { saison });
        const lois = new Map();
        r = {
          source: brut.source,
          brut,
          dist: distributionsDuRepere(brut),
          loi: (kind, portee, mu, invK) => {
            const k = `${kind}|${portee}`;
            if (!lois.has(k)) lois.set(k, loiDuCompte(mu, invK));
            return lois.get(k);
          }
        };
        reperesDuJour.set(cle, r);
      }
      return r;
    };
    const avancer = (partie, fait, total, date) => o.avancement?.({ partie, fait, total, date });
    const totalMag = rencontres.length;
    let faitesMag = 0;
    // L'avancement de la passe football-data (la plus longue chez Pierre) : les lignes lien 0 de ses fenêtres.
    const compterFd = database.prepare('SELECT COUNT(*) n FROM fd_history WHERE lien = 0 AND date >= ? AND date <= ?');
    const totalFd = memoire ? fdRejeu.reduce((s, f) => s + (compterFd.get(f.de, [f.a, finFd].sort()[0])?.n ?? 0), 0) : 0;
    let faitesFd = 0;

    // Les mois de la passe : du premier jour utile au dernier (étape 27 : le premier fait du magasin, avec le modèle de buts).
    const debutPasse = [debutFd, debutRepere, debutMagasin].sort()[0];
    for (let mois = `${debutPasse.slice(0, 7)}-01`; mois <= finRejeu; mois = moisSuivant(mois)) {
      const finMois = moisSuivant(mois);
      const t1 = performance.now();
      const lignesFd = lireFd && mois <= finFd && finMois > debutFd ? lireFd.all(...codes, mois < debutFd ? debutFd : mois, finMois) : [];
      tracer('lecture', t1);
      const fdParJour = new Map();
      for (const r of lignesFd) {
        if (r.date > finFd) continue;
        let l = fdParJour.get(r.date);
        if (!l) fdParJour.set(r.date, (l = []));
        l.push(r);
      }
      const jours = [...new Set([...fdParJour.keys(), ...[...magParJour.keys()].filter((d) => d >= mois && d < finMois)])].sort();
      for (const date of jours) {
        const contributions = new Map();
        const contribuer = (league, saison, c) => {
          const cle = `${league}|${saison}`;
          let x = contributions.get(cle);
          if (!x) contributions.set(cle, (x = { league, saison, liste: [] }));
          x.liste.push(c);
        };
        // 1. Le magasin.
        const rencontresDuJour = magParJour.get(date) ?? [];
        const fenetreMag = dansFenetre(magRejeu, date);
        const noms = rencontresDuJour.length ? lecteur.nomsDuJour(date) : null;
        for (const r of rencontresDuJour) {
          bilan.rencontres.magasin++;
          const nm = noms.get(r.matchKey) ?? { homeName: null, awayName: null };
          if (!fenetreMag) {
            // Avant les périodes demandées : le repère seulement (et les forces de buts, étape 27 — seules, avant le repère).
            const camps = lecteur.st.camps.all(r.rencontre);
            const dom = camps.find((x) => x.camp === 1);
            if (dom) {
              if (date >= debutRepere) {
                const reg = reglementDuMatch(faitsDuMagasin(dom));
                contribuer(r.league, r.saison, contributionAuRepere(reg));
              }
              if (ctx.forces) ctx.forces.ajouter('magasin', dom);
            }
            continue;
          }
          const t2 = performance.now();
          const e = lecteur.entrees(r.rencontre, { homeName: nm.homeName, awayName: nm.awayName });
          tracer('entrees', t2);
          if (!e) {
            bilan.ecartees.sansLigneJourJ++;
            continue;
          }
          // Étape 27 : la rencontre entre dans les forces de buts en fin de journée (jamais avant son propre calcul).
          if (ctx.forces) ctx.forces.ajouter('magasin', e.dom);
          const faits = faitsDuMagasin(e.dom);
          const reglement = reglementDuMatch(faits);
          contribuer(r.league, r.saison, contributionAuRepere(reglement));
          const tranche = fenetreMag.tranche;
          const lignesFdDuMatch = lecteur.lignesFd(r.matchKey);
          const liees = lignesFdDuMatch.filter((x) => x.lien === 1);
          for (const x of lignesFdDuMatch) if (x.lien !== 1) acc.compter(tranche, regleDuLien(x.lien));
          if (liees.length > 1) acc.compter(tranche, 'doublonFd', liees.length - 1);
          const ligneFd = liees[0] ?? null;
          const kickoff = o.prix.includes('gratuites-avant-match') || o.prix.includes('vos-bookmakers') ? lecteur.kickoff(r.matchKey) : null;
          const coupure = coupureDe({ date, kickoff });
          const rencontre = {
            fixtureKey: cleDuMagasin({ home: r.home, away: r.away, league: r.league, homeName: nm.homeName, awayName: nm.awayName, date }),
            matchKey: r.matchKey,
            home: nm.homeName,
            away: nm.awayName,
            league: r.league,
            date,
            kickoff,
            coupe: faits.coupe
          };
          const prix = {};
          const t3 = performance.now();
          for (const jeu of o.prix) {
            if (jeu === 'fd-avant-match' || jeu === 'fd-cloture') prix[jeu] = ligneFd ? prixFd(ligneFd, { jeu }) : null;
            else if (jeu === 'gratuites-avant-match') prix[jeu] = prixGratuits(r.matchKey, { coupure, database, plusMoins: Boolean(ctx.forces) });
            else if (jeu === 'vos-bookmakers') prix[jeu] = prixVosBookmakers(r.matchKey, { coupure, database, plusMoins: Boolean(ctx.forces) });
          }
          // Le prix de la reproduction (moyenne de clôture), lu une fois : celui du jeu « fd-cloture » s'il est rejoué.
          const prixReproduction = ctx.reproduction && tranche === 'P4b' && ligneFd ? (o.prix.includes('fd-cloture') ? prix['fd-cloture'] : prixFd(ligneFd, { jeu: 'fd-cloture' })) : null;
          tracer('prix', t3);
          const m = {
            source: 'magasin',
            tranche,
            rencontre,
            entrees: e.entrees,
            reglement,
            prix,
            jeux: o.prix,
            ligneFd,
            prixReproduction,
            coupure,
            temoins: ligneFd ? temoinsDeCloture(ligneFd) : null,
            repere: repere(r.league, date, r.saison),
            vues: vues(date),
            huisClos: estHuisClos(date),
            // Étape 27 : les clés des entrées du modèle de buts (identifiants FotMob, championnat, saison).
            butsCles: { source: 'magasin', home: r.home, away: r.away, league: r.league, saison: r.saison }
          };
          const t4 = performance.now();
          if (reglement.attribue) {
            acc.compter(tranche, 'attribue');
            bilan.ecartees.attribue++;
            // La reproduction compte les rencontres attribuées comme t24 (lecture du fichier football-data).
            if (prixReproduction) {
              const match = matchDuBanc({ rencontre, entrees: e.entrees, marketOdds: prixReproduction, entreesButs: entreesButsDuMatch(ctx, m, prixReproduction) });
              ajouterAReproduction(ctx, ligneFd, await analyzeMatch(match, config, TILT_NEUTRE, ctx.sport), prixReproduction);
              acc.reproduction.attribuees++;
              bilan.reproductionAnalyses++;
            }
          } else {
            if (faits.prolongation && prixReproduction) acc.reproduction.prolongees++;
            await rejouerUnMatch(ctx, m);
            bilan.rencontres.rejouees++;
          }
          tracer('moteur', t4);
          faitesMag++;
          if (faitesMag % 200 === 0) avancer('magasin', faitesMag, totalMag, date);
          await pauses.siLongtemps('magasin');
        }
        // 2. football-data.
        const lignesDuJour = (fdParJour.get(date) ?? []).sort((x, y) => (cleDuFd(x) < cleDuFd(y) ? -1 : cleDuFd(x) > cleDuFd(y) ? 1 : 0));
        const fenetreFd = dansFenetre(fdRejeu, date);
        for (const ligne of lignesDuJour) {
          bilan.rencontres.fd++;
          const regle = regleDuLien(ligne.lien);
          const lc = (bilan.liensFd[ligne.code] ??= {});
          lc[ligne.lien] = (lc[ligne.lien] ?? 0) + 1;
          if (regle !== 'rejouer-fd') {
            if (fenetreFd && regle !== 'prix-du-magasin') acc.compter(fenetreFd.tranche, regle);
            continue;
          }
          const saison = Number(String(ligne.saison).slice(0, 4));
          const league = ligueDuCode(ligne.code);
          const faits = faitsDuFd(ligne);
          const reglement = reglementDuMatch(faits);
          contribuer(league, saison, contributionAuRepere(reglement));
          if (!fenetreFd || !memoire) continue;
          if (fenetreFd.tranche === 'P1' && date < PERIODES.P1.moteurDepuis) {
            bilan.ecartees.avantMoteur++;
            continue;
          }
          const t2 = performance.now();
          const entrees = memoire.entrees(ligne);
          tracer('entrees', t2);
          const prix = {};
          const jeux = o.prix.filter((j) => j === 'fd-avant-match' || j === 'fd-cloture');
          for (const jeu of jeux) prix[jeu] = prixFd(ligne, { jeu });
          const rencontre = {
            fixtureKey: cleDuFd(ligne),
            matchKey: null,
            home: memoire.noms.get(Number(ligne.dom)) ?? null,
            away: memoire.noms.get(Number(ligne.ext)) ?? null,
            league,
            date,
            kickoff: null,
            coupe: false
          };
          const t4 = performance.now();
          {
            await rejouerUnMatch(ctx, {
              source: 'fd',
              tranche: fenetreFd.tranche,
              rencontre,
              entrees,
              reglement,
              prix,
              jeux,
              ligneFd: ligne,
              coupure: null,
              temoins: temoinsDeCloture(ligne),
              repere: repere(league, date, saison),
              vues: vues(date),
              huisClos: estHuisClos(date),
              // Étape 27 : les clés des entrées du modèle de buts (identifiants fd_teams, code du championnat, saison).
              butsCles: { source: 'fd', home: Number(ligne.dom), away: Number(ligne.ext), league: ligne.code, saison }
            });
            bilan.rencontres.rejouees++;
          }
          tracer('moteur', t4);
          faitesFd++;
          if (faitesFd % 200 === 0) avancer('football-data', faitesFd, totalFd, date);
          await pauses.siLongtemps('football-data');
        }
        // 3. Fin de journée : les faits du jour entrent dans l'histoire, le repère avance.
        if (memoire && lignesDuJour.length) {
          const t5 = performance.now();
          const faitsDuJour = memoire.faitsDe(lignesDuJour);
          memoire.publier(faitsDuJour);
          bilan.fd.faits += faitsDuJour.length;
          bilan.fd.lignes += lignesDuJour.length;
          // Étape 27 : les mêmes faits football-data entrent dans les forces de buts (le camp qui reçoit porte la rencontre).
          if (ctx.forces) for (const f of faitsDuJour) if (f.home) ctx.forces.ajouter('fd', f);
          tracer('entrees', t5);
        }
        // Étape 27 : les forces de buts et les moyennes à la 90e avancent, comme le repère, en fin de journée.
        if (ctx.forces) ctx.forces.finDeJournee();
        for (const c of contributions.values()) reperes.ajouterJournee(c.league, date, c.liste, { saison: c.saison });
        reperesDuJour.clear();
        bilan.rssMax = Math.max(bilan.rssMax, process.memoryUsage.rss());
        await pauses.siLongtemps('fin de journée');
      }
      if (lignesFd.length || jours.length) dire(`[banc] ${mois.slice(0, 7)} : ${bilan.rencontres.rejouees} rencontres rejouées, ${bilan.analyses} analyses.`);
      // Passé la dernière période football-data : son histoire en mémoire (~150 Mo) n'a plus d'usage.
      if (memoire && finMois > finFd) memoire = null;
      await pauses.pause('mois');
    }
    // 4. Le résumé et le juge.
    const t6 = performance.now();
    dire('[banc] résumé et juge…');
    const resume = await resumer(acc, { tirages: o.tirages, graine: o.graine, ...(o.minBlocs ? { minBlocs: o.minBlocs } : {}), pause: (ou) => pauses.pause(ou), attendre: (promesse, ou) => pauses.attendre(promesse, ou), avancement: o.avancement, aPart: Boolean(o.rendreLaMain) });
    tracer('juge', t6);
    resume.options = {
      tranches: o.tranches,
      prix: o.prix,
      marches: o.marches,
      de: o.de,
      a: o.a,
      vues: o.vues,
      fenetres: fenetres.map((f) => ({ id: f.id, de: f.de, a: f.a })),
      fenetresDeRejeu: fenetresR,
      decisions: DECISIONS_DE_PIERRE
    };
    resume.versionBanc = VERSION_BANC;
    resume.formatLignes = FORMAT_LIGNES;
    const fin = performance.now();
    Object.assign(bilan, { fin: new Date().toISOString(), dureeMs: Math.round(fin - debut), ...pauses.bilan(), ...retardDeLaBoucle(), rssMax: Math.max(bilan.rssMax, process.memoryUsage.rss()) });
    return { bilan, resume, moteur };
  } catch (error) {
    Object.assign(bilan, { fin: new Date().toISOString(), dureeMs: Math.round(performance.now() - debut), ...pauses.bilan(), ...retardDeLaBoucle(), erreur: `${error.name === 'Error' ? '' : `${error.name} : `}${error.message}` });
    return { bilan, resume: null, moteur };
  }
}
