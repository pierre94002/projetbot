/**
 * formulesDesCartons.js — LA RÈGLE ET LES FORMULES DES CARTONS (étape 33 du plan, lot 1a, 02/11/2026).
 * -----------------------------------------------------------------------
 * Pur : aucune base, aucun fichier, aucune horloge, aucun hasard, et UN SEUL import (statMarkets.js, la loi des comptes
 * du moteur). C'est voulu (critique de l'étape 32, constat 22) : si le banc retient les cartons, le lot 2 ajoutera CE
 * fichier à l'empreinte du moteur — changer une formule changera alors la version du moteur au lieu de changer ses
 * chiffres en silence. Jusque-là, il est hors de l'empreinte et rien du moteur ne le lit (test cartonsFrontiere, T-X2).
 *
 * Ce qu'on y trouve, UNE fois pour le banc, la nuit, la preuve et (au lot 2) le règlement :
 *   - CONSTANTES_DES_CARTONS : les seuils des formules, fixés avant le regard ;
 *   - cartonsDuDeroule : les cartons de chaque camp sur le déroulé FotMob, joueur par joueur (convention C de Pierre :
 *     un « yellowred » vaut 2 ; les conventions 1 et 3 mesurées à côté), les cartons du banc et du staff COMPTÉS comme
 *     les autres (critique, constat 4) et comptés à part ;
 *   - statutDesCartons : la règle « cartons relevés » (conception §2.2, critique constat 9 : écart = Σ |ligne − déroulé|
 *     par camp ; « non-joue » pour un match annulé, abandonné ou reporté) ; la garde des vrais zéros au jour J ;
 *   - cleDArbitre : la clé « nom exact|pays » (copie de cleDeLArbitre de refereeRead.js, égalité testée) ;
 *   - les rapports d'équipe, la tendance du championnat (constat 2), l'indice d'arbitre, les attendus des trois bras ;
 *   - la loi d'un compte de cartons (décision 2 : 1/k < 0 → binomiale, jamais Poisson), la perte log d'un compte, les
 *     lignes du total.
 * -----------------------------------------------------------------------
 */

import { loiDesComptes } from '../../sports/football/statMarkets.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * LES SEUILS DES FORMULES (fixés avant le regard ; en changer un après = une variante de plus) :
 *   fenetreEquipe 20 / kEquipe 5     les 20 derniers matchs relevés d'une équipe, ramenés vers 1 par 5 matchs « moyens » ;
 *   kArbitre 10                       10 matchs « moyens » ramènent un arbitre peu connu vers 0 ;
 *   ligueJours 365 / minLigue 30     les moyennes d'une compétition : ses matchs relevés des 365 jours d'avant J, 30 au moins ;
 *   tendance { derniers 60, k 30 }   la tendance récente d'une compétition (critique, constat 2) : ses 60 derniers matchs
 *                                     relevés, le rapport cartons / moyenne de chacun, ramené vers 1 par 30 matchs ;
 *   gardeZero { derniers 60, min 30, part 0,10 }   la garde des vrais zéros (critique, constat 9) : parmi les 60 derniers
 *                                     matchs relevés de la compétition (saisons confondues), s'il y en a au moins 30 et
 *                                     plus de 10 % de vrais zéros, les vrais zéros du jour J ne sont pas confirmés ;
 *   plancher 1e-6                     le plancher d'une probabilité (= PROBA_MIN de bench/metrics.js, testé) ;
 *   minBinomiale 15                   la loi binomiale d'une équipe sous-dispersée a au moins 15 essais.
 */
export const CONSTANTES_DES_CARTONS = Object.freeze({
  fenetreEquipe: 20,
  kEquipe: 5,
  kArbitre: 10,
  ligueJours: 365,
  minLigue: 30,
  tendance: Object.freeze({ derniers: 60, k: 30 }),
  gardeZero: Object.freeze({ derniers: 60, min: 30, part: 0.1 }),
  plancher: 1e-6,
  minBinomiale: 15
});

// ======================================================= les cartons du déroulé

const vide = () => ({ jaunes: 0, deuxiemesJaunes: 0, rouges: 0, inconnus: 0, horsTerrain: 0, apres90: 0, remplacements: 0, cartons: 0, un: 0, trois: 0, ligne: 0 });

/** Un carton est-il « hors terrain » (banc, staff) ? La règle de derouleDuMatch.js. */
export const horsTerrain = (e) => e?.notOnPitch === true || String(e?.note ?? '').toLowerCase() === 'not_on_pitch';

/**
 * LES CARTONS DU DÉROULÉ (pur). `evenements` : le déroulé FotMob (mapEvents : `card` en minuscules, « yellow » par
 * défaut). Le déroulé est COMPLET s'il existe et a au moins un remplacement pour CHAQUE camp (un match entier sans
 * remplacement n'existe pas). Par camp : jaunes, deuxièmes jaunes (« yellowred »), rouges directs, cartons hors terrain
 * (comptés à part ET dans les totaux : critique, constat 4), cartons notés après la 90e minute, remplacements, et le
 * compte JOUEUR PAR JOUEUR (critique, constat 8) : un joueur qui a un « yellowred » compte `k` (k = 2 pour la convention
 * C, 1 et 3 pour les deux autres) plus ses rouges directs ; sinon ses jaunes plus ses rouges. Un carton sans joueur nommé
 * compte seul. `ligne` = jaunes + rouges du déroulé : ce que la ligne d'équipe de FotMob doit valoir (jaunes − deuxièmes
 * jaunes, rouges + deuxièmes jaunes). Rend { present, complet, home, away }.
 */
export function cartonsDuDeroule(evenements) {
  const home = vide();
  const away = vide();
  if (!Array.isArray(evenements)) return { present: false, complet: false, home, away };
  const parJoueur = { home: new Map(), away: new Map() };
  let sansNom = 0;
  for (const e of evenements) {
    const camp = e?.side === 'home' ? 'home' : e?.side === 'away' ? 'away' : null;
    if (!camp) continue;
    const c = camp === 'home' ? home : away;
    const type = String(e.type ?? '').toLowerCase();
    if (type === 'substitution') {
      c.remplacements += 1;
      continue;
    }
    if (type !== 'card') continue;
    const code = String(e.card ?? 'yellow').toLowerCase();
    if (horsTerrain(e)) c.horsTerrain += 1;
    if (fini(e.minute) && e.minute > 90) c.apres90 += 1;
    const qui = e.playerId ? `id:${e.playerId}` : typeof e.player === 'string' && e.player.trim() ? `nom:${e.player.trim()}` : `seul:${sansNom++}`;
    const j = parJoueur[camp].get(qui) ?? { y: 0, yr: 0, r: 0 };
    if (code === 'yellow') {
      c.jaunes += 1;
      j.y += 1;
    } else if (code === 'yellowred') {
      c.deuxiemesJaunes += 1;
      j.yr += 1;
    } else if (code === 'red') {
      c.rouges += 1;
      j.r += 1;
    } else {
      c.inconnus += 1;
      continue;
    }
    parJoueur[camp].set(qui, j);
  }
  for (const camp of ['home', 'away']) {
    const c = camp === 'home' ? home : away;
    for (const j of parJoueur[camp].values()) {
      if (j.yr > 0) {
        c.cartons += 2 * j.yr + j.r;
        c.un += j.yr + j.r;
        c.trois += 3 * j.yr + j.r;
      } else {
        c.cartons += j.y + j.r;
        c.un += j.y + j.r;
        c.trois += j.y + j.r;
      }
    }
    c.ligne = c.jaunes + c.rouges;
  }
  return { present: true, complet: home.remplacements > 0 && away.remplacements > 0, home, away };
}

// ======================================================= la règle « cartons relevés »

/** Les statuts (conception §2.2 ; « non-joue » : critique, constat 9). */
export const STATUTS = Object.freeze(['prolonge', 'attribue', 'non-joue', 'non-releve', 'accord', 'ecart-1', 'desaccord', 'ligne-a-zero', 'sans-ligne', 'vrai-zero', 'zero-non-confirme']);
/** Les statuts RELEVÉS (le match compte : appris, jugé, dans les fenêtres). */
export const STATUTS_RELEVES = Object.freeze(['accord', 'ecart-1', 'ligne-a-zero', 'sans-ligne', 'vrai-zero']);
const RELEVES = new Set(STATUTS_RELEVES);
/** Les statuts réglables automatiquement sans condition (au lot 2) ; « ecart-1 » : selon la ligne (reglableALaLigne). */
const REGLABLES = new Set(['accord', 'vrai-zero']);

const entier = (x) => (x === null || x === undefined || x === '' || !Number.isFinite(Number(x)) ? null : Number(x));

/**
 * La ligne d'équipe (team_stats) : { jDom, jExt, rDom, rExt } ; null si l'un des quatre comptes manque (une ligne
 * d'équipe absente). Rouges absents quand les jaunes sont là : jamais vu sur la mise en route (partie 0 de l'étape 33).
 */
export function ligneDesCartons(l) {
  if (!l) return null;
  const v = { jDom: entier(l.jDom), jExt: entier(l.jExt), rDom: entier(l.rDom), rExt: entier(l.rExt) };
  return v.jDom === null || v.jExt === null || v.rDom === null || v.rExt === null ? null : v;
}

/**
 * LE STATUT DES CARTONS D'UN MATCH (pur ; sans la garde des vrais zéros, appliquée au jour J par la passe) :
 * `deroule` (cartonsDuDeroule) ou `evenements` ; `ligne` (ligneDesCartons) ; `prolongation`, `attribue`, `nonJoue`
 * (annulé, abandonné ou reporté avec un score). Rend { statut, releve, valeur: { home, away, total } | null (convention
 * C), conventions: { un, trois } | null (les deux autres, mesurées), reglableAuto, ecart, deroule }.
 *   - attribué, prolongé (prolongation ou tirs au but), non joué : aucun chiffre ;
 *   - déroulé absent ou incomplet : « non-releve » (même avec une ligne : jamais « 0 » sans déroulé complet) ;
 *   - déroulé complet SANS carton : « vrai-zero » si la ligne dit 0-0 aux jaunes ET aux rouges, sinon « zero-non-confirme » ;
 *   - déroulé complet avec des cartons : ligne absente → « sans-ligne » ; ligne à 0-0 aux jaunes alors que le déroulé
 *     a des jaunes → « ligne-a-zero » (les jaunes « fabriqués ») ; sinon écart = Σ par camp |ligne (jaunes + rouges) −
 *     déroulé (jaunes + rouges)| : 0 « accord », 1 « ecart-1 », 2 ou plus « desaccord » (match douteux, non relevé).
 */
export function statutDesCartons({ evenements = undefined, deroule = undefined, ligne = null, prolongation = false, attribue = false, nonJoue = false } = {}) {
  const d = deroule ?? cartonsDuDeroule(evenements);
  const sortie = (statut, { valeur = false, ecart = null } = {}) => {
    const releve = RELEVES.has(statut);
    return {
      statut,
      releve,
      valeur: releve ? (valeur ? { home: d.home.cartons, away: d.away.cartons, total: d.home.cartons + d.away.cartons } : { home: 0, away: 0, total: 0 }) : null,
      conventions: releve ? { un: { home: d.home.un, away: d.away.un, total: d.home.un + d.away.un }, trois: { home: d.home.trois, away: d.away.trois, total: d.home.trois + d.away.trois } } : null,
      reglableAuto: REGLABLES.has(statut),
      ecart,
      deroule: d
    };
  };
  if (attribue) return sortie('attribue');
  if (prolongation) return sortie('prolonge');
  if (nonJoue) return sortie('non-joue');
  if (!d.present || !d.complet) return sortie('non-releve');
  const L = ligneDesCartons(ligne);
  const total = d.home.jaunes + d.home.deuxiemesJaunes + d.home.rouges + d.home.inconnus + d.away.jaunes + d.away.deuxiemesJaunes + d.away.rouges + d.away.inconnus;
  if (total === 0) {
    if (L && L.jDom === 0 && L.jExt === 0 && L.rDom === 0 && L.rExt === 0) return sortie('vrai-zero', { ecart: 0 });
    return sortie('zero-non-confirme');
  }
  if (!L) return sortie('sans-ligne', { valeur: true });
  const jaunesAuDeroule = d.home.jaunes + d.home.deuxiemesJaunes + d.away.jaunes + d.away.deuxiemesJaunes;
  if (L.jDom === 0 && L.jExt === 0 && jaunesAuDeroule > 0) return sortie('ligne-a-zero', { valeur: true });
  const ecart = Math.abs(L.jDom + L.rDom - d.home.ligne) + Math.abs(L.jExt + L.rExt - d.away.ligne);
  if (ecart === 0) return sortie('accord', { valeur: true, ecart });
  if (ecart === 1) return sortie('ecart-1', { valeur: true, ecart });
  return sortie('desaccord', { ecart });
}

/**
 * Au lot 2 (règlement) : un match « ecart-1 » n'est réglable automatiquement que si les deux comptes plausibles — le
 * déroulé (convention C) et la ligne de FotMob ramenée à la convention C (jaunes + rouges + deuxièmes jaunes) — donnent
 * la même issue à la ligne demandée (`portee` : 'total', 'home' ou 'away' ; `ligne` : une demi-ligne). « accord » et
 * « vrai-zero » : toujours ; tout autre statut : jamais.
 */
export function reglableALaLigne(s, { portee = 'total', ligne, ligneDeFotmob = null } = {}) {
  if (!s) return false;
  if (REGLABLES.has(s.statut)) return true;
  if (s.statut !== 'ecart-1' || !fini(ligne) || !s.valeur) return false;
  const L = ligneDesCartons(ligneDeFotmob);
  if (!L) return false;
  const d = s.deroule;
  const parLaLigne = { home: L.jDom + L.rDom + d.home.deuxiemesJaunes, away: L.jExt + L.rExt + d.away.deuxiemesJaunes };
  parLaLigne.total = parLaLigne.home + parLaLigne.away;
  const a = s.valeur[portee];
  const b = parLaLigne[portee];
  return fini(a) && fini(b) && a > ligne === b > ligne;
}

/** La garde des vrais zéros au jour J : `fenetre` = { n, vraisZeros } (les 60 derniers matchs relevés de la compétition AVANT J). */
export function gardeActive(fenetre, garde = CONSTANTES_DES_CARTONS.gardeZero) {
  return Boolean(fenetre) && fenetre.n >= garde.min && fenetre.vraisZeros / fenetre.n > garde.part;
}

/** Le statut après la garde du jour J : un « vrai-zero » devient « zero-non-confirme » quand la garde est active. */
export function statutApresLaGarde(statut, active) {
  return statut === 'vrai-zero' && active ? 'zero-non-confirme' : statut;
}

/** Un statut relevé ? */
export const estReleve = (statut) => RELEVES.has(statut);

// ======================================================= l'arbitre

/** Un texte ramené à une forme stable (NFC, espaces réduits) ; null s'il est vide (la règle de formulesDuContexte.texteStable). */
export function texteStable(t) {
  if (typeof t !== 'string') return null;
  const s = t.normalize('NFC').trim().replace(/\s+/g, ' ');
  return s ? s : null;
}

/** La clé d'un arbitre : « nom exact|pays » (pays vide s'il manque) ; null sans nom. Copie de cleDeLArbitre (refereeRead.js), égalité testée. */
export function cleDArbitre(arbitre) {
  const nom = texteStable(arbitre?.name ?? arbitre?.nom);
  if (!nom) return null;
  const pays = texteStable(arbitre?.country ?? arbitre?.pays) ?? '';
  return `${nom}|${pays}`;
}

/** L'indice d'un arbitre : ln((O + k·ē) / (E + k·ē)), ē = E / n ; null sans match ou sans attendu. */
export function indiceDArbitre(O, E, n, k = CONSTANTES_DES_CARTONS.kArbitre) {
  if (!(n > 0) || !(E > 0) || !fini(O)) return null;
  const moyen = E / n;
  return Math.log((O + k * moyen) / (E + k * moyen));
}

/** FNV-1a 32 bits des octets UTF-8 d'un texte (le placebo : faux arbitre, pseudo-championnat). */
export function fnv1a(texte) {
  const octets = new TextEncoder().encode(String(texte));
  let h = 0x811c9dc5;
  for (const o of octets) {
    h ^= o;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// ======================================================= équipes, tendance, attendus

/**
 * CE QUE PREND ET FAIT PRENDRE UNE ÉQUIPE : `fenetre` = [{ r, p }] (ses matchs relevés d'avant J ; r = cartons pris /
 * moyenne de SON côté dans SA compétition ce jour-là, p = cartons de l'adversaire / moyenne du côté adverse) →
 * ρ̃ = (Σ r + k) / (n + k), π̃ = (Σ p + k) / (n + k).
 */
export function rapportsDEquipe(fenetre, k = CONSTANTES_DES_CARTONS.kEquipe) {
  let sr = 0;
  let sp = 0;
  const n = fenetre?.length ?? 0;
  for (const x of fenetre ?? []) {
    sr += x.r;
    sp += x.p;
  }
  return { rho: (sr + k) / (n + k), pi: (sp + k) / (n + k), n };
}

/** LA TENDANCE RÉCENTE d'une compétition (critique, constat 2) : (Σ rapports cartons / moyenne + k) / (n + k). */
export function tendanceDeLaLigue(rapports, k = CONSTANTES_DES_CARTONS.tendance.k) {
  let s = 0;
  const n = rapports?.length ?? 0;
  for (const x of rapports ?? []) s += x;
  return { valeur: (s + k) / (n + k), n };
}

/** Les bras du modèle des cartons (conception §2.3, constat 2). */
export const BRAS = Object.freeze(['repere', 'equipes', 'complet']);

/**
 * LES CARTONS ATTENDUS d'un match (pur) — `bras` : 'repere' | 'equipes' | 'complet' ; `m` : { dom, ext } (moyennes de
 * la compétition par côté) ; `tendance` (r̄ de la compétition) ; `equipes` : { rhoH, piH, rhoA, piA } ; `z` (indice de
 * l'arbitre, 0 s'il est inconnu) ; `parametres` : { cDom, cExt, lambda, alpha, gamma, beta } :
 *   log μ_dom = log m_dom + c_dom + λ·log r̄ [+ α·log ρ̃_dom + γ·log π̃_ext] [+ β·z]  (et de même à l'extérieur).
 * Rend { home, away, total } ; null si la moyenne de la compétition manque.
 */
export function attendusDesCartons({ m, tendance = 1, equipes = null, z = 0, parametres = {}, bras = 'complet' }) {
  if (!m || !(m.dom > 0) || !(m.ext > 0)) return null;
  if (!BRAS.includes(bras)) throw new Error(`attendusDesCartons : bras inconnu « ${String(bras)} »`);
  const p = { cDom: 0, cExt: 0, lambda: 1, alpha: 1, gamma: 1, beta: 1, ...parametres };
  const lt = fini(tendance) && tendance > 0 ? Math.log(tendance) : 0;
  let lh = Math.log(m.dom) + p.cDom + p.lambda * lt;
  let la = Math.log(m.ext) + p.cExt + p.lambda * lt;
  if (bras !== 'repere') {
    const e = equipes ?? { rhoH: 1, piH: 1, rhoA: 1, piA: 1 };
    lh += p.alpha * Math.log(e.rhoH) + p.gamma * Math.log(e.piA);
    la += p.alpha * Math.log(e.rhoA) + p.gamma * Math.log(e.piH);
  }
  if (bras === 'complet' && fini(z)) {
    lh += p.beta * z;
    la += p.beta * z;
  }
  const home = Math.exp(lh);
  const away = Math.exp(la);
  return { home, away, total: home + away };
}

/** Corners, tirs et tirs cadrés À BLANC : les attendus NEUTRES du moteur ((pour + contre) / 2) × le facteur du championnat. */
export function attendusParChampionnat({ neutres, reglage }) {
  if (!neutres || !reglage || !fini(neutres.home) || !fini(neutres.away)) return null;
  const home = reglage.dom * neutres.home;
  const away = reglage.ext * neutres.away;
  return { home, away, total: home + away };
}

// ======================================================= la loi d'un compte, la perte, les lignes

const LN_FACT = [0];
const lnFact = (n) => {
  for (let i = LN_FACT.length; i <= n; i++) LN_FACT[i] = LN_FACT[i - 1] + Math.log(i);
  return LN_FACT[n];
};

/**
 * LA LOI D'UN COMPTE DE CARTONS (décision 2 de l'orchestrateur ; critique, constat 7) : `pmf[i]` = P(X = i) pour i < N,
 * `queue` = P(X ≥ N). 1/k > 0 : la binomiale négative du moteur (loiDesComptes, importée) ; 1/k < 0 (moins dispersé que
 * Poisson) : la BINOMIALE de n = max(15, arrondi(−1 / (1/k))) essais et de moyenne μ (variance μ + μ²·(−1/n)) ; 1/k ≈ 0 :
 * Poisson. `loi: 'moteur'` : la règle du moteur (un 1/k négatif y est Poisson) — pour les corners et les tirs.
 */
export function loiDesCartons(mu, invK, N, { loi = 'cartons' } = {}) {
  if (loi === 'moteur' || !(invK < -1e-6)) return loiDesComptes(mu, invK, N);
  const n = Math.max(CONSTANTES_DES_CARTONS.minBinomiale, Math.round(-1 / invK));
  const p = mu / n;
  if (!(p < 1)) return loiDesComptes(mu, 0, N);
  const pmf = new Array(N).fill(0);
  const lp = Math.log(p);
  const lq = Math.log1p(-p);
  for (let i = 0; i < N && i <= n; i++) pmf[i] = Math.exp(lnFact(n) - lnFact(i) - lnFact(n - i) + i * lp + (n - i) * lq);
  let somme = 0;
  for (const t of pmf) somme += t;
  return { pmf, queue: Math.max(0, 1 - somme), binomiale: n };
}

/** La loi d'un compte pour la perte log : N = max(41, ⌈4μ⌉) cases, puis la queue (la règle de loiDuCompte, bench/entrees.js). */
export function loiDUnCompte(mu, invK, options = {}) {
  if (!fini(mu) || !(mu > 0)) return null;
  return loiDesCartons(mu, invK, Math.max(41, Math.ceil(4 * mu)), options);
}

/**
 * LA PERTE LOG d'un compte réalisé `x` sous la loi (μ, 1/k), planchée à 1e-6 (= perteLogDesComptes(loiDuCompte(μ, 1/k),
 * x) de runner.js à l'octet, testé). Chaque terme de la loi ne dépend pas du nombre de cases : sous la grille de
 * N = max(41, ⌈4μ⌉) cases, seuls les x + 1 premiers termes sont calculés (le même terme, au bit près) ; au-delà, la queue
 * de la grille entière.
 */
export function perteDesComptes(x, mu, invK, options = {}) {
  if (!fini(mu) || !(mu > 0)) return -Math.log(CONSTANTES_DES_CARTONS.plancher);
  const N = Math.max(41, Math.ceil(4 * mu));
  const p = x < N ? loiDesCartons(mu, invK, x + 1, options).pmf[x] : loiDesCartons(mu, invK, N, options).queue;
  return -Math.log(Math.max(p, CONSTANTES_DES_CARTONS.plancher));
}

/** P(plus de `ligne`) d'un compte (μ, 1/k), `ligne` une demi-ligne. */
export function probabilitePlusDe(mu, invK, ligne, options = {}) {
  if (!fini(mu) || !(mu > 0) || !fini(ligne) || ligne <= 0) return null;
  const k = Math.floor(ligne);
  const { pmf } = loiDesCartons(mu, invK, k + 1, options);
  let s = 0;
  for (const t of pmf) s += t;
  return Math.max(0, 1 - Math.min(1, s));
}

/** LES LIGNES DU TOTAL autour de l'attendu (de 0,4 à 1,8 fois, demi-entiers, comme lineCandidates) : [{ ligne, plus }]. */
export function lignesDuTotal(mu, invK, options = {}) {
  if (!(mu > 0)) return [];
  const out = [];
  for (let ligne = Math.max(0.5, Math.floor(mu * 0.4) + 0.5); ligne <= Math.ceil(mu * 1.8) + 0.5; ligne += 1) {
    const p = probabilitePlusDe(mu, invK, ligne, options);
    if (p > 0 && p < 1) out.push({ ligne, plus: p });
  }
  return out;
}
