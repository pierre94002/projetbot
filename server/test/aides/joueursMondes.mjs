/**
 * DES MONDES TIRÉS AU HASARD pour les essais du banc des joueurs (étape 34, lot 1a, partie B, 03/11/2026) — ce n'est PAS
 * un fichier de test. Aucune base, aucun résultat réel : des rencontres fabriquées, à la forme exacte du lecteur
 * (lectureDesJoueurs.rencontreNormalisee : identifiants en nombres, déroulé normalisé), passées dans le VRAI accumulateur
 * (JoueursAuJourJ) et versées dans les VRAIES données du banc (DonneesDuBanc), avec une base d'équipe tirée autour de la
 * vérité (écart-type 0,2 en log, la même dans les deux bras).
 *
 * Options : `graine` ; `ecart` — l'écart-type (en log) des parts propres à chaque joueur autour de son poste (0 = aucun
 * écart entre joueurs d'un même poste) ; `ligueParPoste` — un écart de CONTEXTE par compétition × poste, sans aucun écart
 * propre au joueur (critique, constat 8) ; `derive` — les parts des attaquants grandissent de ce facteur par saison (sans
 * écart entre joueurs) ; `tireur` — un tireur de penalties désigné par club ; `ligues`, `clubs`, `debut`, `fin`.
 */
import { JoueursAuJourJ, passerLesRencontres } from '../../src/data/joueurs/joueursAuJourJ.js';
import { DonneesDuBanc } from '../../src/data/joueurs/bancDesJoueurs.js';
import { executerSansPause } from '../../src/utils/travailCooperatif.js';

const JOUR_MS = 86_400_000;
const plusJours = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR_MS).toISOString().slice(0, 10);

export function generateur(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normale = (u) => Math.sqrt(-2 * Math.log(Math.max(u(), 1e-12))) * Math.cos(2 * Math.PI * u());
const poisson = (u, l) => {
  if (!(l > 0)) return 0;
  let k = 0;
  let p = Math.exp(-l);
  let s = p;
  const x = u();
  while (x > s && k < 30) {
    k++;
    p *= l / k;
    s += p;
  }
  return k;
};
const tirer = (u, poids) => {
  const total = poids.reduce((s, w) => s + w, 0);
  let x = u() * total;
  for (let i = 0; i < poids.length; i++) {
    x -= poids[i];
    if (x <= 0) return i;
  }
  return poids.length - 1;
};

/** Les parts « vraies » par poste (par 90 minutes) : xG hors penalty, tirs cadrés, averti, xA. */
const PARTS = { 1: { np: 0.003, sot: 0.003, av: 0.03, xa: 0.01 }, 2: { np: 0.04, sot: 0.04, av: 0.1, xa: 0.06 }, 3: { np: 0.1, sot: 0.11, av: 0.1, xa: 0.13 }, 4: { np: 0.25, sot: 0.23, av: 0.09, xa: 0.11 } };
const COMPO = [1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4];

/**
 * LE MONDE : les rencontres normalisées, dans l'ordre (jour, clé), et leur base. Rend { rencontres, bases: Map(clé →
 * { lambda: { lambda, mu }, cadres: { home, away }, cartons: { dom, ext } }) }.
 */
export function mondeDesJoueurs({ graine = 34, ecart = 0.4, ligueParPoste = 0, derive = 0, tireur = true, ligues = 4, clubs = 12, debut = '2023-01-03', fin = '2026-09-20' } = {}) {
  const u = generateur(graine);
  const effet = (s) => Math.exp(s * normale(u));
  const contexte = new Map();
  for (let l = 0; l < ligues; l++) for (let p = 1; p <= 4; p++) contexte.set(`${l}:${p}`, { np: effet(ligueParPoste), sot: effet(ligueParPoste), av: effet(ligueParPoste), xa: effet(ligueParPoste) });
  const effectifs = [];
  for (let l = 0; l < ligues; l++) {
    for (let c = 0; c < clubs; c++) {
      const club = 1000 + l * 100 + c;
      effectifs.push({
        club,
        ligue: l,
        attaque: Math.exp(0.15 * normale(u)),
        defense: Math.exp(0.15 * normale(u)),
        joueurs: COMPO.map((poste, k) => ({ id: club * 100 + k, poste, tireur: tireur && k === 15, f: { np: effet(ecart), sot: effet(ecart), av: effet(ecart), xa: effet(ecart) } }))
      });
    }
  }
  const parLigue = Array.from({ length: ligues }, (_, l) => effectifs.filter((e) => e.ligue === l));
  const rencontres = [];
  const bases = new Map();
  let jour = debut;
  let ronde = 0;
  while (jour <= fin) {
    const saison = Number(jour.slice(0, 4)) - 2023 + (jour.slice(5) >= '07-01' ? 0.5 : 0);
    for (let l = 0; l < ligues; l++) {
      const L = parLigue[l];
      const rot = [...L];
      for (let k = 0; k < ronde % (L.length - 1); k++) rot.splice(1, 0, rot.pop());
      for (let i = 0; i < L.length / 2; i++) {
        const [H, A] = ronde % 2 ? [rot[L.length - 1 - i], rot[i]] : [rot[i], rot[L.length - 1 - i]];
        const cle = `m-${jour}-${H.club}-${A.club}`;
        const lamH = 1.45 * H.attaque / A.defense;
        const lamA = 1.15 * A.attaque / H.defense;
        const SH = 4.6 * H.attaque / A.defense;
        const SA = 3.8 * A.attaque / H.defense;
        const evenements = [];
        const camps = {};
        for (const [side, E, lam, St, autre] of [['home', H, lamH, SH, A], ['away', A, lamA, SA, H]]) {
          const titulaires = [E.joueurs[ronde % 2], ...[2, 3, 4, 5, 6, 7].filter((k) => u() > 0.12).slice(0, 4).map((k) => E.joueurs[k]), ...[8, 9, 10, 11, 12, 13, 14].filter((k) => u() > 0.12).slice(0, 4).map((k) => E.joueurs[k]), ...[15, 16, 17, 18, 19].filter((k) => u() > 0.15).slice(0, 2).map((k) => E.joueurs[k])];
          while (titulaires.length < 11) titulaires.push(E.joueurs.find((j) => !titulaires.includes(j) && j.poste !== 1));
          const banc = E.joueurs.filter((j) => !titulaires.includes(j)).slice(0, 7);
          const entrants = banc.filter((j) => j.poste !== 1).slice(0, 3);
          const minutes = new Map(titulaires.map((j) => [j, 90]));
          entrants.forEach((j, k) => {
            minutes.set(j, 30 - k * 10);
            minutes.set(titulaires[10 - k], 60 + k * 10);
            evenements.push({ type: 'substitution', side, minute: 60 + k * 10, addedTime: null });
          });
          // Un titulaire sur la feuille qui ne joue pas (blessé à l'échauffement, 3 % des camps) : pari remboursé, jamais jugé.
          const forfait = u() < 0.03 ? titulaires[6] : null;
          const presents = [...titulaires.filter((j) => j !== forfait), ...entrants];
          const part = (j, s) => PARTS[j.poste][s] * j.f[s] * contexte.get(`${E.ligue}:${j.poste}`)[s] * (derive && j.poste === 4 && (s === 'np' || s === 'sot') ? (1 + derive) ** saison : 1);
          const poids = (s) => presents.map((j) => part(j, s) * minutes.get(j));
          const st = presents.map(() => ({ xg: 0, pen: 0, sot: 0, passes: 0, xa: 0 }));
          const butsEq = poisson(u, lam);
          for (let b = 0; b < butsEq; b++) {
            const minute = 1 + Math.floor(u() * 90);
            const r = u();
            if (r < 0.03) {
              evenements.push({ type: 'goal', side, minute, addedTime: null, playerId: autre.joueurs[3].id, ownGoal: true, penalty: false, avecPasseur: false });
              continue;
            }
            let k;
            let penalty = false;
            if (r < 0.12) {
              penalty = true;
              k = presents.findIndex((j) => j.tireur);
              if (k < 0) k = tirer(u, poids('np'));
              st[k].pen += 1;
            } else k = tirer(u, poids('np'));
            const avecPasseur = !penalty && u() < 0.6;
            if (avecPasseur) st[tirer(u, poids('xa').map((w, j) => (j === k ? 0 : w)))].passes += 1;
            evenements.push({ type: 'goal', side, minute, addedTime: null, playerId: presents[k].id, ownGoal: false, penalty, avecPasseur });
          }
          const wnp = poids('np');
          const tnp = wnp.reduce((s, w) => s + w, 0);
          const wxa = poids('xa');
          const txa = wxa.reduce((s, w) => s + w, 0);
          const wsot = poids('sot');
          const tsot = wsot.reduce((s, w) => s + w, 0);
          presents.forEach((j, k) => {
            st[k].xg = Math.round(100 * lam * 0.88 * (wnp[k] / tnp) * (0.5 + u())) / 100;
            st[k].xa = Math.round(100 * lam * 0.55 * (wxa[k] / txa) * (0.5 + u())) / 100;
            st[k].sot = poisson(u, St * (wsot[k] / tsot));
          });
          const nCartons = poisson(u, 1.8);
          const avertis = new Set();
          for (let c = 0; c < nCartons; c++) {
            const k = tirer(u, poids('av'));
            if (avertis.has(k)) continue;
            avertis.add(k);
            evenements.push({ type: 'card', side, minute: 10 + Math.floor(u() * 80), addedTime: null, playerId: presents[k].id, card: 'yellow', notOnPitch: false });
          }
          const lignes = [];
          for (const j of [...titulaires, ...banc]) {
            const k = presents.indexOf(j);
            const joue = k >= 0;
            const s = joue ? st[k] : null;
            const xgnp = joue ? s.xg : null;
            const xg = joue ? Math.round(100 * (s.xg + 0.785 * s.pen)) / 100 : null;
            lignes.push({ id: j.id, titulaire: titulaires.includes(j), entre: !titulaires.includes(j) && joue, poste: j.poste, minutes: joue ? minutes.get(j) : null, xg: joue && xg > 0 ? xg : null, xgnp: joue && xg > 0 ? xgnp : null, shotsOnTarget: joue ? s.sot || null : null, assists: joue ? s.passes || null : null, xa: joue ? s.xa || null : null, rating: joue ? 7 : null, touches: joue ? 40 : null, passes: joue ? 30 : null });
          }
          const buts = evenements.filter((e) => e.type === 'goal' && e.side === side).length;
          camps[side] = { club: E.club, buts, buts90: buts, cadresDEquipe: lignes.reduce((s, x) => s + (x.shotsOnTarget ?? 0), 0), cadresAttendus: null, lignes };
        }
        evenements.sort((a, b) => a.minute - b.minute);
        rencontres.push({ matchKey: cle, fotmobId: cle, date: jour, league: `Ligue ${l}`, saison: 2023, coupe: false, home: H.club, away: A.club, attribue: false, prolongation: false, joue: true, cartonsReleves: true, evenements, camps, fait: null });
        bases.set(cle, { lambda: { lambda: lamH * Math.exp(0.2 * normale(u)), mu: lamA * Math.exp(0.2 * normale(u)) }, cadres: { home: SH * Math.exp(0.2 * normale(u)), away: SA * Math.exp(0.2 * normale(u)) }, cartons: { dom: 1.8, ext: 1.8 } });
      }
    }
    jour = plusJours(jour, 7);
    ronde += 1;
  }
  return { rencontres, bases };
}

/** Les données du banc d'un monde : la passe de JoueursAuJourJ, chaque observation versée dans DonneesDuBanc. */
export function donneesDuMonde(options = {}, { periodes } = {}) {
  const { rencontres, bases } = mondeDesJoueurs(options);
  const D = new DonneesDuBanc();
  const acc = new JoueursAuJourJ();
  executerSansPause(
    passerLesRencontres(acc, rencontres, {
      avantLaJournee: (jour, entrees, duJour) => {
        for (const r of duJour) D.ajouterLObservation({ r, entrees: entrees.get(r.matchKey), base: bases.get(r.matchKey) }, periodes ? { periodes } : {});
      }
    })
  );
  return D;
}
