import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BETS_FILE_PATH = path.resolve(__dirname, '../../../data/runtime/bets.json');

function readBets() {
  try {
    if (fs.existsSync(BETS_FILE_PATH)) return JSON.parse(fs.readFileSync(BETS_FILE_PATH, 'utf8'));
  } catch {
    // Fichier corrompu : on repart d'un carnet vide plutôt que de faire échouer l'appli.
  }
  return [];
}

function writeBets(bets) {
  fs.mkdirSync(path.dirname(BETS_FILE_PATH), { recursive: true });
  fs.writeFileSync(BETS_FILE_PATH, JSON.stringify(bets, null, 2), 'utf8');
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

export function updateBetLegStatus(id, legIndex, status) {
  const bets = readBets();
  const bet = bets.find((b) => b.id === id);
  if (!bet) return null;
  const leg = bet.legs[legIndex];
  if (!leg) return null;
  leg.status = status;
  // Paris créés avant le suivi par sélection : les autres jambes sans statut
  // sont traitées comme "en attente" plutôt que de bloquer le calcul.
  for (const l of bet.legs) if (!l.status) l.status = 'pending';
  bet.status = deriveBetStatus(bet.legs);
  bet.settledAt = bet.status === 'pending' ? null : new Date().toISOString();
  writeBets(bets);
  return bet;
}

export function deleteBet(id) {
  const bets = readBets();
  const index = bets.findIndex((b) => b.id === id);
  if (index === -1) return false;
  bets.splice(index, 1);
  writeBets(bets);
  return true;
}
