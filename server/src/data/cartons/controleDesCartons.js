/**
 * controleDesCartons.js — LE CONTRÔLE ANTI-FUITE DE LA NUIT DES CARTONS (étape 33 du plan, lot 1b, 02/11/2026).
 * -----------------------------------------------------------------------
 * Le patron des contrôles de nuit (table du jour J, forces de buts, fiches des joueurs, styles de jeu, contexte du match) :
 * `couples` (rencontre, camp) tirés avec la graine du jour parmi les rencontres jouées des 365 derniers jours ; pour
 * chacun, ce que la passe des cartons SAVAIT au jour J (relevé AVANT que la journée J soit publiée) face à un SECOND
 * CHEMIN qui relit les tables sources directement (day_matches, team_day, matches, team_stats), sans le cache
 * `cartons_rencontres` ni l'accumulateur (critique de l'étape 33, recommandation 4 : la COMPOSITION des fenêtres, clés et
 * comptes — pas les rapports) :
 *   - la fenêtre de l'équipe : les clés de ses 20 derniers matchs aux cartons relevés d'un jour STRICTEMENT antérieur,
 *     dans une compétition qui avait ce jour-là sa moyenne (30 matchs relevés dans les 365 jours d'avant), et les cartons
 *     pris et provoqués de chacun ;
 *   - les sommes de l'arbitre du match : O (cartons réels) et n (matchs) de ses matchs d'avant J, entrés de la même façon.
 * Le second chemin recompte avec les seules RÈGLES pures (formulesDesCartons.js : cartonsDuDeroule, statutDesCartons, la
 * garde des vrais zéros) : chaque compétition concernée est relue en entier, jour par jour, comme la passe la publie.
 * Égalité EXACTE ; chaque écart est nommé, avec sa phrase (`texte`, dite telle quelle à l'écran : controlesAntiFuite.js).
 * Lecture seule, sur la base de l'appelant (dans la nuit : celle du processus à part). Aucune horloge.
 * -----------------------------------------------------------------------
 */

import { NUIT } from './reglagesCartons.js';
import { CONSTANTES_DES_CARTONS, statutDesCartons, statutApresLaGarde, gardeActive, estReleve, cleDArbitre } from './formulesDesCartons.js';

const JOUR_MS = 86_400_000;
const jourMoins = (jour, n) => new Date(Date.parse(`${jour}T00:00:00Z`) - n * JOUR_MS).toISOString().slice(0, 10);
const jourDit = (j) => (typeof j === 'string' && /^\d{4}-\d{2}-\d{2}/.test(j) ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : String(j ?? '?'));
const entierOuNull = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));
const ordre = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.matchKey < b.matchKey ? -1 : a.matchKey > b.matchKey ? 1 : 0);
// Les raisons FotMob (les mêmes règles que la lecture du magasin, écrites ici une seconde fois).
const NON_JOUE = /^(cancelled|abandoned|postponed)$/;
const PROLONGE = /^(afterextra|afterpenalties)$/;
const ATTRIBUE = /^(awarded_win|id_reused)$/;

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
 * des `jours` jours d'avant `jourD`. Rend [{ matchKey, date, camp: 'home' | 'away', club }], triés.
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
  return [...choisis.values()].sort((a, b) => ordre(a, b) || (a.camp < b.camp ? -1 : a.camp > b.camp ? 1 : 0));
}

/**
 * CE QUE LA PASSE SAVAIT au jour J pour un couple — appelé AVANT la publication de la journée J (l'accumulateur ne
 * contient que les jours d'avant J) : la composition de la fenêtre de l'équipe (clés et comptes, telles que la passe les
 * tient) et les sommes O et n de l'arbitre du match. `acc` : l'accumulateur (CartonsAuJourJ) ; `rencontre` : la rencontre
 * du couple dans le flux (son arbitre).
 */
export function instantaneDeLaPasse(acc, couple, rencontre) {
  const fenetre = (acc.equipes.get(couple.club) ?? []).map((e) => ({ matchKey: e.matchKey ?? null, c: e.c, a: e.a }));
  const cle = cleDArbitre(rencontre?.arbitre);
  const a = cle ? acc.arbitres.get(cle) : null;
  return { fenetre, arbitre: cle ? { cle, O: a ? a.O : 0, n: a ? a.n : 0 } : null };
}

const SQL_LIGUE = `SELECT d.match_key, d.date, d.league, d.home, d.away, h.attribue, h.prolongation,
  m.events, json_extract(m.meta, '$.referee.name') AS an, json_extract(m.meta, '$.referee.country') AS ap,
  json_extract(m.meta, '$.reason') AS raison, json_extract(m.meta, '$.awarded') AS awarded,
  th.yellow_cards AS jh, th.red_cards AS rh, ta.yellow_cards AS ja, ta.red_cards AS ra
  FROM day_matches d JOIN team_day h ON h.rencontre = d.rencontre AND h.camp = 1
  LEFT JOIN matches m ON m.match_key = d.match_key
  LEFT JOIN team_stats th ON th.match_key = d.match_key AND th.side = 'home'
  LEFT JOIN team_stats ta ON ta.match_key = d.match_key AND ta.side = 'away'
  WHERE d.league = ? AND d.date < ? ORDER BY d.date, d.match_key`;

/** Une rencontre relue dans les tables sources : son statut de base (sans la garde), ses cartons, son arbitre. */
function rencontreRelue(l) {
  let evenements = null;
  if (typeof l.events === 'string' && l.events) {
    try {
      evenements = JSON.parse(l.events);
    } catch {
      evenements = null;
    }
  }
  const raison = typeof l.raison === 'string' ? l.raison.trim() : '';
  const attribue = Boolean(Number(l.attribue)) || l.awarded === 1 || l.awarded === true || l.awarded === 'true' || ATTRIBUE.test(raison);
  const prolongation = Boolean(Number(l.prolongation)) || PROLONGE.test(raison);
  const s = statutDesCartons({ evenements, ligne: { jDom: entierOuNull(l.jh), jExt: entierOuNull(l.ja), rDom: entierOuNull(l.rh), rExt: entierOuNull(l.ra) }, attribue, prolongation, nonJoue: NON_JOUE.test(raison) });
  return { matchKey: l.match_key, date: l.date, league: l.league, home: Number(l.home), away: Number(l.away), statutBase: s.statut, valeur: s.valeur, arbitre: cleDArbitre({ name: l.an, country: l.ap }) };
}

/**
 * Les matchs ENTRÉS (dans les fenêtres d'équipe et les sommes des arbitres) d'une compétition, avant `jusqua`, par le
 * second chemin : la compétition relue en entier, jour par jour — la garde des vrais zéros (les 60 derniers relevés,
 * saisons confondues) et la moyenne (30 matchs relevés dans les 365 jours d'avant) au jour de chaque match, la journée
 * publiée en fin de jour.
 */
function entresDUneLigue(database, league, jusqua, c = CONSTANTES_DES_CARTONS) {
  const out = [];
  const jours = [];
  let somme = 0;
  const garde = [];
  let jour = null;
  let duJour = [];
  const publier = () => {
    let n = 0;
    for (const r of duJour) {
      if (estReleve(r.statutBase)) {
        garde.push(r.statutBase === 'vrai-zero' ? 1 : 0);
        if (garde.length > c.gardeZero.derniers) garde.shift();
      }
      if (r.releve && r.valeur) n++;
    }
    if (n) {
      jours.push({ date: jour, n });
      somme += n;
    }
    duJour = [];
  };
  const ouvrir = (d) => {
    const limite = jourMoins(d, c.ligueJours);
    while (jours.length && jours[0].date < limite) somme -= jours.shift().n;
  };
  for (const l of database.prepare(SQL_LIGUE).iterate(league, jusqua)) {
    const r = rencontreRelue(l);
    if (jour !== null && r.date !== jour) publier();
    if (r.date !== jour) {
      jour = r.date;
      ouvrir(jour);
    }
    const vraisZeros = garde.reduce((s, x) => s + x, 0);
    r.releve = estReleve(statutApresLaGarde(r.statutBase, gardeActive({ n: garde.length, vraisZeros }, c.gardeZero)));
    r.moyenne = somme >= c.minLigue;
    if (r.releve && r.valeur && r.moyenne) out.push(r);
    duJour.push(r);
  }
  publier();
  return out;
}

/**
 * LE SECOND CHEMIN : pour les clubs et les arbitres des couples, les matchs ENTRÉS d'avant `jusqua` — chaque compétition
 * où ces clubs ont joué, et chaque compétition des matchs de ces arbitres (UN balayage de matches.meta pour les trouver),
 * relue en entier. Rend { parClub: Map(club → [entrés]), parArbitre: Map(clé → [entrés]), ligues }.
 */
export function entresParLeSecondChemin(database, { clubs, arbitres, jusqua }) {
  const lesClubs = [...new Set(clubs)].filter((x) => Number.isSafeInteger(x));
  const lesArbitres = new Set(arbitres.filter(Boolean));
  const ligues = new Set();
  if (lesClubs.length) {
    const marques = lesClubs.map(() => '?').join(', ');
    for (const r of database.prepare(`SELECT DISTINCT league FROM day_matches WHERE date < ? AND (home IN (${marques}) OR away IN (${marques}))`).iterate(jusqua, ...lesClubs, ...lesClubs)) ligues.add(r.league);
  }
  if (lesArbitres.size) {
    for (const r of database
      .prepare(`SELECT d.league, json_extract(m.meta, '$.referee.name') AS n, json_extract(m.meta, '$.referee.country') AS p FROM day_matches d JOIN matches m ON m.match_key = d.match_key WHERE d.date < ?`)
      .iterate(jusqua)) {
      const cle = cleDArbitre({ name: r.n, country: r.p });
      if (cle && lesArbitres.has(cle)) ligues.add(r.league);
    }
  }
  const parClub = new Map(lesClubs.map((x) => [x, []]));
  const parArbitre = new Map([...lesArbitres].map((x) => [x, []]));
  for (const league of [...ligues].sort()) {
    for (const r of entresDUneLigue(database, league, jusqua)) {
      if (parClub.has(r.home)) parClub.get(r.home).push(r);
      if (parClub.has(r.away)) parClub.get(r.away).push(r);
      if (r.arbitre && parArbitre.has(r.arbitre)) parArbitre.get(r.arbitre).push(r);
    }
  }
  for (const l of [...parClub.values(), ...parArbitre.values()]) l.sort(ordre);
  return { parClub, parArbitre, ligues: ligues.size };
}

/**
 * LE CONTRÔLE : pour chaque couple, l'instantané de la passe face au second chemin. `instantanes` : Map(« clé|camp » →
 * instantané). Rend { lignes, ligues, ecarts: [{ matchKey, J, club, camp, colonne, attendu, lu, texte }] }.
 */
export function controlerLesInstantanes({ database, couples, instantanes, nomDuClub = (club) => `club n° ${club}`, constantes = CONSTANTES_DES_CARTONS }) {
  const ecarts = [];
  if (!couples.length) return { lignes: 0, ligues: 0, ecarts };
  const jusqua = couples.reduce((m, c) => (c.date > m ? c.date : m), couples[0].date);
  const cles = couples.map((c) => instantanes.get(`${c.matchKey}|${c.camp}`)?.arbitre?.cle ?? null);
  const second = entresParLeSecondChemin(database, { clubs: couples.map((c) => c.club), arbitres: cles, jusqua });
  let lignes = 0;
  for (const c of couples) {
    const lu = instantanes.get(`${c.matchKey}|${c.camp}`);
    const qui = `${nomDuClub(c.club)} avant le ${jourDit(c.date)}`;
    const ecart = (colonne, attendu, valeur, phrase) => ecarts.push({ matchKey: c.matchKey, J: c.date, club: c.club, camp: c.camp, colonne, attendu, lu: valeur, texte: `${qui} : ${phrase}` });
    if (!lu) {
      ecart('instantane', 'relevé', null, 'la passe des cartons n’a rien relevé ce jour-là (rencontre sautée)');
      continue;
    }
    lignes++;
    const avant = (second.parClub.get(c.club) ?? []).filter((r) => r.date < c.date);
    const attendue = avant.slice(-constantes.fenetreEquipe).map((r) => ({ matchKey: r.matchKey, c: r.home === c.club ? r.valeur.home : r.valeur.away, a: r.home === c.club ? r.valeur.away : r.valeur.home }));
    if (JSON.stringify(attendue) !== JSON.stringify(lu.fenetre)) {
      const enPlus = lu.fenetre.filter((x) => !attendue.some((y) => y.matchKey === x.matchKey)).map((x) => x.matchKey);
      const enMoins = attendue.filter((x) => !lu.fenetre.some((y) => y.matchKey === x.matchKey)).map((x) => x.matchKey);
      const comptes = attendue.filter((x) => lu.fenetre.some((y) => y.matchKey === x.matchKey && (y.c !== x.c || y.a !== x.a))).map((x) => x.matchKey);
      ecart(
        'fenetre',
        attendue,
        lu.fenetre,
        `fenêtre des cartons de ${lu.fenetre.length} match(s) pour la passe, ${attendue.length} pour le second chemin` +
          (enPlus.length ? ` ; en trop pour la passe : ${enPlus.slice(0, 3).join(', ')}` : '') +
          (enMoins.length ? ` ; manquants pour la passe : ${enMoins.slice(0, 3).join(', ')}` : '') +
          (comptes.length ? ` ; cartons différents : ${comptes.slice(0, 3).join(', ')}` : '')
      );
    }
    if (lu.arbitre) {
      const sesMatchs = (second.parArbitre.get(lu.arbitre.cle) ?? []).filter((r) => r.date < c.date);
      const attendu = { O: sesMatchs.reduce((s, r) => s + r.valeur.total, 0), n: sesMatchs.length };
      if (attendu.O !== lu.arbitre.O || attendu.n !== lu.arbitre.n) {
        ecart('arbitre', attendu, { O: lu.arbitre.O, n: lu.arbitre.n }, `arbitre ${lu.arbitre.cle.split('|')[0]} : ${lu.arbitre.n} match(s) et ${lu.arbitre.O} carton(s) pour la passe, ${attendu.n} et ${attendu.O} pour le second chemin`);
      }
    }
  }
  return { lignes, ligues: second.ligues, ecarts };
}
