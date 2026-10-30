/**
 * contexteDuMatch.js — LES MOTS DE L'ENCADRÉ « CONTEXTE DU MATCH » (étape 32 du plan, partie D, 29/10/2026).
 * -----------------------------------------------------------------------
 * Règles PURES (ni Vue, ni réseau, ni navigateur : les tests du serveur les rejouent sur les vraies réponses). Elles
 * disent, en français simple, ce que trois lectures déjà faites par la page apportent — aucune requête de plus :
 *   - `contexte` : le bloc que le serveur joint à l'analyse (data/contexte/contexteRead.js) — la fiche calculée la nuit
 *     (repos, enchaînement, déplacement, altitude, pelouse habituelle, entraîneur), les moyennes du championnat, les
 *     statuts du banc d'essai (la note recopiée par script, jamais retapée ici) ;
 *   - `page` : la page FotMob du match (GET /api/match-stats/preview) — la météo PRÉVUE, la pelouse du match, l'arbitre
 *     désigné et sa ligne au magasin (`arbitreAuMagasin`), l'heure de la lecture (`releveLe`) ;
 *   - `simulation` : le bloc de l'étape 28 (l'enjeu se lit dans SON encadré ; cette ligne y renvoie sans recopier le chiffre).
 *
 * Les neuf lignes sont TOUJOURS là (repos, enchaînement, déplacement, altitude, pelouse, météo, arbitre, entraîneur,
 * enjeu), chacune avec sa raison quand elle manque — jamais « 0 », jamais le silence. Chaque ligne porte sa pastille :
 * « Explication seulement » (gris) par défaut ; « Effet mesuré » (le seul vert, DESIGN.md) pour un facteur que le banc
 * d'essai a mesuré UTILE — et, au lot 1, « pas encore dans le pourcentage » : rien n'entre dans les chiffres avant le lot 2
 * et l'accord de Pierre. Jamais de vert ni de rouge pour une valeur (un repos court n'est pas « mauvais »).
 * Heures de Paris, virgule décimale, espace fine des milliers (toLocaleString('fr-FR')), vrai signe moins, vent en km/h.
 * -----------------------------------------------------------------------
 */

import { meteo, ventEnKmH } from './fotmobLabels.js';
import { parseLeagueLabel } from './leagueDisplay.js';

/** Le vrai signe moins (U+2212), écrit par son code. */
export const MOINS = String.fromCharCode(0x2212);
const fini = (x) => typeof x === 'number' && Number.isFinite(x);

/** Les neuf facteurs de l'encadré, dans l'ordre de l'écran (titre, icône d'AppIcon). */
export const FACTEURS = Object.freeze([
  Object.freeze({ cle: 'repos', titre: 'Repos', icone: 'clock' }),
  Object.freeze({ cle: 'enchainement', titre: 'Enchaînement', icone: 'calendar' }),
  Object.freeze({ cle: 'deplacement', titre: 'Déplacement', icone: 'mapPin' }),
  Object.freeze({ cle: 'altitude', titre: 'Altitude', icone: 'trendUp' }),
  Object.freeze({ cle: 'pelouse', titre: 'Pelouse', icone: 'layers' }),
  Object.freeze({ cle: 'meteo', titre: 'Météo', icone: 'thermometer' }),
  Object.freeze({ cle: 'arbitre', titre: 'Arbitre', icone: 'whistle' }),
  Object.freeze({ cle: 'entraineur', titre: 'Entraîneur', icone: 'swap' }),
  Object.freeze({ cle: 'enjeu', titre: 'Enjeu', icone: 'flag' })
]);

/** Les sources réelles, telles que les pastilles de provenance les écrivent (la règle de Pierre : le vrai endroit des données). */
export const SOURCES = Object.freeze({
  magasin: 'magasin FotMob (feuilles des matchs déjà joués)',
  calendrier: 'calendrier de saison (FotMob)',
  stades: 'table des stades (venues.json, faite depuis FotMob)',
  altitudes: 'liste des altitudes faite à la main (± 50 m)',
  page: 'FotMob, page du match',
  enjeu: 'Simulation CôteMaster, classement FotMob'
});
const FICHIERS = Object.freeze({
  magasin: 'la base du magasin (match-stats.db)',
  calendrier: 'data/runtime/season-calendar.json',
  stades: 'server/src/data/reference/venues.json',
  altitudes: 'server/src/data/reference/altitudes.js'
});

// ------------------------------------------------------------ nombres, jours et heures (heure de Paris)

/** Un nombre à la française (virgule, espace fine des milliers), le vrai signe moins ; null s'il manque. */
export function nombre(x, decimales = 0) {
  if (!fini(x)) return null;
  return x.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).replace('-', MOINS);
}

/** Les décimales communes d'une suite de parts : 2 dès qu'une dépasse 1 %, sinon 3 (« 0,096 % », jamais « 0,10 % »). */
const decimalesDe = (parts) => (parts.filter(fini).some((x) => Math.abs(x * 100) >= 1) ? 2 : 3);

/** Une part (0,0123) en pourcentage signé (« +1,23 % », et le vrai signe moins) ; `decimales` : celles de la phrase. */
export function pourcentSigne(part, decimales = decimalesDe([part])) {
  if (!fini(part)) return null;
  const p = part * 100;
  return `${p > 0 ? '+' : ''}${nombre(p, decimales)} %`;
}

/** Une part en pourcentage sans signe « + » (le moins reste), aux décimales données. */
const pourcentNu = (part, decimales) => {
  const s = pourcentSigne(part, decimales);
  return s && s.startsWith('+') ? s.slice(1) : s;
};

const FMT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: '2-digit', month: '2-digit' });
const FMT_JOUR_SEUL = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' });
const FMT_HEURE = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const FMT_JJMM = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const instant = (iso) => (typeof iso === 'string' && fini(Date.parse(iso)) ? new Date(Date.parse(iso)) : null);

/** « mardi 28/10 » (le jour de Paris d'un instant). */
export const jourDit = (iso) => (instant(iso) ? FMT_JOUR.format(instant(iso)) : null);
/** « mardi 28/10 » pour un jour sans heure (AAAA-MM-JJ). */
export const jourSeulDit = (jour) => (/^\d{4}-\d{2}-\d{2}$/.test(String(jour ?? '')) ? FMT_JOUR_SEUL.format(new Date(`${jour}T12:00:00Z`)) : null);
/** « 21 h », « 3 h 05 » (l'heure de Paris d'un instant). */
export function heureDite(iso) {
  const t = instant(iso);
  if (!t) return null;
  const [h, m] = FMT_HEURE.format(t).split(':');
  return `${Number(h)} h${m === '00' ? '' : ` ${m}`}`;
}
/** « 28/10 » pour un jour AAAA-MM-JJ. */
export const jjmm = (jour) => (/^\d{4}-\d{2}-\d{2}/.test(String(jour ?? '')) ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}` : null);
/** « 28/10/2026 » pour un jour AAAA-MM-JJ. */
export const jjmmaaaa = (jour) => (/^\d{4}-\d{2}-\d{2}/.test(String(jour ?? '')) ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : null);
/** « le 29/10 à 3 h 05 » (jour et heure de Paris d'un calcul). */
export const calculDit = (iso) => (instant(iso) ? `le ${FMT_JJMM.format(instant(iso))} à ${heureDite(iso)}` : null);
/** « juillet 2023 » pour un jour AAAA-MM-JJ. */
const moisDit = (jour) => (/^\d{4}-\d{2}/.test(String(jour ?? '')) ? `${MOIS[Number(jour.slice(5, 7)) - 1]} ${jour.slice(0, 4)}` : null);
const pluriel = (n, un, plusieurs) => (Math.abs(n) >= 2 ? plusieurs : un);
const sansMajuscule = (t) => (t ? `${t.charAt(0).toLowerCase()}${t.slice(1)}` : t);
/** Le nom d'une compétition tel que l'appli le donne (le badge : « EPL », « Ligue 1 », « UEFA Champions League »). */
export const competitionDite = (league) => (league ? parseLeagueLabel(league).name : null);

/** Une forme stable d'un texte, pour comparer deux noms (stade, entraîneur) sans tenir compte de la casse. */
const stable = (t) => (typeof t === 'string' && t.trim() ? t.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr') : null);
const meme = (a, b) => Boolean(stable(a) && stable(a) === stable(b));

/** La pelouse de FotMob en mots fixes (la règle de la fiche, formulesDuContexte.pelouseDe) : synthetique, hybride, naturelle ou null. */
export function surfaceDe(texte) {
  const s = stable(texte);
  if (!s) return null;
  if (/artificial|synthetic|turf|synth/.test(s)) return 'synthetique';
  if (/hybrid/.test(s)) return 'hybride';
  if (/grass|natural/.test(s)) return 'naturelle';
  return null;
}
const PELOUSES = Object.freeze({ synthetique: 'Pelouse synthétique', naturelle: 'Gazon naturel', hybride: 'Pelouse hybride' });

// ------------------------------------------------------------ les pastilles

/**
 * La pastille d'un statut du banc : « Effet mesuré » (vert, et « pas encore dans le pourcentage » au lot 1, ou « compte
 * dans le pourcentage (version N) » après l'adoption) ; sinon « Explication seulement » (gris), avec ce qui la dit
 * (non mesurable, pas encore mesuré) ; un démenti sur vos matchs repasse en « Explication seulement » avec sa note ambre.
 */
export function pastilleDe(statut, { version = null, dementiLe = null } = {}) {
  switch (statut) {
    case 'effet-mesure':
      return { cle: 'mesure', libelle: 'Effet mesuré', sous: 'pas encore dans le pourcentage', note: null, vert: true };
    case 'compte':
      return { cle: 'compte', libelle: 'Effet mesuré', sous: `compte dans le pourcentage${version ? ` (version ${version})` : ''}`, note: null, vert: true };
    case 'dementi':
      return { cle: 'dementi', libelle: 'Explication seulement', sous: null, note: `démenti sur vos matchs${dementiLe ? ` depuis le ${jjmmaaaa(dementiLe)}` : ''}`, vert: false };
    case 'non-mesurable':
      return { cle: 'explication', libelle: 'Explication seulement', sous: 'non mesurable au banc d’essai', note: null, vert: false };
    case 'pas-encore-mesure':
      return { cle: 'explication', libelle: 'Explication seulement', sous: 'pas encore mesuré au banc d’essai', note: null, vert: false };
    default:
      return { cle: 'explication', libelle: 'Explication seulement', sous: null, note: null, vert: false };
  }
}

// ------------------------------------------------------------ le banc d'essai, en mots

/** Ce que chaque variante a mesuré, en mots (« les matchs où … »). */
const CONDITIONS = Object.freeze({
  'repos-court': (s) => `un club avait moins de ${s.courtH / 24} jours de repos`,
  'enchainement-serre': (s) => `un club rejouait moins de ${s.serreH / 24} jours plus tard`,
  'deplacement-distance': () => 'la distance du déplacement était connue',
  'deplacement-altitude': (s) => `le club qui reçoit jouait à ${nombre(s.altitudeM)} m ou plus face à un visiteur venu d’en bas`,
  'pelouse-synthetique': () => 'le match se jouait sur pelouse synthétique',
  'arbitre-buts': () => 'l’arbitre avait déjà des matchs relevés au magasin',
  'entraineur-nouveau': (s) => `un club avait un nouvel entraîneur (${s.nouvelEntraineurMatchs} matchs au plus)`,
  placebo: () => 'un faux facteur tiré au hasard touchait un club'
});

/** Ce que chaque variante a mesuré, en quelques mots (la colonne « Ce qui a été mesuré » du tableau du banc). */
const MESURES = Object.freeze({
  'repos-court': (s) => `repos de moins de ${s.courtH / 24} jours (un des deux clubs)`,
  'enchainement-serre': (s) => `un club qui rejoue moins de ${s.serreH / 24} jours plus tard`,
  'deplacement-distance': () => 'la distance du déplacement (à vol d’oiseau)',
  'deplacement-altitude': (s) => `stade à ${nombre(s.altitudeM)} m ou plus, visiteur venu d’en bas`,
  'pelouse-synthetique': () => 'pelouse synthétique',
  'arbitre-buts': () => 'l’indice de buts de l’arbitre (ses matchs relevés au magasin)',
  'entraineur-nouveau': (s) => `nouvel entraîneur (${s.nouvelEntraineurMatchs} matchs au plus)`,
  placebo: () => 'un faux facteur tiré au hasard'
});

/** Les buts que chaque coefficient corrige : [clé, en tête de phrase, à la suite]. */
const EFFETS = Object.freeze({
  'repos-court': [['sesButs', 'les buts du club au repos court', 'ceux du club au repos court'], ['butsAdverses', 'les buts de son adversaire', 'ceux de son adversaire']],
  'enchainement-serre': [['sesButs', 'les buts du club qui rejoue vite', 'ceux du club qui rejoue vite'], ['butsAdverses', 'les buts de son adversaire', 'ceux de son adversaire']],
  'deplacement-altitude': [['domicile', 'les buts du club qui reçoit', 'ceux du club qui reçoit'], ['visiteur', 'les buts du visiteur', 'ceux du visiteur']],
  'deplacement-distance': [['visiteur', 'les buts du visiteur', 'ceux du visiteur'], ['domicile', 'les buts du club qui reçoit', 'ceux du club qui reçoit']],
  'pelouse-synthetique': [['domicile', 'les buts du club qui reçoit', 'ceux du club qui reçoit'], ['visiteur', 'les buts du visiteur', 'ceux du visiteur']],
  'arbitre-buts': [['lesDeux', 'les buts du match', 'ceux du match']],
  'entraineur-nouveau': [['sesButs', 'les buts du club au nouvel entraîneur', 'ceux du club au nouvel entraîneur'], ['butsAdverses', 'les buts de son adversaire', 'ceux de son adversaire']],
  placebo: [['sesButs', 'les buts du club tiré au hasard', 'ceux du club tiré au hasard'], ['butsAdverses', 'les buts de son adversaire', 'ceux de son adversaire']]
});

/** La période des deux plis du banc : « juillet 2023 à septembre 2026 ». */
export function periodeDuBanc(banc) {
  const plis = banc?.periodes?.plis ?? [];
  const de = plis.flatMap((p) => [p?.apprendre?.de, p?.juger?.de]).filter(Boolean).sort()[0] ?? null;
  const a = plis.flatMap((p) => [p?.apprendre?.a, p?.juger?.a]).filter(Boolean).sort().at(-1) ?? null;
  return de && a ? `${moisDit(de)} à ${moisDit(a)}` : null;
}

/**
 * Ce que les statistiques seules faisaient de travers dans cette situation, lu dans les coefficients des DEUX plis (un
 * sens constant seulement) : « sous-estimaient les buts du club au repos court (de 5 à 7 % selon la période) et
 * surestimaient ceux de son adversaire (de 4 à 7 % selon la période) ». Une erreur des statistiques, pas une cause.
 */
export function directionDuBanc(variante) {
  const effets = EFFETS[variante?.id] ?? [];
  const coefs = variante?.coefficients ?? [];
  const morceaux = [];
  for (const [cle, plein, suite] of effets) {
    const b = coefs.map((c) => c?.[cle]).filter(fini);
    if (!b.length || !(b.every((x) => x > 0) || b.every((x) => x < 0))) continue;
    const verbe = b[0] > 0 ? 'sous-estimaient' : 'surestimaient';
    const tailles = b.map((x) => Math.abs(Math.round((Math.exp(x) - 1) * 100))).sort((x, y) => x - y);
    const taille = tailles[0] === tailles.at(-1) ? `d’environ ${tailles[0]} %` : `de ${tailles[0]} à ${tailles.at(-1)} % selon la période`;
    morceaux.push(`${verbe} ${morceaux.length ? suite : plein} (${taille})`);
  }
  return morceaux.length ? morceaux.join(' et ') : null;
}

/** Le verdict d'une variante en mots (le tableau du banc, la ligne d'un facteur « explication »). */
export function verdictDit(v) {
  if (!v) return 'pas encore mesuré';
  if (v.utile) return 'effet mesuré';
  if (v.verdict === 'retenu') return 'prouvé, mais trop petit pour bouger un pourcentage d’un demi-point';
  if (v.verdict === 'moins-bon') return 'moins bon : le corriger rendait la prévision moins bonne';
  if (v.verdict === 'trop-peu' || v.verdict === 'pas-assez') return 'pas assez de matchs';
  return 'pas prouvé';
}

/** Ce que le banc dit d'un facteur, en une phrase (sous la ligne de l'encadré). */
export function phraseDuBanc(facteur, contexte) {
  const s = contexte?.statuts?.[facteur] ?? null;
  const banc = contexte?.banc ?? null;
  const seuils = contexte?.seuils ?? SEUILS_PAR_DEFAUT;
  if (facteur === 'meteo') {
    const depuis = contexte?.archiveDepuis ? `depuis le ${jjmmaaaa(contexte.archiveDepuis)}` : 'depuis la mise en service de l’étape 32';
    return `La météo des matchs passés a été relue après coup par FotMob (c’est la météo observée, pas la prévision) : elle ne peut pas être mesurée proprement au banc. Les prévisions sont gardées ${depuis} : la mesure se fera sur vos matchs, dans un an environ.`;
  }
  if (facteur === 'enjeu') return 'Non mesurable au banc : l’enjeu n’est calculé que depuis le 27/10/2026, sans historique des saisons passées ; la mesure se fera sur vos matchs.';
  if (!banc || !s || s.statut === 'pas-encore-mesure') return 'Pas encore mesuré au banc d’essai.';
  const v = (banc.variantes ?? []).find((x) => x.id === s.variante) ?? null;
  if (!v) return null;
  const periode = periodeDuBanc(banc) ?? 'la période du banc';
  const condition = CONDITIONS[v.id] ? CONDITIONS[v.id](seuils) : null;
  if (s.statut === 'effet-mesure' || s.statut === 'dementi' || s.statut === 'compte') {
    const direction = directionDuBanc(v);
    const [g1, g2] = v.fourchetteRelative ?? [null, null];
    const d = decimalesDe([v.gainRelatif, g1, g2]);
    const dans = s.statut === 'compte' ? 'Compte dans le pourcentage.' : 'Pas encore dans le pourcentage.';
    return `Effet mesuré au banc : sur ${nombre(v.matchsConcernes)} matchs de ${periode}${condition ? ` où ${condition}` : ''}, les statistiques seules ${direction ?? 'se trompaient'} ; les corriger réduit de ${pourcentNu(v.gainRelatif, d)} l’erreur de prévision du score exact (fourchette ${pourcentNu(g1, d)} à ${pourcentNu(g2, d)}, en tenant compte des ${banc.K} essais faits). ${dans}`;
  }
  return `Mesuré au banc d’essai sur ${nombre(v.matchsConcernes)} matchs de ${periode} : ${verdictDit(v)}.`;
}

// ------------------------------------------------------------ les états

const SEUILS_PAR_DEFAUT = Object.freeze({ courtH: 96, longH: 240, serreH: 96, altitudeM: 2000, ecartAltitudeM: 1500, nouvelEntraineurMatchs: 5, fenetreJours: 14 });

/**
 * L'état de la lecture du contexte : `pret`, ou la note qui dit pourquoi la fiche manque (jamais « 0 », jamais le
 * silence). `analyse` : { loading, error } ; `contexte` : le bloc du serveur (undefined : un serveur d'avant l'étape 32).
 */
export function etatDuContexte({ contexte, analyse = null, match = null }) {
  // L'analyse pas encore partie (la page vient de s'ouvrir) se lit comme une lecture en cours.
  if (analyse?.loading || (analyse && 'result' in analyse && analyse.result === null && !analyse.error)) return { cle: 'chargement', titre: 'Lecture du contexte…', texte: null, ton: 'is-info', court: 'lecture en cours' };
  if (analyse?.error) return { cle: 'analyse-en-echec', titre: 'Contexte indisponible', texte: 'L’analyse du moteur n’a pas répondu : le contexte arrive avec elle. Les autres cartes ne sont pas touchées.', ton: 'is-warning', court: 'indisponible' };
  if (contexte === undefined) return { cle: 'serveur-a-relancer', titre: 'Contexte pas encore lu', texte: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour voir le contexte du match.', ton: 'is-warning', court: 'serveur à relancer' };
  if (!contexte || contexte.etat === 'illisible') {
    const texte = contexte?.raison === 'autre-version' ? 'Contexte illisible : la fiche vient d’une autre version de l’appli. Les autres cartes ne sont pas touchées.' : 'Contexte illisible : la base n’a pas répondu. Les autres cartes ne sont pas touchées.';
    return { cle: 'illisible', titre: 'Contexte illisible', texte, ton: 'is-danger', court: 'illisible' };
  }
  if (contexte.etat === 'clubs-inconnus') {
    const noms = ['home', 'away'].filter((c) => contexte.clubs?.[c]?.id === null || contexte.clubs?.[c]?.id === undefined).map((c) => contexte.clubs?.[c]?.nom ?? match?.[c] ?? 'un club');
    const qui = noms.length > 1 ? `${noms[0]} et ${noms[1]} ne sont pas reconnus par leur identifiant FotMob` : `${noms[0] ?? 'un club'} n’est pas reconnu par son identifiant FotMob`;
    return { cle: 'clubs-inconnus', titre: 'Contexte indisponible', texte: `Contexte indisponible : ${qui} (l’appli ne rapproche jamais deux noms qui se ressemblent).`, ton: 'is-warning', court: 'club non reconnu' };
  }
  if (contexte.etat === 'hors-fenetre') {
    const fenetre = contexte.seuils?.fenetreJours ?? 14;
    return { cle: 'hors-fenetre', titre: 'Pas encore calculé', texte: `Le contexte se calcule chaque nuit pour les matchs des ${fenetre} prochains jours : il paraîtra la nuit du ${jjmm(contexte.paraitLe) ?? '…'}.`, ton: 'is-info', court: `paraîtra la nuit du ${jjmm(contexte.paraitLe) ?? '…'}` };
  }
  if (contexte.etat === 'pas-encore-calcule') {
    const nuit = jjmm(contexte.nuit?.jourD);
    const texte =
      contexte.raison === 'absent-de-la-derniere-nuit'
        ? `Pas encore calculé : la dernière passe de nuit (le ${nuit}) n’avait pas ce match dans le calendrier de saison ; la suivante le reprendra s’il y est.`
        : contexte.raison === 'apres-la-derniere-nuit'
          ? `Pas encore calculé : la dernière passe de nuit date du ${nuit} ; la prochaine le fera.`
          : 'Pas encore calculé : la prochaine passe de nuit le fera.';
    return { cle: 'pas-encore-calcule', titre: 'Pas encore calculé', texte, ton: 'is-info', court: 'pas encore calculé' };
  }
  return { cle: 'pret', titre: null, texte: null, ton: null, court: null };
}

// ------------------------------------------------------------ les lignes, facteur par facteur

const noms = (contexte, match) => ({ home: contexte?.clubs?.home?.nom ?? match?.home ?? 'Le club qui reçoit', away: contexte?.clubs?.away?.nom ?? match?.away ?? 'Le visiteur' });
const provenanceMagasin = (fiche) => ({ source: SOURCES.magasin, releveLe: fiche?.calculeLe ?? null, action: 'calculé', quand: fiche?.calculeLe ? `calculé ${calculDit(fiche.calculeLe)}` : null, fichier: FICHIERS.magasin });
const provenanceStades = (contexte) => ({ source: SOURCES.stades, releveLe: contexte?.stades?.faitLe ?? null, jourSeul: jjmmaaaa(contexte?.stades?.faitLe), action: 'faite', vieuxApresHeures: null, fichier: FICHIERS.stades });
const provenancePage = (page) => ({ source: SOURCES.page, releveLe: page?.data?.releveLe ?? null, action: 'relevé', detail: 'La page FotMob du match, lue à l’ouverture de cette page.' });

/** Le repos d'un club en une phrase, son survol et ses mentions. */
export function phraseRepos(nom, r, { seuils = SEUILS_PAR_DEFAUT, heureDuMatchInconnue = false } = {}) {
  if (!r || !r.precedent || !fini(r.heures)) {
    return { texte: `${nom} : repos inconnu (premier match connu de ce club).`, titre: null, mentions: [] };
  }
  const p = r.precedent;
  const jours = fini(r.jours) ? r.jours : Math.floor(r.heures / 24);
  const quand = p.kickoffConnu && p.kickoff ? `${jourDit(p.kickoff)} à ${heureDite(p.kickoff)} (heure de Paris)` : `${jourSeulDit(p.date)} (heure inconnue)`;
  const comp = competitionDite(p.league);
  const quoi = p.prevu ? 'match prévu' : 'dernier match';
  const duree = jours === 0 ? 'moins d’un jour de repos' : `${nombre(jours)} ${pluriel(jours, 'jour', 'jours')} de repos`;
  const texte = `${nom} : ${duree} — ${quoi} ${quand}${comp ? `, ${comp}` : ''}.`;
  const h = Math.round(r.heures - jours * 24);
  const titre = r.heureInconnue
    ? `Compté au jour près : ${nombre(jours)} ${pluriel(jours, 'jour', 'jours')} entre les deux dates.`
    : `${jours ? `${nombre(jours)} ${pluriel(jours, 'jour', 'jours')} et ` : ''}${nombre(h)} ${pluriel(h, 'heure', 'heures')} entre les deux coups d’envoi.`;
  const mentions = [];
  for (const m of r.mentions ?? []) {
    if (m === 'court') mentions.push(`repos court : moins de ${seuils.courtH / 24} jours`);
    else if (m === 'prolongation') mentions.push('après une prolongation');
    else if (m === 'long-competitions-non-suivies') mentions.push(`repos long : ${seuils.longH / 24} jours ou plus — une compétition que l’appli ne suit pas (supercoupe, championnat d’État au Brésil, sélections…) a pu se jouer entre-temps`);
    else if (m === 'bresil-championnats-d-etat') mentions.push('de janvier à avril, un club brésilien joue aussi son championnat d’État, que l’appli ne suit pas : son vrai repos peut être plus court');
    else if (m === 'heure-inconnue') mentions.push(heureDuMatchInconnue ? 'heure du match pas encore connue : compté au jour près' : 'heure du match précédent inconnue : compté au jour près');
    else if (m === 'prevu') mentions.push(`si le match du ${jourSeulDit(p.date)} se joue comme prévu`);
    else if (m === 'joue-pas-encore-au-magasin') mentions.push(`match du ${jourSeulDit(p.date)} pas encore relevé au magasin : heure inconnue`);
  }
  return { texte, titre, mentions };
}

/** L'enchaînement d'un club : { serre, texte } (serre : true, false, ou null quand le prochain match est inconnu). */
export function phraseEnchainementDUnClub(nom, e) {
  if (!e?.prochain || !fini(e.heures)) return { serre: null, texte: `${nom} : prochain match inconnu (pas encore au calendrier).` };
  const p = e.prochain;
  const jours = Math.floor(e.heures / 24);
  const quand = p.kickoffConnu && p.kickoff ? `${jourDit(p.kickoff)} à ${heureDite(p.kickoff)}` : jourSeulDit(p.date);
  const comp = competitionDite(p.league);
  if (e.serre) return { serre: true, texte: `${nom} rejoue dans ${nombre(jours)} ${pluriel(jours, 'jour', 'jours')} : ${quand}${comp ? `, ${comp}` : ''}.` };
  return { serre: false, texte: `${nom} : prochain match dans ${nombre(jours)} ${pluriel(jours, 'jour', 'jours')} (${quand}${comp ? `, ${comp}` : ''}).` };
}

/** L'enchaînement des deux clubs : la phrase (« Rien de serré… » quand aucun ne rejoue dans les 4 jours), puis le détail. */
export function phraseEnchainement(n, enchainement, { seuils = SEUILS_PAR_DEFAUT } = {}) {
  const h = phraseEnchainementDUnClub(n.home, enchainement?.home);
  const a = phraseEnchainementDUnClub(n.away, enchainement?.away);
  const mentions = [];
  if ([enchainement?.home, enchainement?.away].some((e) => e?.heureInconnue)) mentions.push('compté au jour près : l’heure du prochain match n’est pas encore connue');
  if (h.serre === false && a.serre === false) {
    return { phrases: [{ texte: `Rien de serré : aucun des deux clubs ne rejoue dans les ${seuils.serreH / 24} jours.`, titre: null }], mentions: [h.texte, a.texte, ...mentions] };
  }
  const ordre = h.serre ? [h, a] : a.serre ? [a, h] : [h, a];
  return { phrases: ordre.map((x) => ({ texte: x.texte, titre: null })), mentions };
}

/** Le stade du match est-il un AUTRE que le stade habituel ? (la page FotMob, sinon la fiche) → { autre, stade, habituel }. */
function stadeDuMatch(fiche, page) {
  const d = fiche?.facteurs?.deplacement ?? null;
  const duJour = page?.data?.meta?.stadium ?? null;
  const habituel = d?.stade ?? null;
  if (duJour && habituel && !meme(duJour, habituel)) return { autre: true, stade: duJour, habituel };
  if (d?.stadeHabituel === false) return { autre: true, stade: d.stade, habituel: null };
  return { autre: false, stade: duJour ?? habituel, habituel };
}

/** Le déplacement, en une phrase. */
export function phraseDeplacement(n, { fiche, contexte, page }) {
  const d = fiche?.facteurs?.deplacement ?? null;
  const s = stadeDuMatch(fiche, page);
  if (s.autre) return `Match au ${s.stade}, pas au stade habituel de ${n.home}${s.habituel ? ` (${s.habituel})` : ''} : distance non comptée.`;
  if (fini(d?.km)) {
    // Deux clubs qui partagent un stade (même stade habituel, mêmes coordonnées) : pas de déplacement.
    if (d.km === 0) return 'Les deux clubs ont le même stade habituel : pas de déplacement.';
    if (d.km < 15) return `Les deux stades sont tout proches (${nombre(d.km)} km à vol d’oiseau).`;
    return `${n.away} fait ${nombre(d.km)} km pour venir (entre les stades habituels, à vol d’oiseau).`;
  }
  const absents = ['home', 'away'].filter((c) => contexte?.stades?.[c] === false).map((c) => n[c]);
  if (absents.length) return `Distance inconnue : ${absents.join(' et ')} ${absents.length > 1 ? 'n’ont' : 'n’a'} pas de stade dans la table des stades.`;
  return 'Distance inconnue : les coordonnées d’un des deux stades manquent.';
}

/** L'altitude, en une phrase (toujours une ligne : « stade sous 1 500 m » quand il n'est pas dans la liste). */
export function phraseAltitude(n, { fiche, contexte, page, seuils = SEUILS_PAR_DEFAUT }) {
  const a = fiche?.facteurs?.altitude ?? null;
  const mentions = [];
  if (stadeDuMatch(fiche, page).autre || a?.source === 'stade-inhabituel') return { texte: 'Altitude : match hors du stade habituel, non comptée.', mentions };
  if (fini(a?.stade)) mentions.push('altitude : liste faite à la main (± 50 m), à relire');
  if (a?.concerne && fini(a.stade)) {
    const visiteur = fini(a.visiteur) ? `vient de ${nombre(a.visiteur)} m` : `vient de basse altitude (moins de ${nombre(seuils.ecartAltitudeM)} m)`;
    return { texte: `${n.home} joue à ${nombre(a.stade)} m d’altitude ; ${n.away} ${visiteur}.`, mentions };
  }
  if (fini(a?.stade)) {
    if (a.stade < seuils.altitudeM) return { texte: `${n.home} joue à ${nombre(a.stade)} m d’altitude : sous les ${nombre(seuils.altitudeM)} m retenus par le banc d’essai.`, mentions };
    return { texte: `${n.home} joue à ${nombre(a.stade)} m d’altitude ; ${n.away} vient aussi de haute altitude (${nombre(a.visiteur)} m) : écart de moins de ${nombre(seuils.ecartAltitudeM)} m, non compté.`, mentions };
  }
  if (contexte?.stades?.home === false) return { texte: `Altitude inconnue : ${n.home} n’a pas de stade dans la table des stades.`, mentions };
  return { texte: `Altitude : stade sous ${nombre(seuils.ecartAltitudeM)} m (liste faite à la main).`, mentions };
}

/** La pelouse : celle de la page FotMob du match, sinon celle du stade habituel ; la mention de ce que le visiteur connaît chez lui. */
export function phrasePelouse(n, { fiche, page }) {
  const duJour = surfaceDe(page?.data?.meta?.surface);
  const autre = stadeDuMatch(fiche, page).autre;
  const habituelle = autre ? null : fiche?.facteurs?.pelouse?.surface ?? null;
  const surface = duJour ?? habituelle;
  const mentions = [];
  if (!surface) {
    return { texte: autre ? 'Pelouse inconnue : match hors du stade habituel, et la page FotMob ne la donne pas.' : 'Pelouse inconnue : ni la page FotMob ni la table des stades ne la donnent.', mentions, source: null };
  }
  const v = fiche?.facteurs?.pelouse?.visiteurHabitue;
  if (surface === 'synthetique' && v === false) mentions.push(`${n.away} joue sur gazon chez lui`);
  if (surface !== 'synthetique' && v === true) mentions.push(`${n.away} joue sur synthétique chez lui`);
  return { texte: `${PELOUSES[surface]} (${duJour ? 'page FotMob du match' : 'stade habituel'}).`, mentions, source: duJour ? 'page' : 'stades' };
}

/** La page FotMob du match donne-t-elle une météo (une température ou une description) ? */
const aUneMeteo = (page) => {
  const m = page?.data?.available === false ? null : page?.data?.meta ?? null;
  return Boolean(m && ((m.temperature !== null && m.temperature !== undefined && m.temperature !== '' && Number.isFinite(Number(m.temperature))) || m.weather));
};

/** La météo PRÉVUE par FotMob (la page du match), le vent en km/h ; ou pourquoi elle manque. */
export function phraseMeteo(page) {
  if (page?.loading && !page?.data) return 'Météo : lecture de la page FotMob…';
  if (page?.error && !page?.data) return 'Météo : la page FotMob du match n’a pas pu être lue.';
  if (!page?.data || page.data.available === false) return 'Météo : FotMob ne liste pas encore ce match.';
  const m = page.data.meta ?? {};
  const t = Number(m.temperature);
  const aT = m.temperature !== null && m.temperature !== undefined && m.temperature !== '' && Number.isFinite(t);
  const desc = m.weather ? meteo(m.weather) : null;
  if (!aT && !desc) return 'Météo : FotMob ne la donne pas encore (elle paraît en général la veille ou le jour du match).';
  const morceaux = [];
  if (aT) morceaux.push(`${nombre(t)} °C${t >= 30 ? ' (chaleur)' : t <= 0 ? ' (froid)' : ''}`);
  if (desc) morceaux.push(sansMajuscule(desc));
  const kmh = ventEnKmH(m.windSpeed);
  if (kmh) morceaux.push(`vent ${nombre(kmh)} km/h${Number(m.windSpeed) >= 9 ? ' (vent fort)' : ''}`);
  const p = Number(m.precipitation);
  if (m.precipitation !== null && m.precipitation !== undefined && Number.isFinite(p) && p > 0) morceaux.push(`précipitations prévues : ${nombre(p, p < 10 ? 1 : 0)} mm`);
  return `Prévision FotMob au coup d’envoi : ${morceaux.join(', ')}.`;
}

/**
 * L'arbitre désigné (la page FotMob) et ses moyennes AU MAGASIN (sa ligne de la table de la nuit, jointe à la page par
 * le serveur) ; jamais celles que FotMob affiche. Sans ligne, ce qu'on sait : aucun de ses matchs au magasin (la table
 * existe : une nuit est passée), la table pas encore calculée (aucune nuit), ou les deux possibles (contexte non lu).
 */
export function phraseArbitre({ page, contexte }) {
  const mentions = [];
  const fixe = 'Les moyennes que FotMob affiche ne sont pas reprises, pour rester la même mesure que le banc d’essai : tous ses matchs relevés au magasin.';
  if (page?.loading && !page?.data) return { texte: 'Arbitre : lecture de la page FotMob…', mentions, ligne: null };
  if (page?.error && !page?.data) return { texte: 'Arbitre : la page FotMob du match n’a pas pu être lue.', mentions, ligne: null };
  const ref = page?.data?.meta?.referee ?? null;
  if (!ref?.name) return { texte: 'Arbitre : pas encore désigné chez FotMob.', mentions, ligne: null };
  const qui = `${ref.name}${ref.country ? ` (${ref.country})` : ''}`;
  mentions.push(fixe);
  const aam = page?.data?.arbitreAuMagasin;
  if (aam === undefined) return { texte: `${qui} : moyennes au magasin pas encore lues (serveur à relancer).`, mentions, ligne: null };
  const l = aam?.ligne ?? null;
  for (const h of aam?.homonymes ?? []) mentions.unshift(`un autre arbitre du même nom (${h.pays || 'pays non donné'}) n’est pas compté`);
  if (!l) {
    const lu = contexte && contexte.etat !== 'illisible' && contexte.etat !== 'clubs-inconnus';
    if (lu && contexte.nuit) return { texte: `${qui} : aucun de ses matchs n’est au magasin — pas de moyenne.`, mentions, ligne: null };
    if (lu) return { texte: `${qui} : ses moyennes au magasin ne sont pas encore calculées (la prochaine passe de nuit le fera).`, mentions, ligne: null };
    return { texte: `${qui} : pas de moyenne au magasin (aucun de ses matchs n’y est, ou la table des arbitres n’est pas encore calculée).`, mentions, ligne: null };
  }
  const ligue = contexte?.ligue ?? null;
  const parts = [];
  if (l.matchs_cartons > 0 && fini(l.jaunes)) {
    const j = l.jaunes / l.matchs_cartons;
    const jl = fini(ligue?.jaunesParMatch) ? nombre(ligue.jaunesParMatch, 1) : 'moyenne inconnue';
    parts.push(`${nombre(j, 1)} ${pluriel(j, 'carton jaune', 'cartons jaunes')} par match sur ses ${nombre(l.matchs)} matchs relevés au magasin (championnat : ${jl})`);
    if (l.matchs_cartons < l.matchs) mentions.unshift(`cartons relevés sur ${nombre(l.matchs_cartons)} de ses ${nombre(l.matchs)} matchs`);
  } else {
    parts.push(`${nombre(l.matchs)} ${pluriel(l.matchs, 'match relevé', 'matchs relevés')} au magasin, cartons jamais relevés`);
  }
  if (l.matchs_deroule > 0 && fini(l.penalties)) {
    const p = l.penalties / l.matchs_deroule;
    const pl = fini(ligue?.penaltiesParMatch) ? nombre(ligue.penaltiesParMatch, 2) : 'moyenne inconnue';
    parts.push(`${nombre(p, 2)} ${pluriel(p, 'penalty marqué', 'penalties marqués')} par match (championnat : ${pl})`);
  }
  if (fini(l.indice_buts)) {
    const x = Math.round((Math.exp(l.indice_buts) - 1) * 100);
    parts.push(x === 0 ? 'autant de buts que la moyenne du championnat dans ses matchs' : `${nombre(Math.abs(x))} % de buts ${x > 0 ? 'de plus' : 'de moins'} que la moyenne du championnat dans ses matchs`);
    if ((l.matchs_buts ?? 0) < 20) mentions.unshift('ramené vers la moyenne : un arbitre de peu de matchs compte peu');
  }
  return { texte: `${qui} : ${parts.join(' ; ')}.`, mentions, ligne: l };
}

/** L'entraîneur de chaque club (celui de son dernier match joué) ; la composition publiée qui en montre un autre est dite. */
export function phraseEntraineur(n, { fiche, page }) {
  const phrases = [];
  const mentions = [];
  for (const camp of ['home', 'away']) {
    const e = fiche?.facteurs?.entraineur?.[camp] ?? null;
    const club = n[camp];
    if (!e?.connu) {
      phrases.push({ texte: `${club} : entraîneur inconnu (aucune composition récente).`, titre: null });
    } else {
      const nom = e.nom ?? `entraîneur sans nom (identifiant FotMob ${e.id})`;
      const k = e.depuisMatchs;
      const depuis = e.depuisLe ? (e.precedent ? `Premier match relevé avec lui : le ${jjmmaaaa(e.depuisLe)}.` : `Premier match relevé au magasin avec lui : le ${jjmmaaaa(e.depuisLe)} (il était peut-être là avant).`) : null;
      if (e.nouveau) phrases.push({ texte: `${club} : ${nom} dirige l’équipe depuis ${nombre(k)} ${pluriel(k, 'match', 'matchs')}${e.precedent?.nom ? ` (avant lui : ${e.precedent.nom})` : ''} — nouvel entraîneur.`, titre: depuis });
      else if (!e.precedent) phrases.push({ texte: `${club} : ${nom}, en poste depuis au moins ${nombre(k)} ${pluriel(k, 'match', 'matchs')} (tous ceux relevés au magasin).`, titre: depuis });
      else phrases.push({ texte: `${club} : ${nom}, en poste depuis ${nombre(k)} ${pluriel(k, 'match', 'matchs')}.`, titre: depuis });
    }
    const publie = page?.data?.lineups?.[camp]?.coach ?? null;
    if (typeof publie === 'string' && publie.trim() && !meme(publie, e?.nom)) mentions.push(`Composition publiée : ${publie} sur le banc de ${club} (pas encore dans la fiche).`);
  }
  mentions.push('D’après les compositions de ses derniers matchs : un changement fait depuis le dernier match n’apparaît qu’avec la composition publiée.');
  return { phrases, mentions };
}

/** L'enjeu : il vit dans l'encadré « Enjeu » de l'étape 28 (allumé) ; cette ligne y renvoie, sans recopier le chiffre. */
export function phraseEnjeu(simulation) {
  if (simulation?.affichage?.saisons === 'allume') return 'Enjeu au classement : voir l’encadré « Enjeu » juste au-dessus. Il n’entre dans aucun pourcentage.';
  return 'Enjeu au classement : calculé à blanc chaque nuit, pas encore montré (Réglages › Versions du moteur › « Fins de saison et enjeu »).';
}

// ------------------------------------------------------------ l'encadré entier

/** La phrase d'ouverture : explications seulement, ou ce que veut dire « Effet mesuré » au lot 1. */
export function phraseDOuverture(lignes, banc) {
  if (!lignes.some((l) => l.pastille.cle === 'mesure' || l.pastille.cle === 'compte')) return 'Aujourd’hui, aucune de ces lignes ne change un pourcentage : ce sont des explications.';
  const periode = periodeDuBanc(banc);
  return `« Effet mesuré » : le banc d’essai l’a prouvé sur les matchs de ${periode ?? 'la période du banc'}. Il n’entre dans aucun pourcentage aujourd’hui : il n’y entrera qu’avec votre accord, après un essai à blanc.`;
}

/**
 * Ce match est-il touché par le facteur, tel que le banc l'a mesuré ? repos : un club à moins de 4 jours ; enchaînement :
 * un club qui rejoue dans les 4 jours ; altitude : stade à 2 000 m ou plus face à un visiteur d'en bas. null : sans objet.
 */
export function concerneDe(facteur, f) {
  if (!f) return null;
  if (facteur === 'repos') return ['home', 'away'].some((c) => f.repos?.[c]?.classe === 'court');
  if (facteur === 'enchainement') return ['home', 'away'].some((c) => f.enchainement?.[c]?.serre === true);
  if (facteur === 'altitude') return f.altitude?.concerne === true;
  return null;
}
const PAS_CONCERNE = Object.freeze({
  repos: (s) => `ce match n’est pas concerné : aucun des deux clubs n’a moins de ${s.courtH / 24} jours de repos`,
  enchainement: (s) => `ce match n’est pas concerné : aucun des deux clubs ne rejoue dans les ${s.serreH / 24} jours`,
  altitude: (s) => `ce match n’est pas concerné : pas de stade à ${nombre(s.altitudeM)} m ou plus face à un visiteur d’en bas`
});

/**
 * L'ENCADRÉ EN MOTS. `contexte` : le bloc de l'analyse (undefined : serveur d'avant) ; `analyse` : { loading, error } ;
 * `page` : { loading, error, data } (la page FotMob) ; `simulation` : le bloc de l'étape 28 ; `match` : { home, away }.
 * Rend { etat, ouverture, lignes (TOUJOURS 9), tableau, pied }.
 */
export function contexteDit({ contexte, analyse = null, page = null, simulation = null, match = null } = {}) {
  const etat = etatDuContexte({ contexte, analyse, match });
  const c = etat.cle === 'chargement' || etat.cle === 'analyse-en-echec' || etat.cle === 'serveur-a-relancer' ? null : contexte ?? null;
  const fiche = c?.fiche ?? null;
  const n = noms(c, match);
  const seuils = c?.seuils ?? SEUILS_PAR_DEFAUT;
  const manque = (titre) => `${titre} : ${etat.court ?? 'fiche absente'}.`;
  const statut = (f) => c?.statuts?.[f] ?? { statut: 'pas-encore-mesure', variante: null };
  const lignes = FACTEURS.map(({ cle, titre, icone }) => {
    const s = statut(cle);
    const pastille = pastilleDe(s.statut, { dementiLe: s.dementiLe ?? null });
    const ligne = { facteur: cle, titre, icone, phrases: [], mentions: [], banc: phraseDuBanc(cle, c), pastille, provenances: [] };
    if (cle === 'repos') {
      if (fiche) {
        for (const camp of ['home', 'away']) {
          const r = phraseRepos(n[camp], fiche.facteurs?.repos?.[camp], { seuils, heureDuMatchInconnue: fiche.facteurs?.heureInconnue === true });
          ligne.phrases.push({ texte: r.texte, titre: r.titre });
          ligne.mentions.push(...r.mentions.map((m) => `${n[camp]} — ${m}`));
        }
        ligne.provenances.push(provenanceMagasin(fiche));
      } else ligne.phrases.push({ texte: manque(titre), titre: null });
    } else if (cle === 'enchainement') {
      if (fiche) {
        const e = phraseEnchainement(n, fiche.facteurs?.enchainement, { seuils });
        ligne.phrases.push(...e.phrases);
        ligne.mentions.push(...e.mentions);
        ligne.provenances.push({ source: SOURCES.calendrier, releveLe: fiche.calculeLe, action: 'lu', quand: `lu ${calculDit(fiche.calculeLe)}`, fichier: FICHIERS.calendrier, detail: 'Le prochain match de chaque club, tel que le calendrier de saison le donnait à la passe de nuit.' });
      } else ligne.phrases.push({ texte: manque(titre), titre: null });
    } else if (cle === 'deplacement') {
      if (fiche) {
        ligne.phrases.push({ texte: phraseDeplacement(n, { fiche, contexte: c, page }), titre: null });
        ligne.provenances.push(provenanceStades(c));
      } else ligne.phrases.push({ texte: manque(titre), titre: null });
    } else if (cle === 'altitude') {
      if (fiche) {
        const a = phraseAltitude(n, { fiche, contexte: c, page, seuils });
        ligne.phrases.push({ texte: a.texte, titre: null });
        ligne.mentions.push(...a.mentions);
        ligne.provenances.push({ ...provenanceStades(c), source: SOURCES.altitudes, fichier: FICHIERS.altitudes });
      } else ligne.phrases.push({ texte: manque(titre), titre: null });
    } else if (cle === 'pelouse') {
      const p = phrasePelouse(n, { fiche, page });
      if (p.source || fiche) {
        ligne.phrases.push({ texte: p.texte, titre: null });
        ligne.mentions.push(...p.mentions);
      } else ligne.phrases.push({ texte: manque(titre), titre: null });
      if (p.source === 'page') ligne.provenances.push(provenancePage(page));
      else if (p.source === 'stades') ligne.provenances.push(provenanceStades(c));
    } else if (cle === 'meteo') {
      ligne.phrases.push({ texte: phraseMeteo(page), titre: null });
      // La provenance d'une prévision qui existe (jamais celle d'une page qui ne l'a pas).
      if (aUneMeteo(page)) ligne.provenances.push(provenancePage(page));
    } else if (cle === 'arbitre') {
      const a = phraseArbitre({ page, contexte: c });
      ligne.phrases.push({ texte: a.texte, titre: null });
      ligne.mentions.push(...a.mentions);
      if (page?.data?.meta?.referee?.name) ligne.provenances.push({ ...provenancePage(page), detail: 'Le nom et le pays de l’arbitre désigné.' });
      if (a.ligne) ligne.provenances.push({ source: SOURCES.magasin, releveLe: a.ligne.calcule_le ?? null, action: 'calculé', quand: a.ligne.calcule_le ? `calculé ${calculDit(a.ligne.calcule_le)}` : null, fichier: `${FICHIERS.magasin}, table contexte_arbitres`, detail: 'Ses moyennes, recalculées sur ses matchs relevés au magasin.' });
    } else if (cle === 'entraineur') {
      if (fiche) {
        const e = phraseEntraineur(n, { fiche, page });
        ligne.phrases.push(...e.phrases);
        ligne.mentions.push(...e.mentions);
        ligne.provenances.push(provenanceMagasin(fiche));
      } else ligne.phrases.push({ texte: manque(titre), titre: null });
    } else if (cle === 'enjeu') {
      ligne.phrases.push({ texte: phraseEnjeu(simulation), titre: null });
      const enjeu = simulation?.affichage?.saisons === 'allume' ? simulation?.enjeu ?? null : null;
      if (enjeu?.calculeLe) ligne.provenances.push({ source: SOURCES.enjeu, releveLe: enjeu.calculeLe, action: 'calculé', vieuxApresHeures: null });
    }
    ligne.concerne = fiche ? concerneDe(cle, fiche.facteurs) : null;
    if (pastille.cle === 'mesure' && ligne.concerne === false) ligne.mentions.unshift(PAS_CONCERNE[cle](seuils));
    ligne.aria = `${titre} : ${pastille.libelle}${pastille.sous ? `, ${pastille.sous}` : ''}${pastille.note ? `, ${pastille.note}` : ''}.`;
    return ligne;
  });
  const pied = [];
  if (fiche) pied.push({ cle: 'fiche', source: 'Fiche : magasin FotMob', releveLe: fiche.calculeLe, action: 'calculée', quand: `calculée ${calculDit(fiche.calculeLe)}`, fichier: `${FICHIERS.magasin}, table contexte_fiches` });
  if (page?.data?.releveLe) pied.push({ cle: 'page', source: 'Page FotMob du match', releveLe: page.data.releveLe, action: 'relevée' });
  if (fiche && c?.stades?.faitLe) pied.push({ cle: 'stades', source: 'Stades : venues.json', releveLe: c.stades.faitLe, jourSeul: jjmmaaaa(c.stades.faitLe), action: 'faite', vieuxApresHeures: null, fichier: FICHIERS.stades });
  return { etat, ouverture: phraseDOuverture(lignes, c?.banc ?? null), lignes, tableau: tableauDuBanc(c?.banc ?? null, c), pied };
}

// ------------------------------------------------------------ le tableau « Ce que dit le banc d'essai »

/**
 * Le tableau du banc (replié) : TOUJOURS les neuf facteurs et le contrôle (faux facteur). Colonnes : facteur, ce qui a
 * été mesuré, matchs jugés, part des matchs, gain (fourchette), verdict. Météo et enjeu : « non mesurable au banc » et
 * leur raison. Pied : Σ des matchs jugés (un compte) et ⌀ de la part concernée, sur les facteurs mesurés — jamais une
 * somme de pourcentages ; puis la phrase du banc (matchs, période, essais comptés, date du calcul).
 */
export function tableauDuBanc(banc, contexte = null) {
  const seuils = contexte?.seuils ?? SEUILS_PAR_DEFAUT;
  const variante = (id) => (banc?.variantes ?? []).find((v) => v.id === id) ?? null;
  const ligneMesuree = (titre, id, cle) => {
    const v = variante(id);
    if (!v) return { cle, facteur: titre, mesure: MESURES[id] ? MESURES[id](seuils) : '—', matchs: 'pas encore mesuré', part: '—', gain: '—', verdict: 'pas encore mesuré', mesureUtile: false, chiffres: null };
    const [g1, g2] = v.fourchetteRelative ?? [null, null];
    return {
      cle,
      facteur: titre,
      mesure: MESURES[id] ? MESURES[id](seuils) : '—',
      matchs: nombre(v.matchsConcernes) ?? '—',
      part: fini(v.partConcernee) ? `${nombre(v.partConcernee * 100, 1)} %` : '—',
      gain: fini(v.gainRelatif) ? `${pourcentSigne(v.gainRelatif, decimalesDe([v.gainRelatif, g1, g2]))} (${pourcentSigne(g1, decimalesDe([v.gainRelatif, g1, g2]))} à ${pourcentSigne(g2, decimalesDe([v.gainRelatif, g1, g2]))})` : '—',
      verdict: verdictDit(v),
      mesureUtile: v.utile === true,
      chiffres: { matchs: v.matchsConcernes, part: v.partConcernee }
    };
  };
  const nonMesurable = (titre, cle, raison) => ({ cle, facteur: titre, mesure: raison, matchs: '—', part: '—', gain: '—', verdict: 'non mesurable au banc', mesureUtile: false, chiffres: null });
  const variantes = { repos: 'repos-court', enchainement: 'enchainement-serre', deplacement: 'deplacement-distance', altitude: 'deplacement-altitude', pelouse: 'pelouse-synthetique', arbitre: 'arbitre-buts', entraineur: 'entraineur-nouveau' };
  const lignes = FACTEURS.map(({ cle, titre }) => {
    if (cle === 'meteo') return nonMesurable(titre, cle, 'la météo des matchs passés a été relue après coup (observée, pas prévue)');
    if (cle === 'enjeu') return nonMesurable(titre, cle, 'aucun historique avant le 27/10/2026, date de son premier calcul');
    return ligneMesuree(titre, banc?.facteurs?.[cle]?.variante ?? variantes[cle], cle);
  });
  const controle = ligneMesuree('Contrôle (faux facteur)', 'placebo', 'controle');
  const mesurees = lignes.filter((l) => l.chiffres);
  const somme = mesurees.reduce((s, l) => s + l.chiffres.matchs, 0);
  const moyenne = mesurees.length ? mesurees.reduce((s, l) => s + l.chiffres.part, 0) / mesurees.length : null;
  const periode = periodeDuBanc(banc);
  return {
    lignes: [...lignes, controle],
    somme: mesurees.length ? `Σ ${nombre(somme)} matchs jugés (un match compte une fois par facteur)` : 'Σ pas encore mesuré',
    moyenne: fini(moyenne) ? `⌀ ${nombre(moyenne * 100, 1)} % des matchs concernés par facteur` : '⌀ pas encore mesuré',
    portee: `Σ et ⌀ sur les ${mesurees.length} facteurs mesurés, sans le contrôle`,
    pied: banc
      ? `Banc d’essai : ${nombre(banc.matchs?.utilisables)} matchs de ${periode ?? 'la période du banc'}, en deux moitiés — chacune jugée avec ce qui a été appris sur l’autre —, en tenant compte des ${banc.K} essais faits, seuil sévère (calcul du ${jjmmaaaa(banc.calculeLe)}). ${banc.bancFaux || banc.placebo?.verdict === 'retenu' ? 'Le contrôle (un faux facteur tiré au hasard) est sorti prouvé : le banc est faux, ses verdicts ne comptent pas.' : 'Le contrôle (un faux facteur tiré au hasard) sort « pas prouvé », comme il se doit.'}`
      : 'Banc d’essai : pas encore passé.',
    preuve: contexte?.preuve ? 'La preuve sur vos matchs est en cours.' : 'La preuve sur vos matchs viendra des fiches gardées avant chaque coup d’envoi.'
  };
}
