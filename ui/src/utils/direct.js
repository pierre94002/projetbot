/**
 * direct.js — LES MOTS DU DIRECT (étape 46 du plan, lot 1, partie D, 12/11/2026).
 * -----------------------------------------------------------------------
 * Toutes les phrases de la page « Direct », de ses cartes, du détail d'un match et de l'encart de la page du match
 * (conception § 1.2 et § 4.2 ; critique R2, R3, R4, R5, R6, R8, R9, R10, R11, R12, R17, R25, R28, R29, R30, R35 point 4,
 * R37 ; décisions P4, P6, P6 bis). Règle PURE (server/test/aides/rendu.mjs, `reglesPures`) : aucun import, ni Vue, ni
 * réseau, ni navigateur, ni horloge — `maintenant` est toujours passé. Les tests rejouent ces phrases sur les VRAIES
 * réponses du serveur (data/direct/lectureDuDirect.js).
 *
 * Ce que l'écran ne fait jamais : un pourcentage tant que le calcul est « à blanc » (sans note du banc d'essai, P4) ;
 * « 100 % » ou « 0 % » ; un écart entre la référence et le calcul (R2 : deux instants différents) ; une « cote juste »
 * (R3) ; un mot du banc (« perte log », « créneau », « strate ») ; une minute extrapolée par l'horloge.
 * -----------------------------------------------------------------------
 */

// ------------------------------------------------------------ les constantes

/** Les familles de marchés du détail (P6, question 8 : toutes ; le retrait d'une famille se fera d'une ligne au verdict). */
export const MARCHES_MONTRES = Object.freeze(['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal', 'scoreExact']);
/** Les familles qu'aucun jugement du banc ne couvre (R17, voie courte ; P6, question 9) : en gris, « non jugé au banc ». */
export const FAMILLES_NON_JUGEES = Object.freeze(['resultAndTotal', 'scoreExact']);
/** Le titre de chaque famille au détail. */
export const TITRES_DES_FAMILLES = Object.freeze({
  result: 'Résultat (1 N 2)',
  totalGoals: 'Buts du match',
  bothTeamsScore: 'Les deux équipes marquent',
  teamGoals: 'Buts de chaque équipe',
  resultAndTotal: 'Résultat et buts',
  scoreExact: 'Scores exacts les plus probables'
});
/** Les noms des sources des cotes en direct (§ 3.4) : jamais les payantes. */
export const NOMS_DES_SOURCES = Object.freeze({ espn: 'ESPN', '365scores': '365Scores', kalshi: 'Kalshi', smarkets: 'Smarkets' });
/** Les phases d'un match qui se joue : la puce rouge « en direct » de l'appli, avec le mot et le point. */
export const PHASES_EN_JEU = Object.freeze(['jeu', 'mi-temps', 'prolongation', 'tirs-au-but', 'minute-inconnue', 'libelle-inconnu']);
/** R3 point 3 : dans le bandeau et sous le tableau du détail. */
export const PHRASE_DU_RETARD =
  "Le score et la minute arrivent avec une à deux minutes de retard, les cartons rouges avec jusqu'à cinq ; une cote en direct, elle, bouge en quelques secondes. Ne comparez pas ces chiffres à une cote en direct.";
/** Le bandeau (conception § 1.1 ; R4 point 6 : « à chaque relevé », jamais « minute après minute »). */
export const PHRASE_DU_BANDEAU =
  "Les matchs en cours des championnats suivis : le score, la minute et les cartons rouges relevés chez FotMob, à chaque relevé (toutes les une à deux minutes). Les probabilités du calcul ne sont montrées que si le banc d'essai les a jugées ; jamais un pari conseillé.";
/** L'encart de la page du match : monté de 10 minutes avant le coup d'envoi à 4 heures après (une prolongation dépasse les 130 minutes de matchStatus.js). */
export const ENCART_AVANT_MS = 10 * 60_000;
export const ENCART_APRES_MS = 4 * 3_600_000;
/** Un match demandé par ses clubs : celui dont le coup d'envoi est à moins de 3 heures (la règle de la route, § 4.1). */
const ECART_DU_COUP_MS = 3 * 3_600_000;

// ------------------------------------------------------------ les heures, les âges, les nombres

const FUSEAU = 'Europe/Paris';
const instantDe = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(t) ? t : null;
};
const parties = (t, options) =>
  Object.fromEntries(new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, hourCycle: 'h23', ...options }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));

/** « 21 h 34 » (heure de Paris, R37 point 2 : un seul format) ; null sans heure. */
export function heureCourte(v) {
  const t = instantDe(v);
  if (t === null) return null;
  const p = parties(t, { hour: '2-digit', minute: '2-digit' });
  return `${p.hour} h ${p.minute}`;
}
/** « 14/11 à 13 h 11 » ; null sans heure. */
export function dateEtHeure(v) {
  const t = instantDe(v);
  if (t === null) return null;
  const p = parties(t, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return `${p.day}/${p.month} à ${p.hour} h ${p.minute}`;
}
/** « le 14/11 à 13 h 11 » ; null sans heure. */
export const jourEtHeure = (v) => (dateEtHeure(v) ? `le ${dateEtHeure(v)}` : null);

/** « 40 s », « 1 min 40 », « 12 min », « 2 h 05 » (R3 point 1) ; null sans âge. */
export function ageDit(s) {
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return null;
  const n = Math.round(s);
  if (n < 60) return `${n} s`;
  if (n < 600) {
    const m = Math.floor(n / 60);
    const r = n % 60;
    return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min`;
  }
  if (n < 3600) return `${Math.floor(n / 60)} min`;
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const nombreDit = (x, d = 1) => Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const entierDit = (n) => Number(n).toLocaleString('fr-FR');
const butsDe = (L) => `${nombreDit(L)} ${Number(L) < 2 ? 'but' : 'buts'}`;
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

/** Une probabilité en mots : « 62 % » ; « plus de 99 % », « moins de 1 % » — jamais « 100 % » ni « 0 % » ; null sans nombre. */
export function pourcentDit(p) {
  if (!fini(p)) return null;
  if (p >= 0.995) return 'plus de 99 %';
  if (p < 0.005) return 'moins de 1 %';
  return `${Math.round(p * 100)} %`;
}

/** Le 1N2 arrondi au plus fort reste (R35 point 4) : trois entiers qui font 100 ; null s'il manque un nombre. */
export function un2Arrondi(un2) {
  const cles = ['home', 'draw', 'away'];
  const v = cles.map((k) => un2?.[k]);
  if (!v.every(fini)) return null;
  const somme = v.reduce((s, x) => s + x, 0);
  if (!(somme > 0)) return null;
  const brut = v.map((x) => (100 * x) / somme);
  const bas = brut.map((x) => Math.floor(x));
  let reste = 100 - bas.reduce((s, x) => s + x, 0);
  const ordre = brut.map((x, i) => [x - bas[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of ordre) {
    if (reste <= 0) break;
    bas[i] += 1;
    reste -= 1;
  }
  return Object.fromEntries(cles.map((k, i) => [k, bas[i]]));
}
/** Le 1N2 en mots, au plus fort reste, sans jamais « 100 % » ni « 0 % ». */
export function un2Dit(un2) {
  const a = un2Arrondi(un2);
  if (!a) return null;
  const dit = (k) => (un2[k] >= 0.995 || a[k] >= 100 ? 'plus de 99 %' : un2[k] < 0.005 || a[k] <= 0 ? 'moins de 1 %' : `${a[k]} %`);
  return { home: dit('home'), draw: dit('draw'), away: dit('away') };
}
const pointsDits = (pt) => {
  const n = Math.round(Math.abs(pt));
  return `${n} ${pluriel(n, 'point', 'points')}`;
};

// ------------------------------------------------------------ la minute, les tranches, les marchés

/** La puce de minute : « 34e », « 45+2 », « 90+3 », « Mi-temps », « Prolongation »… (jamais extrapolée par l'horloge). */
export function minuteDite(etat) {
  const ph = etat?.phase ?? null;
  const LIBELLES = {
    'mi-temps': 'Mi-temps',
    prolongation: 'Prolongation',
    'tirs-au-but': 'Tirs au but',
    'fin-90': 'Fin du temps réglementaire',
    termine: 'Terminé',
    interrompu: 'Interrompu',
    arrete: 'Arrêté',
    attribue: 'Résultat attribué',
    avant: 'Pas commencé',
    'sans-releve': 'Sans relevé',
    'libelle-inconnu': 'État inconnu',
    'minute-inconnue': 'Minute inconnue'
  };
  if (ph === 'jeu') {
    if (Number.isInteger(etat.ajout) && etat.ajout > 0) return `${etat.creneau === 45 ? 45 : 90}+${etat.ajout}`;
    if (Number.isInteger(etat.minute)) return etat.minute <= 1 ? '1re' : `${etat.minute}e`;
    return 'Minute inconnue';
  }
  return LIBELLES[ph] ?? 'État inconnu';
}

const TRANCHES = Object.freeze({
  '1-15': 'entre la 1re et la 15e minute',
  '16-30': 'entre la 16e et la 30e minute',
  '31-45': 'entre la 31e et la 45e minute',
  '45+': 'pendant les arrêts de jeu de la 1re mi-temps',
  '46-60': 'entre la 46e et la 60e minute',
  '61-75': 'entre la 61e et la 75e minute',
  '76-90': 'entre la 76e et la 90e minute',
  '90+': 'pendant les arrêts de jeu de la 2e mi-temps'
});
/** Une tranche de la note du banc en mots (« entre la 76e et la 90e minute »). */
export const trancheDite = (t) => TRANCHES[t] ?? 'dans cette partie du match';
/** Les arrêts de jeu : une partie du match qu'aucun jugement du banc ne couvre (R17 point 3). */
export const enArretsDeJeu = (etat) => etat?.tranche === '45+' || etat?.tranche === '90+';

/**
 * Le libellé d'un marché du direct et le camp qu'il nomme (R29 point 2 : un logo devant) : « Arsenal gagne », « Plus de
 * 2,5 buts », « Chelsea marque »… `cle` : la clé à plat du serveur (`result.home`, `totalGoals.2.5.over`,
 * `teamGoals.away.0.5.over`, `bothTeamsScore.yes`, `resultAndTotal.2.5.homeOver`).
 */
export function libelleDuMarche(cle, { home = 'Domicile', away = 'Extérieur' } = {}) {
  const k = String(cle ?? '');
  const nom = { home, away };
  let m = /^result\.(home|draw|away)$/.exec(k);
  if (m) return m[1] === 'draw' ? { texte: 'Match nul', camps: [] } : { texte: `${nom[m[1]]} gagne`, camps: [m[1]] };
  m = /^totalGoals\.(\d+\.\d+)\.(over|under)$/.exec(k);
  if (m) return { texte: `${m[2] === 'over' ? 'Plus' : 'Moins'} de ${butsDe(m[1])}`, camps: [] };
  m = /^teamGoals\.(home|away)\.(\d+\.\d+)\.(over|under)$/.exec(k);
  if (m) {
    const [, c, L, s] = m;
    if (Number(L) === 0.5) return { texte: s === 'over' ? `${nom[c]} marque` : `${nom[c]} ne marque pas`, camps: [c] };
    return { texte: `${nom[c]} : ${s === 'over' ? 'plus' : 'moins'} de ${butsDe(L)}`, camps: [c] };
  }
  m = /^bothTeamsScore\.(yes|no)$/.exec(k);
  if (m) return { texte: m[1] === 'yes' ? 'Les deux équipes marquent' : 'Une équipe au moins ne marque pas', camps: [] };
  m = /^resultAndTotal\.(\d+\.\d+)\.(home|draw|away)(Over|Under)$/.exec(k);
  if (m) {
    const [, L, r, s] = m;
    const debut = r === 'draw' ? 'Match nul' : `${nom[r]} gagne`;
    return { texte: `${debut} et ${s === 'Over' ? 'plus' : 'moins'} de ${butsDe(L)}`, camps: r === 'draw' ? [] : [r] };
  }
  m = /^scoreExact\.(\d+)-(\d+)$/.exec(k);
  if (m) return { texte: `Score exact ${m[1]}-${m[2]}`, camps: [] };
  if (k === 'scoreExact.autre') return { texte: 'Un autre score', camps: [] };
  return { texte: 'Un marché du direct', camps: [] };
}

/** L'unité d'une paire du banc (`totalGoals.2.5`, `result.home`, `bothTeamsScore`…) ramenée à la ligne qu'elle juge. */
const cleDeLUnite = (u) => {
  const s = String(u ?? '');
  if (/^totalGoals\.\d+\.\d+$/.test(s) || /^teamGoals\.(home|away)\.\d+\.\d+$/.test(s)) return `${s}.over`;
  if (s === 'bothTeamsScore') return 'bothTeamsScore.yes';
  return s;
};
/** Une ligne du direct est-elle visée par une paire du banc (`unite` = la ligne, ses deux issues, ou la famille) ? */
const viseLaLigne = (unite, cle) => {
  const u = String(unite ?? '');
  return Boolean(u) && (cle === u || cle.startsWith(`${u}.`) || cle === cleDeLUnite(u));
};

/** « écarté par le banc d'essai (annoncé 61 %, arrivé 52 % sur 40 matchs) » (banc-regles § 9). */
export function pairePhrase(p) {
  const chiffres = [fini(p?.annonce) ? `annoncé ${pourcentDit(p.annonce)}` : null, fini(p?.realise) ? `arrivé ${pourcentDit(p.realise)}` : null].filter(Boolean).join(', ');
  const n = Number.isInteger(p?.n) ? ` sur ${entierDit(p.n)} ${pluriel(p.n, 'match', 'matchs')}` : '';
  return chiffres || n ? `(${chiffres}${n})` : '';
}

// ------------------------------------------------------------ l'adresse de la page « Direct » (P6 bis)

const ID_FOTMOB = /^fotmob-[1-9]\d*$/;
const ID_MATCH = /^[1-9]\d*$/;

/** L'instant d'un rejeu lu dans l'adresse (`?instant=`, R28) ; null hors rejeu ou illisible. */
export function instantDeLAdresse(query) {
  const v = Array.isArray(query?.instant) ? query.instant[0] : query?.instant;
  return typeof v === 'string' && instantDe(v) !== null ? v : null;
}

/** Le match visé par l'adresse : `?match=<id FotMob>`, ou `?home=fotmob-…&away=fotmob-…&coup=<ISO>` ; `page` : sa page dans l'appli. */
export function cibleDeLAdresse(query) {
  const lu = (k) => {
    const v = Array.isArray(query?.[k]) ? query[k][0] : query?.[k];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  };
  const page = lu('page');
  const id = lu('match');
  if (id && ID_MATCH.test(id)) return { id, home: null, away: null, coup: null, page };
  const home = lu('home');
  const away = lu('away');
  const coup = lu('coup');
  if (home && away && ID_FOTMOB.test(home) && ID_FOTMOB.test(away) && coup && instantDe(coup) !== null) return { id: null, home, away, coup, page };
  return null;
}

/** L'adresse de la page « Direct » positionnée sur un match (et dans le même rejeu) : { path, query }. */
export function adresseDuDirect({ id = null, home = null, away = null, coup = null, page = null, instant = null } = {}) {
  const query = {};
  if (id && ID_MATCH.test(String(id))) query.match = String(id);
  else if (home && away && ID_FOTMOB.test(home) && ID_FOTMOB.test(away) && instantDe(coup) !== null) Object.assign(query, { home, away, coup: new Date(instantDe(coup)).toISOString() });
  if (page && (query.match || query.home)) query.page = String(page);
  if (instant && instantDe(instant) !== null) query.instant = instant;
  return { path: '/direct', query };
}

/** Le match du tableau que vise l'adresse : par son identifiant FotMob, ou par ses deux clubs et un coup d'envoi à moins de 3 h. */
export function estLaCible(entree, cible) {
  if (!entree || !cible) return false;
  if (cible.id) return String(entree.fotmobId) === cible.id;
  const t = instantDe(entree.kickoff);
  return entree.home?.id === cible.home && entree.away?.id === cible.away && t !== null && Math.abs(t - instantDe(cible.coup)) < ECART_DU_COUP_MS;
}

/** L'encart de la page du match se monte-t-il ? De 10 minutes avant le coup d'envoi à 4 heures après (`maintenant` : l'heure du rejeu en rejeu). */
export function fenetreDeLEncart(coup, maintenant) {
  const t = instantDe(coup);
  if (t === null || !fini(maintenant)) return false;
  return maintenant >= t - ENCART_AVANT_MS && maintenant <= t + ENCART_APRES_MS;
}

// ------------------------------------------------------------ les matchs en cours de toute l'appli (correctifs D2, point 2)

/** « fotmob-123 » (ou « 123 ») → « fotmob-123 » ; un nom, un vide → null (jamais un nom). */
export function idDeClub(v) {
  const m = /^(?:fotmob-)?([1-9]\d*)$/.exec(String(v ?? '').trim());
  return m ? `fotmob-${m[1]}` : null;
}

/** La clé d'un match par la PAIRE d'identifiants FotMob de ses clubs (« fotmob-1|fotmob-2 ») ; null s'il en manque un. */
export function cleDeLaPaire(homeId, awayId) {
  const h = idDeClub(homeId);
  const a = idDeClub(awayId);
  return h && a ? `${h}|${a}` : null;
}

/** Le jour (AAAA-MM-JJ, UTC) d'une date « 2026-11-07 » ou d'un instant ISO ; null sinon. */
export function jourDe(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = instantDe(v);
  return t === null ? null : new Date(t).toISOString().slice(0, 10);
}

/** Deux jours à un jour près au plus (un match à cheval sur minuit, un fuseau) ; faux s'il en manque un. */
export function joursProches(a, b) {
  const ja = jourDe(a);
  const jb = jourDe(b);
  if (!ja || !jb) return false;
  return Math.abs(Date.parse(`${ja}T00:00:00Z`) - Date.parse(`${jb}T00:00:00Z`)) <= 86_400_000;
}

/**
 * L'ENSEMBLE DES MATCHS EN COURS (GET /api/direct/en-cours) indexé par la PAIRE d'identifiants FotMob : Map(clé → [entrées]).
 * Une réponse illisible, absente, une entrée sans ses deux identifiants : rien.
 */
export function indexDesEnCours(reponse) {
  const index = new Map();
  for (const e of Array.isArray(reponse?.matchs) ? reponse.matchs : []) {
    const cle = cleDeLaPaire(e?.homeId, e?.awayId);
    if (!cle) continue;
    if (!index.has(cle)) index.set(cle, []);
    index.get(cle).push(e);
  }
  return index;
}

/** Le compte « N en direct » : tous les matchs que la boucle suit en cours (0 pour une réponse illisible ou absente). */
export const compteDesEnCours = (reponse) => (Array.isArray(reponse?.matchs) ? reponse.matchs.length : 0);

/**
 * Le match EN COURS d'une carte ou d'une page : l'entrée de l'ensemble dont la paire est la sienne (identifiants FotMob,
 * jamais un nom), le jour à un jour près (une autre rencontre des deux mêmes clubs ne s'allume jamais) ; null sinon — et
 * null si deux entrées répondent.
 */
export function enCoursDeLaPaire(index, { homeId = null, awayId = null, jour = null } = {}) {
  const cle = cleDeLaPaire(homeId, awayId);
  if (!cle || !(index instanceof Map)) return null;
  const proches = (index.get(cle) ?? []).filter((e) => joursProches(jour, e?.date));
  return proches.length === 1 ? proches[0] : null;
}

/**
 * La minute de la puce « Direct » d'une carte de rencontre, d'après l'ensemble : « 34e », « 45+2 », « Mi-temps »,
 * « Prolongation », « Tirs au but » ; null sinon (minute inconnue, autre phase : la puce dit « Direct » seul).
 * Correctif « écrans 1 » (13/11/2026) : un relevé périmé (boucle suspendue ou arrêtée, match sorti de la liste) ne donne
 * aucune minute — jamais une minute figée sans son âge (la carte dit l'âge au survol).
 */
export function minuteDeLaPuce(e) {
  if (e?.perime) return null;
  const ph = e?.phase ?? null;
  if (ph === 'jeu') return Number.isInteger(e.minute) || (Number.isInteger(e.ajout) && e.ajout > 0) ? minuteDite(e) : null;
  return ['mi-temps', 'prolongation', 'tirs-au-but'].includes(ph) ? minuteDite(e) : null;
}

/**
 * Relire au tic de l'horloge partagée ? (correctifs D2, point 1) En direct, toujours ; en rejeu, tant que des calculs sont
 * en attente ; et, en direct comme en rejeu, TANT QU'AUCUNE RÉPONSE N'EST ARRIVÉE ET QU'AUCUNE ERREUR N'EST DITE (une page
 * montée dans un onglet caché n'a rien lu). Un match terminé (l'encart) ne se relit plus. L'onglet caché, lui, ne lit
 * jamais : c'est la lecture qui le vérifie.
 */
export function relireAuTic({ instant = null, reponse = null, erreur = null, enAttente = 0, termine = false } = {}) {
  if (termine) return false;
  if (!reponse && !erreur) return true;
  return !instant || enAttente > 0;
}

/**
 * La provenance de l'en-tête de la page « Direct » (correctifs D2, point 4) : en rejeu, les instantanés rangés et l'instant
 * (« instantanés rangés · rejeu du 07/11 à 16 h 40 ») ; en direct, la liste du jour de FotMob et l'heure de sa lecture.
 * `releveLe` : l'heure que dit la pastille au survol (l'instant du rejeu, ou la lecture de la liste).
 */
export function provenanceDeLEnTete({ instant = null, listeLueLe = null } = {}) {
  const quand = dateEtHeure(instant);
  // Mineur du 13/11 soir (écrans 9) : `titre`, le survol de la pastille, au même format d'heure que le texte (R37 point 2).
  if (instant && quand) return { source: 'instantanés rangés', quand: `rejeu du ${quand}`, releveLe: instant, rejeu: true, titre: `Instantanés rangés dans la base : rejeu du ${quand}.` };
  const lue = heureCourte(listeLueLe);
  const dit = lue ? `liste lue à ${lue}` : 'liste pas encore lue';
  return { source: 'FotMob (liste du jour)', quand: dit, releveLe: listeLueLe ?? null, rejeu: false, titre: `FotMob (liste du jour) : ${dit}.` };
}

// ------------------------------------------------------------ le tableau et la boucle (R10, R25, R28)

/** L'état du tableau (`data-etat`) : chargement, erreur, illisible, coupe, suspendu, perime, vide, ok. */
export function etatDuTableau(reponse, { erreur = null } = {}) {
  if (erreur) return 'erreur';
  if (!reponse) return 'chargement';
  if (reponse.etat === 'illisible') return 'illisible';
  const b = reponse.boucle ?? {};
  if (b.pourquoi === 'suspendue') return 'suspendu';
  if (['coupee', 'bac-a-sable', 'pas-demarree'].includes(b.pourquoi)) return 'coupe';
  if (b.pourquoi === 'plus-de-tour') return 'perime';
  return (reponse.matchs ?? []).length ? 'ok' : 'vide';
}

/** Les puces du bandeau : « 7 en cours », « 2 à la mi-temps ». */
export function resumeDuTableau(reponse) {
  const matchs = reponse?.matchs ?? [];
  return { enCours: matchs.length, miTemps: matchs.filter((e) => e.etat?.phase === 'mi-temps').length, finis: (reponse?.finis ?? []).length };
}

/** Le bandeau ambre d'un rejeu (R28 point 1). */
export function rejeuDit(instant) {
  const quand = dateEtHeure(instant);
  return quand
    ? `Rejeu du ${quand} : chaque match est refait depuis les instantanés rangés dans la base (ceux des 6 minutes d'avant) ; rien n'est en direct.`
    : null;
}

const RAISON_ILLISIBLE = Object.freeze({
  'module-illisible': "le direct n'a pas pu démarrer sur le serveur",
  'lecture-ratee': 'la lecture du direct a échoué sur le serveur'
});
/** Une réponse « illisible » du serveur (R24) : jamais une erreur 500, les autres pages ne sont pas touchées. */
export const illisibleDit = (r) => `Direct illisible : ${RAISON_ILLISIBLE[r?.raison] ?? 'réponse du serveur illisible'}. Les autres pages de l'appli ne sont pas touchées.`;

/**
 * Ce que la boucle du direct dit au tableau (R10, R25, R37 point 6) : { ton, texte } ou null quand rien n'est à dire.
 * Hors match, l'état est « vide », jamais « périmé » ; « PC en veille ou boucle arrêtée » seulement après 5 minutes sans tour.
 */
export function boucleDite(boucle, { matchs = 0 } = {}) {
  const b = boucle ?? {};
  if (b.rejeu) return null;
  const phrase = b.phrase ? ` (${b.phrase})` : '';
  switch (b.pourquoi) {
    case 'bac-a-sable':
      return { cle: 'boucle-bac', ton: 'warning', texte: `Boucle du direct coupée dans le bac à sable${phrase} : aucun match n'est suivi ici ; ouvrez un rejeu (adresse « ?instant= ») pour voir l'écran.` };
    case 'coupee':
      return { cle: 'boucle-coupee', ton: 'warning', texte: `Boucle du direct arrêtée${phrase} : aucun match n'est suivi en ce moment.` };
    case 'pas-demarree':
      return { cle: 'boucle-pas-demarree', ton: 'warning', texte: `Boucle du direct pas encore démarrée${phrase} : les matchs s'afficheront à son premier tour.` };
    case 'suspendue': {
      const jusqua = heureCourte(b.suspendueJusqua);
      return { cle: 'boucle-suspendue', ton: 'warning', texte: `FotMob répond mal : la boucle du direct est arrêtée${jusqua ? ` jusqu'à ${jusqua}` : ''} ; les chiffres ci-dessous sont ceux du dernier relevé, en gris.` };
    }
    case 'plus-de-tour': {
      const dernier = heureCourte(b.dernierTourLe);
      return { cle: 'boucle-sans-tour', ton: 'warning', texte: `Pas de tour de la boucle depuis ${dernier ?? 'plus de 5 minutes'} (PC en veille ou boucle arrêtée) : les chiffres ci-dessous sont ceux de ce moment-là, en gris.` };
    }
    default:
      break;
  }
  if (Number.isInteger(b.erreurs?.consecutives) && b.erreurs.consecutives > 0) {
    const depuis = heureCourte(b.erreurs.depuis ?? b.erreurs.derniere?.at);
    const n = b.erreurs.consecutives;
    return { cle: 'fotmob-erreurs', ton: 'warning', texte: `FotMob ne répond pas${depuis ? ` depuis ${depuis}` : ''} (${n} ${pluriel(n, 'erreur', 'erreurs de suite')}) : la boucle réessaie à chaque tour.` };
  }
  if (b.suivi46?.module === 'indisponible') {
    const depuis = heureCourte(b.suivi46.dernierePanne?.at);
    return { cle: 'suivi-en-panne', ton: 'warning', texte: `Suivi du direct en panne${depuis ? ` depuis ${depuis}` : ''} : score et minute seulement.` };
  }
  if (!matchs) {
    const prochain = heureCourte(b.prochainCoupDEnvoi);
    const lue = heureCourte(b.listeLueLe);
    const liste = lue ? ` (liste FotMob relue à ${lue}, toutes les 10 minutes hors match)` : '';
    return prochain
      ? { cle: 'vide', ton: 'info', texte: `Aucun match en cours. Prochain coup d'envoi suivi : ${prochain}${liste}.` }
      : { cle: 'vide', ton: 'info', texte: `Aucun match en cours, et aucun coup d'envoi à venir dans la liste FotMob du jour${liste}.` };
  }
  return null;
}

/**
 * Ce que la boucle a fait depuis son démarrage (R37 point 6 : les relevés de la liste comptent TOUTES les boucles). Mineur du
 * 13/11 soir (écrans 6) : sans jargon — « Depuis … : N relevés de la liste FotMob, M fiches de match lues. »
 */
export function chargeDite(charge) {
  const c = charge ?? {};
  if (!Number.isInteger(c.tours)) return null;
  const morceaux = [];
  if (Number.isInteger(c.listesFotmob)) morceaux.push(`${entierDit(c.listesFotmob)} ${pluriel(c.listesFotmob, 'relevé', 'relevés')} de la liste FotMob`);
  if (Number.isInteger(c.details)) morceaux.push(`${entierDit(c.details)} ${pluriel(c.details, 'fiche', 'fiches')} de match ${pluriel(c.details, 'lue', 'lues')}`);
  if (!morceaux.length) return null;
  const depuis = jourEtHeure(c.depuis);
  return `${depuis ? `Depuis ${depuis} : ` : ''}${morceaux.join(', ')}.`;
}

// ------------------------------------------------------------ la note du banc : l'interrupteur (P4, P5, R12, R30)

/**
 * L'interrupteur, dit dans le bandeau (R30) : { etat: 'non-juge' | 'eteint' | 'allume', ton, texte }. La note est le SEUL
 * interrupteur ; ses phrases sont dites ici, en mots simples (jamais la phrase brute de la note : elle peut porter des mots
 * du banc).
 */
export function noteDite(note) {
  const n = note ?? { etat: 'non-juge', raison: 'sans-note' };
  if (n.etat !== 'juge') {
    const pourquoi = n.raison === 'note-illisible' ? "la note du banc d'essai est illisible" : "le banc d'essai n'est pas passé";
    return { etat: 'non-juge', ton: 'muted', texte: `Probabilités en direct : pas encore jugées — calculées à blanc, jamais montrées tant que ${pourquoi}. L'écran montre les faits : le score, la minute et les cartons rouges.` };
  }
  const sur = Number.isInteger(n.matchs) ? `sur ${entierDit(n.matchs)} ${pluriel(n.matchs, 'match rejoué', 'matchs rejoués')}` : 'sur les matchs rejoués';
  const quand = n.passeLe ? ` (banc d'essai du ${String(n.passeLe).split('-').reverse().join('/')}, moteur version ${n.version})` : '';
  if (n.verdict === 'faits-seuls') {
    return { etat: 'eteint', ton: 'muted', texte: `Probabilités en direct : éteintes — le banc d'essai ne les a pas retenues ${sur}${quand}. Le score, la minute et les cartons rouges seulement.` };
  }
  if (n.verdict === 'prouve') {
    return { etat: 'allume', ton: 'info', texte: `Probabilités en direct : allumées — ce calcul s'est montré meilleur que la simple règle du temps restant ${sur}${quand}.` };
  }
  // « montre-non-tranche » (regard de sûreté) et « pas-prouve » : en gris, jamais en ambre (R12 point 3).
  return { etat: 'allume', ton: 'muted', texte: `Probabilités en direct : allumées, pas encore tranchées — ${sur}, ce calcul n'est ni prouvé meilleur ni prouvé moins bon que la simple règle du temps restant${quand}.` };
}

/** Pourquoi les chiffres d'UN match ne sont pas montrés (le calcul « à blanc », la tranche, la version) ; null s'ils le sont. */
export function aBlancDit(calcul) {
  const c = calcul ?? {};
  if (!c.aBlanc) return null;
  const nm = c.note ?? {};
  if (nm.applique && nm.verdict === 'faits-seuls') return "Probabilités éteintes par le banc d'essai : le score, la minute et les cartons rouges seulement.";
  if (nm.applique && nm.trancheNonMontree) return `Pas de pourcentage ${trancheDite(nm.tranche)} : le banc d'essai ne l'a pas retenu dans cette partie du match.`;
  if (nm.raison === 'pas-juge-pour-cette-version') return "Pas encore jugé pour cette version du moteur : probabilités calculées à blanc, pas montrées.";
  if (nm.raison === 'note-illisible') return "Pas encore jugé (la note du banc d'essai est illisible) : probabilités calculées à blanc, pas montrées.";
  if (nm.raison === 'sans-avant-match') return null;
  return "Pas encore jugé : probabilités calculées à blanc, pas montrées tant que le banc d'essai n'est pas passé.";
}

/**
 * § 2.7 de la vérification de la 46 (18/11/2026) : la ligne d'avant-match vient d'une version du moteur RECONDUITE — lue
 * comme la version jugée au banc d'essai, et l'écran le dit (PROJET § 1 point 7). null sans reconduction. Corrigé le 18/11
 * (O15, mineur 10) : le nombre dit est celui des RENCONTRES distinctes comparées, la date celle de l'inscription, et la phrase
 * ne dit que ce qui a été vu (« n'ont pas bougé sur les N matchs comparés »).
 */
export function reconduiteDite(note) {
  const r = note?.applique ? note.reconduite : null;
  if (!r || !Number.isInteger(r.de) || !Number.isInteger(r.vers)) return null;
  const le = typeof r.le === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(r.le) ? `inscrit le ${r.le.split('-').reverse().join('/')}` : null;
  const nuits = Number.isInteger(r.nuits) ? `${r.nuits} ${pluriel(r.nuits, 'nuit', 'nuits')}` : null;
  const parentheses = [nuits, le].filter(Boolean).join(' ; ');
  const sur = Number.isInteger(r.rencontres) ? `sur les ${entierDit(r.rencontres)} ${pluriel(r.rencontres, 'match comparé', 'matchs comparés')}` : 'sur les matchs comparés';
  return `Le moteur est passé de la version ${r.de} à la version ${r.vers}. Le banc d'essai a jugé la version ${r.de} ; son jugement est gardé, car les pronostics d'avant-match n'ont pas bougé ${sur}${parentheses ? ` (${parentheses})` : ''}.`;
}

// ------------------------------------------------------------ le pronostic d'avant-match (R9)

const RAISONS_SANS_LIGNE_DITES = Object.freeze({
  'sans-identifiant': 'clubs non reconnus par leur identifiant FotMob',
  'sans-coup-d-envoi': "heure du coup d'envoi inconnue",
  'table-absente': "aucun pronostic d'avant-match rangé dans cette base",
  'aucune-nuit': "aucun calcul d'avant-match complet",
  'aucune-ligne': "aucune ligne calculée avant son coup d'envoi",
  'calculee-apres': "la seule ligne a été calculée après le coup d'envoi",
  'ligne-illisible': 'ligne illisible'
});
/** Chaque raison d'absence de la ligne d'avant-match (RAISONS_SANS_LIGNE du serveur), en mots. */
export const RAISONS_SANS_LIGNE = Object.freeze(Object.keys(RAISONS_SANS_LIGNE_DITES));

/** D'où vient le 1N2 de la ligne (R9 point 3) : les cotes gratuites, le relevé The Odds API, ou le modèle de buts tempéré. */
export function sourceDuPronosticDite(a) {
  const s = String(a?.oddsSource ?? '');
  const quand = dateEtHeure(a?.oddsAt);
  const gratuites = /^cotes gratuites\s*:\s*(.*)$/.exec(s);
  if (gratuites) {
    const noms = gratuites[1]
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => NOMS_DES_SOURCES[x.toLowerCase()] ?? x)
      .join(', ');
    return `1N2 tiré des cotes gratuites ${noms || '(source non dite)'} relevées ${quand ? `le ${quand}` : 'à une heure inconnue'}`;
  }
  if (/^The Odds API/i.test(s)) return `1N2 tiré du relevé The Odds API ${quand ? `du ${quand}` : "(heure du relevé inconnue)"}`;
  if (/^aucune cote/i.test(s)) return 'aucune cote pour ce match : 1N2 du modèle de buts, tempéré';
  return "provenance du 1N2 non rangée dans la ligne d'avant-match";
}

/**
 * La ligne d'avant-match en mots (R9) : { trouve, ton, titre, source, texte }. Jamais « la page du match affichait », ni
 * « sans la composition », ni « de la nuit » (le rangement se fait le plus souvent en journée).
 */
export function avantMatchDit(a) {
  if (!a?.trouve) {
    const raison = RAISONS_SANS_LIGNE_DITES[a?.raison] ?? 'raison inconnue';
    return { trouve: false, ton: 'info', titre: null, source: null, texte: `Pas de pronostic d'avant-match rangé pour ce match (${raison}) : score et minute seulement.` };
  }
  const calcule = jourEtHeure(a.calculeLe);
  const titre = `pronostic d'avant-match (calculé ${calcule ?? 'à une heure inconnue'})`;
  const source = sourceDuPronosticDite(a);
  const vieux = [];
  if (fini(a.ageAuCoupDEnvoiH) && a.ageAuCoupDEnvoiH > 24) vieux.push(`calculé ${entierDit(Math.round(a.ageAuCoupDEnvoiH))} h avant le coup d'envoi`);
  if (fini(a.coteAgeAuCoupDEnvoiH) && a.coteAgeAuCoupDEnvoiH > 12) vieux.push(`cotes relevées ${entierDit(Math.round(a.coteAgeAuCoupDEnvoiH))} h avant le coup d'envoi`);
  const version = a.engineVersion !== null && a.engineVersion !== undefined ? ` · moteur version ${a.engineVersion}` : '';
  return {
    trouve: true,
    ton: a.ambre ? 'warning' : 'muted',
    titre,
    source,
    texte: `Point de départ : ${titre} ; ${source}${version}${vieux.length ? ` — ancien : ${vieux.join(', ')}` : ''}.`
  };
}

// ------------------------------------------------------------ le score, les rouges, l'âge (R2 point 3, R3, R37 point 5)

const camp = (e, c) => (c === 'home' ? e?.home?.nom ?? 'Domicile' : e?.away?.nom ?? 'Extérieur');
const scoreDe = (s) => (Number.isInteger(s?.home) && Number.isInteger(s?.away) ? `${s.home}-${s.away}` : null);

/** Le score et son heure (R2 point 3 : « changement de score vu à », jamais « but de »). */
export function scoreDit(e) {
  const s = e?.etat?.score ?? {};
  if (!s.connu) return { texte: '?-?', depuis: 'score non publié par FotMob' };
  const heure = heureCourte(s.depuisLe);
  let depuis = null;
  if (heure && s.precedent === null && s.home + s.away > 0) depuis = `score vu pour la première fois à ${heure}`;
  else if (heure && s.precedent) depuis = `changement de score vu à ${heure}`;
  return { texte: `${s.home}-${s.away}`, depuis };
}

/** L'âge de l'état sur la carte (R3 point 1) : « état relevé il y a 1 min 40 », ambre après 150 s, gris et « périmé » après 5 min. */
export function ageDeLEtatDit(etat, { decalageS = 0 } = {}) {
  if (!fini(etat?.ageS)) return { ton: 'muted', texte: 'heure du relevé inconnue', perime: false };
  const age = ageDit(etat.ageS + Math.max(0, decalageS));
  if (etat.perime) return { ton: 'muted', texte: `état relevé il y a ${age} — périmé`, perime: true };
  return { ton: etat.ambre ? 'warning' : 'muted', texte: `état relevé il y a ${age}`, perime: false };
}

/** La ligne des cartons rouges, toujours là (R3 point 2) : { cle, ton, texte, camps }. */
export function rougesDits(e) {
  const r = e?.etat?.rouges ?? {};
  if (!r.connus) {
    if (r.phrase === 'non-publies') {
      const detail = heureCourte(e?.suivi?.dernierDetailLe);
      return { cle: 'rouges', ton: 'muted', camps: [], texte: `Cartons rouges : non publiés par FotMob${detail ? ` (détail lu à ${detail})` : ''}.` };
    }
    return { cle: 'rouges', ton: 'muted', camps: [], texte: "Cartons rouges : pas encore lus (le détail de ce match n'a pas encore été relevé)." };
  }
  const h = r.home ?? 0;
  const a = r.away ?? 0;
  const n = h + a;
  const quand = heureCourte(r.vusLe);
  const lus = n > 1 ? 'lus' : n === 1 ? 'lu' : 'lus';
  const precision = [quand ? `${lus} à ${quand}` : null, r.avantLaPause ? 'avant la pause' : null, r.ambre && fini(r.ageS) ? `il y a ${ageDit(r.ageS)}` : null].filter(Boolean).join(', ');
  let texte;
  let camps = [];
  if (n === 0) texte = 'Cartons rouges : aucun';
  else if (h && a) {
    texte = `Cartons rouges : ${h} pour ${camp(e, 'home')}, ${a} pour ${camp(e, 'away')}`;
    camps = ['home', 'away'];
  } else {
    const c = h ? 'home' : 'away';
    texte = `Cartons rouges : ${n} pour ${camp(e, c)}`;
    camps = [c];
  }
  if (precision) texte += ` (${precision})`;
  if (r.desaccord) texte += ` ; la liste FotMob et le détail du match ne disent pas la même chose : ${r.source === 'detail' ? 'ceux du détail' : 'ceux de la liste'} sont retenus`;
  return { cle: 'rouges', ton: r.ambre || r.desaccord ? 'warning' : 'muted', camps, texte: `${texte}.` };
}

// ------------------------------------------------------------ les notes d'un match (§ 1.2, R5, R6, R10, R25)

const MINUTE_DU_LIBELLE = (libelle) => {
  const m = /(\d+)/.exec(String(libelle ?? ''));
  return m ? Number(m[1]) : null;
};

/** Le score de la 90e (R5 point 2) : affirmé seulement quand il est sûr ; sinon « non relevé », avec le dernier score vu. */
export function score90Dit(objet) {
  const s = objet?.score90 ?? null;
  if (s && s.sur) return `les paris sur 90 minutes sont réglés sur le score de la 90e : ${s.home}-${s.away}${heureCourte(s.vuLe) ? ` (vu à ${heureCourte(s.vuLe)})` : ''}`;
  if (s) {
    const minute = MINUTE_DU_LIBELLE(s.libelle);
    const ou = [minute ? `à la ${minute}e` : null, heureCourte(s.vuLe)].filter(Boolean).join(', ');
    return `score de la 90e non relevé (dernier score vu : ${s.home}-${s.away}${ou ? ` ${ou}` : ''})`;
  }
  return 'score de la 90e non relevé';
}

const PHRASES_DES_PHASES = Object.freeze({
  'sans-releve': 'Aucun relevé FotMob pour ce match : rien à montrer.',
  avant: 'Pas encore commencé chez FotMob : rien à calculer.',
  'fin-90': 'Fin du temps réglementaire relevée : pas de calcul (prolongation ou fin du match à venir).',
  interrompu: 'Match interrompu chez FotMob : score seul, pas de calcul.',
  attribue: 'Résultat attribué par FotMob (sur tapis vert) : score seul, pas de probabilité.'
});
/** Chaque phase du serveur (PHASES d'etatDuDirect.js) a sa phrase ou sa puce. */
export const PHASES_DITES = Object.freeze(['sans-releve', 'avant', 'jeu', 'mi-temps', 'prolongation', 'tirs-au-but', 'fin-90', 'interrompu', 'attribue', 'arrete', 'termine', 'minute-inconnue', 'libelle-inconnu']);

/** La phrase d'une minute qu'on ne place pas (RAISONS_MINUTE du serveur, R6) ou d'un score inconnu. */
export function minuteInconnueDite(etat) {
  const m = Number.isInteger(etat?.minute) ? etat.minute : MINUTE_DU_LIBELLE(etat?.libelle);
  switch (etat?.raison) {
    case 'sans-duree-max':
      return `Minute ${m ?? '?'} publiée sans durée de jeu : arrêts de jeu ou prolongation, on ne sait pas ; score seul, pas de calcul.`;
    case 'hors-limites':
      return `Minute ${m ?? '?'} publiée, au-delà de ce qu'un match peut durer : score seul, pas de calcul.`;
    case 'ajout-inattendu':
      return `Temps additionnel publié là où on ne l'attend pas (« ${etat?.libelle ?? '?'} ») : score seul, pas de calcul.`;
    case 'score-inconnu':
      return 'Score non publié par FotMob : pas de calcul.';
    default:
      return 'Minute non publiée par FotMob : score seul, pas de calcul.';
  }
}

/** Le relevé périmé ou figé (R3, R10 point 3) : sa cause dite d'après ce qui est su. */
function releveDit(e, boucle) {
  const et = e?.etat ?? {};
  const de = heureCourte(et.releveLe);
  const chiffres = `chiffres de ${de ?? "l'heure du dernier relevé"}, en gris`;
  if (et.perime) {
    switch (et.perimeCause) {
      case 'rejeu':
        return { cle: 'releve-rejeu', ton: 'info', camps: [], texte: `Rejeu : l'état est celui du dernier instantané rangé${de ? ` (${de})` : ''}.` };
      case 'plus-de-tour':
        return { cle: 'releve-perime', ton: 'warning', camps: [], texte: `Pas de relevé FotMob depuis ${de ?? 'plus de 5 minutes'} (PC en veille ou boucle arrêtée) : ${chiffres}.` };
      case 'suspendue': {
        const jusqua = heureCourte(boucle?.suspendueJusqua);
        return { cle: 'releve-perime', ton: 'warning', camps: [], texte: `FotMob répond mal : la boucle du direct est arrêtée${jusqua ? ` jusqu'à ${jusqua}` : ''} ; ${chiffres}.` };
      }
      case 'boucle-coupee':
        return { cle: 'releve-perime', ton: 'warning', camps: [], texte: `Boucle du direct arrêtée${boucle?.phrase ? ` (${boucle.phrase})` : ''} : ${chiffres}.` };
      case 'fotmob-erreurs': {
        const depuis = heureCourte(boucle?.erreurs?.depuis ?? boucle?.erreurs?.derniere?.at);
        const n = boucle?.erreurs?.consecutives;
        return { cle: 'releve-perime', ton: 'warning', camps: [], texte: `FotMob ne répond pas${depuis ? ` depuis ${depuis}` : ''}${Number.isInteger(n) ? ` (${n} ${pluriel(n, 'erreur', 'erreurs de suite')})` : ''} : ${chiffres}.` };
      }
      case 'absent-de-la-liste': {
        const lue = heureCourte(boucle?.listeLueLe);
        return { cle: 'releve-perime', ton: 'warning', camps: [], texte: `Match absent de la dernière liste FotMob${lue ? ` (relue à ${lue})` : ''} : ${chiffres}.` };
      }
      default:
        return { cle: 'releve-perime', ton: 'warning', camps: [], texte: `Relevé périmé${de ? ` (dernier relevé à ${de})` : ''}, cause inconnue : ${chiffres}.` };
    }
  }
  if (et.fige) {
    const depuis = heureCourte(et.figeDepuisLe);
    return { cle: 'minute-figee', ton: 'warning', camps: [], texte: `La minute ne bouge plus${depuis ? ` depuis ${depuis}` : ''} : match peut-être interrompu. Chiffres du dernier état, en gris.` };
  }
  return null;
}

/**
 * LES NOTES D'UN MATCH (conception § 1.2, § 4.2 ; R29 point 2 : chacune porte ses camps, l'écran pose un logo devant) :
 * [{ cle, ton: 'info' | 'warning' | 'muted', texte, camps }] — la phase, le score revenu ou à confirmer, le relevé périmé
 * ou figé, le suivi en panne, l'absence de ligne d'avant-match, le calcul (à blanc, en attente, replié). La ligne des
 * rouges est à part (`rougesDits`, toujours là).
 */
export function notesDeLEtat(e, { boucle = null } = {}) {
  const notes = [];
  const et = e?.etat ?? {};
  const c = e?.calcul ?? {};
  const ajouter = (cle, ton, texte, camps = []) => notes.push({ cle, ton, texte, camps });
  const score = scoreDe(et.score);

  // La phase.
  switch (et.phase) {
    case 'jeu':
      if (et.raison === 'score-inconnu') ajouter('score-inconnu', 'warning', minuteInconnueDite(et));
      else if (enArretsDeJeu(et)) ajouter('arrets-de-jeu', 'info', "Arrêts de jeu : la durée annoncée n'est pas lue ; le calcul compte ce qui reste en moyenne à ce moment-là.");
      break;
    case 'mi-temps':
      if (et.raison === 'score-inconnu') ajouter('score-inconnu', 'warning', minuteInconnueDite(et));
      break;
    case 'prolongation':
      ajouter('prolongation', 'info', `Prolongation — ${score90Dit(et)}. Pas de calcul en prolongation.`);
      break;
    case 'tirs-au-but':
      ajouter('tirs-au-but', 'info', `Tirs au but — ${score90Dit(et)}. Pas de calcul.`);
      break;
    case 'termine':
      ajouter('termine', 'info', et.prolongation?.joueeLe || et.prolongation?.vueLe ? `Terminé après prolongation : ${score ?? '?-?'} ; ${score90Dit(et)}. Pas de calcul.` : `Terminé chez FotMob : ${score ?? '?-?'}. Pas de calcul.`);
      break;
    case 'arrete':
      ajouter('arrete', 'warning', `Match arrêté (annulé chez FotMob), score au moment de l'arrêt : ${score ?? 'non publié'}. Pas de probabilité.`);
      break;
    case 'minute-inconnue':
      ajouter('minute-inconnue', 'warning', minuteInconnueDite(et));
      break;
    case 'libelle-inconnu':
      ajouter('libelle-inconnu', 'warning', `État du match non reconnu (« ${et.libelle ?? '?'} ») : score seul, pas de calcul.`);
      break;
    default:
      if (PHRASES_DES_PHASES[et.phase]) ajouter(et.phase, 'info', PHRASES_DES_PHASES[et.phase]);
      break;
  }

  // Le score revenu en arrière, ou à confirmer (R4 point 2, R37 point 5 : jamais « but annulé » affirmé).
  const s = et.score ?? {};
  if (s.connu && s.aConfirmer) ajouter('score-a-confirmer', 'warning', 'Score à confirmer : FotMob a publié un score plus bas, en attente de la prochaine lecture de la liste.');
  else if (s.connu && s.baisseLe && s.precedent) {
    ajouter('score-revenu', 'warning', `Le score est revenu de ${s.precedent.home}-${s.precedent.away} à ${s.home}-${s.away}${heureCourte(s.baisseLe) ? ` (vu à ${heureCourte(s.baisseLe)})` : ''} : but annulé ou correction de FotMob.`);
  }

  // Le relevé (R3, R10 point 3), le suivi (R25).
  const r = releveDit(e, boucle);
  if (r) notes.push(r);
  if (et.memoire === false) {
    const panne = heureCourte(boucle?.suivi46?.dernierePanne?.at);
    ajouter('suivi-en-panne', 'warning', panne ? `Suivi du direct en panne depuis ${panne} : score et minute seulement.` : 'Suivi du direct indisponible pour ce match : score et minute de la liste FotMob seulement.');
  }

  // Le calcul (l'absence de ligne d'avant-match est dite par la ligne du point de départ, toujours là : avantMatchDit).
  // Correctif « écrans 2 » (13/11/2026) : à blanc, aucun chiffre ne viendra — jamais « les chiffres arrivent ».
  if (c.enAttente && !c.aBlanc) ajouter('en-attente', 'info', 'Calcul en cours sur le serveur : les chiffres arrivent à la prochaine lecture (dans 30 secondes au plus).');
  else if (c.raison === 'erreur') ajouter('calcul-erreur', 'warning', "Calcul impossible pour cet état : rien n'est montré.");
  const blanc = aBlancDit(c);
  if (blanc) ajouter('a-blanc', 'muted', blanc);
  else if (c.fait) {
    if (c.repli) {
      ajouter(
        'repli',
        'info',
        c.repli.raison === 'total-hors-bornes'
          ? "Buts attendus du match hors des bornes du recalage : le calcul part des buts attendus du moteur, sans recalage sur le 1N2 d'avant-match."
          : "Pas de 1N2 d'avant-match pour recaler le calcul : il part des buts attendus du moteur."
      );
    }
    if (enArretsDeJeu(et)) ajouter('non-juge-arrets', 'muted', 'Partie du match non jugée au banc (les arrêts de jeu) : chiffres à lire comme des ordres de grandeur.');
    // § 2.7 (18/11/2026) : chiffres montrés pour une version reconduite — l'écran le dit.
    const reconduite = reconduiteDite(c.note);
    if (reconduite) ajouter('reconduite', 'muted', reconduite);
  }
  return notes;
}

// ------------------------------------------------------------ les chiffres d'une carte et du détail (P4, R8, R17)

const ETATS_DITS = Object.freeze({ acquis: 'déjà acquis (sauf but annulé)', impossible: 'impossible (sauf but annulé)' });
/** L'état d'une issue décidée par le score (« déjà acquis », jamais « 100 % ») ; null si elle est ouverte. */
export const etatDeLIssueDit = (etat) => ETATS_DITS[etat] ?? null;

/** Les paires du banc qui visent une ligne : écartée (pas montrée, avec ses chiffres) ou à surveiller (montrée, en ambre). */
function pairesDe(calcul, cle) {
  const nm = calcul?.note ?? {};
  return {
    ecartee: (nm.ecartees ?? []).find((p) => viseLaLigne(p?.unite, cle)) ?? null,
    aSurveiller: (nm.aSurveiller ?? []).find((p) => viseLaLigne(p?.unite, cle)) ?? null
  };
}
const familleNonMontree = (calcul, famille) => (calcul?.note?.famillesNonMontrees ?? []).includes(famille);

/**
 * Une ligne de marché prête à afficher : { cle, texte, camps, montre, valeur, ton, raison, avant }. `montre: false` porte
 * sa phrase (`raison`) : à blanc, famille ou paire écartée par le banc. Une issue décidée par le score dit « déjà acquis ».
 */
function ligneDite(e, cle, p, etat, { avant = null, noms } = {}) {
  const c = e?.calcul ?? {};
  const l = libelleDuMarche(cle, noms);
  const base = { cle, texte: l.texte, camps: l.camps, montre: false, valeur: null, ton: 'muted', raison: null, avant: null, p: null };
  if (c.aBlanc || !c.fait) return { ...base, raison: c.aBlanc ? 'à blanc' : 'pas de calcul' };
  const famille = cle.split('.')[0];
  if (familleNonMontree(c, famille)) return { ...base, raison: "pas montré en direct : le banc d'essai l'a écarté" };
  const { ecartee, aSurveiller } = pairesDe(c, cle);
  if (ecartee) return { ...base, raison: `pas montré ${trancheDite(c.note?.tranche)} — écarté par le banc d'essai ${pairePhrase(ecartee)}`.trim() };
  const dit = etatDeLIssueDit(etat);
  return {
    ...base,
    montre: true,
    p,
    valeur: dit ?? pourcentDit(p),
    ton: aSurveiller ? 'warning' : FAMILLES_NON_JUGEES.includes(famille) ? 'muted' : 'info',
    raison: aSurveiller ? `à surveiller (banc d'essai) ${pairePhrase(aSurveiller)}`.trim() : FAMILLES_NON_JUGEES.includes(famille) ? 'non jugé au banc' : null,
    avant: fini(avant) ? pourcentDit(avant) : null
  };
}

/**
 * LES CHIFFRES D'UNE CARTE : les trois barres du 1N2 (au plus fort reste, avec le pronostic d'avant-match sous chacune) et
 * les deux lignes de buts (plus de 2,5, les deux marquent). Rien n'est montré « à blanc ».
 */
export function chiffresDeLaCarte(e) {
  const c = e?.calcul ?? {};
  const noms = { home: camp(e, 'home'), away: camp(e, 'away') };
  const m0 = c.minute0?.marches ?? {};
  const fair = e?.avantMatch?.fair ?? null;
  const avantDe = (k) => (fini(m0[`result.${k}`]?.avant) ? m0[`result.${k}`].avant : fini(fair?.[k]) ? fair[k] : null);
  const dits = c.un2 ? un2Dit(c.un2) : null;
  const un2 = ['home', 'draw', 'away'].map((k) => {
    const l = ligneDite(e, `result.${k}`, c.un2?.[k] ?? null, 'ouvert', { avant: avantDe(k), noms });
    const titre = k === 'draw' ? 'Nul' : noms[k];
    return { ...l, issue: k, titre, valeur: l.montre && dits ? dits[k] : l.valeur };
  });
  const buts = [
    { ...ligneDite(e, 'totalGoals.2.5.over', c.plus25 ?? null, c.plus25Etat, { noms }), issue: 'plus25' },
    { ...ligneDite(e, 'bothTeamsScore.yes', c.lesDeuxMarquent ?? null, c.lesDeuxMarquentEtat, { noms }), issue: 'lesDeuxMarquent' }
  ];
  return { un2, buts, montre: un2.some((l) => l.montre) || buts.some((l) => l.montre) };
}

/**
 * LES LIGNES DU DÉTAIL, famille par famille (P6, question 8 : toutes) : [{ famille, titre, nonJugee, montree, raison,
 * lignes }]. Le score exact : les huit cases les plus probables et « un autre score ».
 */
export function lignesDuDetail(e) {
  const c = e?.calcul ?? {};
  const m = c.marches ?? null;
  const noms = { home: camp(e, 'home'), away: camp(e, 'away') };
  const L = ['0.5', '1.5', '2.5', '3.5'];
  const familles = [];
  for (const famille of MARCHES_MONTRES) {
    const lignes = [];
    if (famille === 'result') for (const k of ['home', 'draw', 'away']) lignes.push(ligneDite(e, `result.${k}`, m?.result?.[k] ?? null, 'ouvert', { noms }));
    if (famille === 'totalGoals') for (const l of L) for (const s of ['over', 'under']) lignes.push(ligneDite(e, `totalGoals.${l}.${s}`, m?.totalGoals?.[l]?.[s] ?? null, m?.totalGoals?.[l]?.etats?.[s], { noms }));
    if (famille === 'bothTeamsScore') for (const s of ['yes', 'no']) lignes.push(ligneDite(e, `bothTeamsScore.${s}`, m?.bothTeamsScore?.[s] ?? null, m?.bothTeamsScore?.etats?.[s], { noms }));
    if (famille === 'teamGoals') {
      for (const cote of ['home', 'away']) for (const l of L) for (const s of ['over', 'under']) lignes.push(ligneDite(e, `teamGoals.${cote}.${l}.${s}`, m?.teamGoals?.[cote]?.[l]?.[s] ?? null, m?.teamGoals?.[cote]?.[l]?.etats?.[s], { noms }));
    }
    if (famille === 'resultAndTotal') {
      for (const l of L) {
        for (const issue of ['homeOver', 'homeUnder', 'drawOver', 'drawUnder', 'awayOver', 'awayUnder']) {
          lignes.push(ligneDite(e, `resultAndTotal.${l}.${issue}`, m?.resultAndTotal?.[l]?.[issue] ?? null, m?.resultAndTotal?.[l]?.etats?.[issue], { noms }));
        }
      }
    }
    if (famille === 'scoreExact') {
      for (const cas of m?.scoreExact?.cases ?? []) lignes.push(ligneDite(e, `scoreExact.${cas.home}-${cas.away}`, cas.p, 'ouvert', { noms }));
      if (m?.scoreExact) lignes.push(ligneDite(e, 'scoreExact.autre', m.scoreExact.autre, 'ouvert', { noms }));
    }
    const nonMontree = familleNonMontree(c, famille);
    familles.push({
      famille,
      titre: TITRES_DES_FAMILLES[famille],
      nonJugee: FAMILLES_NON_JUGEES.includes(famille),
      montree: lignes.some((l) => l.montre),
      raison: nonMontree ? "Pas montré en direct : le banc d'essai l'a écarté." : null,
      lignes
    });
  }
  return familles;
}

/**
 * L'ÉCART DE LA MINUTE 0 (R8) : une phrase par cause, sur les marchés dont l'écart est dit (2 points ou plus). Avec une
 * variante ancrée, le 1N2 part de celui d'avant-match (écart nul) : ce sont les buts qui sautent. Rien à blanc.
 */
export function ecartsDeLaMinute0(e) {
  const c = e?.calcul ?? {};
  if (c.aBlanc || !c.fait || !c.minute0?.marches) return [];
  const noms = { home: camp(e, 'home'), away: camp(e, 'away') };
  const ancree = /-ancre$/.test(String(c.variante ?? ''));
  const dits = Object.entries(c.minute0.marches).filter(([, v]) => v?.dit && fini(v.ecartPt));
  const plusGrand = (liste) => liste.reduce((a, b) => (Math.abs(b[1].ecartPt) > Math.abs(a[1].ecartPt) ? b : a));
  const notes = [];
  const resultats = dits.filter(([k]) => k.startsWith('result.'));
  const autres = dits.filter(([k]) => !k.startsWith('result.'));
  if (resultats.length) {
    const [k, v] = plusGrand(resultats);
    const l = libelleDuMarche(k, noms);
    notes.push({
      cle: 'minute0-resultat',
      ton: 'info',
      camps: l.camps,
      texte: `Au coup d'envoi, ce calcul donnait ${pourcentDit(v.direct)} à “${l.texte}”, le pronostic d'avant-match ${pourcentDit(v.avant)} : ${pointsDits(v.ecartPt)} d'écart qui viennent du point de départ (les buts attendus du moteur), pas du match.`
    });
  }
  if (autres.length) {
    const [k, v] = plusGrand(autres);
    const l = libelleDuMarche(k, noms);
    const n = autres.length - 1;
    const plus = n > 0 ? ` (et ${n} autre${n > 1 ? 's' : ''} marché${n > 1 ? 's' : ''} à 2 points ou plus)` : '';
    const sansCote = /^aucune cote/i.test(String(e?.avantMatch?.oddsSource ?? ''));
    notes.push({
      cle: 'minute0-buts',
      ton: 'info',
      camps: l.camps,
      texte: ancree
        ? `Ce calcul part du 1N2 du pronostic d'avant-match${sansCote ? " (celui du modèle de buts, tempéré : aucune cote pour ce match)" : ''} ; ce pronostic tirait ces chiffres-là des buts attendus du moteur : ${pointsDits(v.ecartPt)} d'écart sur “${l.texte}” dès le coup d'envoi, avant tout fait de jeu${plus}.`
        : `Au coup d'envoi, ce calcul donnait ${pourcentDit(v.direct)} à “${l.texte}”, le pronostic d'avant-match ${pourcentDit(v.avant)} : ${pointsDits(v.ecartPt)} d'écart qui viennent du point de départ, pas du match${plus}.`
    });
  }
  return notes;
}

// ------------------------------------------------------------ la référence des cotes, SANS écart (R2 forme a, § 3.4)

/** Le fournisseur d'une ligne de référence : « DraftKings (relevé par ESPN) », « Kalshi (prix d'échange) »… */
export function fournisseurDit(l) {
  const src = NOMS_DES_SOURCES[l?.source] ?? l?.source ?? 'source inconnue';
  if (l?.echange) return l.source === 'smarkets' ? `${src} (prix d'échange, retardés)` : `${src} (prix d'échange)`;
  return `${l?.bookmaker ?? 'bookmaker inconnu'} (relevé par ${src})`;
}
const ISSUES_DE_REFERENCE = Object.freeze({ draw: 'Nul', yes: 'Les deux marquent', no: 'Une équipe au moins ne marque pas' });
/** L'issue d'une ligne de référence en mots, et son camp. */
export function issueDeReference(l, noms = {}) {
  if (l?.marche === '1x2' && (l.issue === 'home' || l.issue === 'away')) return { texte: l.issue === 'home' ? noms.home ?? 'Domicile' : noms.away ?? 'Extérieur', camps: [l.issue] };
  if (l?.marche === 'ou') return { texte: `${l.issue === 'over' ? 'Plus' : 'Moins'} de ${butsDe(l.ligne)}`, camps: [] };
  return { texte: ISSUES_DE_REFERENCE[l?.issue] ?? 'Issue inconnue', camps: [] };
}

/**
 * UNE LIGNE DE RÉFÉRENCE (R2 forme a) : le prix, son fournisseur, son heure ; la probabilité marge retirée quand les
 * chiffres sont montrés ; JAMAIS d'écart au calcul. « Changement de score vu à », jamais « but de » (R2 point 3).
 */
export function referenceDite(l, { aBlanc = true, noms = {}, etat = null } = {}) {
  const issue = issueDeReference(l, noms);
  const prix = fini(l?.prix) ? nombreDit(l.prix, 2) : null;
  const heure = heureCourte(l?.releveLe);
  const morceaux = [];
  if (l?.echange) {
    const p = !aBlanc && fini(l.proba) ? `, soit ${pourcentDit(l.proba)}` : '';
    morceaux.push(`${issue.texte} : ${prix ? `${prix} ` : ''}chez ${fournisseurDit(l)}${p} — pas une cote de vos bookmakers`);
  } else {
    const p = !aBlanc && fini(l?.proba) && !l?.alerte ? `, soit ${pourcentDit(l.proba)} marge retirée` : '';
    morceaux.push(`${issue.texte} : ${prix ?? 'prix inconnu'} chez ${fournisseurDit(l)}${p}`);
  }
  morceaux.push(heure ? `prix relevé à ${heure}` : 'heure du prix inconnue');
  if (l?.alerte === 'source-retardee') morceaux.push("prix retardés, jamais ceux de l'instant");
  if (l?.alerte === 'anomalie') morceaux.push('marge impossible à retirer (cotes incohérentes)');
  if (l?.alerte === 'issue-manquante') morceaux.push('une issue du marché manque : pas de probabilité');
  if (l?.avantLeDernierBut) {
    const s = etat?.score;
    const vu = heureCourte(s?.depuisLe);
    morceaux.push(s?.precedent === null ? `relevé avant le score vu pour la première fois${vu ? ` à ${vu}` : ''}` : `relevé avant le changement de score vu${vu ? ` à ${vu}` : ''}`);
  }
  if (l?.avantLeRouge) {
    const vu = heureCourte(etat?.rouges?.depuisLe);
    morceaux.push(`relevé avant le carton rouge vu${vu ? ` à ${vu}` : ''}`);
  }
  return { texte: `${morceaux.join(' ; ')}.`, camps: issue.camps, fournisseur: fournisseurDit(l), heure };
}

/** La référence absente, avec sa raison (règle de Pierre du 04/10 : une cote qui manque se dit). */
export function referenceAbsenteDite(reference) {
  if (reference?.raison === 'illisible') return 'Cotes en direct illisibles dans la base : pas de référence pour ce match.';
  return 'Pas de cote en direct relevée pour ce match (ESPN, 365Scores, Kalshi, Smarkets).';
}

// ------------------------------------------------------------ les matchs non suivis, les finis (R5 point 5, R11, R37 point 4)

/** Chaque raison d'un match non suivi (RAISONS_NON_SUIVI du serveur, R11 point 1), plus celle de l'écran sans identifiants. */
export const RAISONS_NON_SUIVI_DITES = Object.freeze({
  fini: 'Match terminé.',
  'coupure-4h': "Suivi arrêté 4 heures après le coup d'envoi ; FotMob le dit toujours en cours.",
  'boucle-coupee': 'Boucle du direct arrêtée : pas de direct pour ce match en ce moment.',
  'boucle-suspendue': 'FotMob répond mal : la boucle du direct est arrêtée ; pas de direct pour ce match en ce moment.',
  'pas-demarree': 'Boucle du direct pas encore démarrée : pas de direct pour ce match en ce moment.',
  'pas-commence': "Pas encore commencé : le direct démarre au coup d'envoi.",
  'pas-encore-vu': "Coup d'envoi passé depuis moins de 30 minutes, match pas encore vu dans la liste FotMob : il s'affichera au prochain relevé.",
  'plus-suivi': 'Suivi puis disparu de la liste FotMob : plus de relevé pour ce match.',
  inconnu: "Ce match n'est pas suivi par la boucle du direct (championnat non suivi, ou match absent de la liste FotMob du jour).",
  'sans-identifiants': 'Clubs non reconnus par leur identifiant FotMob : pas de direct pour ce match.'
});

/** Un match fini (`finis`, ou `fin` d'un match non suivi) : « terminé » seulement si son statut le dit (R11 point 3). */
export function finDite(f) {
  if (!f) return null;
  const score = scoreDe(f.score);
  const releve = heureCourte(f.finReleveeLe);
  const fin = releve ? ` (FotMob, fin relevée à ${releve})` : '';
  if (f.raison === 'coupure-4h') return `Suivi arrêté 4 heures après le coup d'envoi ; FotMob le dit toujours en cours${score ? ` (dernier score vu : ${score})` : ''}${fin}.`;
  if (f.statut === 'annulé') return `Match arrêté (annulé chez FotMob)${score ? `, score au moment de l'arrêt : ${score}` : ''}${fin}.`;
  if (f.prolongation?.joueeLe || f.prolongation?.vueLe) return `Terminé après prolongation : ${score ?? '?-?'} ; ${score90Dit(f)}${fin}.`;
  return `Match terminé : ${score ?? '?-?'}${fin}.`;
}

/** Correctifs D3 (12/11/2026, point 2) : un match fini dont la fiche n'est pas encore au magasin n'a pas de page « match terminé ». */
export const PHRASE_SANS_PAGE_DU_FINI = 'Page du match terminé pas encore rangée : elle arrive avec une prochaine actualisation des résultats.';

/**
 * Correctifs D3 (12/11/2026, point 2) — LE LIEN D'UN MATCH FINI : la page « match terminé » de l'appli (/match/<clé>), quand le
 * serveur a trouvé sa fiche au magasin par les identifiants FotMob et le jour (`f.page`, jamais par un nom) ; l'instant d'un
 * rejeu gardé. Sans fiche : null (l'écran dit PHRASE_SANS_PAGE_DU_FINI). La page d'un match à venir (/match-a-venir/) n'ouvre
 * jamais un match fini.
 */
export function lienDuFini(f, instant = null) {
  const id = typeof f?.page?.id === 'string' && f.page.id ? f.page.id : null;
  if (!id) return null;
  return { path: `/match/${encodeURIComponent(id)}`, query: instant && instantDe(instant) !== null ? { instant } : {} };
}

/** Un match non suivi en mots (R11) : la phrase de sa raison, la fin quand il est fini, la boucle quand elle est arrêtée. */
export function nonSuiviDit(reponse) {
  if (reponse?.etat === 'illisible') return illisibleDit(reponse);
  const raison = reponse?.raison ?? 'inconnu';
  if ((raison === 'fini' || raison === 'coupure-4h') && reponse?.fin) return finDite(reponse.fin);
  if (raison === 'boucle-suspendue') {
    const jusqua = heureCourte(reponse?.boucle?.suspendueJusqua);
    return `FotMob répond mal : la boucle du direct est arrêtée${jusqua ? ` jusqu'à ${jusqua}` : ''} ; pas de direct pour ce match en ce moment.`;
  }
  if (raison === 'boucle-coupee' && reponse?.boucle?.phrase) return `Boucle du direct arrêtée (${reponse.boucle.phrase}) : pas de direct pour ce match en ce moment.`;
  return RAISONS_NON_SUIVI_DITES[raison] ?? RAISONS_NON_SUIVI_DITES.inconnu;
}

// ------------------------------------------------------------ la provenance de chaque chiffre (§ 4.4, R37 point 3)

/**
 * Les provenances d'une carte : [{ cle, source, releveLe, action, texte }] — l'état (liste du jour), les rouges (détail du
 * match), le point de départ (moteur), le calcul (CôteMaster, seulement s'il est montré). Le texte de l'heure est écrit ici
 * (un seul format) ; aucune pastille ne dit « les cotes ont pu bouger » sur un score.
 */
export function provenances(e) {
  const et = e?.etat ?? {};
  const liste = [];
  const quand = (action, v) => (heureCourte(v) ? `${action} à ${heureCourte(v)}` : `heure du ${action === 'calculé' ? 'calcul' : 'relevé'} inconnue`);
  liste.push({ cle: 'etat', source: 'FotMob (liste du jour)', releveLe: et.releveLe ?? null, action: 'relevé', texte: quand('relevé', et.releveLe) });
  const detail = e?.suivi?.dernierDetailLe ?? et.rouges?.vusLe ?? null;
  liste.push({ cle: 'rouges', source: 'FotMob (détail du match)', releveLe: detail, action: 'lu', texte: detail ? quand('lu', detail) : 'détail pas encore lu' });
  const a = e?.avantMatch ?? {};
  if (a.trouve) {
    liste.push({ cle: 'avant-match', source: `Moteur CôteMaster, pronostic d'avant-match${a.engineVersion !== null && a.engineVersion !== undefined ? ` (version ${a.engineVersion})` : ''}`, releveLe: a.calculeLe ?? null, action: 'calculé', texte: jourEtHeure(a.calculeLe) ? `calculé ${jourEtHeure(a.calculeLe)}` : 'heure du calcul inconnue' });
  }
  const c = e?.calcul ?? {};
  if (c.fait && !c.aBlanc) liste.push({ cle: 'calcul', source: 'Calcul CôteMaster', releveLe: c.calculeLe ?? null, action: 'calculé', texte: quand('calculé', c.calculeLe) });
  // Mineur du 13/11 soir (écrans 9) : le survol de chaque pastille dit la même chose, au même format d'heure (R37 point 2).
  return liste.map((p) => ({ ...p, titre: `${p.source} : ${p.texte}.` }));
}

// ------------------------------------------------------------ la courbe (§ 3.3) : une géométrie propre au direct

const abscisse = (p) => {
  if (p?.type === 'avant-match') return 0;
  if (Number.isInteger(p?.minute)) return p.minute;
  if (p?.phase === 'mi-temps') return 45;
  return null;
};

/**
 * La géométrie de la courbe du 1N2 : les minutes en abscisse (0 à 90, plus si le match va au-delà), la probabilité en
 * ordonnée (0 à 100 %). Trois séries (club qui reçoit, nul, visiteur), coupées aux trous de plus de 12 minutes ; un trait
 * vertical à chaque changement de score vu. Null s'il n'y a pas deux points chiffrés.
 */
export function geometrieDuDirect(courbe, { largeur = 340, hauteur = 170, marges = { gauche: 34, droite: 10, haut: 10, bas: 24 } } = {}) {
  const points = (courbe?.points ?? []).map((p) => ({ p, x: abscisse(p) })).filter(({ p, x }) => x !== null && p?.un2 && ['home', 'draw', 'away'].every((k) => fini(p.un2[k])));
  if (points.length < 2) return null;
  const xMax = Math.max(90, ...points.map(({ x }) => x));
  const X = (m) => Math.round((marges.gauche + (m / xMax) * (largeur - marges.gauche - marges.droite)) * 100) / 100;
  const Y = (v) => Math.round((marges.haut + (1 - v) * (hauteur - marges.haut - marges.bas)) * 100) / 100;
  const trous = courbe?.trous ?? [];
  const coupe = (a, b) => a.p.type !== 'avant-match' && trous.some((t) => String(t.de) >= String(a.p.at) && String(t.a) <= String(b.p.at));
  const series = ['home', 'draw', 'away'].map((issue) => {
    const chemins = [];
    let courant = [];
    points.forEach((pt, i) => {
      if (i > 0 && coupe(points[i - 1], pt)) {
        if (courant.length > 1) chemins.push(courant);
        courant = [];
      }
      courant.push(`${X(pt.x)},${Y(pt.p.un2[issue])}`);
    });
    if (courant.length > 1) chemins.push(courant);
    return { issue, chemins: chemins.map((c) => c.join(' ')) };
  });
  const buts = [];
  const tous = (courbe?.points ?? []).filter((p) => abscisse(p) !== null);
  for (let i = 1; i < tous.length; i++) {
    const a = scoreDe(tous[i - 1].score);
    const b = scoreDe(tous[i].score);
    if (a && b && a !== b) buts.push({ x: X(abscisse(tous[i])), score: b });
  }
  const ticksX = [0, 15, 30, 45, 60, 75, 90].filter((m) => m <= xMax).map((m) => ({ x: X(m), valeur: m }));
  // Le quadrillage va de 0 à 1, mais seuls 25, 50 et 75 % sont écrits : l'écran du direct n'écrit jamais « 0 % » ni « 100 % ».
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ y: Y(v), valeur: v, libelle: v > 0 && v < 1 ? `${Math.round(v * 100)} %` : null }));
  return { largeur, hauteur, gauche: marges.gauche, droite: largeur - marges.droite, haut: marges.haut, bas: hauteur - marges.bas, series, buts, ticksX, ticksY, points: points.length };
}
