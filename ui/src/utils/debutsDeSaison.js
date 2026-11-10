/**
 * debutsDeSaison.js — LES MOTS DU « DÉBUT DE SAISON » (étape 35 du plan, lot 1b, 10/11/2026) : le bloc posé SOUS les neuf
 * lignes de l'encadré « Contexte du match » (jamais une dixième ligne) et la carte « Arrivées et départs » de la page de
 * l'équipe (juste après « Indice de force »).
 * -----------------------------------------------------------------------
 * Règles PURES (ni Vue, ni réseau, ni navigateur : server/test/debutsEcran.test.mjs les rejoue sur de vraies réponses). Elles
 * disent ce que deux lectures apportent — aucune requête de plus à l'ouverture de la page du match :
 *   - `debuts` : le bloc que le serveur joint à l'analyse APRÈS elle (server/src/data/debutsDeSaison/debutsRead.js,
 *     debutsDuMatch) — la fiche gelée la nuit (rang, statut, forces lues, bras du banc), les lignes des deux clubs
 *     (continuité, mouvements, force de l'effectif à blanc), la note du banc recopiée par script (jamais retapée ici) ;
 *   - la réponse de GET /api/match-stats/effectif?club=N (effectifDuClub), la seule lecture de la carte de l'équipe.
 * Le bloc garde TOUJOURS ses deux lignes (une par club), la carte TOUJOURS ses deux tableaux ; chaque état vide dit sa raison
 * (jamais « 0 », jamais le silence). « Explication seulement » (gris) par défaut ; « Effet mesuré » (le seul vert) pour une
 * famille UTILE au banc d'essai qui concerne CE match, toujours suivi de « pas encore dans le pourcentage » : rien n'entre dans
 * les chiffres au lot 1 ; la puce « À blanc » sur la force de l'effectif, toujours. Jamais de vert ni de rouge pour une valeur
 * (un promu n'est pas « mauvais », une continuité basse non plus). Σ et ⌀, jamais une somme de pourcentages. Clubs et joueurs
 * par identifiant FotMob : un club sans identifiant n'a ni chiffres ni logo retrouvé par son nom.
 * Heures de Paris, virgule décimale, espace fine des milliers (toLocaleString('fr-FR')), vrai signe moins.
 * -----------------------------------------------------------------------
 */

import { nombre, pourcentSigne, jjmm, jjmmaaaa, calculDit, competitionDite } from './contexteDuMatch.js';
import { posteDit } from './ficheJoueur.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const pluriel = (n, un, plusieurs) => (Math.abs(n) >= 2 ? plusieurs : un);
const idFotMob = (x) => {
  if (Number.isSafeInteger(x) && x > 0) return `fotmob-${x}`;
  return /^fotmob-[1-9]\d*$/.test(String(x ?? '')) ? String(x) : null;
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const moisDit = (jour) => (/^\d{4}-\d{2}/.test(String(jour ?? '')) ? `${MOIS[Number(jour.slice(5, 7)) - 1]} ${jour.slice(0, 4)}` : null);
const anDe = (jour) => (/^\d{4}/.test(String(jour ?? '')) ? jour.slice(0, 4) : null);
/** « de Lens », « d’Ardenne Athletic » (l’élision devant une voyelle). */
export const deNom = (nom) => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(String(nom ?? '')) ? `d’${nom}` : `de ${nom}`);

/** Les sources réelles, telles que les pastilles de provenance les écrivent (le vrai endroit des données). */
export const SOURCES_DEBUTS = Object.freeze({
  magasin: 'magasin FotMob (feuilles des matchs déjà joués)',
  modele: 'modèle de buts en essai (étape 27) et banc d’essai de l’étape 35',
  fiches: 'fiches des joueurs (étape 30)',
  liste: 'FotMob, liste du jour',
  banc: 'banc d’essai de l’étape 35 (magasin 2023-2026 ; football-data 2019-2023)'
});
const FICHIERS = Object.freeze({
  fiches: 'la base du magasin (match-stats.db), table debuts_fiches',
  clubs: 'la base du magasin (match-stats.db), table debuts_clubs'
});

/** Les trois mentions fixes du bloc (une ligne grise chacune). */
export const MENTIONS_FIXES = Object.freeze([
  'Rang : les matchs de championnat déjà joués (un match reporté compte le jour où il se joue).',
  'Clubs et joueurs reconnus par leur identifiant FotMob, jamais par leur nom.',
  'Un départ n’est dit que si le joueur a été vu jouer pour un autre club ; sinon « pas revu ».'
]);

/** La limite dite sous la force de l'effectif (LIMITES_DU_LOT_1A[3], recopiée par le serveur dans `banc.limites`). */
const LIMITE_DU_ONZE = 'L’exemple des titulaires majeurs absents relève de la force du onze du jour (étapes 30 et 34), pas de l’effectif de la saison.';

/** Les seuils de l'écran par défaut (le serveur les envoie ; ceux-ci servent quand il ne les a pas). */
const SEUILS = Object.freeze({ fenetreJours: 14, nPremieres: 10, quiCompte: 0.3, minMatchsArrivee: 2, effectifMinMatchs: 2, prior: 8, demarrage: 8 });

// ------------------------------------------------------------ nombres

/** « 1er », « 2e », « 18e ». */
export const ordinal = (n) => (Number.isSafeInteger(n) ? (n === 1 ? '1er' : `${n}e`) : null);

/** Un nombre de buts signé, deux décimales : « +0,09 », « −0,18 » (le vrai signe moins), « 0,00 ». */
export function butsSignes(x) {
  if (!fini(x)) return null;
  const r = Math.round(x * 100) / 100;
  if (r === 0) return nombre(0, 2);
  return `${r > 0 ? '+' : ''}${nombre(r, 2)}`;
}

/** Une part (0,71) en pourcentage sans signe : « 71 % ». */
export const pourcent = (part, decimales = 0) => (fini(part) ? `${nombre(part * 100, decimales)} %` : null);

/** Une part en nombre de pour cent, sans « % » ni « + » (le moins reste) : « 0,022 » — la phrase met « % » une fois. */
const pourcentNu = (part, decimales) => (fini(part) ? nombre(part * 100, decimales) : '?');
/** Deux décimales ; trois quand tout est sous 1 % et que la plus petite valeur non nulle passe sous 0,1 % (« 0,022 »). */
const decimalesDe = (parts) => {
  const v = parts.filter(fini).map((x) => Math.abs(x * 100)).filter((x) => x > 0);
  if (!v.length || v.some((x) => x >= 1)) return 2;
  return Math.min(...v) < 0.1 ? 3 : 2;
};

/** L'ampleur du banc (une probabilité) en points : « 0,52 point », « 3,26 points ». */
/** Une part en pourcentage signé aux décimales `d` (celles de la ligne) ; « 0,000 % » sans signe quand l'arrondi tombe à zéro, jamais « −0,000 % ». */
function pourcentAuSigne(part, d = decimalesDe([part])) {
  if (!fini(part)) return null;
  const arrondi = Math.round(part * 100 * 10 ** d) / 10 ** d;
  return arrondi === 0 ? `${nombre(0, d)} %` : pourcentSigne(part, d);
}

export const ampleurDite = (a) => (fini(a) ? `${nombre(a * 100, 2)} ${pluriel(a * 100, 'point', 'points')}` : null);

// ------------------------------------------------------------ le banc d'essai, en mots

/** Les fenêtres du banc, en mots (« magasin 2023-2026 », « football-data 2019-2023 ») ; tirées des périodes quand elles y sont. */
export function fenetresDuBanc(banc) {
  const plis = banc?.periodes?.magasin?.plis ?? [];
  const bornes = plis.flatMap((p) => [p?.apprendre?.de, p?.apprendre?.a, p?.juger?.de, p?.juger?.a]).filter(Boolean).sort();
  const fd = banc?.periodes?.fd ?? null;
  return {
    magasin: bornes.length ? `magasin ${anDe(bornes[0])}-${anDe(bornes.at(-1))}` : 'magasin 2023-2026',
    fd: fd?.juger ? `football-data ${anDe(fd.juger.de)}-${anDe(fd.juger.a)}` : 'football-data 2019-2023'
  };
}

/** Ce que chaque famille a comparé, en mots (la colonne « Ce qui a été comparé »). */
const COMPARES = Object.freeze({
  rappel: 'Oubli à la trêve : la force d’avant ramenée un peu plus vers la moyenne',
  promus: 'Promus et relégués : un écart propre au sens du changement',
  nouveaux: 'Nouveaux venus : placés comme les promus suivis',
  effectif: 'Force de l’effectif (fiches des joueurs, à blanc)'
});
const CONTROLES = Object.freeze({
  rappel: 'Contrôle : une fausse rentrée tirée au hasard',
  promus: 'Contrôle : un faux promu tiré au hasard',
  nouveaux: 'Contrôle : un faux promu tiré au hasard',
  effectif: 'Contrôle : une fausse force d’effectif'
});

/** Le verdict d'une variante du banc, en mots (la colonne « Verdict »). */
export function verdictDesDebuts(v, banc) {
  if (!v) return 'pas encore mesuré';
  const f = banc?.familles?.[v.famille] ?? null;
  if (v.placebo) return v.verdict === 'retenu' ? 'le contrôle a gagné : la mesure n’est pas fiable' : 'rien trouvé, comme il se doit';
  if (f?.utile && f.fenetre === v.fenetre) return f.prudent ? 'effet mesuré (jugement prudent)' : 'effet mesuré';
  // La prudence tient au magasin déjà vu par d'autres réglages (et à la force de l'effectif, toujours prudente) : jamais à football-data.
  const prudent = f?.prudent && (v.fenetre === 'magasin' || v.famille === 'effectif') ? ' (jugement toujours prudent)' : '';
  if (v.verdict === 'retenu') return `retenu, mais pas utile${prudent}`;
  if (v.verdict === 'moins-bon') return `moins bon : le corriger rendait la prévision moins bonne${prudent}`;
  if (v.verdict === 'trop-peu' || v.verdict === 'pas-assez') return `pas assez de matchs${prudent}`;
  return `pas prouvé${prudent}`;
}

/** Ce que la famille dit d'un club du match quand elle n'est pas utile (« Effet des promus et relégués : … »). */
function effetNonMesure(famille, banc) {
  const f = banc?.familles?.[famille] ?? null;
  const mot = f?.mot ?? (famille === 'promus' ? 'promus et relégués' : famille === 'nouveaux' ? 'nouveaux venus' : famille);
  if (!banc || !f) return `Effet des ${mot} : pas encore mesuré au banc d’essai.`;
  const faux = Object.values(f.bancFaux ?? {}).some(Boolean);
  if (faux) return `Effet des ${mot} : le contrôle (un faux promu tiré au hasard) a gagné lui aussi : la mesure n’est pas fiable, rien n’est retenu.`;
  if (f.moinsBonQuelquePart) return `Effet des ${mot} : moins bon au banc d’essai (le corriger rendait la prévision moins bonne) : rien n’est retenu.`;
  return `Effet des ${mot} : pas prouvé au banc d’essai.`;
}

/** « sur {n} matchs de … » : ce que chaque famille a jugé (§7.2 : l'oubli à la trêve se dit « début de saison »). */
const MATCHS_DE = Object.freeze({ rappel: 'début de saison', promus: 'promus et relégués', nouveaux: 'nouveaux venus', effectif: 'début de saison' });

/** La variante retenue d'une famille utile (celle de sa fenêtre), ou null. */
function varianteUtile(famille, banc) {
  const f = banc?.familles?.[famille] ?? null;
  if (!f?.utile || !f.fenetre) return null;
  const id = f.fenetres?.[f.fenetre]?.variante ?? null;
  return (banc.variantes ?? []).find((v) => v.id === id) ?? null;
}

/**
 * La phrase sous la pastille « Effet mesuré » : ce que le banc a mesuré pour une famille utile (sa fenêtre, ses matchs, le
 * gain sur le score exact et sa fourchette, l'ampleur, les essais comptés) et le 1N2 seul, rapporté sans verdict.
 */
export function phraseDuBancDesDebuts(famille, banc) {
  const v = varianteUtile(famille, banc);
  if (!v) return null;
  const f = banc.familles[famille];
  const fen = fenetresDuBanc(banc)[v.fenetre] ?? v.fenetre;
  const [g1, g2] = v.fourchetteRelative ?? [null, null];
  const d = decimalesDe([v.gainRelatif, g1, g2]);
  const un = v.unDeuxSeul;
  const unDeux = un && fini(un.gainRelatif) ? `rapporté sans verdict (${nombre(un.matchs)} matchs, ${pourcentAuSigne(un.gainRelatif)})` : 'rapporté sans verdict';
  return `Mesuré au banc : sur ${nombre(v.matchsJuges)} matchs de ${MATCHS_DE[famille] ?? f.mot} (${fen}), ce calcul se trompe moins que le modèle de buts en essai (${pourcentNu(v.gainRelatif, d)} % d’erreur en moins sur le score exact, fourchette ${pourcentNu(g1, d)} à ${pourcentNu(g2, d)} %, ampleur ${ampleurDite(v.ampleur?.max)}, en tenant compte des ${banc.K} essais faits). Avec les cotes du 1N2 : ${unDeux}.`;
}

/**
 * LE TABLEAU « Ce que dit le banc d'essai » du bloc (replié) : une ligne par variante (sans cote), une ligne « 1N2 seul »
 * rapportée sans verdict sous chaque variante qui n'est pas un contrôle, puis le poids par championnat et le second tournoi
 * (jamais mesurés, dits). Σ : les matchs distincts jugés, par fenêtre — « au moins » le plus grand nombre jugé d'une ligne (les
 * lignes se recouvrent : jamais leur somme) ; ⌀ : l'ampleur moyenne des variantes mesurées, sans les contrôles. Jamais une
 * somme de pourcentages. Puis le pied (périodes, essais comptés, date) et les limites du lot.
 */
export function tableauDuBancDesDebuts(banc) {
  const fen = fenetresDuBanc(banc);
  const lignes = [];
  const variantes = banc?.variantes ?? [];
  for (const v of variantes) {
    const [g1, g2] = v.fourchetteRelative ?? [null, null];
    const d = decimalesDe([v.gainRelatif, g1, g2]);
    lignes.push({
      cle: v.id,
      compare: v.placebo ? CONTROLES[v.famille] ?? 'Contrôle' : COMPARES[v.famille] ?? v.famille,
      fenetre: fen[v.fenetre] ?? v.fenetre,
      regime: 'sans cote',
      matchs: fini(v.matchsJuges) ? nombre(v.matchsJuges) : '—',
      erreur: fini(v.gainRelatif) ? `${pourcentAuSigne(v.gainRelatif, d)} (${pourcentAuSigne(g1, d)} à ${pourcentAuSigne(g2, d)})` : '—',
      ampleur: ampleurDite(v.ampleur?.max) ?? '—',
      verdict: verdictDesDebuts(v, banc),
      mesure: !v.placebo && banc?.familles?.[v.famille]?.utile === true && banc.familles[v.famille].fenetre === v.fenetre,
      controle: v.placebo === true
    });
    if (!v.placebo && v.unDeuxSeul) {
      lignes.push({
        cle: `${v.id}-1n2`,
        compare: `${COMPARES[v.famille] ?? v.famille} — avec les cotes du 1N2`,
        fenetre: fen[v.fenetre] ?? v.fenetre,
        regime: '1N2 seul (rapporté)',
        matchs: fini(v.unDeuxSeul.matchs) ? nombre(v.unDeuxSeul.matchs) : '—',
        erreur: fini(v.unDeuxSeul.gainRelatif) ? pourcentAuSigne(v.unDeuxSeul.gainRelatif) : '—',
        ampleur: '—',
        verdict: 'rapporté, sans verdict',
        mesure: false,
        controle: false
      });
    }
  }
  lignes.push({ cle: 'poids-par-championnat', compare: 'Poids par championnat', fenetre: '—', regime: '—', matchs: '—', erreur: '—', ampleur: '—', verdict: 'non mesurable au banc d’essai : une ou deux rentrées par championnat', mesure: false, controle: false });
  lignes.push({ cle: 'second-tournoi', compare: 'Second tournoi (une coupe, une phase finale)', fenetre: '—', regime: '—', matchs: '—', erreur: '—', ampleur: '—', verdict: 'non mesuré : votre choix (pas un début de saison)', mesure: false, controle: false });
  // Σ par fenêtre : au moins le plus grand nombre de matchs jugés d'une ligne (les lignes se recouvrent).
  const parFenetre = new Map();
  for (const v of variantes) if (fini(v.matchsJuges)) parFenetre.set(v.fenetre, Math.max(parFenetre.get(v.fenetre) ?? 0, v.matchsJuges));
  const sommes = [...parFenetre.entries()].map(([f, n]) => `${fen[f] ?? f} : au moins ${nombre(n)} matchs distincts jugés`);
  const mesurees = variantes.filter((v) => !v.placebo && fini(v.ampleur?.max));
  const moyenne = mesurees.length ? mesurees.reduce((s, v) => s + v.ampleur.max, 0) / mesurees.length : null;
  const plis = banc?.periodes?.magasin?.plis ?? [];
  const bornes = plis.flatMap((p) => [p?.apprendre?.de, p?.apprendre?.a, p?.juger?.de, p?.juger?.a]).filter(Boolean).sort();
  const fd = banc?.periodes?.fd ?? null;
  const magasin = bornes.length ? `magasin de ${moisDit(bornes[0])} à ${moisDit(bornes.at(-1))}` : 'magasin de juillet 2023 à septembre 2026';
  const footballData = fd?.juger && fd?.apprendre ? `football-data de ${moisDit(fd.juger.de)} à ${moisDit(fd.juger.a)}, appris sur ${anDe(fd.apprendre.de)}-${anDe(fd.apprendre.a)}` : 'football-data de juillet 2019 à juin 2023, appris sur 2005-2019';
  return {
    lignes,
    portee: variantes.length ? `Σ et ⌀ sur les ${variantes.length} lignes jugées (sans le 1N2 rapporté)` : 'Σ et ⌀ : pas encore mesuré',
    somme: sommes.length ? `Σ ${sommes.join(' ; ')}` : 'Σ pas encore mesuré',
    moyenne: fini(moyenne) ? `⌀ ampleur ${ampleurDite(moyenne)} (${mesurees.length} variantes, sans les contrôles)` : '⌀ pas encore mesuré',
    pied: banc
      ? `Banc d’essai : ${magasin}, deux moitiés croisées (des matchs déjà vus par d’autres étapes : un jugement prudent) ; ${footballData} (jamais vu pour cette question ; sans xG) ; ${banc.K} essais comptés, seuil sévère (calcul du ${jjmmaaaa(banc.calculeLe) ?? '…'}).`
      : 'Banc d’essai : pas encore passé.',
    limites: [...(banc?.limites ?? [])]
  };
}

// ------------------------------------------------------------ les états du bloc

/**
 * L'état de la lecture du début de saison : `pret`, ou la note qui dit pourquoi la fiche manque (jamais « 0 », jamais le
 * silence). `analyse` : { loading, error, result } ; `debuts` : le bloc du serveur (undefined : un serveur d'avant l'étape 35).
 */
export function etatDesDebuts({ debuts, analyse = null, match = null }) {
  if (analyse?.loading || (analyse && 'result' in analyse && analyse.result === null && !analyse.error)) return { cle: 'chargement', titre: 'Lecture du début de saison…', texte: null, ton: 'is-info', court: 'lecture en cours' };
  if (analyse?.error) return { cle: 'analyse-en-echec', titre: 'Début de saison indisponible', texte: 'L’analyse du moteur n’a pas répondu : le début de saison arrive avec elle. Les autres lignes ne sont pas touchées.', ton: 'is-warning', court: 'indisponible' };
  if (debuts === undefined) return { cle: 'serveur-a-relancer', titre: 'Début de saison pas encore lu', texte: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour voir le début de saison.', ton: 'is-warning', court: 'serveur à relancer' };
  if (!debuts || debuts.etat === 'illisible') {
    const pourquoi = POURQUOI_ILLISIBLE[debuts?.raison] ?? 'la base n’a pas répondu';
    return { cle: 'illisible', titre: 'Début de saison illisible', texte: `Début de saison illisible : ${pourquoi}. Les autres lignes ne sont pas touchées.`, ton: 'is-danger', court: 'illisible' };
  }
  if (debuts.etat === 'clubs-inconnus') {
    const noms = ['home', 'away'].filter((c) => debuts.clubs?.[c]?.id === null || debuts.clubs?.[c]?.id === undefined).map((c) => debuts.clubs?.[c]?.nom ?? match?.[c] ?? 'un club');
    const texte = noms.length > 1 ? `${noms[0]} et ${noms[1]} ne sont pas reconnus par leur identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).` : `${noms[0] ?? 'Un club'} n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).`;
    return { cle: 'clubs-inconnus', titre: 'Club non reconnu', texte, ton: 'is-warning', court: 'club non reconnu' };
  }
  if (debuts.etat === 'hors-fenetre') {
    const fenetre = debuts.seuils?.fenetreJours ?? SEUILS.fenetreJours;
    return { cle: 'hors-fenetre', titre: 'Pas encore calculé', texte: `Paraîtra la nuit du ${jjmm(debuts.paraitLe) ?? '…'} (${fenetre} jours avant le match).`, ton: 'is-info', court: `paraîtra la nuit du ${jjmm(debuts.paraitLe) ?? '…'}` };
  }
  if (debuts.etat === 'pas-encore-calcule') {
    const nuit = jjmm(debuts.nuit?.jourD) ?? '…';
    // Les mots de la 32, juste au-dessus sur la même page ; sans fiche malgré la nuit : le match manquait au calendrier, ou
    // un de ses deux identifiants FotMob (l'annuaire strict).
    const texte =
      debuts.raison === 'absent-de-la-derniere-nuit'
        ? `Pas encore calculé : la dernière passe de nuit (le ${nuit}) n’a pas fait de fiche pour ce match (absent du calendrier de saison, ou sans ses deux identifiants FotMob) ; la suivante le reprendra.`
        : debuts.raison === 'apres-la-derniere-nuit'
          ? `Pas encore calculé : la dernière passe de nuit date du ${nuit} ; la prochaine le fera.`
          : 'Pas encore calculé : la prochaine passe de nuit le fera.';
    return { cle: 'pas-encore-calcule', titre: 'Pas encore calculé', texte, ton: 'is-info', court: 'pas encore calculé' };
  }
  return { cle: 'pret', titre: null, texte: null, ton: null, court: null };
}

/** Pourquoi une lecture est illisible, en mots (la raison du serveur) ; sans raison connue : « la base n'a pas répondu ». */
const POURQUOI_ILLISIBLE = Object.freeze({
  'autre-version': 'la fiche vient d’une autre version de l’appli',
  'fiche-illisible': 'la fiche rangée par la passe de nuit ne se lit pas',
  'ligne-illisible': 'la ligne d’un des deux clubs, rangée par la passe de nuit, ne se lit pas',
  'date-du-match-illisible': 'la date du match ne se lit pas',
  'lecture-ratee': 'la lecture n’a pas abouti'
});

// ------------------------------------------------------------ la pastille du bloc

/**
 * La pastille du bloc : « Effet mesuré » + « pas encore dans le pourcentage » seulement si une famille UTILE au banc concerne
 * CE match (ses bras sont dans la fiche) ; « Explication seulement » sinon ; « pas encore mesuré au banc d'essai » sans note.
 */
export function pastilleDesDebuts(debuts) {
  const banc = debuts?.banc ?? null;
  const titre = 'Début de saison';
  const avec = (p) => ({ ...p, aria: `${titre} : ${p.libelle}${p.sous ? `, ${p.sous}` : ''}.` });
  if (debuts && debuts.etat === 'pret' && (!banc || !banc.familles)) return avec({ cle: 'non-mesure', libelle: 'Explication seulement', sous: 'pas encore mesuré au banc d’essai', vert: false, familles: [] });
  const concernees = debuts?.etat === 'pret' ? Object.keys(debuts?.fiche?.bras?.familles ?? {}) : [];
  const mesurees = concernees.filter((f) => banc?.familles?.[f]?.utile === true && (banc.utiles ?? []).includes(f));
  if (mesurees.length) return avec({ cle: 'mesure', libelle: 'Effet mesuré', sous: 'pas encore dans le pourcentage', vert: true, familles: mesurees });
  return avec({ cle: 'explication', libelle: 'Explication seulement', sous: null, vert: false, familles: [] });
}

// ------------------------------------------------------------ les deux lignes

/** La part de la moyenne du championnat (8 / (W + 8), par club), en mots. */
function phraseDuRappel(c, banc) {
  const p = c.partDeLaMoyenne;
  const parts = p && fini(p.attaque) && fini(p.defense) ? ` de ${pourcent(p.attaque)} (attaque) et ${pourcent(p.defense)} (défense)` : '';
  if (c.rappel && fini(c.rappel.avec?.attaque) && fini(c.rappel.sans?.attaque)) {
    // Deux décimales ; trois quand les deux valeurs se confondraient à deux (jamais « 0,95 au lieu de 0,95 »).
    const deux = (a, b) => {
      const d = Math.round(a * 100) === Math.round(b * 100) ? 3 : 2;
      return `${nombre(a, d)} au lieu de ${nombre(b, d)}`;
    };
    return `À blanc, sa force de la saison passée est ramenée un peu plus vers la moyenne : attaque ${deux(c.rappel.avec.attaque, c.rappel.sans.attaque)}, défense ${deux(c.rappel.avec.defense, c.rappel.sans.defense)} (le modèle de buts en essai).`;
  }
  const debut = `Le modèle de buts en essai ramène déjà sa force, tirée de tout ce qui précède,${parts} vers la moyenne du championnat`;
  if (!banc?.familles?.rappel) return `${debut} ; l’effet d’un rappel de plus n’est pas encore mesuré.`;
  return `${debut} ; le banc d’essai n’a pas trouvé mieux.`;
}

/** L'effet à blanc d'une famille utile dans CE match : B − A, pour le club et pour son adversaire (en buts). */
function effetDansLeMatch(famille, camp, debuts) {
  const b = debuts?.fiche?.bras?.familles?.[famille];
  if (!b?.A || !b?.B) return null;
  const dl = b.B.lambda - b.A.lambda;
  const dm = b.B.mu - b.A.mu;
  return camp === 'home' ? { sien: dl, adverse: dm } : { sien: dm, adverse: dl };
}

/**
 * La phrase de l'effet mesuré (famille utile qui concerne ce club), ou celle qui dit pourquoi rien n'est mesuré. `adverse` : le
 * club d'en face ({ nom, teamId, league }) — la phrase mesurée le nomme, elle porte donc son logo (`clubs`).
 */
function phraseDeLEffet(famille, camp, debuts, noms, adverse = null) {
  const banc = debuts?.banc ?? null;
  const v = varianteUtile(famille, banc);
  const e = v ? effetDansLeMatch(famille, camp, debuts) : null;
  if (!v || !e) return { texte: effetNonMesure(famille, banc), mesure: false, clubs: [] };
  const fen = fenetresDuBanc(banc);
  const valeurs = `${butsSignes(e.sien)} ${pluriel(e.sien, 'but', 'buts')} pour ${noms.sien}, ${butsSignes(e.adverse)} pour ${noms.adverse}`;
  if (famille === 'nouveaux') {
    const ou = v.fenetre === 'magasin' ? `${fen.magasin} : un jugement prudent` : `la méthode mesurée sur ${fen[v.fenetre]}`;
    return { texte: `Nouveau venu : effet mesuré dans ce match, à blanc : ${valeurs} (la valeur apprise sur les promus suivis du magasin ; sur ${nombre(v.matchsJuges)} matchs de nouveaux venus jugés au banc, ${ou}).`, mesure: true, clubs: adverse ? [adverse] : [] };
  }
  const ou = v.fenetre === 'magasin' ? `valeur apprise et mesurée sur le ${fen.magasin}, un jugement prudent` : `valeur apprise sur le ${fen.magasin} ; la méthode a été mesurée sur ${fen[v.fenetre]}`;
  return { texte: `Promu : effet mesuré dans ce match, à blanc : ${valeurs} — ce qui prédit le mieux un promu, sur ${nombre(v.matchsJuges)} matchs de promus et relégués jugés au banc (${ou}).`, mesure: true, clubs: adverse ? [adverse] : [] };
}

/**
 * Rien à comparer : pas de saison d'avant au magasin (nouveau venu, premier au magasin), ou une saison d'avant SANS feuilles de
 * match (le club y était, ses compositions n'ont pas été relevées) — dit tel quel, jamais l'un pour l'autre.
 */
const AVEC_SAISON_D_AVANT = new Set(['debut', 'promu', 'relegue', 'autre-changement']);
function rienAComparer(statut) {
  return AVEC_SAISON_D_AVANT.has(statut)
    ? { court: 'aucune feuille de match de la saison passée au magasin', texte: 'Aucune feuille de match de la saison passée au magasin pour ce club (ses compositions n’ont pas été relevées) : rien à comparer.' }
    : { court: 'aucune saison d’avant au magasin', texte: 'Aucune saison d’avant au magasin pour ce club : rien à comparer.' };
}

/** La ligne « Effectif de {Club} » (la continuité, les arrivées et départs qui comptent), ou null hors début de saison. */
function ligneDeLEffectif(nom, ligne) {
  const m = ligne?.mouvements ?? null;
  if (!ligne) return { texte: `Effectif ${deNom(nom)} : pas encore calculé.` };
  if (!m) return { texte: `Effectif ${deNom(nom)} : ${rienAComparer(ligne.statut).court} — rien à comparer.` };
  if (!m.matchsSaison || !m.debut) return { texte: `Effectif ${deNom(nom)} : aucun match joué cette saison ; les arrivées et les départs se verront aux premières feuilles de match.` };
  const moy = pourcent(ligne.contMoyLigue) ?? 'inconnue';
  const a = m.arrivesQuiComptent ?? 0;
  const p = m.partis ?? 0;
  const r = m.pasRevus ?? 0;
  const part = pourcent(ligne.continuite);
  const debut = part ? `${part} des minutes de cette saison jouées par des joueurs déjà là la saison passée (moyenne du championnat : ${moy})` : 'continuité inconnue';
  return { texte: `Effectif ${deNom(nom)} : ${debut} ; ${a} ${pluriel(a, 'arrivé', 'arrivés')} et ${p} ${pluriel(p, 'départ', 'départs')} qui comptent, ${r} pas ${pluriel(r, 'revu', 'revus')} — détail sur la page de l’équipe.` };
}

/** La phrase de la force de l'effectif à blanc (à partir de 2 matchs), ou null. */
export function phraseDeLaForce(force) {
  if (!force || !fini(force.dOff) || !fini(force.dDef)) return null;
  return `Effectif utilisé (fiches des joueurs) : apport offensif ${butsSignes(force.dOff)} but par match par rapport à la saison passée, défensif ${butsSignes(force.dDef)}. Pas dans les chiffres : à votre décision.`;
}

const provenanceDeLaFiche = (debuts, fiche) => {
  const quand = fiche?.calculeLe ?? null;
  return { source: SOURCES_DEBUTS.magasin, releveLe: quand, action: 'calculé', quand: quand ? `calculé ${calculDit(quand)}` : null, fichier: FICHIERS.fiches, detail: fiche?.fige ? 'Fiche gelée avant le coup d’envoi : jamais réécrite.' : null };
};
const provenanceDuModele = (fiche, banc) => ({
  source: SOURCES_DEBUTS.modele,
  releveLe: fiche?.calculeLe ?? null,
  action: 'calculé',
  quand: fiche?.calculeLe ? `calculé ${calculDit(fiche.calculeLe)}${banc?.calculeLe ? ` · banc du ${jjmmaaaa(banc.calculeLe)}` : ''}` : null,
  detail: banc?.calculeLe ? `La note du banc d’essai, calculée le ${jjmmaaaa(banc.calculeLe)}.` : null
});
const provenanceDuClub = (ligne) => ({ source: SOURCES_DEBUTS.magasin, releveLe: ligne?.calculeLe ?? null, action: 'calculé', quand: ligne?.calculeLe ? `calculé ${calculDit(ligne.calculeLe)}` : null, fichier: FICHIERS.clubs });
const jourDeLaNuit = (debuts, ligne) => debuts?.nuit?.jourD ?? (typeof ligne?.calculeLe === 'string' ? ligne.calculeLe.slice(0, 10) : null);
const provenanceDesFiches = (force, jour, releveLe) => ({
  source: SOURCES_DEBUTS.fiches,
  releveLe,
  action: 'calculées',
  quand: `calculées la nuit du ${jjmm(jour) ?? '…'}`,
  detail: force?.fichesDu ? `Fiches des joueurs du ${jjmmaaaa(force.fichesDu)}.` : null
});

const CONCERNES = new Set(['debut', 'promu', 'relegue', 'nouveau', 'autre-changement', 'premier-au-magasin']);

/** Une ligne du bloc (un club), dans l'état `pret`. */
function ligneDuClubPret(camp, debuts, noms, ids, seuils) {
  const autre = camp === 'home' ? 'away' : 'home';
  const c = debuts.clubs?.[camp] ?? {};
  const nom = noms[camp];
  const ligne = c.ligne ?? null;
  const comp = competitionDite(c.league ?? debuts.league ?? debuts.fiche?.league) ?? 'son championnat';
  const club = { nom, teamId: ids[camp], league: c.league ?? debuts.league ?? null };
  const sortie = { camp, cas: 'vide', club, phrases: [], effectif: null, force: null, provenances: [] };
  if (c.id === null || c.id === undefined || c.valide === false) {
    sortie.cas = 'sans-identifiant';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : non reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).` });
    return sortie;
  }
  // Un match de coupe : pas de fiche (un second tournoi n'est pas un début de saison) ; le club par sa ligne de la nuit.
  if (debuts.coupe) {
    sortie.cas = 'coupe';
    const joues = Number.isSafeInteger(ligne?.rang) ? ligne.rang - 1 : null;
    const enChampionnat = ligne?.league && joues !== null ? ` En championnat (${competitionDite(ligne.league)}), ${joues} ${pluriel(joues, 'match joué', 'matchs joués')} cette saison.` : '';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : match de coupe — un second tournoi n’est pas un début de saison.${enChampionnat}` });
    if (ligne) sortie.provenances.push(provenanceDuClub(ligne));
    return sortie;
  }
  const rang = c.rang;
  const r = ordinal(rang) ?? '?e';
  const saison = c.saisonDite ?? debuts.fiche?.saisonDite ?? null;
  const nomsEffet = { sien: nom, adverse: noms[autre] };
  const adverse = { nom: noms[autre], teamId: ids[autre], league: debuts.clubs?.[autre]?.league ?? debuts.league ?? null };
  if (Number.isSafeInteger(rang) && rang > seuils.nPremieres) {
    sortie.cas = 'en-saison';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : ${r} match de championnat de la saison — plus un début de saison.` });
  } else if (c.statut === 'premier-au-magasin') {
    sortie.cas = 'premier-au-magasin';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : première saison ${deNom(comp)} au magasin — rien à comparer.` });
  } else if (c.statut === 'promu' || c.statut === 'relegue') {
    sortie.cas = c.statut;
    const avant = competitionDite(c.ligueAvant) ?? 'sa division d’avant';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : ${c.statut === 'promu' ? 'promu' : 'relégué'} ${deNom(avant)} — ${r} match en ${comp}. Le modèle de buts en essai le place à la moyenne ${deNom(comp)} et l’ajuste à mesure de ses matchs.` });
    const e = phraseDeLEffet('promus', camp, debuts, nomsEffet, adverse);
    sortie.phrases.push({ cle: 'effet', texte: e.texte, mesure: e.mesure, clubs: e.clubs });
  } else if (c.statut === 'nouveau') {
    sortie.cas = 'nouveau';
    const demarrage = seuils.demarrage ?? seuils.prior;
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : nouveau venu en ${comp} — sa division de la saison passée n’est pas suivie par CôteMaster ; ${r} match. Le modèle de buts en essai le place à la moyenne du championnat, total des buts ramené vers celui du championnat tant qu’il a moins de ${demarrage} matchs au magasin.` });
    const e = phraseDeLEffet('nouveaux', camp, debuts, nomsEffet, adverse);
    sortie.phrases.push({ cle: 'effet', texte: e.texte, mesure: e.mesure, clubs: e.clubs });
  } else if (c.statut === 'autre-changement') {
    sortie.cas = 'autre-changement';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : a changé de championnat (${competitionDite(c.ligueAvant) ?? 'un autre'} → ${comp}) ; ${r} match. Remis à la moyenne par le modèle de buts en essai.` });
  } else if (c.statut === 'debut') {
    sortie.cas = 'debut';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : ${r} match de championnat de la saison${saison ? ` ${saison}` : ''} (${comp}).` });
    sortie.phrases.push({ cle: 'force', texte: phraseDuRappel(c, debuts.banc) });
  } else {
    sortie.cas = 'vide';
    sortie.phrases.push({ cle: 'statut', texte: `${nom} : pas de rang de championnat pour ce match.` });
  }
  sortie.provenances.push(provenanceDeLaFiche(debuts, debuts.fiche));
  if (sortie.phrases.length > 1) sortie.provenances.push(provenanceDuModele(debuts.fiche, debuts.banc));
  if (CONCERNES.has(sortie.cas)) {
    sortie.effectif = ligneDeLEffectif(nom, ligne);
    if (ligne) sortie.provenances.push(provenanceDuClub(ligne));
    const texte = phraseDeLaForce(ligne?.force);
    if (texte) {
      sortie.force = { texte, aria: `Force de l’effectif ${deNom(nom)} : à blanc, pas dans les chiffres.`, limite: debuts.banc?.limites?.[3] ?? LIMITE_DU_ONZE };
      sortie.provenances.push(provenanceDesFiches(ligne.force, jourDeLaNuit(debuts, ligne), ligne.calculeLe ?? null));
    }
  }
  return sortie;
}

/** Une ligne du bloc dans un état vide : le club et la raison courte (le bloc garde toujours ses deux lignes). */
function ligneVide(camp, debuts, noms, ids, etat) {
  const nom = noms[camp];
  const c = debuts?.clubs?.[camp] ?? null;
  const club = { nom, teamId: ids[camp], league: debuts?.league ?? null };
  if (etat.cle === 'clubs-inconnus') {
    const inconnu = c && (c.id === null || c.id === undefined);
    const texte = inconnu ? `${nom} : non reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).` : `${nom} : pas de fiche — le match n’a pas ses deux identifiants FotMob.`;
    return { camp, cas: inconnu ? 'sans-identifiant' : 'vide', club: inconnu ? { ...club, teamId: null } : club, phrases: [{ cle: 'statut', texte }], effectif: null, force: null, provenances: [] };
  }
  return { camp, cas: 'vide', club, phrases: [{ cle: 'statut', texte: `${nom} : ${etat.court}.` }], effectif: null, force: null, provenances: [] };
}

/**
 * LE BLOC « Début de saison » : { etat, pastille, banc (la phrase sous « Effet mesuré », ou null), prudence, lignes (TOUJOURS 2),
 * grise (les deux clubs en saison), mentions, pied, tableau }.
 */
export function debutsDits({ debuts, analyse = null, match = null } = {}) {
  const etat = etatDesDebuts({ debuts, analyse, match });
  const noms = {
    home: debuts?.clubs?.home?.nom ?? match?.home ?? 'Le club qui reçoit',
    away: debuts?.clubs?.away?.nom ?? match?.away ?? 'Le visiteur'
  };
  const si = analyse?.result?.scoreInputs ?? null;
  const ids = {
    home: idFotMob(debuts?.clubs?.home?.id) ?? idFotMob(si?.home?.teamId),
    away: idFotMob(debuts?.clubs?.away?.id) ?? idFotMob(si?.away?.teamId)
  };
  const seuils = { ...SEUILS, ...(debuts?.seuils ?? {}) };
  const pastille = pastilleDesDebuts(etat.cle === 'pret' ? debuts : null);
  const banc = debuts?.banc ?? null;
  const lignes = ['home', 'away'].map((camp) => (etat.cle === 'pret' ? ligneDuClubPret(camp, debuts, noms, ids, seuils) : ligneVide(camp, debuts, noms, ids, etat)));
  const sousLaPastille = pastille.vert ? pastille.familles.map((f) => phraseDuBancDesDebuts(f, banc)).filter(Boolean) : [];
  const prudence = pastille.vert && pastille.familles.some((f) => banc?.familles?.[f]?.prudent) ? banc?.limites?.[0] ?? null : null;
  // Les deux clubs en saison : le bloc reste, une ligne grise le dit (et garde ses deux lignes).
  const grise =
    etat.cle === 'pret' && lignes.every((l) => l.cas === 'en-saison')
      ? `Pas un début de saison : ${noms.home} joue son ${ordinal(debuts.clubs.home.rang)} match de championnat de la saison, ${noms.away} son ${ordinal(debuts.clubs.away.rang)}.`
      : null;
  const pied = [];
  if (banc?.calculeLe) pied.push({ cle: 'banc', source: SOURCES_DEBUTS.banc, releveLe: banc.calculeLe, jourSeul: jjmmaaaa(banc.calculeLe), action: 'calculé', vieuxApresHeures: null });
  return {
    etat,
    pastille,
    banc: sousLaPastille.length ? sousLaPastille.join(' ') : null,
    prudence,
    lignes,
    grise,
    mentions: [...MENTIONS_FIXES],
    pied,
    tableau: tableauDuBancDesDebuts(banc)
  };
}

// ======================================================= la carte « Arrivées et départs » (page de l'équipe)

const RAISONS = Object.freeze({ blesse: 'blessé', suspendu: 'suspendu', 'en-selection': 'en sélection', indisponible: 'indisponible' });

/** L'état de la carte : `pret`, ou la note qui dit pourquoi elle est vide. */
export function etatDeLEffectif({ chargement = false, erreur = null, reponse = null, clubId = null, clubName = '' } = {}) {
  const nom = clubName || 'Ce club';
  const inconnu = { cle: 'clubs-inconnus', titre: 'Club non reconnu', texte: `${nom} n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).`, ton: 'is-warning', court: 'club non reconnu' };
  if (!idFotMob(clubId)) return inconnu;
  if (chargement && !reponse) return { cle: 'chargement', titre: 'Lecture de l’effectif…', texte: null, ton: 'is-info', court: 'lecture en cours' };
  // Un serveur d'avant l'étape 35 (la route manque : le client le dit « pas à jour ») : dit, jamais « illisible ».
  if (erreur && /pas à jour|Route introuvable/.test(String(erreur))) return { cle: 'serveur-a-relancer', titre: 'Arrivées et départs pas encore lus', texte: 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour voir les arrivées et départs.', ton: 'is-warning', court: 'serveur à relancer' };
  if (erreur) return { cle: 'illisible', titre: 'Arrivées et départs illisibles', texte: 'Arrivées et départs illisibles : la base n’a pas répondu. Les autres cartes ne sont pas touchées.', ton: 'is-danger', court: 'illisible' };
  if (!reponse) return { cle: 'chargement', titre: 'Lecture de l’effectif…', texte: null, ton: 'is-info', court: 'lecture en cours' };
  if (reponse.etat === 'clubs-inconnus') return inconnu;
  if (reponse.etat === 'illisible') {
    const pourquoi =
      { 'autre-version': 'la ligne vient d’une autre version de l’appli', 'ligne-illisible': 'la ligne rangée par la passe de nuit ne se lit pas', 'lecture-ratee': 'la lecture n’a pas abouti' }[reponse.raison] ?? 'la base n’a pas répondu';
    return { cle: 'illisible', titre: 'Arrivées et départs illisibles', texte: `Arrivées et départs illisibles : ${pourquoi}. Les autres cartes ne sont pas touchées.`, ton: 'is-danger', court: 'illisible' };
  }
  if (reponse.etat === 'pas-encore-calcule') {
    const jours = reponse.seuils?.joursDesClubs ?? 400;
    const texte =
      reponse.raison === 'absent-de-la-derniere-nuit'
        ? `Pas calculé pour ce club : la dernière passe de nuit (le ${jjmm(reponse.nuit?.jourD) ?? '…'}) ne prend que les clubs vus jouer au magasin dans les ${jours} derniers jours.`
        : 'Pas encore calculé : la prochaine passe de nuit le fera.';
    return { cle: 'pas-encore-calcule', titre: 'Pas encore calculé', texte, ton: 'is-info', court: 'pas encore calculé' };
  }
  if (reponse.sansSaisonDAvant) return { cle: 'sans-saison-d-avant', titre: 'Rien à comparer', texte: rienAComparer(reponse.statut).texte, ton: 'is-info', court: rienAComparer(reponse.statut).court };
  if (!reponse.mouvements?.matchsSaison) return { cle: 'avant-le-premier-match', titre: 'Pas encore de match', texte: 'Aucun match joué cette saison ; les arrivées et les départs se verront aux premières feuilles de match.', ton: 'is-info', court: 'aucun match joué cette saison' };
  return { cle: 'pret', titre: null, texte: null, ton: null, court: null };
}

const nomDuJoueur = (j) => j?.nom ?? `joueur n° ${j?.id ?? '?'}`;
const clubDit = (c, league = null) => (c ? { nom: c.nom ?? `club n° ${c.id}`, teamId: idFotMob(c.teamId ?? c.id), league: c.league ?? league } : null);

/** La situation du club dans sa saison, en mots (le résumé de la carte). */
function situationDuClub(r, seuils) {
  const joues = Number.isSafeInteger(r.rang) ? r.rang - 1 : null;
  if (joues !== null && joues >= seuils.nPremieres) return 'en saison';
  if (r.statut === 'promu') return `promu ${deNom(competitionDite(r.ligueAvant) ?? 'sa division d’avant')}`;
  if (r.statut === 'relegue') return `relégué ${deNom(competitionDite(r.ligueAvant) ?? 'sa division d’avant')}`;
  if (r.statut === 'nouveau') return 'nouveau venu';
  if (r.statut === 'premier-au-magasin') return 'première saison du championnat au magasin';
  if (r.statut === 'autre-changement') return `venu ${deNom(competitionDite(r.ligueAvant) ?? 'un autre championnat')}`;
  return 'en début de saison';
}

/** Le résumé de la carte (deux phrases), ou null hors de l'état `pret`. */
function resumeDeLaCarte(r, seuils) {
  const comp = competitionDite(r.club?.league) ?? 'son championnat';
  const saison = r.saison?.dite ? `Saison ${r.saison.dite}` : 'Cette saison';
  const joues = Number.isSafeInteger(r.rang) ? r.rang - 1 : null;
  const matchs = joues !== null ? `${joues} ${pluriel(joues, 'match', 'matchs')} de championnat ${pluriel(joues, 'joué', 'joués')}` : `${r.mouvements?.matchsSaison ?? 0} ${pluriel(r.mouvements?.matchsSaison ?? 0, 'match', 'matchs')} avec feuille`;
  const premiere = `${saison} en ${comp} : ${matchs} (${situationDuClub(r, seuils)}).`;
  const part = pourcent(r.continuite);
  const seconde = part ? ` ${part} des minutes de cette saison ont été jouées par des joueurs déjà là la saison passée (moyenne du championnat : ${pourcent(r.contMoyLigue) ?? 'inconnue'}).` : '';
  return `${premiere}${seconde}`;
}

/** « Cette saison » d'un joueur de la saison passée : { etat, avant, club, apres } (le club, s'il y en a un, entre les deux). */
function cetteSaison(x) {
  if (x.etat === 'joue') return { etat: 'joue', avant: `joue — ${nombre(x.minutes)} min (${pourcent(x.partSaison) ?? '?'})`, club: null, apres: null };
  // « parti » seulement vu jouer ailleurs, avec le club et la date ; sans eux, jamais « parti ».
  if (x.etat === 'parti' && x.club && x.date) return { etat: 'parti', avant: 'parti — vu jouer pour', club: clubDit(x.club), apres: `le ${jjmm(x.date)}` };
  if (x.etat === 'pas-revu' || x.etat === 'parti') {
    const raison = x.raison ? ` · ${RAISONS[x.raison] ?? 'indisponible'} (liste FotMob du ${jjmm(x.jourRaison) ?? '…'})` : '';
    return { etat: 'pas-revu', avant: `pas revu depuis la reprise${raison}`, club: null, apres: null };
  }
  return { etat: 'a-venir', avant: 'pas encore de match cette saison', club: null, apres: null };
}

/**
 * LA CARTE « Arrivées et départs » : { etat, resume, reference: { lignes, vide, somme, moyenne }, arrives: { … }, doubles,
 * sansIdentifiant, force, pied }. TOUJOURS ses deux tableaux (une ligne « aucun » s'il le faut).
 */
export function effectifDit({ chargement = false, erreur = null, reponse = null, clubId = null, clubName = '', league = null } = {}) {
  const etat = etatDeLEffectif({ chargement, erreur, reponse, clubId, clubName });
  const seuils = { ...SEUILS, ...(reponse?.seuils ?? {}) };
  const r = reponse ?? {};
  const club = { nom: clubName || r.club?.nom || 'Ce club', teamId: idFotMob(clubId) ?? idFotMob(r.club?.teamId), league: r.club?.league ?? league };
  const lisible = ['pret', 'sans-saison-d-avant', 'avant-le-premier-match'].includes(etat.cle);
  const ref = lisible ? r.reference ?? [] : [];
  const arr = lisible ? r.arrives ?? [] : [];
  const reference = ref.map((x) => ({
    id: x.id,
    nom: nomDuJoueur(x),
    pays: x.pays ?? null,
    nomPays: x.nomPays ?? null,
    poste: posteDit(x.poste),
    avant: `${nombre(x.minutesAvant ?? 0)} min (${pourcent(x.partAvant) ?? '?'})`,
    cetteSaison: cetteSaison(x)
  }));
  const arrives = arr.map((x) => ({
    id: x.id,
    nom: nomDuJoueur(x),
    pays: x.pays ?? null,
    nomPays: x.nomPays ?? null,
    poste: posteDit(x.poste),
    minutes: `${nombre(x.minutes ?? 0)} min (${pourcent(x.partSaison) ?? '?'})`,
    compte: x.compte === true,
    dOu: x.dOu?.club ? (x.dOu.recent ? { avant: 'vu la saison passée à', club: clubDit(x.dOu.club), apres: null } : { avant: 'vu plus tôt à', club: clubDit(x.dOu.club), apres: x.dOu.date ? `le ${jjmmaaaa(x.dOu.date)}` : null }) : { avant: 'pas vu dans un autre club au magasin', club: null, apres: null }
  }));
  const compte = (etatJ) => ref.filter((x) => x.etat === etatJ).length;
  const moyenne = (xs, f) => {
    const v = xs.map(f).filter(fini);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
  };
  const videReference = etat.cle === 'sans-saison-d-avant' ? etat.texte : lisible ? 'Aucun joueur n’a joué au moins 30 % des minutes qu’il pouvait jouer la saison passée.' : `Rien à montrer : ${etat.court}.`;
  const videArrives = etat.cle === 'avant-le-premier-match' ? 'Aucun match joué cette saison : les arrivées se verront aux premières feuilles de match.' : lisible ? 'Aucun joueur arrivé depuis la saison passée.' : `Rien à montrer : ${etat.court}.`;
  const nRef = ref.length;
  const morceaux = [`${compte('joue')} ${pluriel(compte('joue'), 'joue', 'jouent')}`, `${compte('parti')} ${pluriel(compte('parti'), 'parti', 'partis')}`, `${compte('pas-revu')} pas ${pluriel(compte('pas-revu'), 'revu', 'revus')}`];
  if (compte('a-venir')) morceaux.push(`${compte('a-venir')} sans match encore`);
  const mRef = moyenne(ref, (x) => x.partAvant);
  const mJoue = moyenne(ref.filter((x) => x.etat === 'joue'), (x) => x.partSaison);
  const nArr = arr.length;
  const nComptent = arr.filter((x) => x.compte).length;
  const mArr = moyenne(arr, (x) => x.partSaison);
  const doubles = (lisible ? r.doubles ?? [] : []).map((d) => ({
    pasRevu: { id: d.pasRevu?.id, nom: nomDuJoueur(d.pasRevu), pays: d.pasRevu?.pays ?? null, nomPays: d.pasRevu?.nomPays ?? null },
    arrive: { id: d.arrive?.id, nom: nomDuJoueur(d.arrive), pays: d.arrive?.pays ?? null, nomPays: d.arrive?.nomPays ?? null },
    texte: `${nomDuJoueur(d.pasRevu)} (pas revu) et ${nomDuJoueur(d.arrive)} (arrivé) ont la même date de naissance et le même poste : peut-être le même joueur sous deux identifiants FotMob. Ils ne sont pas réunis.`
  }));
  const force = lisible ? phraseDeLaForce(r.force) : null;
  const jour = r.nuit?.jourD ?? (typeof r.calculeLe === 'string' ? r.calculeLe.slice(0, 10) : null);
  const pied = [];
  if (lisible && r.calculeLe) pied.push({ cle: 'magasin', source: SOURCES_DEBUTS.magasin, releveLe: r.calculeLe, action: 'calculé', quand: `calculé ${calculDit(r.calculeLe)}`, fichier: FICHIERS.clubs });
  const listes = ref.filter((x) => x.etat === 'pas-revu' && x.raison && x.jourRaison).map((x) => x.jourRaison).sort();
  if (listes.length) pied.push({ cle: 'liste', source: SOURCES_DEBUTS.liste, releveLe: listes.at(-1), jourSeul: jjmmaaaa(listes.at(-1)), action: 'relevé', vieuxApresHeures: null });
  if (force) pied.push({ cle: 'fiches', ...provenanceDesFiches(r.force, jour, r.calculeLe ?? null) });
  return {
    etat,
    club,
    resume: lisible ? resumeDeLaCarte(r, seuils) : null,
    reference: {
      lignes: reference,
      vide: videReference,
      somme: `Σ ${nRef} ${pluriel(nRef, 'joueur', 'joueurs')} : ${morceaux.join(', ')}`,
      moyenne: fini(mRef) ? `⌀ ${pourcent(mRef)} des minutes qu’il pouvait jouer` : '⌀ sans objet',
      moyenneSaison: fini(mJoue) ? `⌀ ${pourcent(mJoue)} pour ceux qui jouent` : '⌀ sans objet'
    },
    arrives: {
      lignes: arrives,
      vide: videArrives,
      somme: `Σ ${nArr} ${pluriel(nArr, 'arrivé', 'arrivés')}, dont ${nComptent} qui ${pluriel(nComptent, 'compte', 'comptent')}`,
      moyenne: fini(mArr) ? `⌀ ${pourcent(mArr)} des minutes qu’il pouvait jouer` : '⌀ sans objet'
    },
    seuilDit: `au moins ${pourcent(seuils.quiCompte)} des minutes qu’il pouvait jouer (90 minutes × les matchs du club)`,
    seuilArrives: `en gras, ceux qui comptent : au moins ${pourcent(seuils.quiCompte)} des minutes qu’il pouvait jouer (90 minutes × les matchs du club) et au moins ${seuils.minMatchsArrivee} matchs du club`,
    doubles,
    sansIdentifiant: lisible && fini(r.sansIdentifiant) ? `Minutes sans identifiant FotMob : ${nombre(r.sansIdentifiant * 100, 1)} % (jamais comptées).` : null,
    force: force ? { texte: force, aria: `Force de l’effectif ${deNom(club.nom)} : à blanc, pas dans les chiffres.`, limite: r.banc?.limites?.[3] ?? LIMITE_DU_ONZE } : null,
    pied
  };
}
