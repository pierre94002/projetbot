/**
 * cartonsABlanc.js — LES MOTS DE LA CARTE « CARTONS ATTENDUS — À BLANC » (étape 33 du plan, lot 1b, partie D, 02/11/2026).
 * -----------------------------------------------------------------------
 * Règles PURES (ni Vue, ni réseau, ni navigateur : les tests du serveur les rejouent sur les vraies réponses). Elles
 * disent, en français simple, ce que trois lectures déjà faites par la page apportent — aucune requête de plus :
 *   - `cartons` : le bloc que le serveur joint à l'analyse (data/cartons/cartonsRead.js) — les tables de la nuit (équipes,
 *     moyennes du championnat), les cartons attendus SANS arbitre (le bras « complet », z = 0), les paramètres et les
 *     statuts de la note du banc (recopiée par script, jamais retapée ici), corners et tirs avec les réglages par
 *     championnat (des nombres) ;
 *   - `page` : la page FotMob du match (GET /api/match-stats/preview) — l'arbitre désigné et sa ligne dans la table des
 *     cartons (`arbitreDesCartons`), l'heure de la lecture (`releveLe`) ;
 *   - `simulation` : le bloc de l'étape 28 (l'enjeu se lit dans SON encadré ; la ligne y renvoie sans recopier le chiffre).
 *
 * Les cinq lignes sont TOUJOURS là (équipes, championnat, arbitre, enjeu, corners et tirs par championnat), chacune avec
 * sa raison quand elle manque — jamais « 0 », jamais le silence. Les pastilles : « Explication seulement » (gris) par
 * défaut ; « Effet mesuré » (le seul vert, DESIGN.md) pour une famille que le banc d'essai a mesurée UTILE — avec « pas
 * encore un marché » pour les cartons, « pas encore dans le pourcentage » pour corners et tirs (critique de l'étape 33,
 * constat 14). Jamais de vert ni de rouge pour une valeur (un arbitre sévère n'est pas « mauvais »).
 * L'effet de l'arbitre désigné : le même bras, z connu (cartons attendus sans arbitre × e^(β·z)), sa propre dispersion.
 * Les lignes du total : seulement si les cartons des équipes sont utiles au banc (Q7), par la loi RECOPIÉE ici (la même que
 * celle du serveur, à 1e-12 près : cartonsEcran.test.mjs). Virgule décimale, espace fine des milliers
 * (toLocaleString('fr-FR')), vrai signe moins, heures de Paris.
 * -----------------------------------------------------------------------
 */

import { nombre, MOINS, calculDit, jjmmaaaa, competitionDite } from './contexteDuMatch.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Les cinq lignes de la carte, dans l'ordre de l'écran (titre, icône d'AppIcon). */
export const LIGNES = Object.freeze([
  Object.freeze({ cle: 'equipes', titre: 'Équipes', icone: 'users' }),
  Object.freeze({ cle: 'championnat', titre: 'Championnat', icone: 'trophy' }),
  Object.freeze({ cle: 'arbitre', titre: 'Arbitre', icone: 'whistle' }),
  Object.freeze({ cle: 'enjeu', titre: 'Enjeu', icone: 'flag' }),
  Object.freeze({ cle: 'reglages', titre: 'Corners et tirs par championnat', icone: 'target' })
]);

/** Les sources réelles, telles que les pastilles de provenance les écrivent (le vrai endroit des données). */
export const SOURCES = Object.freeze({
  magasin: 'magasin FotMob (déroulés des matchs déjà joués)',
  page: 'FotMob, page du match',
  banc: 'banc d’essai de l’étape 33 (magasin 2023-2026)',
  enjeu: 'Simulation CôteMaster, classement FotMob'
});
const FICHIER_MAGASIN = 'la base du magasin (match-stats.db)';

/** Les mentions fixes, en repli si le serveur ne les donne pas (les mêmes que reglagesCartons.MOTS). */
const MOTS_PAR_DEFAUT = Object.freeze({
  convention: 'Cartons comptés : jaunes et rouges, temps additionnel compris ; un joueur exclu après deux jaunes compte pour deux cartons (le premier jaune, puis le second qui est le rouge).',
  horsTerrain: 'Les cartons du banc et des entraîneurs comptent comme les autres : FotMob ne les distingue pas sur les matchs d’avant octobre 2026.',
  deroule: 'Comptés sur le déroulé du match : depuis octobre 2026, FotMob publie des cartons jaunes à 0 dans treize championnats, alors que le déroulé les donne.',
  exclus: 'Les matchs prolongés et ceux dont FotMob ne publie pas le déroulé complet ne comptent pas.'
});

// ------------------------------------------------------------ la loi recopiée (celle du serveur : formulesDesCartons.loiDesCartons)

// log Γ (Lanczos) : la même que statMarkets.js, terme pour terme.
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (const ci of c) s += ci / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
const LN_FACT = [0];
const lnFact = (n) => {
  for (let i = LN_FACT.length; i <= n; i++) LN_FACT[i] = LN_FACT[i - 1] + Math.log(i);
  return LN_FACT[n];
};
const MIN_BINOMIALE = 15;

/**
 * La loi d'un compte de cartons (pmf de 0 à N − 1) : 1/k > 0, la binomiale négative du moteur ; 1/k < 0, la binomiale de
 * n = max(15, arrondi(−1 / (1/k))) essais et de moyenne μ ; sinon Poisson. La copie de loiDesCartons (serveur).
 */
export function loiDuCompte(mu, invK, N) {
  const pmf = new Array(N).fill(0);
  if (invK < -1e-6) {
    const n = Math.max(MIN_BINOMIALE, Math.round(-1 / invK));
    const p = mu / n;
    if (p < 1) {
      const lp = Math.log(p);
      const lq = Math.log1p(-p);
      for (let i = 0; i < N && i <= n; i++) pmf[i] = Math.exp(lnFact(n) - lnFact(i) - lnFact(n - i) + i * lp + (n - i) * lq);
      return pmf;
    }
    invK = 0;
  }
  if (invK <= 1e-6) {
    for (let i = 0; i < N; i++) pmf[i] = Math.exp(-mu + i * Math.log(mu) - lgamma(i + 1));
  } else {
    const r = 1 / invK;
    const p = r / (r + mu);
    for (let i = 0; i < N; i++) pmf[i] = Math.exp(lgamma(i + r) - lgamma(r) - lgamma(i + 1) + r * Math.log(p) + i * Math.log(1 - p));
  }
  return pmf;
}

/** P(plus de `ligne`) d'un compte (μ, 1/k) — la règle de formulesDesCartons.probabilitePlusDe. */
export function probabilitePlusDe(mu, invK, ligne) {
  if (!fini(mu) || !(mu > 0) || !fini(ligne) || ligne <= 0) return null;
  const pmf = loiDuCompte(mu, invK, Math.floor(ligne) + 1);
  let s = 0;
  for (const t of pmf) s += t;
  return Math.max(0, 1 - Math.min(1, s));
}

/** Les trois lignes du total autour de l'attendu (ℓ* = ⌊μ⌋ + 0,5, puis ℓ* − 1 et ℓ* + 1 ; jamais sous 0,5) : [{ ligne, plus }]. */
export function probabilitesDuTotal(mu, invK) {
  if (!fini(mu) || !(mu > 0)) return [];
  const centre = Math.floor(mu) + 0.5;
  return [centre - 1, centre, centre + 1].filter((l) => l >= 0.5).map((ligne) => ({ ligne, plus: probabilitePlusDe(mu, invK, ligne) }));
}

// ------------------------------------------------------------ nombres et pastilles

const un = (x) => nombre(x, 1);
/** Un nombre signé (« +0,5 », le vrai signe moins). */
const signe = (x, d = 1) => (fini(x) ? `${x > 0 ? '+' : x < 0 ? '' : '±'}${nombre(x, d)}` : null);
/** Un pourcentage entier (« 62 % »). */
const pourcent = (p) => (fini(p) ? `${nombre(p * 100, 0)} %` : null);
/** Une part en pourcentage, aux décimales données (« 0,37 % », « 0,013 % ») ; une part qui s’arrondit à zéro s’écrit sans signe. */
const part = (x, d = 2) => {
  if (!fini(x)) return null;
  const t = nombre(x * 100, d);
  return `${/^[−-]?0(,0+)?$/.test(t) ? nombre(0, d) : t} %`;
};
/** Les décimales d’une ligne du banc : 2 dès que la part dépasse 0,1 %, sinon 3 (« 0,013 % », jamais « 0,01 % »). */
const decimalesDe = (...parts) => (parts.filter(fini).some((x) => Math.abs(x * 100) >= 0.1) ? 2 : 3);

/**
 * La pastille d'un statut d'écran (cartonsRead.statutsDesCartons) : « Effet mesuré » (vert) avec `sousMesure` (« pas
 * encore un marché » pour les cartons, « pas encore dans le pourcentage » pour corners et tirs) ; sinon « Explication
 * seulement » (gris), avec ce qui la dit ; un démenti sur vos matchs repasse en gris avec sa note ambre.
 */
export function pastilleDe(s, { sousMesure = 'pas encore un marché' } = {}) {
  const statut = s?.statut ?? 'non-mesure';
  if (statut === 'mesure') return { cle: 'mesure', libelle: 'Effet mesuré', sous: sousMesure, note: null, vert: true };
  if (statut === 'dementi') return { cle: 'dementi', libelle: 'Explication seulement', sous: null, note: `démenti sur vos matchs${s?.dementiLe ? ` depuis le ${jjmmaaaa(s.dementiLe)}` : ''}`, vert: false };
  if (statut === 'non-mesure') return { cle: 'explication', libelle: 'Explication seulement', sous: 'pas encore mesuré au banc d’essai', note: null, vert: false };
  if (s?.nonMesurable) return { cle: 'explication', libelle: 'Explication seulement', sous: 'non mesurable au banc d’essai', note: null, vert: false };
  return { cle: 'explication', libelle: 'Explication seulement', sous: null, note: null, vert: false };
}

// ------------------------------------------------------------ l'état de la lecture

/**
 * L'état de la lecture des cartons : `pret`, ou la note qui dit pourquoi les cartons attendus manquent (jamais « 0 »,
 * jamais le silence). `analyse` : { loading, error, result } ; `cartons` : le bloc du serveur (undefined : un serveur
 * d'avant l'étape 33).
 */
export function etatDesCartons({ cartons, analyse = null, match = null }) {
  if (analyse?.loading || (analyse && 'result' in analyse && analyse.result === null && !analyse.error)) return { cle: 'chargement', titre: 'Lecture des cartons attendus…', texte: null, ton: 'is-info' };
  if (analyse?.error) return { cle: 'analyse-en-echec', titre: 'Cartons attendus indisponibles', texte: 'L’analyse du moteur n’a pas répondu : les cartons attendus arrivent avec elle. Les autres cartes ne sont pas touchées.', ton: 'is-warning' };
  if (cartons === undefined) return { cle: 'serveur-a-relancer', titre: 'Cartons attendus pas encore lus', texte: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour voir les cartons attendus.', ton: 'is-warning' };
  if (!cartons || cartons.etat === 'illisible') return { cle: 'illisible', titre: 'Cartons attendus illisibles', texte: 'Cartons attendus illisibles : la base n’a pas répondu. Les autres cartes ne sont pas touchées.', ton: 'is-danger' };
  if (cartons.etat === 'clubs-inconnus') {
    const noms = ['home', 'away'].filter((c) => cartons.clubs?.[c]?.id === null || cartons.clubs?.[c]?.id === undefined).map((c) => cartons.clubs?.[c]?.nom ?? match?.[c] ?? 'un club');
    const qui = noms.length > 1 ? `${noms[0]} et ${noms[1]} ne sont pas reconnus par leur identifiant FotMob` : `${noms[0] ?? 'un club'} n’est pas reconnu par son identifiant FotMob`;
    return { cle: 'clubs-inconnus', titre: 'Cartons attendus indisponibles', texte: `Cartons attendus indisponibles : ${qui} (l’appli ne rapproche jamais deux noms qui se ressemblent).`, ton: 'is-warning' };
  }
  if (cartons.etat === 'pas-encore-calcule') return { cle: 'pas-encore-calcule', titre: 'Pas encore calculé', texte: 'Pas encore calculé : la prochaine passe de nuit le fera.', ton: 'is-info' };
  if (cartons.etat === 'competition-sans-cartons') {
    const c = competitionDite(cartons.ligue?.league ?? match?.league ?? null) ?? 'Cette compétition';
    return { cle: 'competition-sans-cartons', titre: 'Pas de cartons attendus', texte: `${c} : moins de 30 matchs aux cartons relevés dans les 365 derniers jours (FotMob n’y publie pas le déroulé complet) — pas de cartons attendus.`, ton: 'is-info' };
  }
  return { cle: 'pret', titre: null, texte: null, ton: null };
}

// ------------------------------------------------------------ l'arbitre désigné et les attendus du match

/**
 * L'arbitre désigné, d'après la page FotMob du match : { etat: 'chargement' | 'illisible' | 'pas-designe' | 'sans-match' |
 * 'connu', nom, pays, ligne, homonymes, z }.
 */
export function arbitreDuMatch(page) {
  if (page?.loading && !page?.data) return { etat: 'chargement' };
  if (page?.error && !page?.data) return { etat: 'illisible' };
  const referee = page?.data?.meta?.referee ?? null;
  const a = page?.data?.arbitreDesCartons ?? null;
  const nom = a?.nom ?? (typeof referee?.name === 'string' && referee.name.trim() ? referee.name.trim() : null);
  if (!nom) return { etat: 'pas-designe' };
  const pays = a?.pays ?? (typeof referee?.country === 'string' ? referee.country : '');
  if (a?.illisible) return { etat: 'illisible', nom, pays, homonymes: [] };
  const ligne = a?.ligne ?? null;
  if (!ligne || !(ligne.matchs > 0) || !fini(ligne.indice)) return { etat: 'sans-match', nom, pays, ligne, homonymes: a?.homonymes ?? [] };
  return { etat: 'connu', nom, pays, ligne, homonymes: a?.homonymes ?? [], z: ligne.indice };
}

/**
 * Les cartons attendus de CE match : sans arbitre (le serveur), puis avec l'arbitre désigné connu au magasin (× e^(β·z),
 * sa dispersion) — { home, away, total, invKTotal, avecArbitre, multiplicateur, effet } ; null sans attendus.
 */
export function attendusDuMatch(cartons, arbitre) {
  const s = cartons?.sansArbitre;
  const p = cartons?.parametres;
  if (!s || !fini(s.home) || !fini(s.away) || !p) return null;
  if (arbitre?.etat === 'connu' && fini(p.beta)) {
    const m = Math.exp(p.beta * arbitre.z);
    const home = s.home * m;
    const away = s.away * m;
    return { home, away, total: home + away, invKTotal: p.avecArbitre?.invKTotal ?? null, avecArbitre: true, multiplicateur: m, effet: home + away - s.total };
  }
  return { home: s.home, away: s.away, total: s.total, invKTotal: p.sansArbitre?.invKTotal ?? null, avecArbitre: false, multiplicateur: 1, effet: 0 };
}

// ------------------------------------------------------------ les phrases (§7.2, corrigé par la critique)

const nomsDe = (cartons, match) => ({ home: cartons?.equipes?.home?.nom ?? cartons?.clubs?.home?.nom ?? match?.home ?? 'Le club qui reçoit', away: cartons?.equipes?.away?.nom ?? cartons?.clubs?.away?.nom ?? match?.away ?? 'Le visiteur' });

/** « {Club A} prend {x} cartons par match et en fait prendre {y} à ses adversaires, sur ses {n} derniers matchs relevés ; {Club B} : {x'} et {y'} ({n'} matchs). » */
export function phraseEquipes(cartons, match) {
  const n = nomsDe(cartons, match);
  const h = cartons?.equipes?.home;
  const a = cartons?.equipes?.away;
  if (!h || !a) return { phrases: [], mentions: [] };
  const sans = (nom) => `${nom} : aucun match relevé au magasin — la moyenne du championnat.`;
  const phrases = [];
  if (h.n > 0 && a.n > 0) {
    phrases.push(`${n.home} prend ${un(h.pris)} cartons par match et en fait prendre ${un(h.provoques)} à ses adversaires, sur ses ${nombre(h.n)} derniers matchs relevés ; ${n.away} : ${un(a.pris)} et ${un(a.provoques)} (${nombre(a.n)} matchs).`);
  } else {
    if (h.n > 0) phrases.push(`${n.home} prend ${un(h.pris)} cartons par match et en fait prendre ${un(h.provoques)} à ses adversaires, sur ses ${nombre(h.n)} derniers matchs relevés.`);
    else phrases.push(sans(n.home));
    if (a.n > 0) phrases.push(`${n.away} prend ${un(a.pris)} cartons par match et en fait prendre ${un(a.provoques)} à ses adversaires, sur ses ${nombre(a.n)} derniers matchs relevés.`);
    else phrases.push(sans(n.away));
  }
  const mentions = [];
  if ((h.n > 0 && h.n < 10) || (a.n > 0 && a.n < 10)) mentions.push('peu de matchs relevés : ramené vers la moyenne');
  return { phrases, mentions };
}

/** « {Compétition} : {d} cartons par équipe à domicile, {e} à l'extérieur, sur ses {m} matchs relevés des 365 derniers jours. » */
export function phraseLigue(cartons, match) {
  const l = cartons?.ligue;
  const c = competitionDite(l?.league ?? match?.league ?? null) ?? 'Cette compétition';
  if (!l || !fini(l.dom) || !fini(l.ext)) return `${c} : moins de 30 matchs aux cartons relevés dans les 365 derniers jours — pas de moyenne.`;
  return `${c} : ${un(l.dom)} cartons par équipe à domicile, ${un(l.ext)} à l’extérieur, sur ses ${nombre(l.n)} matchs relevés des 365 derniers jours.`;
}

/**
 * L'arbitre (critique de l'étape 33, constat 3 : « la sévérité de l'arbitre et le genre de matchs qu'on lui confie, que
 * le banc ne sépare pas ») — { phrases, mentions }.
 */
export function phraseArbitre(arbitre, attendus) {
  const qui = arbitre?.nom ? `${arbitre.nom}${arbitre.pays ? ` (${arbitre.pays})` : ''}` : null;
  const mentions = [];
  if (arbitre?.etat === 'chargement') return { phrases: ['Lecture de la page FotMob du match…'], mentions };
  if (arbitre?.etat === 'illisible') return { phrases: [qui ? `${qui} : sa ligne au magasin est illisible — cartons attendus sans lui.` : 'Page FotMob du match illisible : cartons attendus sans l’arbitre.'], mentions };
  if (!arbitre || arbitre.etat === 'pas-designe') return { phrases: ['Arbitre pas encore désigné chez FotMob : cartons attendus sans lui.'], mentions };
  for (const h of arbitre.homonymes ?? []) mentions.push(`un autre arbitre du même nom (${h.pays || 'pays inconnu'}) n’est pas compté`);
  mentions.push('Les moyennes que FotMob affiche ne sont pas reprises : tous ses matchs relevés au magasin.');
  if (arbitre.etat === 'sans-match') return { phrases: [`${qui} : aucun de ses matchs relevés au magasin — sans effet sur les cartons attendus.`], mentions };
  const r = Math.exp(arbitre.z) - 1;
  const ecart = Math.abs(r) < 0.005 ? 'autant de cartons que' : `${nombre(Math.abs(r) * 100, 0)} % de cartons de ${r > 0 ? 'plus' : 'moins'} que`;
  const n = arbitre.ligne.matchs;
  if (n < 20) mentions.unshift('ramené vers la moyenne : un arbitre de peu de matchs compte peu');
  const effet = attendus?.avecArbitre ? ` Sur ce match : ${signe(attendus.effet)} carton attendu.` : '';
  return {
    phrases: [`${qui} : ses ${nombre(n)} matchs relevés au magasin ont eu ${ecart} ce que prenaient d’habitude les équipes : la sévérité de l’arbitre et le genre de matchs qu’on lui confie, que le banc ne sépare pas.${effet} Ses moyennes sont dans « Contexte du match ».`],
    mentions
  };
}

/** L'enjeu : il vit dans son encadré (étape 28) ; ici, jamais son chiffre. */
export function phraseEnjeu(simulation) {
  const allume = simulation?.affichage?.saisons === 'allume' && Boolean(simulation?.enjeu);
  return allume
    ? 'Enjeu au classement : dans l’encadré « Enjeu » du Résumé. Il n’entre pas dans les cartons attendus : son effet n’est pas mesurable, faute d’historique avant le 27/10/2026.'
    : 'Enjeu au classement : calculé à blanc chaque nuit, pas encore montré.';
}

/** Les corners et les tirs avec les réglages du championnat (des nombres, jamais un pourcentage) — { phrases, survol }. */
export function phraseReglages(cartons, match) {
  const s = cartons?.statsParChampionnat;
  const c = competitionDite(s?.league ?? match?.league ?? null) ?? 'ce championnat';
  const st = s?.stats ?? {};
  const cles = ['corners', 'tirs', 'cadres'];
  if (!cles.every((k) => st[k]?.aBlanc && st[k]?.moteur)) return { phrases: ['À blanc (étape 33) : le moteur n’a pas assez de matchs des deux équipes pour les corners et les tirs de ce match.'], survol: null };
  const propre = cles.every((k) => st[k].reglage?.propre);
  const chiffres = `${un(st.corners.aBlanc.total)} corners, ${un(st.tirs.aBlanc.total)} tirs et ${un(st.cadres.aBlanc.total)} tirs cadrés attendus au total (le moteur : ${un(st.corners.moteur.total)} · ${un(st.tirs.moteur.total)} · ${un(st.cadres.moteur.total)})`;
  const phrase = propre
    ? `À blanc (étape 33) : avec les réglages mesurés pour ${c}, ${chiffres}. Pas encore dans les pourcentages.`
    : `À blanc (étape 33) : ${c} n’a pas assez de matchs pour un réglage propre — réglage commun : ${chiffres}. Pas encore dans les pourcentages.`;
  const terrain = (k, mot) => {
    const r = st[k].reglage;
    const m = st[k].constantesDuMoteur;
    return `${mot} ${nombre(r.dom, 2)}/${nombre(r.ext, 2)}${m ? ` (moteur ${nombre(m.dom, 2)}/${nombre(m.ext, 2)})` : ''}`;
  };
  const dispersion = (k, mot) => {
    const r = st[k].reglage;
    const m = st[k].constantesDuMoteur;
    return `${mot} ${nombre(r.invKEquipe, 3)}${m ? ` (moteur ${nombre(m.invKEquipe, 3)})` : ''}`;
  };
  const survol = `Avantage du terrain : ${terrain('corners', 'corners')}, ${terrain('tirs', 'tirs')}, ${terrain('cadres', 'tirs cadrés')} ; dispersion par équipe : ${dispersion('corners', 'corners')}, ${dispersion('tirs', 'tirs')}, ${dispersion('cadres', 'tirs cadrés')}.`;
  return { phrases: [phrase], survol };
}

/** Ce que dit le banc d'une variante utile, sous sa pastille (avec l'ampleur en points : critique, constat 14). */
export function phraseDuBanc(variante, { face = 'la moyenne du championnat', quoi = 'ce calcul', K = 8 } = {}) {
  if (!variante || !variante.utile) return null;
  const f = variante.fourchetteRelative ?? [];
  const ampleur = variante.ampleur?.max;
  return `Effet mesuré au banc : sur ${nombre(variante.matchsJuges)} matchs de 2023 à 2026, ${quoi} se trompe moins que ${face} (${nombre((variante.gainRelatif ?? 0) * 100, 2)} % d’erreur en moins, fourchette ${nombre((f[0] ?? 0) * 100, 2)} à ${nombre((f[1] ?? 0) * 100, 2)} %, en tenant compte des ${nombre(K)} essais faits${fini(ampleur) ? ` ; les probabilités des lignes bougent jusqu’à ${nombre(ampleur * 100, 1)} points en moyenne` : ''}).`;
}

// ------------------------------------------------------------ les provenances

const provenanceMagasin = (cartons) => ({ source: SOURCES.magasin, releveLe: cartons?.calculeLe ?? null, action: 'calculé', quand: cartons?.calculeLe ? `calculé ${calculDit(cartons.calculeLe)}` : null, fichier: FICHIER_MAGASIN });
const provenanceBanc = (cartons) => ({ source: SOURCES.banc, releveLe: cartons?.banc?.calculeLe ?? null, action: 'calculé', jourSeul: jjmmaaaa(cartons?.banc?.calculeLe), vieuxApresHeures: null });
const provenancePage = (page) => ({ source: SOURCES.page, releveLe: page?.data?.releveLe ?? null, action: 'relevé', detail: 'La page FotMob du match, lue à l’ouverture de cette page.' });

// ------------------------------------------------------------ la carte

const varianteDe = (cartons, id) => (cartons?.banc?.variantes ?? []).find((v) => v.id === id) ?? null;

/**
 * TOUT CE QUE DIT LA CARTE : { etat, enTete, barres, modele, lignes (cinq, toujours), total, mentions, tableau,
 * tableauChampionnats }. `cartons` : le bloc de l'analyse ; `analyse` : { loading, error, result } ; `page` : la page
 * FotMob du match ; `simulation` : le bloc de l'étape 28 ; `match` : { home, away, league, homeId, awayId }.
 */
export function cartonsDit({ cartons, analyse = null, page = null, simulation = null, match = null } = {}) {
  const etat = etatDesCartons({ cartons, analyse, match });
  const pret = etat.cle === 'pret';
  const statuts = cartons?.statuts ?? {};
  const arbitre = arbitreDuMatch(page);
  const attendus = pret ? attendusDuMatch(cartons, arbitre) : null;
  const K = cartons?.banc?.K ?? 8;
  const vEquipes = varianteDe(cartons, 'cartons-equipes');
  const vArbitre = varianteDe(cartons, 'cartons-arbitre');
  const raison = (texte) => (pret ? texte : etat.texte ?? etat.titre);
  const sansObjet = (texte) => [{ texte: raison(texte) }];

  const lignes = LIGNES.map((d) => ({ cle: d.cle, titre: d.titre, icone: d.icone, pastille: pastilleDe(statuts.equipes), pastilles: null, phrases: [], mentions: [], banc: null, provenances: [], crests: null, survol: null }));
  const L = Object.fromEntries(lignes.map((l) => [l.cle, l]));

  // Équipes.
  L.equipes.pastille = pastilleDe(statuts.equipes);
  L.equipes.crests = 'les-deux';
  if (pret && cartons.equipes) {
    const e = phraseEquipes(cartons, match);
    L.equipes.phrases = e.phrases.map((texte) => ({ texte }));
    L.equipes.mentions = e.mentions;
  } else L.equipes.phrases = sansObjet('');
  L.equipes.banc = phraseDuBanc(vEquipes, { K });
  L.equipes.provenances = cartons?.calculeLe ? [provenanceMagasin(cartons)] : [];

  // Championnat.
  // Le championnat est le repère (la moyenne et sa tendance), pas un effet mesuré : une explication.
  L.championnat.pastille = pastilleDe({ statut: 'explication' });
  L.championnat.crests = 'ligue';
  L.championnat.phrases = pret || etat.cle === 'competition-sans-cartons' ? [{ texte: phraseLigue(cartons, match) }] : sansObjet('');
  L.championnat.provenances = cartons?.calculeLe ? [provenanceMagasin(cartons)] : [];

  // Arbitre.
  L.arbitre.pastille = pastilleDe(statuts.arbitre);
  const a = phraseArbitre(arbitre, attendus);
  L.arbitre.phrases = pret ? a.phrases.map((texte) => ({ texte })) : sansObjet('');
  L.arbitre.mentions = pret ? a.mentions : [];
  L.arbitre.banc = phraseDuBanc(vArbitre, { K, face: 'le même calcul sans l’arbitre', quoi: 'le calcul avec l’arbitre' });
  L.arbitre.provenances = [...(page?.data?.releveLe ? [provenancePage(page)] : []), ...(pret && arbitre.etat === 'connu' && arbitre.ligne?.calculeLe ? [{ ...provenanceMagasin({ calculeLe: arbitre.ligne.calculeLe }) }] : [])];

  // Enjeu.
  L.enjeu.pastille = pastilleDe(statuts.enjeu ?? { statut: 'explication', nonMesurable: true });
  L.enjeu.phrases = [{ texte: phraseEnjeu(simulation) }];
  L.enjeu.provenances = simulation?.affichage?.saisons === 'allume' && simulation?.enjeu ? [{ source: SOURCES.enjeu, releveLe: simulation.enjeu.calculeLe ?? null, action: 'calculé' }] : [];

  // Corners et tirs par championnat (des nombres, jamais un pourcentage).
  const r = phraseReglages(cartons, match);
  L.reglages.pastille = null;
  L.reglages.crests = 'ligue';
  L.reglages.pastilles = [
    { stat: 'corners', mot: 'corners', ...pastilleDe(statuts.corners, { sousMesure: 'pas encore dans le pourcentage' }) },
    { stat: 'tirs', mot: 'tirs', ...pastilleDe(statuts.tirs, { sousMesure: 'pas encore dans le pourcentage' }) },
    { stat: 'cadres', mot: 'tirs cadrés', ...pastilleDe(statuts.cadres, { sousMesure: 'pas encore dans le pourcentage' }) }
  ];
  L.reglages.phrases = cartons && cartons.etat !== 'illisible' && etat.cle !== 'chargement' && etat.cle !== 'analyse-en-echec' && etat.cle !== 'serveur-a-relancer' ? r.phrases.map((texte) => ({ texte, titre: r.survol })) : sansObjet('');
  L.reglages.survol = r.survol;
  L.reglages.provenances = cartons?.banc?.calculeLe ? [provenanceBanc(cartons)] : [];

  for (const l of lignes) {
    const p = l.pastille ?? (l.pastilles?.length ? l.pastilles[0] : null);
    const textes = l.phrases.map((x) => x.texte).join(' ');
    l.aria = l.pastilles ? `${l.titre} : ${l.pastilles.map((x) => `${x.mot}, ${x.libelle.toLowerCase()}${x.sous ? `, ${x.sous}` : ''}`).join(' ; ')}. ${textes}` : `${l.titre} : ${p.libelle.toLowerCase()}${p.sous ? `, ${p.sous}` : ''}. ${textes}`;
  }

  // Les barres face à face et la pastille du modèle.
  const barres = attendus
    ? { group: { title: 'Attendus', rows: [{ key: 'cartons', label: `Cartons attendus · ${un(attendus.total)} au total`, decimals: 1 }] }, home: { cartons: attendus.home }, away: { cartons: attendus.away } }
    : null;
  const modele = { pastille: pastilleDe(statuts.equipes), banc: phraseDuBanc(vEquipes, { K }), aria: null };
  modele.aria = `Modèle des cartons : ${modele.pastille.libelle.toLowerCase()}${modele.pastille.sous ? `, ${modele.pastille.sous}` : ''}.`;

  // Les lignes du total : seulement si les cartons des équipes sont utiles au banc (Q7).
  const utile = statuts.equipes?.statut === 'mesure';
  const total = {
    montre: Boolean(attendus && utile && fini(attendus.invKTotal)),
    lignes: attendus && utile && fini(attendus.invKTotal) ? probabilitesDuTotal(attendus.total, attendus.invKTotal).map((x) => ({ ligne: x.ligne, titre: `Plus de ${nombre(x.ligne, 1)}`, p: pourcent(x.plus), plus: x.plus })) : [],
    pied: 'À blanc : ni un pronostic, ni une cote juste. Le moteur ne calcule pas encore les cartons (étape 33, lot 2).'
  };

  const mots = { ...MOTS_PAR_DEFAUT, ...(cartons?.mots ?? {}) };
  return {
    etat,
    enTete: {
      eyebrow: 'À blanc · pas encore un marché',
      titre: 'Cartons attendus',
      sousTitre: 'Calculés depuis le magasin FotMob : ce que chaque équipe prend et fait prendre, l’arbitre et le championnat. Ils n’entrent dans aucun pronostic, aucune value et aucun pari conseillé.'
    },
    attendus,
    barres,
    modele,
    lignes,
    total,
    mentions: [mots.convention, mots.horsTerrain, mots.deroule, mots.exclus],
    tableau: tableauDuBanc(cartons?.banc ?? null),
    tableauChampionnats: tableauDesChampionnats(cartons?.banc ?? null)
  };
}

// ------------------------------------------------------------ les tableaux du banc (repliés)

/** Les huit lignes du tableau « Ce que dit le banc d'essai », dans l'ordre. */
export const LIGNES_DU_BANC = Object.freeze([
  Object.freeze({ cle: 'cartons-equipes', quoi: 'Cartons (équipes) : ce que chaque équipe prend et fait prendre, face à la moyenne du championnat' }),
  Object.freeze({ cle: 'cartons-arbitre', quoi: 'Cartons (arbitre) : le même calcul avec l’arbitre, face au calcul sans lui' }),
  Object.freeze({ cle: 'cartons-placebo', quoi: 'Contrôle (faux arbitre tiré au sort) : ne doit rien trouver' }),
  Object.freeze({ cle: 'corners-championnat', quoi: 'Corners par championnat, face au réglage commun' }),
  Object.freeze({ cle: 'tirs-championnat', quoi: 'Tirs par championnat, face au réglage commun' }),
  Object.freeze({ cle: 'cadres-championnat', quoi: 'Tirs cadrés par championnat, face au réglage commun' }),
  Object.freeze({ cle: 'championnat-placebo', quoi: 'Contrôle (faux championnats tirés au sort) : ne doit rien trouver' }),
  Object.freeze({ cle: 'enjeu', quoi: 'Enjeu au classement' })
]);
const VERDICTS = Object.freeze({ retenu: 'Retenu', 'pas-prouve': 'Pas prouvé', 'moins-bon': 'Moins bon' });

/**
 * Le tableau du banc : TOUJOURS ses huit lignes ; Σ = les matchs distincts jugés au moins une fois (au moins le plus
 * grand des comptes : les lignes se recouvrent, jamais leur somme) ; ⌀ = l'écart moyen annoncé − réalisé, après, des
 * variantes mesurées (jamais une somme de pourcentages).
 */
export function tableauDuBanc(banc) {
  const parId = new Map((banc?.variantes ?? []).map((v) => [v.id, v]));
  const lignes = LIGNES_DU_BANC.map((d) => {
    if (d.cle === 'enjeu') return { cle: d.cle, quoi: d.quoi, matchs: '—', gain: '—', calibration: '—', verdict: 'Non mesurable au banc d’essai : pas d’historique de l’enjeu avant le 27/10/2026', mesureUtile: false };
    const v = parId.get(d.cle);
    if (!v) return { cle: d.cle, quoi: d.quoi, matchs: '—', gain: '—', calibration: '—', verdict: banc ? 'Pas jugé' : 'Pas encore mesuré', mesureUtile: false };
    const f = v.fourchetteRelative ?? [];
    return {
      cle: d.cle,
      quoi: d.quoi,
      matchs: nombre(v.matchsJuges) ?? '—',
      gain: fini(v.gainRelatif) ? `${part(v.gainRelatif, decimalesDe(v.gainRelatif))} (${part(f[0], decimalesDe(v.gainRelatif))} à ${part(f[1], decimalesDe(v.gainRelatif))})` : '—',
      calibration: v.calibration && fini(v.calibration.A) && fini(v.calibration.B) ? `${nombre(v.calibration.A, 2)} → ${nombre(v.calibration.B, 2)} pt` : '—',
      verdict: `${VERDICTS[v.verdict] ?? v.verdict}${v.utile ? '' : v.verdict === 'retenu' ? ' (pas utile)' : ''}`,
      mesureUtile: v.utile === true
    };
  });
  const juges = (banc?.variantes ?? []).map((v) => v.matchsJuges).filter(fini);
  const mesurees = (banc?.variantes ?? []).filter((v) => v.utile && fini(v.calibration?.B)).map((v) => v.calibration.B);
  return {
    lignes,
    somme: juges.length ? `Σ au moins ${nombre(Math.max(...juges))} matchs distincts` : 'Σ —',
    moyenne: mesurees.length ? `⌀ ${nombre(mesurees.reduce((s, x) => s + x, 0) / mesurees.length, 2)} pt` : '⌀ —',
    pied: `Banc d’essai : magasin de juillet 2023 à septembre 2026, deux moitiés croisées (chacune jugée avec ce qui a été appris sur l’autre), ${nombre(banc?.K ?? 8)} essais comptés, seuil sévère${banc?.calculeLe ? ` (calcul du ${jjmmaaaa(banc.calculeLe)})` : ''}. Corners et tirs : chaque championnat est comparé au réglage commun appris sur l’autre moitié.`,
    preuve: 'Preuve sur vos matchs : reportée (étape 33, partie C2) ; l’arbitre désigné de chaque match est déjà gardé avant le coup d’envoi.'
  };
}

/** Le second tableau replié « Réglages par championnat (à blanc) » : une ligne par championnat ; Σ des matchs ; ⌀ des réglages. */
export function tableauDesChampionnats(banc) {
  const r = banc?.reglagesParChampionnat ?? null;
  if (!r) return { lignes: [], somme: 'Σ —', moyenne: '⌀ —' };
  const ligne = (x) => (x ? `${nombre(x.dom, 2)} / ${nombre(x.ext, 2)}` : '—');
  const lignes = (r.championnats ?? []).map((c) => ({ league: c.league, nom: competitionDite(c.league) ?? c.league, matchs: nombre(c.n) ?? '—', corners: ligne(c.corners), tirs: ligne(c.tirs), cadres: ligne(c.cadres), propre: c.propre ? 'propre' : 'commun' }));
  const n = (r.championnats ?? []).map((c) => c.n).filter(fini);
  const moy = (stat, cote) => {
    const v = (r.championnats ?? []).map((c) => c[stat]?.[cote]).filter(fini);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  return {
    lignes,
    somme: n.length ? `Σ ${nombre(n.reduce((s, x) => s + x, 0))} matchs` : 'Σ —',
    moyenne: `⌀ corners ${nombre(moy('corners', 'dom'), 2)} / ${nombre(moy('corners', 'ext'), 2)} · tirs ${nombre(moy('tirs', 'dom'), 2)} / ${nombre(moy('tirs', 'ext'), 2)} · tirs cadrés ${nombre(moy('cadres', 'dom'), 2)} / ${nombre(moy('cadres', 'ext'), 2)}`,
    commun: r.commun ?? null
  };
}

export const __pourLesTests = { MOINS, MOTS_PAR_DEFAUT };
