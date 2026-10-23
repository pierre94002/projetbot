/**
 * aiMemory.js — LA MÉMOIRE DE L'IA (étape 44 du plan, 23/10/2026) : les règles PURES des dossiers.
 * -----------------------------------------------------------------------
 * Par équipe et par championnat, un petit DOSSIER écrit par le CODE, jamais par l'IA : les faits du moment
 * (classement, série en cours), la forme, les absents connus, le changement d'entraîneur, le style (étape 37) et
 * des LEÇONS — seulement celles que le carnet de l'IA (étape 21) CONFIRME sur plusieurs matchs. Avant chaque
 * analyse d'avant-match, l'IA reçoit les 300 à 500 mots utiles des deux équipes et du championnat, à la place des
 * « 3 dernières leçons » de chaque type de marché qu'elle recevait jusqu'ici, prises sans aucun tri.
 *
 * UNE LEÇON, c'est le texte que l'IA a écrit dans son bilan d'après-match sur UN pronostic du moteur (« Corners —
 * Arsenal : plus de 4,5 »), avec sa date et son match d'origine. Ce que le code en retient pour la vérifier :
 *   - son SENS, lu dans le règlement du carnet (jamais dans le texte libre) : le pronostic du moteur a échoué
 *     (sens −1 : « le moteur s'y est trompé ») ou a tenu (sens +1) ;
 *   - ses PORTÉES : le club concerné (les deux clubs pour un marché du match, le seul club d'un marché d'équipe),
 *     reconnu par son IDENTIFIANT FotMob (celui du carnet : composition, gel, annuaire strict ; jamais le nom seul —
 *     « Port », « Portsmouth », « Porto », les « Nacional »), et son championnat.
 * Pour chaque portée, les cas du carnet APRÈS le match d'origine, du même type de marché : l'écart entre ce qui
 * s'est passé et ce que le moteur annonçait (réalisé − probabilité), corrigé de l'écart moyen du type sur tous les
 * cas (une erreur du moteur commune à tous les clubs n'est pas une leçon sur CE club), compté dans le sens de la
 * leçon. La leçon est CONFIRMÉE quand il y a assez de matchs (3 pour un club, 10 pour un championnat), un écart
 * moyen assez grand ET un écart qui dépasse le hasard (z ≥ 2, l'écart rapporté à ce que le hasard donnerait avec
 * les probabilités du moteur) ; elle est DÉMENTIE quand les matchs suivants vont plutôt contre elle (z ≤ −1) : elle
 * est alors RETIRÉE pour de bon — une leçon fausse ne doit jamais se répéter. Une leçon jamais confirmée en 120
 * jours, ou sur toute sa fenêtre de matchs, est retirée aussi. Les seuils sont fixés ici d'avance : aucun n'a été
 * choisi en regardant les résultats.
 *
 * L'IA NE FOURNIT JAMAIS UN CHIFFRE AU MOTEUR : un dossier est du texte choisi par le code, lu par l'IA seule. La
 * note manuscrite de Pierre (matchNotesRepository.js) n'y entre pas, ni dans aucun chiffre. Le moteur ne lit
 * jamais les dossiers (un test le vérifie sur les fichiers de son empreinte).
 *
 * Fonctions pures : aucune base, aucun réseau, aucun Claude, aucune horloge (`maintenant` est passé).
 * -----------------------------------------------------------------------
 */

/** La forme des dossiers : un fichier d'une autre forme est entièrement refait la nuit suivante. */
export const VERSION_DOSSIERS = 1;

/** Ce que l'IA reçoit : entre 300 et 500 mots (dossiers des deux équipes et du championnat). */
export const MOTS_POUR_IA = Object.freeze({ min: 300, max: 500 });

/**
 * Caractères du MESSAGE par token, calés à l'étape 41 sur les vrais appels du 02-05/10/2026 (consignes 2,33,
 * message 1,92) : la même règle que le budget de la 41 (objectif ~17 000 tokens par avant-match), donc une
 * estimation prudente — le texte en français courant se découpe plutôt moins.
 */
export const CARACTERES_PAR_TOKEN = 1.92;

/**
 * LES RÈGLES DES LEÇONS, fixées d'avance (jamais réglées sur les résultats) :
 *   minMatchs  matchs APRÈS le match d'origine avant de pouvoir trancher ;
 *   z          l'écart doit dépasser le hasard de z fois ce que les probabilités du moteur laissent attendre ;
 *   ecartMin   et peser au moins tant, en moyenne, dans le sens de la leçon (en part : 0,15 = 15 points) ;
 *   fenetre    seuls les derniers matchs comptent (une leçon vraie hier peut ne plus l'être) ;
 *   zDementi   en dessous, les matchs suivants vont contre la leçon : elle est retirée pour de bon.
 */
export const REGLES_LECONS = Object.freeze({
  equipe: Object.freeze({ minMatchs: 3, z: 2, ecartMin: 0.15, fenetre: 12 }),
  championnat: Object.freeze({ minMatchs: 10, z: 2, ecartMin: 0.05, fenetre: 60 }),
  zDementi: -1,
  expireApresJours: 120,
  /** Au plus tant de leçons par dossier dans le texte remis à l'IA (les plus récentes, une par type et par sens). */
  pourIA: Object.freeze({ parEquipe: 2, parChampionnat: 2 }),
  /** Ce que le dossier garde pour Pierre. */
  gardees: Object.freeze({ confirmees: 12, retirees: 10 })
});

/** Les états d'une leçon, en mots (dossier, écran). */
export const ETATS_LECON = Object.freeze({
  attente: 'en attente : pas encore assez de matchs pour que le carnet tranche',
  incertaine: 'pas encore tranchée : les matchs suivants ne disent rien de net',
  confirmee: 'confirmée par le carnet sur les matchs suivants',
  dementie: 'démentie par le carnet : retirée pour de bon',
  expiree: 'jamais confirmée : retirée'
});

/** Les états qui RETIRENT une leçon pour de bon. */
export const ETATS_RETIRES = Object.freeze(['dementie', 'expiree']);

/** D'où viennent les morceaux d'un dossier : dit tel quel à l'IA (en résumé) et à Pierre. */
export const PROVENANCE_DOSSIERS = Object.freeze({
  faits: 'magasin FotMob : rencontres et scores (table du jour J, étape 17), classement officiel FotMob',
  absents: 'absents annoncés par FotMob, relevés avant chaque match (enregistreurs, étape E)',
  entraineur: 'entraîneurs des compositions FotMob (étape 37)',
  style: 'styles de jeu calculés chaque nuit (étape 37)',
  championnat: 'repères du championnat (étape 15) et classement officiel FotMob',
  lecons: 'bilans d’après-match écrits par l’IA, gardés seulement quand son carnet (étape 21) les confirme',
  regle: 'écrit par le code, jamais par l’IA ; lu par l’IA seule, jamais par le moteur'
});

const JOUR_MS = 86_400_000;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const estVide = (v) => v === null || v === undefined || v === '';
const uneLigne = (v) => String(v ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();
const moyenne = (liste) => (liste.length ? liste.reduce((a, x) => a + x, 0) / liste.length : null);

// ============================================================ mots et tokens

/** Les mots d'un texte : tout morceau entre deux blancs qui porte au moins une lettre ou un chiffre (« · », « — », « | » ne comptent pas). */
export function compterMots(texte) {
  return String(texte ?? '')
    .split(/\s+/)
    .filter((m) => /[\p{L}\p{N}]/u.test(m)).length;
}

/** Les tokens d'un texte, estimés comme le budget de l'étape 41 (CARACTERES_PAR_TOKEN). */
export const estimerTokens = (texte) => Math.ceil(String(texte ?? '').length / CARACTERES_PAR_TOKEN);

// ============================================================ petits mots

const JOUR_DE_PARIS = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' });

/**
 * « 18/10 » ; `annee` : « 18/10/2026 ». Un jour seul (AAAA-MM-JJ) est dit tel quel ; un instant (avec son heure) est
 * dit au jour de PARIS (un calcul de 1 h du matin le 23 n'est pas « du 22 »).
 */
export function jourDit(iso, { annee = false } = {}) {
  let s = String(iso ?? '');
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s))) s = JOUR_DE_PARIS.format(new Date(s));
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return annee ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}

/** Un nombre à la française : virgule décimale, `d` décimales au plus. */
export function nombreDit(x, d = 1) {
  if (!fini(x)) return null;
  const arrondi = Math.round(x * 10 ** d) / 10 ** d;
  return String(arrondi).replace('.', ',');
}

/** Une part (0 à 1) en « 52 % ». */
export const pourcentDit = (x) => (fini(x) ? `${Math.round(100 * x)} %` : null);

const pluriel = (n, un, plusieurs) => `${n} ${Math.abs(n) > 1 ? plusieurs : un}`;
const rangDit = (r) => (r === 1 ? '1er' : `${r}e`);

// ============================================================ les leçons

/** Le sens d'une leçon, lu dans le RÈGLEMENT du carnet : −1 si le pronostic du moteur a échoué, +1 s'il a tenu. */
export const sensDuReglement = (realise) => (realise === true ? 1 : realise === false ? -1 : null);

/** La clé d'une portée : l'identifiant FotMob du club (« fotmob-9825 »), ou « ligue:EPL ». */
export const cleDeLigue = (league) => `ligue:${league}`;
/** La clé d'une leçon dans une portée (son état gardé d'une nuit à l'autre). */
export const cleDePortee = (leconId, portee) => `${leconId}@${portee}`;

/**
 * LES LEÇONS CANDIDATES : chaque leçon écrite par l'IA dans un bilan d'après-match (postMatchReview.marketReviews[i].
 * lesson, sous la règle du 30/09 : `minOdds`) rattachée au CAS du carnet de ce pronostic (même analyse, même place,
 * même marché) — c'est lui qui donne les identifiants FotMob des clubs, le jour du match et l'issue réglée. Une leçon
 * sans cas (club sans identifiant sûr, match pas réglé, analyse en double…) n'est jamais rattachée : comptée seulement.
 * @returns {{ lecons: object[], sansCas: number, total: number }}
 */
export function leconsDesAnalyses(analyses, cas) {
  const parAnalyse = new Map();
  for (const k of cas ?? []) {
    if (!k?.matchId) continue;
    if (!parAnalyse.has(k.matchId)) parAnalyse.set(k.matchId, []);
    parAnalyse.get(k.matchId).push(k);
  }
  const lecons = [];
  let sansCas = 0;
  let total = 0;
  for (const e of analyses ?? []) {
    const revues = e?.postMatchReview?.marketReviews;
    if (!Array.isArray(revues)) continue;
    const casDuMatch = parAnalyse.get(e.matchId) ?? [];
    revues.forEach((r, i) => {
      const texte = uneLigne(r?.lesson);
      if (!texte || !r?.minOdds) return;
      total++;
      // La place du bilan = la place du pronostic gardé avec l'analyse (la revue les suit dans l'ordre) ; le libellé le confirme.
      const k = casDuMatch.find((c) => c.index === i && c.market === r.market) ?? null;
      const sens = sensDuReglement(k?.realise);
      if (!k || !k.homeId || !k.awayId || sens === null) {
        sansCas++;
        return;
      }
      lecons.push({
        id: `${e.matchId}|${k.marche}`,
        matchId: e.matchId,
        bloc: k.bloc,
        date: k.date,
        league: k.league ?? null,
        homeId: k.homeId,
        awayId: k.awayId,
        homeName: e.homeName ?? null,
        awayName: e.awayName ?? null,
        type: k.type,
        equipe: k.equipe ?? null,
        market: r.market ?? k.market ?? null,
        pick: r.pick ?? k.pick ?? null,
        realise: k.realise,
        p: fini(k.p) ? k.p : null,
        verdict: r.aiVerdict ?? k.verdict ?? null,
        sens,
        texte,
        ecriteLe: e.postMatchReview?.createdAt ?? null
      });
    });
  }
  return { lecons, sansCas, total };
}

/** Les portées d'une leçon : le ou les clubs (identifiants FotMob), puis son championnat. */
export function porteesDeLaLecon(l) {
  const clubs = l.equipe === 'home' ? [l.homeId] : l.equipe === 'away' ? [l.awayId] : [l.homeId, l.awayId];
  const out = clubs.filter(Boolean).map((club) => ({ cle: club, genre: 'equipe', club }));
  if (l.league) out.push({ cle: cleDeLigue(l.league), genre: 'championnat', league: l.league });
  return out;
}

/**
 * Les cas du carnet rangés pour les leçons : par « type|club » (un cas d'un marché du match compte pour ses deux
 * clubs, un cas d'un marché d'équipe pour ce seul club) et par « type|ligue:… », chacun du plus ancien au plus récent.
 * Et l'écart moyen (réalisé − annoncé) de chaque type sur TOUS les cas : la part commune à tous les clubs.
 */
export function indexDesCas(cas) {
  const parCle = new Map();
  const ajouter = (cle, k) => {
    if (!parCle.has(cle)) parCle.set(cle, []);
    parCle.get(cle).push(k);
  };
  const sommes = new Map();
  const tries = [...(cas ?? [])].filter((k) => k && fini(k.p) && typeof k.realise === 'boolean' && k.type && k.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  for (const k of tries) {
    if (k.homeId && (k.equipe === null || k.equipe === undefined || k.equipe === 'home')) ajouter(`${k.type}|${k.homeId}`, k);
    if (k.awayId && (k.equipe === null || k.equipe === undefined || k.equipe === 'away')) ajouter(`${k.type}|${k.awayId}`, k);
    if (k.league) ajouter(`${k.type}|${cleDeLigue(k.league)}`, k);
    const s = sommes.get(k.type) ?? { n: 0, somme: 0 };
    s.n++;
    s.somme += (k.realise ? 1 : 0) - k.p;
    sommes.set(k.type, s);
  }
  const bases = new Map([...sommes].map(([t, s]) => [t, s.n ? s.somme / s.n : 0]));
  return { parCle, bases };
}

/** Les cas d'une portée APRÈS le match d'origine (jour strictement postérieur), du même type, sans le match d'origine. */
export function casSuivants(index, lecon, portee) {
  return (index.parCle.get(`${lecon.type}|${portee.cle}`) ?? []).filter((k) => String(k.date) > String(lecon.date) && k.bloc !== lecon.bloc);
}

/**
 * LE JUGEMENT D'UNE LEÇON dans une portée, sur ses cas suivants (`suivants`, du plus ancien au plus récent) :
 * { etat, preuve }. `etat` : 'attente' | 'incertaine' | 'confirmee' | 'dementie' | 'expiree' (cf. REGLES_LECONS).
 * `preuve` : les matchs comptés, ce que le moteur annonçait (moyenne), ce qui s'est passé, l'écart dans le sens de la
 * leçon (corrigé de la part commune du type, `base`) et son z.
 */
export function jugerLaLecon(lecon, suivants, { genre = 'equipe', base = 0, regles = REGLES_LECONS, maintenant }) {
  const r = genre === 'championnat' ? regles.championnat : regles.equipe;
  const blocs = [];
  for (const k of suivants) if (!blocs.includes(k.bloc)) blocs.push(k.bloc);
  const gardes = new Set(blocs.slice(-r.fenetre));
  const fen = suivants.filter((k) => gardes.has(k.bloc));
  const n = gardes.size;
  const ecarts = fen.map((k) => lecon.sens * ((k.realise ? 1 : 0) - k.p - base));
  const variance = fen.reduce((a, k) => a + k.p * (1 - k.p), 0);
  const somme = ecarts.reduce((a, x) => a + x, 0);
  const z = variance > 0 ? somme / Math.sqrt(variance) : null;
  const ecart = moyenne(ecarts);
  const preuve = {
    matchs: n,
    cas: fen.length,
    annonce: moyenne(fen.map((k) => k.p)),
    realises: fen.filter((k) => k.realise).length,
    ecart,
    z,
    base,
    du: fen[0]?.date ?? null,
    au: fen.at(-1)?.date ?? null
  };
  const ageJours = fini(maintenant) && Number.isFinite(Date.parse(lecon.date)) ? (maintenant - Date.parse(lecon.date)) / JOUR_MS : 0;
  const tropVieille = ageJours > regles.expireApresJours;
  if (n < r.minMatchs) return { etat: tropVieille ? 'expiree' : 'attente', preuve };
  if (z !== null && z >= r.z && ecart >= r.ecartMin) return { etat: 'confirmee', preuve };
  if (z !== null && z <= regles.zDementi) return { etat: 'dementie', preuve };
  return { etat: tropVieille || n >= r.fenetre ? 'expiree' : 'incertaine', preuve };
}

/**
 * L'ÉTAT GARDÉ d'une leçon dans une portée, d'une nuit à l'autre : un état « retiré » (démentie, expirée) ne se
 * rejuge JAMAIS — une leçon retirée ne revient pas ; une leçon confirmée garde la date de sa PREMIÈRE confirmation
 * (« confirmée le … »), et sort du dossier si elle ne l'est plus (sans être retirée, sauf démentie).
 * @returns {{ etat, depuis, confirmeeLe, retireeLe, raison, preuve, change }}
 */
export function etatSuivant(precedent, jugement, jour) {
  if (precedent && ETATS_RETIRES.includes(precedent.etat)) return { ...precedent, change: false };
  const { etat, preuve } = jugement;
  const confirmeeLe = etat === 'confirmee' ? precedent?.confirmeeLe ?? jour : precedent?.confirmeeLe ?? null;
  const retire = ETATS_RETIRES.includes(etat);
  return {
    etat,
    depuis: precedent?.etat === etat ? precedent.depuis ?? jour : jour,
    confirmeeLe,
    retireeLe: retire ? jour : null,
    raison: retire ? (etat === 'dementie' ? (precedent?.confirmeeLe ? 'confirmée d’abord, puis démentie par les matchs suivants' : 'démentie par les matchs suivants') : 'jamais confirmée') : null,
    preuve,
    change: (precedent?.etat ?? 'aucun') !== etat
  };
}

/** La preuve d'une leçon en mots : « sur 4 matchs suivants, le moteur annonçait 68 % en moyenne ; c'est passé 1 fois sur 4 ». */
export function preuveDite(preuve) {
  if (!preuve || !preuve.cas) return 'aucun match suivant compté';
  return `sur ${pluriel(preuve.matchs, 'match suivant', 'matchs suivants')}, le moteur annonçait ${pourcentDit(preuve.annonce)} en moyenne ; c’est passé ${preuve.realises} fois sur ${preuve.cas}`;
}

/** Le résumé d'une leçon gardée dans un dossier (ce que Pierre et l'IA lisent), sans le cas complet. */
export function leconPourLeDossier(l, etat) {
  return {
    id: l.id,
    date: l.date,
    match: { matchId: l.matchId, home: l.homeName, away: l.awayName, homeId: l.homeId, awayId: l.awayId, date: l.date, league: l.league },
    type: l.type,
    market: l.market,
    pick: l.pick,
    issue: l.realise ? 'juste' : 'faux',
    sens: l.sens,
    verdict: l.verdict,
    texte: l.texte,
    ecriteLe: l.ecriteLe,
    etat: etat.etat,
    confirmeeLe: etat.confirmeeLe ?? null,
    retireeLe: etat.retireeLe ?? null,
    raison: etat.raison ?? null,
    preuve: etat.preuve ?? null
  };
}

/**
 * Les leçons d'une portée pour son dossier : les CONFIRMÉES (les plus récentes d'abord, REGLES.gardees.confirmees au
 * plus), les RETIRÉES (les dernières retirées), et combien attendent encore. `etats` : Map clé de portée → état gardé.
 */
export function leconsDuDossier(lecons, porteeCle, etats, regles = REGLES_LECONS) {
  const confirmees = [];
  const retirees = [];
  let enAttente = 0;
  for (const l of lecons) {
    const e = etats.get(cleDePortee(l.id, porteeCle));
    if (!e) continue;
    if (e.etat === 'confirmee') confirmees.push(leconPourLeDossier(l, e));
    else if (ETATS_RETIRES.includes(e.etat)) retirees.push(leconPourLeDossier(l, e));
    else enAttente++;
  }
  confirmees.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)));
  retirees.sort((a, b) => String(b.retireeLe).localeCompare(String(a.retireeLe)) || String(b.date).localeCompare(String(a.date)));
  return { confirmees: confirmees.slice(0, regles.gardees.confirmees), retirees: retirees.slice(0, regles.gardees.retirees), enAttente, confirmeesEnTout: confirmees.length, retireesEnTout: retirees.length };
}

// ============================================================ les faits d'un club

/** Une rencontre vue par un club : { date, league, coupe, adversaireId, adversaire, lieu ('dom'|'ext'), bp, bc, issue ('V'|'N'|'D'), attribue }. */
export const issueDe = (bp, bc) => (bp > bc ? 'V' : bp === bc ? 'N' : 'D');
const POINTS = { V: 3, N: 1, D: 0 };

/** Les matchs JOUÉS d'un club, du plus récent au plus ancien, sans les matchs attribués (aucun jeu). */
const joues = (matchs) => (matchs ?? []).filter((m) => !m.attribue && fini(m.bp) && fini(m.bc)).sort((a, b) => String(b.date).localeCompare(String(a.date)));

/**
 * LA FORME : les 10 derniers matchs (toutes compétitions), leur bilan, et la tendance (points par match des 5
 * derniers face aux 5 d'avant). `null` sans match.
 */
export function formeDuClub(matchs) {
  const liste = joues(matchs);
  if (!liste.length) return null;
  const dix = liste.slice(0, 10);
  const bilan = (l) => ({
    matchs: l.length,
    v: l.filter((m) => m.issue === 'V').length,
    n: l.filter((m) => m.issue === 'N').length,
    d: l.filter((m) => m.issue === 'D').length,
    bp: l.reduce((a, m) => a + m.bp, 0),
    bc: l.reduce((a, m) => a + m.bc, 0),
    points: l.reduce((a, m) => a + POINTS[m.issue], 0)
  });
  const cinq = bilan(dix.slice(0, 5));
  const avant = dix.length >= 8 ? bilan(dix.slice(5, 10)) : null;
  return {
    derniers: dix.map(({ date, league, coupe, adversaireId, adversaire, lieu, bp, bc, issue }) => ({ date, league, coupe: Boolean(coupe), adversaireId, adversaire, lieu, bp, bc, issue })),
    bilan: bilan(dix),
    tendance: avant ? { cinq: cinq.points / cinq.matchs, avant: avant.points / avant.matchs } : null,
    dernierMatch: dix[0].date
  };
}

/**
 * LES SÉRIES EN COURS (toutes compétitions, matchs attribués écartés), seulement celles qui se remarquent :
 * victoires (≥ 3), défaites (≥ 3), invaincu (≥ 4, s'il ne gagne pas tout), sans victoire (≥ 4, s'il ne perd pas tout),
 * a marqué à chaque match (≥ 5), muet (≥ 2), sans encaisser (≥ 2) ; puis à domicile et à l'extérieur en championnat
 * (invaincu ou sans victoire, ≥ 5). Chacune : { cle, n, texte }.
 */
export function seriesDuClub(matchs) {
  const liste = joues(matchs);
  const suite = (l, test) => {
    let n = 0;
    for (const m of l) {
      if (!test(m)) break;
      n++;
    }
    return n;
  };
  const out = [];
  const victoires = suite(liste, (m) => m.issue === 'V');
  const defaites = suite(liste, (m) => m.issue === 'D');
  const invaincu = suite(liste, (m) => m.issue !== 'D');
  const sansVictoire = suite(liste, (m) => m.issue !== 'V');
  if (victoires >= 3) out.push({ cle: 'victoires', n: victoires, texte: `${victoires} victoires de suite` });
  else if (invaincu >= 4) out.push({ cle: 'invaincu', n: invaincu, texte: `invaincu depuis ${invaincu} matchs` });
  if (defaites >= 3) out.push({ cle: 'defaites', n: defaites, texte: `${defaites} défaites de suite` });
  else if (sansVictoire >= 4) out.push({ cle: 'sansVictoire', n: sansVictoire, texte: `sans victoire depuis ${sansVictoire} matchs` });
  const marque = suite(liste, (m) => m.bp > 0);
  const muet = suite(liste, (m) => m.bp === 0);
  const propre = suite(liste, (m) => m.bc === 0);
  if (marque >= 5) out.push({ cle: 'marque', n: marque, texte: `a marqué lors de ses ${marque} derniers matchs` });
  if (muet >= 2) out.push({ cle: 'muet', n: muet, texte: `n’a pas marqué depuis ${muet} matchs` });
  if (propre >= 2) out.push({ cle: 'propre', n: propre, texte: `n’a pas encaissé de but depuis ${propre} matchs` });
  for (const [lieu, mot] of [['dom', 'à domicile'], ['ext', 'à l’extérieur']]) {
    const l = liste.filter((m) => !m.coupe && m.lieu === lieu);
    const inv = suite(l, (m) => m.issue !== 'D');
    const sv = suite(l, (m) => m.issue !== 'V');
    if (inv >= 5) out.push({ cle: `invaincu-${lieu}`, n: inv, texte: `invaincu ${mot} en championnat depuis ${inv} matchs` });
    else if (sv >= 5) out.push({ cle: `sansVictoire-${lieu}`, n: sv, texte: `sans victoire ${mot} en championnat depuis ${sv} matchs` });
  }
  return out;
}

/**
 * LE CLASSEMENT d'un club, lu dans les tables officielles FotMob de son championnat (par IDENTIFIANT, jamais par le
 * nom) : la table qui le contient, son rang, ses points, et l'écart avec le premier (ou son avance sur le deuxième).
 * `tables` : [{ league, season, table_name, ord, fetched_at, rows: [...] }] (une saison, la plus récente). null s'il n'y est pas.
 */
export function classementDuClub(tables, club) {
  const plusieurs = (tables ?? []).length > 1;
  for (const t of [...(tables ?? [])].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))) {
    const rows = Array.isArray(t.rows) ? t.rows : [];
    const moi = rows.find((r) => r?.teamId === club);
    if (!moi) continue;
    const tries = [...rows].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const premier = tries[0];
    const second = tries[1] ?? null;
    return {
      league: t.league,
      saison: t.season,
      // Le nom de la table seulement quand la compétition en a plusieurs (groupes, conférences).
      table: plusieurs ? t.table_name : null,
      luLe: t.fetched_at ?? null,
      rang: moi.rank,
      equipes: rows.length,
      points: moi.points,
      joues: moi.played,
      v: moi.won,
      n: moi.drawn,
      d: moi.lost,
      bp: moi.goalsFor,
      bc: moi.goalsAgainst,
      zone: estVide(moi.description) ? null : String(moi.description),
      premier: premier && premier.teamId !== club ? { id: premier.teamId, nom: premier.teamName, points: premier.points } : null,
      second: moi.rank === 1 && second ? { id: second.teamId, nom: second.teamName, points: second.points } : null
    };
  }
  return null;
}

/** Le classement en une phrase : « 2e de EPL (sur 20) : 18 pts en 7 matchs, à 3 pts du 1er, Manchester City ; zone : Champions League ». */
export function classementDit(c) {
  if (!c) return null;
  let t = `${rangDit(c.rang)} de ${c.table && c.table !== c.league ? `${c.league}, ${c.table}` : c.league} (sur ${c.equipes}) : ${pluriel(c.points ?? 0, 'pt', 'pts')} en ${pluriel(c.joues ?? 0, 'match', 'matchs')}`;
  if (c.premier && fini(c.premier.points) && fini(c.points)) t += `, à ${pluriel(c.premier.points - c.points, 'pt', 'pts')} du 1er, ${c.premier.nom}`;
  if (c.second && fini(c.second.points) && fini(c.points)) t += `, ${pluriel(c.points - c.second.points, 'pt', 'pts')} d’avance sur ${c.second.nom}`;
  if (c.zone) t += ` ; zone : ${c.zone}`;
  return t;
}

/**
 * L'ENTRAÎNEUR, lu dans les compositions (étape 37, team_style_matches) : `lignes` = [{ date, coach, coach_id }] du club,
 * toutes compétitions ; `matchs` = ses rencontres (pour le bilan sous lui). L'entraîneur en place, depuis quand (le
 * premier match de la suite en cours : « au moins » si la suite commence avec le magasin), son bilan, et le précédent.
 * NOUVEAU : la suite a commencé il y a moins de `nouveauJours` jours après un autre entraîneur.
 */
export function entraineurDuClub(lignes, matchs, { maintenant, nouveauJours = 90 } = {}) {
  const l = [...(lignes ?? [])].filter((x) => x && (x.coach || x.coach_id)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!l.length) return null;
  // Sans identifiant des deux côtés, le nom — accents, casse et espaces près : FotMob écrit « Marcão » puis « Marcao » pour le
  // même homme (vu sur Fluminense dans la base du bac, qui passait pour un « nouvel entraîneur » après lui-même).
  const nomSimple = (n) => String(n ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const memeHomme = (a, b) => (a.coach_id && b.coach_id ? a.coach_id === b.coach_id : nomSimple(a.coach) === nomSimple(b.coach));
  const actuel = l[0];
  let i = 0;
  while (i < l.length && memeHomme(l[i], actuel)) i++;
  const suite = l.slice(0, i);
  const depuis = suite.at(-1).date;
  const precedent = l[i] ?? null;
  const parJour = new Map(joues(matchs).map((m) => [m.date, m]));
  const sousLui = suite.map((x) => parJour.get(x.date)).filter(Boolean);
  const bilan = { matchs: sousLui.length, v: sousLui.filter((m) => m.issue === 'V').length, n: sousLui.filter((m) => m.issue === 'N').length, d: sousLui.filter((m) => m.issue === 'D').length };
  const age = fini(maintenant) ? (maintenant - Date.parse(depuis)) / JOUR_MS : Infinity;
  return {
    nom: actuel.coach ?? null,
    coachId: actuel.coach_id ?? null,
    depuis,
    auMoins: !precedent,
    bilan,
    precedent: precedent ? { nom: precedent.coach ?? null, dernierMatch: precedent.date } : null,
    nouveau: Boolean(precedent) && age <= nouveauJours
  };
}

/** L'entraîneur en une phrase. */
export function entraineurDit(e) {
  if (!e?.nom) return null;
  const b = e.bilan;
  const bilan = b?.matchs ? ` (${pluriel(b.matchs, 'match', 'matchs')} : ${b.v} V, ${b.n} N, ${b.d} D)` : '';
  if (e.nouveau) return `Nouvel entraîneur : ${e.nom}, depuis le ${jourDit(e.depuis, { annee: true })}${bilan}, après ${e.precedent?.nom ?? 'un autre'} (dernier match le ${jourDit(e.precedent?.dernierMatch, { annee: true })}).`;
  return `Entraîneur : ${e.nom}, en place depuis ${e.auMoins ? 'au moins ' : ''}le ${jourDit(e.depuis, { annee: true })}${bilan}${e.precedent ? `, après ${e.precedent.nom}` : ''}.`;
}

/** Le style (étape 37) en une phrase. `s` : { libelle, secondLibelle, provisoire, n, jour } ou null. */
export function styleDit(s) {
  if (!s?.libelle) return null;
  return `Style de jeu : ${s.libelle}${s.secondLibelle ? ` (aussi ${s.secondLibelle})` : ''}, lu sur ses ${s.n} derniers matchs de championnat au ${jourDit(s.jour)}${s.provisoire ? ', provisoire' : ''}.`;
}

/** Les absents en une phrase (au plus `max` noms). `a` : { lusLe, match: { date, adversaire }, liste: [{ nom, motif, retour }] }. */
export function absentsDits(a, { max = 6 } = {}) {
  if (!a) return null;
  const pour = a.match ? ` pour le match du ${jourDit(a.match.date)} contre ${a.match.adversaire ?? 'un adversaire inconnu'}` : '';
  if (!a.liste?.length) return `Absents : aucun annoncé par FotMob (lu le ${jourDit(a.lusLe)}${pour}).`;
  const MOTIFS = { injury: 'blessure', suspension: 'suspension' };
  const noms = a.liste.slice(0, max).map((x) => `${x.nom} (${MOTIFS[x.motif] ?? x.motif ?? 'indisponible'}${x.retour ? `, retour : ${x.retour}` : ''})`);
  const reste = a.liste.length - noms.length;
  return `Absents connus (lus le ${jourDit(a.lusLe)}${pour}) : ${noms.join(' · ')}${reste > 0 ? ` · et ${reste} autre${reste > 1 ? 's' : ''}` : ''}.`;
}

/** La forme en une phrase (bilan + tendance), et le détail des 5 derniers matchs à part. */
export function formeDite(f) {
  if (!f) return null;
  const b = f.bilan;
  let t = `Forme sur ${pluriel(b.matchs, 'match', 'matchs')} (toutes compétitions) : ${b.v} V, ${b.n} N, ${b.d} D, ${pluriel(b.bp, 'but marqué', 'buts marqués')}, ${b.bc} encaissé${b.bc > 1 ? 's' : ''}`;
  if (f.tendance) {
    const { cinq, avant } = f.tendance;
    const sens = cinq - avant >= 0.5 ? 'en hausse' : avant - cinq >= 0.5 ? 'en baisse' : 'stable';
    t += ` ; ${sens} : ${nombreDit(cinq)} point${cinq >= 2 ? 's' : ''} par match sur les 5 derniers contre ${nombreDit(avant)} sur les 5 d’avant`;
  }
  return `${t}.`;
}
export function cinqDerniersDits(f) {
  if (!f?.derniers?.length) return null;
  const m = f.derniers.slice(0, 5).map((x) => `${x.issue} ${x.bp}-${x.bc} ${x.lieu === 'dom' ? 'contre' : 'à'} ${x.adversaire ?? 'adversaire inconnu'} (${x.league}, ${jourDit(x.date)})`);
  return `Derniers matchs : ${m.join(' · ')}.`;
}

/** Les faits du moment en une phrase : classement, séries. */
export function faitsDits(d) {
  const morceaux = [];
  const c = classementDit(d.classement);
  if (c) morceaux.push(c);
  if (d.series?.length) morceaux.push(`séries : ${d.series.map((s) => s.texte).join(', ')}`);
  return morceaux.length ? `Faits : ${morceaux.join(' ; ')}.` : null;
}

// ============================================================ le championnat

/**
 * LE PROFIL d'un championnat, lu dans ses repères (étape 15) : la saison en cours (la plus récente qui n'est pas
 * « toutes ») face à toutes ses saisons. `reperes` : [{ saison, repere, valeur, matchs }].
 */
export function profilDuChampionnat(reperes) {
  const parSaison = new Map();
  for (const r of reperes ?? []) {
    if (!parSaison.has(r.saison)) parSaison.set(r.saison, {});
    parSaison.get(r.saison)[r.repere] = { valeur: r.valeur, matchs: r.matchs };
  }
  const annee = (s) => Number(String(s).slice(0, 4)) || 0;
  const saisons = [...parSaison.keys()].filter((s) => s !== 'toutes').sort((a, b) => annee(b) - annee(a) || String(b).localeCompare(String(a)));
  const courante = saisons[0] ?? null;
  if (!courante) return null;
  const lire = (s) => {
    const r = parSaison.get(s) ?? {};
    const v = (k) => (fini(r[k]?.valeur) ? r[k].valeur : null);
    return { matchs: v('matchs'), buts: v('buts'), victoiresDom: v('victoires_dom'), nuls: v('nuls'), victoiresExt: v('victoires_ext'), plus25: v('plus_2_5'), deuxMarquent: v('deux_marquent'), corners: v('corners') };
  };
  return { saison: courante, ...lire(courante), toutes: parSaison.has('toutes') ? lire('toutes') : null };
}

/** Le profil en une phrase. */
export function profilDit(p) {
  if (!p || !p.matchs) return null;
  const morceaux = [];
  if (fini(p.buts)) morceaux.push(`${nombreDit(p.buts)} buts par match${fini(p.toutes?.buts) ? ` (toutes saisons : ${nombreDit(p.toutes.buts)})` : ''}`);
  if (fini(p.victoiresDom)) morceaux.push(`victoires à domicile ${pourcentDit(p.victoiresDom)}, nuls ${pourcentDit(p.nuls)}, victoires à l’extérieur ${pourcentDit(p.victoiresExt)}`);
  if (fini(p.plus25)) morceaux.push(`plus de 2,5 buts ${pourcentDit(p.plus25)}${fini(p.toutes?.plus25) ? ` (toutes saisons : ${pourcentDit(p.toutes.plus25)})` : ''}`);
  if (fini(p.deuxMarquent)) morceaux.push(`les deux marquent ${pourcentDit(p.deuxMarquent)}`);
  if (fini(p.corners)) morceaux.push(`${nombreDit(p.corners)} corners par match`);
  return `Saison ${p.saison} (${pluriel(Math.round(p.matchs), 'match', 'matchs')}) : ${morceaux.join(', ')}.`;
}

/** La tête du classement en une phrase : « En tête : Manchester City 21 pts, Arsenal 18 pts (7 matchs joués) ». */
export function teteDite(tete) {
  if (!tete?.length) return null;
  return `En tête : ${tete.map((t) => `${t.nom} ${pluriel(t.points ?? 0, 'pt', 'pts')}`).join(', ')}${fini(tete[0].joues) ? ` (${pluriel(tete[0].joues, 'match joué', 'matchs joués')} pour le 1er)` : ''}.`;
}

/**
 * Ce que dit le carnet de l'IA (étape 21) pour ce championnat : ses avis comptés et tenus, en tout et par type de
 * marché (au moins `min` avis), le plus fourni d'abord. `lignes` : les cases parChampionnat de carnet-ia.json.
 */
export function carnetDuChampionnat(lignes, league, { min = 5, max = 4 } = {}) {
  const miennes = (lignes ?? []).filter((c) => c?.league === league && c?.bilan);
  if (!miennes.length) return null;
  const total = miennes.reduce((a, c) => ({ avis: a.avis + (c.bilan.aiVerdicts ?? 0), tenus: a.tenus + (c.bilan.aiRight ?? 0) }), { avis: 0, tenus: 0 });
  const types = miennes
    .filter((c) => (c.bilan.aiVerdicts ?? 0) >= min)
    .map((c) => ({ type: c.marketType ?? c.bilan.marketType, label: c.label ?? c.bilan.label, avis: c.bilan.aiVerdicts, tenus: c.bilan.aiRight }))
    .sort((a, b) => b.avis - a.avis || String(a.type).localeCompare(String(b.type)));
  return { ...total, types: types.slice(0, max), typesEnTout: types.length };
}

/**
 * Ce que dit le carnet des matchs d'UN club (par identifiant) : les pronostics du moteur réglés et justes, les avis de
 * l'IA comptés et tenus. `cas` : les cas du carnet ; un cas d'un marché du match compte pour ses deux clubs, un cas
 * d'un marché d'équipe pour ce seul club. null sans aucun cas.
 */
export function carnetDuClub(cas, club) {
  let pronostics = 0;
  let justes = 0;
  let avis = 0;
  let tenus = 0;
  const matchs = new Set();
  for (const k of cas ?? []) {
    const moi = (k.homeId === club && (k.equipe == null || k.equipe === 'home')) || (k.awayId === club && (k.equipe == null || k.equipe === 'away'));
    if (!moi || typeof k.realise !== 'boolean') continue;
    matchs.add(k.bloc);
    pronostics++;
    if (k.realise) justes++;
    if (k.tenu === true || k.tenu === false) {
      avis++;
      if (k.tenu) tenus++;
    }
  }
  return pronostics ? { matchs: matchs.size, pronostics, justes, avis, tenus } : null;
}

export function carnetDuClubDit(c) {
  if (!c || c.pronostics < 5) return null;
  const sur = c.matchs > 1 ? `ses ${c.matchs} matchs analysés` : 'son seul match analysé';
  return `Ton carnet sur ${sur} : pronostics du moteur justes ${c.justes}/${c.pronostics}${c.avis ? `, tes avis tenus ${c.tenus}/${c.avis}` : ''}.`;
}

export function carnetDit(c) {
  if (!c || !c.avis) return null;
  return `Tes avis dans ce championnat (ton carnet, avis comptés) : ${c.tenus}/${c.avis} tenus${c.types.length ? ` ; ${c.types.map((t) => `${t.label} ${t.tenus}/${t.avis}`).join(', ')}` : ''}.`;
}

// ============================================================ le texte remis à l'IA

/** Une leçon telle que l'IA la lit : son match d'origine, son marché, son texte, et ce que le carnet en a vu. */
export function leconDite(l) {
  const match = `${l.match?.home ?? '?'} – ${l.match?.away ?? '?'}`;
  const verdictDit = l.sens === -1 ? 'le moteur s’y est trompé à nouveau' : 'le pronostic du moteur a tenu à nouveau';
  return `[${jourDit(l.date)}, ${match}, ${l.market} : « ${l.pick} » ${l.issue}] « ${uneLigne(l.texte)} » — confirmée par ton carnet : ${verdictDit} (${preuveDite(l.preuve)}).`;
}

/** Choisit les leçons à remettre à l'IA : les plus récentes, une seule par type de marché et par sens, `max` au plus, jamais une déjà citée. */
export function leconsPourIA(confirmees, { max, dejaCitees = new Set() } = {}) {
  const vues = new Set();
  const out = [];
  for (const l of confirmees ?? []) {
    if (out.length >= max) break;
    if (dejaCitees.has(l.id)) continue;
    const cle = `${l.type}|${l.sens}`;
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push(l);
  }
  return out;
}

/** L'en-tête de la section : ce qu'est un dossier, et comment s'en servir (compté dans les mots). */
export const ENTETE_POUR_IA =
  '## dossiers — ta mémoire, tenue par le code (pas par toi) : faits du moment, forme, absents, entraîneur, style, et seulement les leçons que ton carnet a CONFIRMÉES sur plusieurs matchs. Cite une leçon (sa date et son match) quand elle sert à un avis ; ignore-la sinon.';

/**
 * LE TEXTE REMIS À L'IA, entre 300 et 500 mots : l'en-tête, puis le dossier de chaque équipe et celui du championnat.
 * Chaque morceau a sa PRIORITÉ ; ils entrent du plus utile au moins utile tant que le total reste sous `max` mots
 * (les leçons confirmées d'abord, puis les faits, le changement d'entraîneur, le profil du championnat, le style,
 * les absents quand la composition ne les dit pas, le carnet du championnat, la forme ; le détail des derniers
 * matchs seulement quand la fiche ne donne pas déjà la forme du magasin). Rien n'est inventé : un dossier absent est
 * dit en une ligne. Pur.
 *
 * `equipes` : { home: { nom, club, dossier }, away: {...} } (dossier = celui du fichier, ou null, et la raison) ;
 * `championnat` : { league, dossier } ; `contexte` : { absentsConnus: { home, away }, formeConnue: { home, away } }.
 * @returns {{ texte, mots, tokens, parties: [{ cle, bloc, mots }], lecons: string[], ecartes: [{ cle, bloc, mots }] }}
 */
export function texteDesDossiersPourIA({ equipes, championnat, contexte = {}, regles = REGLES_LECONS, mots = MOTS_POUR_IA } = {}) {
  const morceaux = [];
  const ajouter = (bloc, ordre, priorite, cle, texte, extra = {}) => {
    if (!texte) return;
    morceaux.push({ bloc, ordre, priorite, cle, texte, mots: compterMots(texte), ...extra });
  };
  const titres = {};
  const citees = new Set();
  for (const cote of ['home', 'away']) {
    const e = equipes?.[cote] ?? {};
    const d = e.dossier;
    if (!d) {
      titres[cote] = `### ${e.nom ?? (cote === 'home' ? 'Équipe à domicile' : 'Équipe à l’extérieur')} : pas de dossier (${e.raison ?? 'club inconnu du magasin'}).`;
      continue;
    }
    titres[cote] = `### ${d.nom ?? e.nom} (${cote === 'home' ? 'à domicile' : 'à l’extérieur'}) — dossier du ${jourDit(d.majLe)}, matchs jusqu’au ${jourDit(d.jusquAu)}`;
    const choisies = leconsPourIA(d.lecons?.confirmees, { max: regles.pourIA.parEquipe, dejaCitees: citees });
    choisies.forEach((l, i) => {
      citees.add(l.id);
      ajouter(cote, 90 + i, 10 + i, `lecon:${l.id}`, `Leçon : ${leconDite(l)}`, { lecon: l.id });
    });
    ajouter(cote, 10, 20, 'faits', faitsDits(d));
    ajouter(cote, 30, d.entraineur?.nouveau ? 15 : 45, 'entraineur', entraineurDit(d.entraineur));
    ajouter(cote, 40, 30, 'style', styleDit(d.style));
    // Les absents et le détail des derniers matchs que la fiche donne déjà (composition de CE match, forme du magasin) :
    // seulement pour atteindre le plancher de mots, jamais avant ce qui est neuf.
    ajouter(cote, 50, 32, 'absents', absentsDits(d.absents), { redondant: Boolean(contexte.absentsConnus?.[cote]) });
    ajouter(cote, 20, 40, 'forme', formeDite(d.forme));
    ajouter(cote, 60, 38, 'carnet', carnetDuClubDit(d.carnet));
    ajouter(cote, 25, 60, 'cinqDerniers', cinqDerniersDits(d.forme), { redondant: Boolean(contexte.formeConnue?.[cote]) });
  }
  const c = championnat?.dossier;
  if (!c) {
    titres.ligue = `### ${championnat?.league ?? 'Compétition inconnue'} : pas de dossier de championnat.`;
  } else {
    titres.ligue = `### ${c.league} — dossier du ${jourDit(c.majLe)}`;
    const choisies = leconsPourIA(c.lecons?.confirmees, { max: regles.pourIA.parChampionnat, dejaCitees: citees });
    choisies.forEach((l, i) => {
      citees.add(l.id);
      ajouter('ligue', 90 + i, 12 + i, `lecon:${l.id}`, `Leçon du championnat : ${leconDite(l)}`, { lecon: l.id });
    });
    ajouter('ligue', 10, 25, 'profil', profilDit(c.profil));
    ajouter('ligue', 20, 50, 'tete', teteDite(c.tete));
    ajouter('ligue', 30, 35, 'carnet', carnetDit(c.carnet));
  }
  const fixes = [ENTETE_POUR_IA, titres.home, titres.away, titres.ligue];
  let total = fixes.reduce((a, t) => a + compterMots(t), 0);
  const gardes = [];
  const ecartes = [];
  const parPriorite = (a, b) => a.priorite - b.priorite || a.ordre - b.ordre;
  // 1. Le neuf, du plus utile au moins utile, sous le plafond ; 2. ce que la fiche dit déjà, seulement sous le plancher.
  for (const m of morceaux.filter((x) => !x.redondant).sort(parPriorite)) {
    if (total + m.mots <= mots.max) {
      gardes.push(m);
      total += m.mots;
    } else ecartes.push({ cle: m.cle, bloc: m.bloc, mots: m.mots, raison: 'plafond' });
  }
  for (const m of morceaux.filter((x) => x.redondant).sort(parPriorite)) {
    if (total < mots.min && total + m.mots <= mots.max) {
      gardes.push(m);
      total += m.mots;
    } else ecartes.push({ cle: m.cle, bloc: m.bloc, mots: m.mots, raison: total >= mots.min ? 'deja-dans-la-fiche' : 'plafond' });
  }
  const bloc = (b) => [titres[b], ...gardes.filter((m) => m.bloc === b).sort((x, y) => x.ordre - y.ordre).map((m) => m.texte)];
  const texte = [ENTETE_POUR_IA, ...bloc('home'), ...bloc('away'), ...bloc('ligue')].join('\n');
  return {
    texte,
    mots: compterMots(texte),
    tokens: estimerTokens(texte),
    parties: gardes.map((m) => ({ cle: m.cle, bloc: m.bloc, mots: m.mots })),
    lecons: gardes.filter((m) => m.lecon).map((m) => m.lecon),
    ecartes
  };
}

/**
 * Les PHRASES d'un dossier, pour l'écran (mêmes mots que ceux que l'IA lit) : faits, forme, entraîneur, style, absents,
 * carnet, et pour chaque leçon (confirmée ou retirée) sa preuve en mots. null sans dossier.
 */
export function phrasesDuDossier(d) {
  if (!d) return null;
  const preuves = {};
  for (const l of [...(d.lecons?.confirmees ?? []), ...(d.lecons?.retirees ?? [])]) preuves[l.id] = preuveDite(l.preuve);
  return {
    classement: classementDit(d.classement),
    series: (d.series ?? []).map((s) => s.texte),
    forme: formeDite(d.forme),
    entraineur: entraineurDit(d.entraineur),
    style: styleDit(d.style),
    absents: absentsDits(d.absents, { max: 50 }),
    carnet: carnetDuClubDit(d.carnet),
    preuves
  };
}

/** Les phrases d'un dossier de championnat, pour l'écran. */
export function phrasesDuChampionnat(c) {
  if (!c) return null;
  const preuves = {};
  for (const l of [...(c.lecons?.confirmees ?? []), ...(c.lecons?.retirees ?? [])]) preuves[l.id] = preuveDite(l.preuve);
  return { profil: profilDit(c.profil), tete: teteDite(c.tete), carnet: carnetDit(c.carnet), preuves };
}

/** Le bloc d'UNE équipe tel que l'IA le lirait (la page équipe le montre à Pierre) : son titre et ses morceaux, sans limite de mots. */
export function texteDUneEquipePourIA(d) {
  if (!d) return null;
  const lignes = [
    `### ${d.nom} — dossier du ${jourDit(d.majLe)}, matchs jusqu’au ${jourDit(d.jusquAu)}`,
    faitsDits(d),
    formeDite(d.forme),
    entraineurDit(d.entraineur),
    styleDit(d.style),
    absentsDits(d.absents),
    carnetDuClubDit(d.carnet),
    ...leconsPourIA(d.lecons?.confirmees, { max: REGLES_LECONS.pourIA.parEquipe }).map((l) => `Leçon : ${leconDite(l)}`)
  ].filter(Boolean);
  const texte = lignes.join('\n');
  return { texte, mots: compterMots(texte), tokens: estimerTokens(texte) };
}
