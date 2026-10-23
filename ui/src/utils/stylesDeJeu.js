/**
 * stylesDeJeu.js — les MOTS des styles de jeu (étape 37 du plan, 22/10/2026) : le bloc « Style de jeu » de la page d'une
 * équipe (TeamStyleCard.vue) et le bloc « Duel de styles » de la page d'un match (StyleDuelCard.vue).
 * -----------------------------------------------------------------------
 * Les réponses viennent du serveur (GET /api/match-stats/team-style et /style-duel ; server/src/data/db/teamStyle.js),
 * calculées chaque nuit par l'actualisation, lues telles quelles : rien n'est recalculé ici, sinon des mots. PUR : ne
 * lit rien, n'importe que d'autres règles du même dossier (rejoué par server/test/stylesEcran.test.mjs).
 *
 * Règles d'écriture (ui/DESIGN.md) : français simple, virgule décimale, la vraie provenance et l'heure, un bloc
 * toujours affiché avec ses tableaux même vides, « explication seulement » tant que le banc n'a rien prouvé. Les styles
 * ne sont ni bons ni mauvais : jamais le vert ni le rouge (le vert est réservé à ce que le banc a PROUVÉ).
 * -----------------------------------------------------------------------
 */
import { parseLeagueLabel } from './leagueDisplay.js';

const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
/** « 2026-10-12 » → « 12/10/2026 ». */
export const jourDit = (jour) => (typeof jour === 'string' && /^\d{4}-\d{2}-\d{2}/.test(jour) ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : 'jour inconnu');
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 2026-09-01 » → « septembre 2026 ». */
export const moisDit = (jour) => (typeof jour === 'string' && /^\d{4}-\d{2}/.test(jour) ? `${MOIS[Number(jour.slice(5, 7)) - 1]} ${jour.slice(0, 4)}` : 'mois inconnu');
/** Le championnat dit par le nom que l'appli lui donne : « du championnat (EPL) ». */
export const duChampionnat = (league) => (league ? `du championnat (${parseLeagueLabel(league).name})` : 'de son championnat');
const accord = (n, un, plusieurs) => `${fr(n)} ${n > 1 ? plusieurs : un}`;

/** Les cinq étiquettes, comme le serveur les nomme (teamStyle.js : STYLES, SANS_STYLE). */
export const STYLES = Object.freeze([
  Object.freeze({ id: 'possession', libelle: 'possession', icone: 'activity' }),
  Object.freeze({ id: 'direct', libelle: 'jeu direct', icone: 'arrowRight' }),
  Object.freeze({ id: 'contre', libelle: 'contre-attaque', icone: 'bolt' }),
  Object.freeze({ id: 'cpa', libelle: 'coups de pied arrêtés', icone: 'flag' }),
  Object.freeze({ id: 'equilibre', libelle: 'sans style marqué', icone: 'minus' })
]);
export const libelleDe = (id) => STYLES.find((s) => s.id === id)?.libelle ?? 'style inconnu';
export const iconeDe = (id) => STYLES.find((s) => s.id === id)?.icone ?? 'info';

/**
 * LES HUIT CHIFFRES qui justifient un style, dans l'ordre du tableau. `cle` : la colonne de la ligne du serveur ;
 * `ligue` : la moyenne du championnat ; `z` : l'écart au championnat (en écarts-types) ; `carte` : mesuré par la carte
 * des tirs FotMob ; `pour` : les styles qu'il justifie.
 */
export const CHIFFRES = Object.freeze([
  Object.freeze({ id: 'poss', cle: 'poss', ligue: 'l_poss', z: 'z_poss', libelle: 'Possession du ballon', unite: 'pourcentage', pour: ['possession', 'direct', 'contre'] }),
  Object.freeze({ id: 'tiers', cle: 'tiers', ligue: 'l_tiers', z: 'z_tiers', libelle: 'Passes dans le dernier tiers, par match', unite: 'nombre', pour: ['possession'] }),
  Object.freeze({ id: 'longs', cle: 'longs', ligue: 'l_longs', z: 'z_longs', libelle: 'Part des longs ballons dans ses passes', unite: 'part', pour: ['direct'] }),
  Object.freeze({ id: 'centres', cle: 'centres', ligue: 'l_centres', z: 'z_centres', libelle: 'Centres, par match', unite: 'decimal', pour: [] }),
  Object.freeze({ id: 'contre', cle: 'contre', ligue: 'l_contre', z: 'z_contre', libelle: 'Part de ses tirs en contre-attaque', unite: 'part', carte: true, pour: ['contre'] }),
  Object.freeze({ id: 'cpa', cle: 'cpa', ligue: 'l_cpa', z: 'z_cpa', libelle: 'Part de ses tirs sur coup de pied arrêté', unite: 'part', carte: true, pour: ['cpa'] }),
  Object.freeze({ id: 'corner', cle: 'corner', ligue: 'l_corner', z: null, libelle: 'dont sur corner', unite: 'part', carte: true, pour: ['cpa'] }),
  Object.freeze({ id: 'coupFranc', cle: 'coup_franc', ligue: 'l_coup_franc', z: null, libelle: 'dont sur coup franc', unite: 'part', carte: true, pour: ['cpa'] })
]);

/** Une valeur dans son unité : « 61 % », « 12,4 % », « 143 », « 14,2 ». */
export function valeurDite(unite, v) {
  if (!fini(v)) return null;
  if (unite === 'pourcentage') return `${fr(v)} %`;
  if (unite === 'part') return `${fr(100 * v, 1)} %`;
  if (unite === 'decimal') return fr(v, 1);
  return fr(Math.round(v));
}

/** Un écart au championnat (z), en mots : jamais un chiffre d'écart-type à l'écran. */
export function ecartDit(z) {
  if (!fini(z)) return { texte: '—', ton: '' };
  if (z >= 1.5) return { texte: 'très au-dessus', ton: 'is-fort' };
  if (z >= 0.75) return { texte: 'au-dessus', ton: 'is-fort' };
  if (z > -0.75) return { texte: 'dans la moyenne', ton: '' };
  if (z > -1.5) return { texte: 'en dessous', ton: 'is-faible' };
  return { texte: 'très en dessous', ton: 'is-faible' };
}

const SERVEUR_PAS_A_JOUR = /^Le serveur n.est pas à jour/;

/** L'état du bloc de la page d'une équipe : chargement, club inconnu, erreur, jamais calculé, pas de style, prêt. */
export function etatDuBloc({ chargement = false, erreur = null, reponse = null, clubId = null } = {}) {
  if (!clubId) return { cle: 'sans-club', ton: 'is-warning', titre: 'Club non reconnu', texte: 'La page n’a pas trouvé l’identifiant FotMob de ce club : sans lui, son style ne peut pas être lu. Le tableau ci-dessous reste affiché, sans valeurs.' };
  if (erreur) {
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: `${erreur} Le tableau ci-dessous reste affiché, sans valeurs.` }
      : { cle: 'erreur', ton: 'is-danger', titre: 'Style de jeu illisible', texte: `${erreur} Le tableau ci-dessous reste affiché, sans valeurs.` };
  }
  if (chargement || !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture du style de jeu…' };
  if (reponse.etat?.absent) return { cle: 'jamais', ton: 'is-info', titre: 'Pas encore calculé', texte: 'Les styles de jeu n’ont pas encore été calculés : la prochaine passe de nuit de l’actualisation le fera (quelques secondes). Le tableau ci-dessous reste affiché, sans valeurs.' };
  if (!reponse.style) {
    return { cle: 'sans-style', ton: 'is-info', titre: 'Pas de style pour ce club', texte: 'Il faut au moins 6 matchs de championnat relevés dans les 400 derniers jours, dans un championnat d’au moins 6 clubs suivis. Le tableau ci-dessous reste affiché, sans valeurs.' };
  }
  return { cle: 'pret', ton: '', titre: null, texte: null, aRefaire: reponse.etat?.aJour === false };
}

/** La vraie provenance du bloc : le fournisseur, ce qui est lu, l'heure du calcul, le fichier de la base. */
export function provenanceDuBloc(reponse) {
  const e = reponse?.etat ?? {};
  return {
    source: 'FotMob (magasin) · styles de jeu',
    releveLe: e.calculeLe ?? null,
    action: 'calculé',
    fichier: reponse?.base ?? null,
    detail: e.jusqua
      ? `Statistiques d’équipe, carte des tirs et compositions FotMob des matchs joués jusqu’au ${jourDit(e.jusqua)}. Calculé chaque nuit par l’actualisation ; seules les rencontres nouvelles ou changées sont relues.`
      : 'Calculé chaque nuit par l’actualisation, à partir des statistiques d’équipe, de la carte des tirs et des compositions FotMob.'
  };
}

/** Les lignes du tableau des chiffres : chacune avec sa valeur, celle du championnat et l'écart — ou pourquoi elle manque. */
export function lignesDesChiffres(style, cle = 'pret') {
  return CHIFFRES.map((c) => {
    const base = { id: c.id, libelle: c.libelle, justifie: Boolean(style && c.pour.includes(style.style)) };
    if (!style) {
      const t = cle === 'pret' || cle === 'sans-style' ? 'pas assez de matchs' : 'pas encore calculé';
      return { ...base, club: t, ligue: '—', ecart: { texte: '—', ton: '' }, vide: true };
    }
    const v = style[c.cle];
    if (!fini(v)) {
      const pourquoi = c.carte ? 'non mesuré (carte des tirs absente)' : 'non publié';
      return { ...base, club: pourquoi, ligue: valeurDite(c.unite, style[c.ligue]) ?? '—', ecart: { texte: '—', ton: '' }, vide: true };
    }
    return { ...base, club: valeurDite(c.unite, v), ligue: valeurDite(c.unite, style[c.ligue]) ?? '—', ecart: c.z ? ecartDit(style[c.z]) : { texte: '—', ton: '' }, vide: false };
  });
}

/** Le pied du tableau des chiffres : Σ (chiffres mesurés, matchs lus) et ⌀ (ce que sont les valeurs). */
export function piedDesChiffres(style, lignes) {
  const mesures = lignes.filter((l) => !l.vide).length;
  return {
    sigma: `${fr(mesures)} sur ${fr(lignes.length)} mesurés${style ? ` · ${accord(style.n, 'match', 'matchs')} lus, dont ${fr(style.n_carte ?? 0)} avec la carte des tirs` : ''}`,
    moyenne: style ? `moyennes par match sur ses ${accord(style.n, 'dernier match', 'derniers matchs')} de championnat` : 'aucune valeur lue'
  };
}

/** La phrase qui JUSTIFIE l'étiquette, avec les chiffres qui la portent (ceux du club, puis ceux du championnat). */
export function pourquoiCeStyle(style) {
  if (!style) return null;
  const du = duChampionnat(style.league);
  const morceau = (id, nom) => {
    const c = CHIFFRES.find((x) => x.id === id);
    const v = valeurDite(c.unite, style[c.cle]);
    const l = valeurDite(c.unite, style[c.ligue]);
    return `${nom} ${v ?? 'non mesuré'}${l ? ` (moyenne ${du} : ${l})` : ''}`;
  };
  switch (style.style) {
    case 'possession':
      return `Il garde le ballon : ${morceau('poss', 'possession')}, ${morceau('tiers', 'passes dans le dernier tiers par match')}.`;
    case 'direct':
      return `Il joue long : ${morceau('longs', 'part des longs ballons')}, ${morceau('poss', 'possession')}.`;
    case 'contre':
      return `Il frappe en contre : ${morceau('contre', 'part de ses tirs en contre-attaque')}, ${morceau('poss', 'possession')}.`;
    case 'cpa':
      return `Il vit des coups de pied arrêtés : ${morceau('cpa', 'part de ses tirs sur coup de pied arrêté')} — corner ${valeurDite('part', style.corner) ?? 'non mesuré'}, coup franc ${valeurDite('part', style.coup_franc) ?? 'non mesuré'}.`;
    default:
      return `Aucun de ses chiffres ne s’écarte assez de la moyenne ${du} pour lui donner une étiquette (${morceau('poss', 'possession')}).`;
  }
}

/** Les mises en garde du style : provisoire, début de saison, nouvel entraîneur, contre-attaque et coups de pied arrêtés non mesurés. */
export function prudences(style, reglages = {}) {
  if (!style) return [];
  const out = [];
  const etabli = reglages.etabli ?? 12;
  const debut = reglages.debutSaison ?? 6;
  if (style.provisoire) out.push({ cle: 'provisoire', texte: `Style provisoire : seulement ${accord(style.n, 'match', 'matchs')} de championnat relevés (${fr(etabli)} pour un style établi).` });
  if (Number.isFinite(style.n_saison) && style.n_saison < debut && style.n > style.n_saison) out.push({ cle: 'debut-saison', texte: `Début de saison : ${accord(style.n_saison, 'match joué', 'matchs joués')} depuis la trêve, le style est surtout lu sur la saison passée.` });
  if (style.entraineur && Number.isFinite(style.sous_lui) && style.sous_lui < Math.min(8, style.n / 2)) out.push({ cle: 'nouvel-entraineur', texte: `Nouvel entraîneur : il n’a dirigé que ${fr(style.sous_lui)} des ${fr(style.n)} matchs lus ; le style peut changer avec lui.` });
  if (!fini(style.contre)) out.push({ cle: 'sans-carte', texte: 'Contre-attaque et coups de pied arrêtés non mesurés : FotMob ne publie pas assez de cartes des tirs pour ce club (au moins 6 matchs couverts).' });
  return out;
}

/** L'historique des 13 derniers mois : une ligne par 1er du mois, et son pied (Σ mois lus, style le plus fréquent ; ⌀ matchs). */
export function historiqueDit(historique = []) {
  const lignes = historique.map((h) => ({ jour: h.jour, mois: moisDit(h.jour), style: h.style, libelle: libelleDe(h.style), provisoire: Boolean(h.provisoire), n: h.n }));
  const comptes = new Map();
  for (const l of lignes) comptes.set(l.style, (comptes.get(l.style) ?? 0) + 1);
  const [plusFrequent, nFois] = [...comptes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  let changements = 0;
  for (let i = 1; i < lignes.length; i++) if (lignes[i].style !== lignes[i - 1].style) changements++;
  return {
    lignes,
    sigma: lignes.length ? `${accord(lignes.length, 'mois', 'mois')} · ${libelleDe(plusFrequent)} ${fr(nFois)} fois · ${accord(changements, 'changement', 'changements')}` : 'aucun mois lu',
    moyenne: lignes.length ? `${fr(lignes.reduce((s, l) => s + (l.n ?? 0), 0) / lignes.length, 1)} matchs lus par mois` : '—',
    phrase: !lignes.length
      ? 'Pas encore d’historique : le style est noté au 1er de chaque mois.'
      : changements === 0
        ? `Le même style depuis ${accord(lignes.length, 'mois', 'mois')} : ${libelleDe(lignes.at(-1).style)}.`
        : `${accord(changements, 'changement', 'changements')} de style en ${accord(lignes.length, 'mois', 'mois')}.`
  };
}

/** L'entraîneur, en mots : son nom, depuis quand, son style et ses clubs. */
export function entraineurDit(reponse) {
  const e = reponse?.entraineur ?? null;
  const sans = reponse?.entraineurSansStyle ?? null;
  if (!e && !sans) return { connu: false, nom: null, texte: 'Entraîneur inconnu : aucune composition relevée ne le nomme.', style: null, clubs: [] };
  const nom = e?.nom ?? sans?.nom ?? 'inconnu';
  const depuis = (e ?? sans)?.depuis;
  const avecLeClub = (e ?? sans)?.matchsAvecLeClub;
  const depuisTexte = depuis ? `aux commandes depuis le ${jourDit(depuis)}${Number.isFinite(avecLeClub) ? ` (${accord(avecLeClub, 'match de championnat relevé', 'matchs de championnat relevés')} avec ce club)` : ''}` : 'date d’arrivée inconnue';
  if (!e) return { connu: true, nom, texte: `${nom}, ${depuisTexte}. Pas encore assez de matchs dirigés (6 de championnat) pour lui donner un style.`, style: null, clubs: [], homonyme: false };
  const clubs = (e.clubs ?? []).map((c) => ({ club: c.club, nom: c.nom ?? `club n° ${c.club}`, teamId: Number.isFinite(c.club) ? `fotmob-${c.club}` : null, league: c.league, n: c.n, texte: `${accord(c.n, 'match', 'matchs')}, du ${jourDit(c.de)} au ${jourDit(c.a)}` }));
  return {
    connu: true,
    nom,
    style: e.style,
    libelle: libelleDe(e.style),
    provisoire: Boolean(e.provisoire),
    homonyme: Boolean(e.homonyme),
    clubs,
    texte: `${nom}, ${depuisTexte}. Son style sur ses ${accord(e.n, 'dernier match', 'derniers matchs')} de championnat${clubs.length > 1 ? ', tous clubs confondus' : ''} : ${libelleDe(e.style)}${e.provisoire ? ' (provisoire)' : ''}.`,
    note: e.homonyme ? 'Un autre entraîneur porte le même nom dans le magasin : il est suivi club par club, pour ne pas mélanger les deux.' : null
  };
}

// ------------------------------------------------------------ le duel (page du match)

/** Ce qu'un duel de deux styles laisse attendre, en une phrase — une EXPLICATION, jamais un chiffre. */
export function scenarioDuDuel(dom, ext) {
  const paire = new Set([dom, ext]);
  if (dom === 'equilibre' || ext === 'equilibre') return dom === ext ? 'Aucune des deux équipes n’a de style marqué : pas de duel particulier à lire.' : 'Une seule équipe a un style marqué : le match devrait se jouer sur son terrain de prédilection, sans duel particulier.';
  if (dom === ext) {
    if (dom === 'possession') return 'Deux équipes qui veulent le ballon : celle qui le perdra devra courir après.';
    if (dom === 'direct') return 'Deux équipes qui jouent long : beaucoup de duels aériens et de seconds ballons.';
    if (dom === 'contre') return 'Deux équipes qui attendent l’autre pour partir vite : peu d’espaces, un match souvent fermé.';
    return 'Deux équipes dangereuses sur coups de pied arrêtés : chaque corner et chaque coup franc comptera.';
  }
  if (paire.has('possession') && paire.has('contre')) return 'L’une aura le ballon, l’autre attendra de le récupérer pour partir en contre : les pertes de balle compteront.';
  if (paire.has('possession') && paire.has('direct')) return 'L’une construit au sol, l’autre saute le milieu : le match se jouera sur les seconds ballons.';
  if (paire.has('direct') && paire.has('contre')) return 'Deux équipes qui laissent volontiers le ballon : le match risque d’être haché, fait de transitions.';
  if (paire.has('cpa')) return 'Les coups de pied arrêtés peuvent peser : l’une des deux en tire une grande part de ses occasions.';
  return 'Deux façons de jouer différentes : à lire avec le reste de la page.';
}

/** L'état du bloc de la page d'un match. */
export function etatDuDuel({ chargement = false, erreur = null, reponse = null } = {}) {
  if (erreur) {
    return SERVEUR_PAS_A_JOUR.test(erreur)
      ? { cle: 'pas-a-jour-serveur', ton: 'is-warning', titre: 'Serveur à relancer', texte: erreur }
      : /^Club inconnu du magasin/.test(erreur)
        ? { cle: 'club-inconnu', ton: 'is-info', titre: 'Club inconnu du magasin', texte: `${erreur} Sans ses matchs relevés, pas de style à lire.` }
        : { cle: 'erreur', ton: 'is-danger', titre: 'Duel de styles illisible', texte: erreur };
  }
  if (chargement || !reponse) return { cle: 'chargement', ton: '', titre: 'Lecture en cours', texte: 'Lecture des styles des deux équipes…' };
  if (reponse.etat?.absent) return { cle: 'jamais', ton: 'is-info', titre: 'Pas encore calculé', texte: 'Les styles de jeu n’ont pas encore été calculés : la prochaine passe de nuit de l’actualisation le fera.' };
  if (!reponse.home || !reponse.away) return { cle: 'incomplet', ton: 'is-info', titre: 'Style inconnu pour une équipe', texte: 'Une des deux équipes n’a pas assez de matchs de championnat relevés (6 au moins) : pas de duel à lire.' };
  return { cle: 'pret', ton: '', titre: null, texte: null };
}

/**
 * Le duel en mots : son titre (« possession contre contre-attaque »), le scénario, la MENTION (« Explication
 * seulement » ou « Effet mesuré ») et ce que le banc en dit.
 */
export function duelDit(reponse) {
  const banc = reponse?.banc ?? {};
  const global = banc.global ?? {};
  const matchsJuges = Math.max(global.un2?.matchs ?? 0, global.pm?.matchs ?? 0);
  const bancTexte = banc.valable
    ? `Au banc d’essai (${fr(matchsJuges)} matchs de 2025-2026 jugés face à la cote de clôture, ${fr(banc.K ?? 0)} essais comptés, seuil sévère), ${banc.casesRetenues ? `${accord(banc.casesRetenues, 'duel surprend', 'duels surprennent')} le marché` : 'aucun duel de styles ne surprend le marché'} : ${fr(banc.casesJugees ?? 0)} duels jugés « pas prouvé », ${fr(banc.casesTropPetites ?? 0)} trop rares pour être jugés.`
    : 'Pas encore mesuré au banc d’essai avec les réglages en service : tout duel est une explication.';
  const d = reponse?.duel ?? null;
  if (!d) return { titre: null, scenario: null, mention: 'Explication seulement', mesure: false, bancTexte, effetTexte: null };
  const titre = `${libelleDe(d.dom)} contre ${libelleDe(d.ext)}`;
  if (d.mesure) {
    const pts = fini(d.mesure.effet) ? `${d.mesure.effet >= 0 ? '+' : '−'}${fr(Math.abs(100 * d.mesure.effet), 1)} point${Math.abs(100 * d.mesure.effet) >= 2 ? 's' : ''}` : '?';
    const effetTexte =
      d.mesure.marche === 'un2'
        ? `Effet mesuré : ${pts} de chance de victoire du club qui reçoit par rapport à la cote, sur ${fr(d.mesure.matchs)} matchs vérifiés.`
        : `Effet mesuré : ${pts} de chance de « plus de 2,5 buts » par rapport à la cote, sur ${fr(d.mesure.matchs)} matchs vérifiés.`;
    return { titre, scenario: scenarioDuDuel(d.dom, d.ext), mention: 'Effet mesuré', mesure: true, bancTexte, effetTexte };
  }
  return { titre, scenario: scenarioDuDuel(d.dom, d.ext), mention: 'Explication seulement', mesure: false, bancTexte, effetTexte: null };
}

/** La provenance du bloc du duel. */
export function provenanceDuDuel(reponse) {
  const e = reponse?.etat ?? {};
  return {
    source: 'FotMob (magasin) · styles de jeu',
    releveLe: e.calculeLe ?? null,
    action: 'calculé',
    fichier: reponse?.base ?? null,
    detail: e.jusqua ? `Matchs joués jusqu’au ${jourDit(e.jusqua)}. Duels mesurés au banc d’essai sur la cote de clôture football-data.` : 'Calculé chaque nuit par l’actualisation.'
  };
}
