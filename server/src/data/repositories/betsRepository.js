import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { readJsonFile, writeJsonAtomic } from '../../utils/atomicJson.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BETS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/bets.json');

// Un carnet illisible fait échouer la lecture au lieu de passer pour un
// carnet vide : un pari saisi à ce moment-là l'aurait réécrit avec ce seul
// pari (cf. utils/atomicJson.js).
function readBets() {
  return readJsonFile(BETS_FILE_PATH, []);
}

function writeBets(bets) {
  writeJsonAtomic(BETS_FILE_PATH, bets);
}

export function listBets() {
  return readBets().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// `legs` : 1 entrée = pari simple, plusieurs = combiné. La cote enregistrée
// (`odds`) est le produit des cotes de chaque jambe — c'est la vraie cote
// combinée telle qu'un bookmaker la calculerait pour un pari accumulateur
// (contrairement à "Meilleures chances", qui liste des paris INDÉPENDANTS
// sans jamais les multiplier : ici l'utilisateur choisit lui-même de les
// combiner en un seul pari réel, ce n'est pas une suggestion du moteur).
export function createBet({ stake, legs }) {
  const bets = readBets();
  const odds = Number(legs.reduce((product, leg) => product * leg.odds, 1).toFixed(4));
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    settledAt: null,
    status: 'pending',
    stake,
    odds,
    legs: legs.map((leg) => ({ ...leg, status: 'pending' }))
  };
  bets.push(entry);
  writeBets(bets);
  return entry;
}

// Le statut global d'un pari est TOUJOURS déduit du statut de chaque
// sélection, jamais fixé directement — un combiné est tout-ou-rien : une
// seule sélection perdante suffit à faire perdre tout le ticket même si les
// autres ont gagné individuellement. Les sélections annulées sont ignorées
// du calcul (comme chez un bookmaker) ; si toutes le sont, le ticket entier
// est annulé.
function deriveBetStatus(legs) {
  const relevant = legs.filter((leg) => leg.status !== 'void');
  if (relevant.length === 0) return 'void';
  if (relevant.some((leg) => leg.status === 'lost')) return 'lost';
  if (relevant.some((leg) => !leg.status || leg.status === 'pending')) return 'pending';
  return 'won';
}

/**
 * Sélections créées avant le suivi par sélection : un ticket à une seule
 * sélection porte son statut au niveau du ticket. On le reporte sur la
 * sélection plutôt que de la tenir pour « en attente », ce qui rouvrirait un
 * ticket déjà réglé.
 */
function completerStatuts(bet) {
  for (const l of bet.legs) {
    if (!l.status) l.status = bet.legs.length === 1 && bet.status && bet.status !== 'pending' ? bet.status : 'pending';
  }
}

/** Statut posé à la main (Mes paris) : le règlement automatique n'y reviendra pas. */
export function updateBetLegStatus(id, legIndex, status) {
  const bets = readBets();
  const bet = bets.find((b) => b.id === id);
  if (!bet) return null;
  const leg = bet.legs[legIndex];
  if (!leg) return null;
  completerStatuts(bet);
  leg.status = status;
  leg.settledBy = status === 'pending' ? null : 'manual';
  leg.settledScore = null;
  bet.status = deriveBetStatus(bet.legs);
  bet.settledAt = bet.status === 'pending' ? null : new Date().toISOString();
  writeBets(bets);
  return bet;
}

/**
 * Règlements AUTOMATIQUES de sélections, d'une seule lecture et d'une seule
 * écriture du carnet. Chaque sélection garde le score qui l'a réglée.
 *
 * @param {{ betId: string, legIndex: number, status: string, score: string, resultId: string|null }[]} settlements
 * @returns {number} sélections modifiées
 */
export function applyBetLegSettlements(settlements) {
  if (!settlements.length) return 0;
  const bets = readBets();
  const byId = new Map(bets.map((b) => [b.id, b]));
  const touches = new Set();
  let n = 0;
  for (const s of settlements) {
    const bet = byId.get(s.betId);
    const leg = bet?.legs[s.legIndex];
    if (!leg) continue;
    completerStatuts(bet);
    leg.status = s.status;
    leg.settledBy = 'auto';
    leg.settledScore = s.score;
    leg.settledResultId = s.resultId ?? null;
    touches.add(bet);
    n++;
  }
  const now = new Date().toISOString();
  for (const bet of touches) {
    bet.status = deriveBetStatus(bet.legs);
    bet.settledAt = bet.status === 'pending' ? null : now;
  }
  if (n) writeBets(bets);
  return n;
}

export function deleteBet(id) {
  const bets = readBets();
  const index = bets.findIndex((b) => b.id === id);
  if (index === -1) return false;
  bets.splice(index, 1);
  writeBets(bets);
  return true;
}
