/**
 * controleDuContexte.js — LE CONTRÔLE ANTI-FUITE DE LA NUIT DU CONTEXTE (étape 32 du plan, lot 1a, 29/10/2026).
 * -----------------------------------------------------------------------
 * Le patron des contrôles de nuit (table du jour J, forces de buts, fiches des joueurs, styles de jeu) : `couples`
 * (rencontre, camp) tirés avec la graine du jour parmi les rencontres jouées des 365 derniers jours ; pour chacun, ce que
 * la passe savait AU JOUR J (relevé pendant la passe, AVANT que la journée J soit publiée) face à un SECOND CHEMIN qui
 * relit directement les tables sources, sans le cache ni la passe :
 *   - le dernier match du club d'un jour strictement antérieur et son coup d'envoi (team_day, day_matches, matches.meta) ;
 *   - l'entraîneur de ses matchs d'avant J (matches.lineups : nom et identifiant FotMob) et depuis combien de matchs ;
 *   - les sommes de l'arbitre du match (UN balayage de matches.meta pour trouver ses rencontres — jamais vingt —, puis
 *     team_day pour les cartons et les buts, le déroulé pour les penalties).
 * Égalité EXACTE ; chaque écart est nommé, avec sa phrase (`texte`, dite telle quelle à l'écran : controlesAntiFuite.js).
 * Lecture seule, sur la base de l'appelant (dans la nuit : celle du processus à part).
 * -----------------------------------------------------------------------
 */

import { NUIT } from './reglagesContexte.js';
import { texteStable, entraineurAuJourJ } from './formulesDuContexte.js';
import { cleDeLArbitre, apportDUneRencontre } from '../db/refereeRead.js';
import { butsA90DeLaLigne, cartonsDeLaLigne } from './lectureDuMagasin.js';
import { valeursDUneRencontre } from '../db/leagueBenchmarks.js';

const JOUR_MS = 86_400_000;
const isoOuNull = (x) => (typeof x === 'string' && Number.isFinite(Date.parse(x)) ? new Date(Date.parse(x)).toISOString() : null);
const jourMoins = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
const jourDit = (j) => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j) ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : String(j ?? '?'));

/** Le hasard semé du contrôle (mulberry32). */
function tirage(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Les couples recontrôlés : `nombre` (rencontre, camp) tirés avec `graine` parmi les rencontres jouées (non attribuées)
 * des `jours` jours d'avant `jourD`. Rend [{ matchKey, date, camp: 'home' | 'away', club }].
 */
export function tirerLesCouples({ database, jourD, graine, nombre = NUIT.couples, jours = NUIT.joursDuControle }) {
  if (graine === null || graine === undefined || !nombre) return [];
  const lignes = database
    .prepare('SELECT d.match_key, d.date, d.home, d.away FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1 WHERE d.date >= ? AND d.date < ? AND t.attribue = 0 ORDER BY d.date, d.match_key')
    .all(jourMoins(jourD, jours), jourD);
  if (!lignes.length) return [];
  const hasard = tirage(graine);
  const choisis = new Map();
  for (let essai = 0; essai < nombre * 20 && choisis.size < Math.min(nombre, lignes.length * 2); essai++) {
    const l = lignes[Math.floor(hasard() * lignes.length)];
    const camp = hasard() < 0.5 ? 'home' : 'away';
    choisis.set(`${l.match_key}|${camp}`, { matchKey: l.match_key, date: l.date, camp, club: Number(camp === 'home' ? l.home : l.away) });
  }
  return [...choisis.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : a.camp < b.camp ? -1 : 1));
}

const SOMMES = ['matchs', 'matchsCartons', 'jaunes', 'rouges', 'matchsFautes', 'fautes', 'matchsDeroule', 'penalties', 'matchsButs', 'buts90'];
const sommesDe = (e) => (e ? Object.fromEntries(SOMMES.map((k) => [k, e[k] ?? 0])) : null);

/**
 * CE QUE LA PASSE SAVAIT au jour J pour un couple (appelé par le crochet `avantLaJournee` de la passe, quand l'état ne
 * contient que les jours d'avant J) : le dernier match du club, son entraîneur, et les sommes de l'arbitre du match.
 * `rencontre` : la rencontre du couple dans le flux (son arbitre).
 */
export function instantaneDeLaPasse(contexte, couple, rencontre) {
  const etat = contexte.etatDuClub(couple.club);
  const d = etat?.dernier ?? null;
  const e = entraineurAuJourJ(etat?.entraineurs ?? []);
  const cle = cleDeLArbitre(rencontre?.arbitre);
  return {
    precedent: d ? { date: d.date, kickoff: isoOuNull(d.kickoff), matchKey: d.matchKey } : null,
    entraineur: { nom: e.nom, id: e.id, depuisMatchs: e.depuisMatchs },
    arbitre: cle ? { cle, sommes: sommesDe(contexte.arbitres.etat(cle)) } : null
  };
}

/** Le dernier match (non attribué) du club d'un jour strictement antérieur à J, relu dans les tables sources. */
function precedentParLeSecondChemin(database, club, J) {
  const r = database
    .prepare(
      `SELECT d.date, d.match_key, json_extract(m.meta, '$.kickoff') AS k FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre
       JOIN matches m ON m.match_key = d.match_key WHERE t.club = ? AND t.date < ? AND t.attribue = 0
       ORDER BY t.date DESC, COALESCE(json_extract(m.meta, '$.kickoff'), '') DESC, d.match_key DESC LIMIT 1`
    )
    .get(club, J);
  return r ? { date: r.date, kickoff: isoOuNull(r.k), matchKey: r.match_key } : null;
}

/** L'entraîneur du club au jour J, relu dans les compositions stockées (matches.lineups) de ses matchs d'avant J. */
function entraineurParLeSecondChemin(database, club, J) {
  const obs = [];
  for (const r of database
    .prepare(
      `SELECT d.date, t.camp, json_extract(m.lineups, '$.home.coach') AS ch, json_extract(m.lineups, '$.home.coachId') AS ih,
       json_extract(m.lineups, '$.away.coach') AS ca, json_extract(m.lineups, '$.away.coachId') AS ia
       FROM team_day t JOIN day_matches d ON d.rencontre = t.rencontre JOIN matches m ON m.match_key = d.match_key
       WHERE t.club = ? AND t.date < ? AND t.attribue = 0 ORDER BY t.date, d.match_key`
    )
    .iterate(club, J)) {
    const nom = texteStable(Number(r.camp) === 1 ? r.ch : r.ca);
    const brut = Number(Number(r.camp) === 1 ? r.ih : r.ia);
    const id = Number.isSafeInteger(brut) && brut > 0 ? brut : null;
    if (nom || id) obs.push({ date: r.date, nom, id });
  }
  const e = entraineurAuJourJ(obs);
  return { nom: e.nom, id: e.id, depuisMatchs: e.depuisMatchs };
}

/**
 * Les sommes des arbitres tirés, par le second chemin : UN balayage de `matches.meta` (nom et pays de l'arbitre de chaque
 * rencontre du registre), puis, pour les seules rencontres de ces arbitres, team_day et le déroulé. Rend Map(clé →
 * [{ date, apport }]).
 */
function arbitresParLeSecondChemin(database, cles) {
  const voulues = new Set(cles);
  const out = new Map([...voulues].map((c) => [c, []]));
  if (!voulues.size) return out;
  const trouvees = [];
  for (const r of database
    .prepare(`SELECT d.match_key, json_extract(m.meta, '$.referee.name') AS n, json_extract(m.meta, '$.referee.country') AS p FROM day_matches d JOIN matches m ON m.match_key = d.match_key`)
    .iterate()) {
    const cle = cleDeLArbitre({ name: r.n, country: r.p });
    if (cle && voulues.has(cle)) trouvees.push({ matchKey: r.match_key, cle });
  }
  const st = database.prepare(
    `SELECT d.date, t.attribue, t.prolongation, t.bp, t.bc, t.bp90, t.bc90, t.jaunes_p, t.jaunes_c, t.rouges_p, t.rouges_c, t.fautes_p, t.fautes_c,
     m.home_goals, m.away_goals, m.events FROM day_matches d JOIN team_day t ON t.rencontre = d.rencontre AND t.camp = 1
     JOIN matches m ON m.match_key = d.match_key WHERE d.match_key = ?`
  );
  for (const { matchKey, cle } of trouvees) {
    const l = st.get(matchKey);
    if (!l || Number(l.attribue)) continue;
    let events = null;
    try {
      events = typeof l.events === 'string' && l.events ? JSON.parse(l.events) : null;
    } catch {
      events = null;
    }
    const joue = l.home_goals !== null && l.away_goals !== null;
    const p = joue && Array.isArray(events) ? valeursDUneRencontre({ homeGoals: l.home_goals, awayGoals: l.away_goals, events }).penalties : null;
    out.get(cle).push({ date: l.date, apport: apportDUneRencontre({ cartons: cartonsDeLaLigne(l), penalties: Number.isInteger(p) ? p : null, buts90: butsA90DeLaLigne(l) }) });
  }
  return out;
}

/**
 * LE CONTRÔLE : pour chaque couple, l'instantané de la passe face au second chemin. `instantanes` : Map(« clé|camp » →
 * instantané). Rend { lignes, ecarts: [{ matchKey, J, club, camp, colonne, attendu, lu, texte }] }.
 */
export function controlerLesInstantanes({ database, couples, instantanes, nomDuClub = (club) => `club n° ${club}` }) {
  const ecarts = [];
  const cles = [...new Set(couples.map((c) => instantanes.get(`${c.matchKey}|${c.camp}`)?.arbitre?.cle).filter(Boolean))];
  const parArbitre = arbitresParLeSecondChemin(database, cles);
  let lignes = 0;
  for (const c of couples) {
    const lu = instantanes.get(`${c.matchKey}|${c.camp}`);
    const qui = `${nomDuClub(c.club)} avant le ${jourDit(c.date)}`;
    const ecart = (colonne, attendu, valeur, phrase) => ecarts.push({ matchKey: c.matchKey, J: c.date, club: c.club, camp: c.camp, colonne, attendu, lu: valeur, texte: `${qui} : ${phrase}` });
    if (!lu) {
      ecart('instantane', 'relevé', null, 'la passe n’a rien relevé ce jour-là (rencontre sautée)');
      continue;
    }
    lignes++;
    const p = precedentParLeSecondChemin(database, c.club, c.date);
    if ((p?.date ?? null) !== (lu.precedent?.date ?? null) || (p?.kickoff ?? null) !== (lu.precedent?.kickoff ?? null)) {
      ecart('precedent', p, lu.precedent, `dernier match lu le ${lu.precedent ? jourDit(lu.precedent.date) : '(aucun)'} par la passe, le ${p ? jourDit(p.date) : '(aucun)'} par le second chemin`);
    }
    const e = entraineurParLeSecondChemin(database, c.club, c.date);
    if (e.nom !== lu.entraineur.nom || e.id !== lu.entraineur.id || e.depuisMatchs !== lu.entraineur.depuisMatchs) {
      ecart('entraineur', e, lu.entraineur, `entraîneur « ${lu.entraineur.nom ?? '?'} » depuis ${lu.entraineur.depuisMatchs ?? '?'} match(s) pour la passe, « ${e.nom ?? '?'} » depuis ${e.depuisMatchs ?? '?'} pour le second chemin`);
    }
    if (lu.arbitre) {
      const attendu = Object.fromEntries(SOMMES.map((k) => [k, 0]));
      for (const x of parArbitre.get(lu.arbitre.cle) ?? []) {
        if (!(x.date < c.date)) continue;
        for (const k of SOMMES) attendu[k] += x.apport[k];
      }
      const differentes = SOMMES.filter((k) => (lu.arbitre.sommes?.[k] ?? 0) !== attendu[k]);
      if (differentes.length) {
        ecart('arbitre', attendu, lu.arbitre.sommes, `arbitre ${lu.arbitre.cle.split('|')[0]} : ${differentes.map((k) => `${k} ${lu.arbitre.sommes?.[k] ?? 0} pour la passe, ${attendu[k]} pour le second chemin`).join(', ')}`);
      }
    }
  }
  return { lignes, ecarts };
}
