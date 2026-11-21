/**
 * Étape 46 du plan (« Prédiction en direct »), lot 1, partie D — L'ÉCRAN DU DIRECT (ui/src/utils/direct.js, les cinq
 * composants de ui/src/components/direct/, la page /direct, le menu, la puce « Direct » de MatchCard, le compte « N en
 * direct » de la page Matchs, l'encart de la page du match). Les réponses rendues sont celles du VRAI serveur
 * (data/direct/lectureDuDirect.js) sur un direct FABRIQUÉ (aides/directFabrique.mjs : base SQLite en mémoire, aucune
 * donnée réelle, aucun réseau) ; les notes du banc sont fabriquées (aucune n'existe avant la partie C) :
 *   node --test test/directEcran.test.mjs        (depuis server/)
 *
 *   T-U1  les phrases (§ 1.2 ; R3, R5, R6, R8, R9, R10, R11), exactes, sur la réponse qui les produit ;
 *   T-U2  un logo par identifiant FotMob sur chaque ligne qui nomme une équipe (cartes, notes, barres, marchés,
 *         référence, légende de la courbe, terminés) ;
 *   T-U3  jamais vert (ni --cm-accent, ni --cm-section, ni ProbabilityRing, ni ValueBadge) ; barres en --cm-info ; la
 *         référence en gris ; le rouge « en direct » avec son mot et son point ;
 *   T-U4  la structure complète dans les 11 états sans chiffre (mêmes blocs, `data-raison`) ;
 *   T-U5  la provenance de chaque chiffre (état, rouges, avant-match, calcul, référence) ; l'ambre au-delà des délais ;
 *   T-U6  note nulle : AUCUN pourcentage, « pas encore jugé » ; notes fabriquées : prouvé, pas prouvé (gris), faits seuls,
 *         paire écartée, à surveiller, tranche et famille non montrées ; les deux variantes affichées (P2) ;
 *   T-U6 (écrans 4, 13/11/2026) la courbe lit la note point par point (un point d'une tranche non montrée sans 1N2) ;
 *         sans calcul lu, la courbe reste à blanc ;
 *   T-U7  les seules familles du direct (aucun corner, tir ni carton), « déjà acquis », « plus de 99 % », jamais
 *         « 100 % » ni « 0 % » ;
 *   T-U8  375 px : une colonne, aucune largeur fixe au-delà de 343 px ;
 *   T-U9  l'encart de la page du match : fenêtre −10 min / +4 h, monté en rejeu, plus aucun appel payant ;
 *   T-U10 les appels : le tableau lit GET /api/direct, le détail GET /api/direct/match, rien d'autre ;
 *   T-U11 le menu : 9 entrées, « Direct » sous « Matchs », active seule sur /direct ; direct.js est une règle pure ;
 *   P6 bis toutes les cartes, cliquables, jamais plafonnées ; l'encart cliquable vers Direct, positionné sur son match ;
 *         la puce « Direct » cliquable de MatchCard ; le compte « N en direct » de la page Matchs ;
 *   R28   l'écran en rejeu : le bandeau ambre, l'instant gardé de lien en lien.
 *   Correctifs D2 (12/11/2026) : 1 — monté dans un onglet caché, le direct lit dès que l'onglet redevient visible (et au
 *         tic tant qu'il n'a ni réponse ni erreur) ; 2 b — l'ensemble des matchs en cours, partagé (GET /api/direct/en-cours,
 *         une lecture par minute, ?instant= de l'adresse) ; 2 c — la puce de MatchCard suit cet ensemble (paire
 *         d'identifiants FotMob et jour), le clic ouvre /direct?match= ; 2 d — « N en direct » en est le compte ; 2 e —
 *         l'encart lit par l'identifiant FotMob du match ; 3 — le lien « Page du match » des cartes ; 4 — la provenance de
 *         l'en-tête en rejeu (la page du match elle-même : pageMatchDecisionEcran.test.mjs).
 *   Correctifs D3 (12/11/2026) : 2 — sous chaque match terminé, le lien « Page du match terminé » (/match/<clé> : la fiche
 *         du magasin trouvée par le serveur par les identifiants FotMob et le jour), l'instant d'un rejeu gardé ; sans fiche,
 *         pas de lien et la phrase « pas encore rangée » ; 3 — « N en direct » de la page Matchs (la page rendue) garde
 *         l'instant d'un rejeu, comme la puce. Le point 1 (l'index du calendrier sans bloc) : directLecture.test.mjs.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as attendre } from 'node:timers/promises';
import * as F from './aides/directFabrique.mjs';
import * as L from '../src/data/direct/lectureDuDirect.js';
import { UI, imp, ouvrirLeRendu, optionsDuRendu as options, texteDe, blocDe, tableauDe, reglesPures } from './aides/rendu.mjs';

const W = await imp(path.join(UI, 'src', 'utils', 'direct.js'));
const MIN = 60_000;
const H = 3_600_000;
const T = Date.parse('2026-11-14T20:34:40.000Z'); // 21 h 34 à Paris
const iso = (t) => new Date(t).toISOString();
const lbl = (m) => `${m}${String.fromCharCode(0x2019)}`;
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const COMPOSANTS = ['DirectBoard', 'DirectMatchCard', 'DirectMarkets', 'DirectCurve', 'DirectEncart'];
const sourceDe = (nom) => lireUi('components', 'direct', `${nom}.vue`);

// ------------------------------------------------------------ le direct fabriqué

function liste(id, homeId, awayId, kickoff, o) {
  return F.listeEnJeu({ id, homeId, awayId, kickoff, homeName: o.homeName, awayName: o.awayName, label: o.label ?? lbl(o.minute), maxTime: o.maxTime ?? (o.minute > 45 ? 90 : 45), h: o.h ?? 0, a: o.a ?? 0, rh: o.rh ?? null, ra: o.ra ?? null, halfTime: o.halfTime ?? false });
}
/** Un match suivi : `lectures` = [{ dt (ms avant T), …champs de la liste, detail }] (défaut : une lecture 20 s avant T). */
function suivi(id, homeId, awayId, o) {
  const kickoff = o.coup ?? iso(T - (o.minute > 45 ? o.minute + 15 : o.minute) * MIN);
  const lectures = (o.lectures ?? [{ dt: 20_000 }]).map((l) => ({ t: T - l.dt, liste: liste(id, homeId, awayId, kickoff, { ...o, ...l }), detail: l.detail ?? null }));
  return F.matchSuivi({ id, homeId, awayId, kickoff, homeName: o.homeName, awayName: o.awayName, rang: o.rang ?? 3, lectures });
}

/** Le scénario principal : 5101 (34e, 1-0 vu à 21 h 34, rouges pas encore lus, cotes ESPN d'avant le but), 5102 (80e,
 *  0-1, un rouge lu au club qui reçoit), 5103 (mi-temps, sans ligne d'avant-match). */
const PRINCIPAL = () => [
  suivi(5101, 'fotmob-1201', 'fotmob-1202', { minute: 34, homeName: 'Ville A', awayName: 'Ville B', lectures: [{ dt: 10 * MIN, label: lbl(24), h: 0 }, { dt: 20_000, h: 1 }] }),
  suivi(5102, 'fotmob-1203', 'fotmob-1204', { minute: 80, a: 1, homeName: 'Ville C', awayName: 'Ville D', lectures: [{ dt: 20_000, detail: { liveLabel: lbl(80), homeGoals: 0, awayGoals: 1, homeRedCards: 1, awayRedCards: 0 } }] }),
  suivi(5103, 'fotmob-1205', 'fotmob-1206', { minute: 45, label: 'HT', halfTime: true, homeName: 'Ville E', awayName: 'Ville F' })
];
const COTES_5101 = (db) =>
  F.poserDesCotes(db, { homeId: 'fotmob-1201', awayId: 'fotmob-1202', date: '2026-11-14', live: { home: [{ price: 1.9, releveAt: iso(T - 5 * MIN) }], draw: [{ price: 3.4, releveAt: iso(T - 5 * MIN) }], away: [{ price: 4.2, releveAt: iso(T - 5 * MIN) }] } });

/** Une note du banc FABRIQUÉE (format de banc-regles § 10) ; `o` la modifie. */
const note = (o = {}) => ({
  format: 1,
  modele: 'ancien-81',
  version: 5,
  role: 'service',
  candidateHash: null,
  variante: 'direct-ancre',
  regard: 'surete',
  verdict: 'prouve',
  passeLe: '2026-11-22',
  modules: {},
  regles: { sha1: 'essai' },
  export: { sha1: 'essai', matchs: 812, de: '2026-09-24', a: '2026-11-20' },
  k: 8,
  n: 812,
  t: 2.4,
  jugements: [],
  tranchesNonMontrees: ['76-90'],
  famillesNonMontrees: ['scoreExact'],
  paires: { jugees: 24, ecartees: [{ unite: 'totalGoals.2.5', tranche: '31-45', annonce: 0.61, realise: 0.52, n: 40 }], aSurveiller: [{ unite: 'bothTeamsScore', tranche: '31-45' }] },
  rouges: { auBanc: 'a-la-minute', retardMedianCreneaux: 0, partSansRouge: 0.1 },
  additionnelSurP5: { ecartMax: 0.01 },
  phrase: 'Note fabriquée pour les tests de l’écran.',
  ...o
});

/** Les vraies réponses du serveur : { tableau, details[id], base }. */
async function construire({ matchs = PRINCIPAL(), note: n = null, varianteAffichee = null, sans = ['fotmob-1205'], lignes = {}, cotes = COTES_5101, extra = {}, em = null } = {}) {
  L.viderLesTables();
  const db = F.baseDuDirect();
  if (cotes) cotes(db);
  const ligneDe = (q) =>
    sans.includes(q.homeId)
      ? { trouve: false, raison: 'aucune-ligne', cle: null, nuit: null }
      : F.ligneFabriquee({ ...q, oddsSource: 'cotes gratuites : espn', oddsAt: iso(T - 9 * H), ...(lignes[q.homeId] ?? {}) });
  const etat = em ?? F.etatMinute({ maintenant: T, matchs });
  const base = { maintenant: T, database: db, note: n, ...F.sourcesActives(etat), ligneDe, ...(varianteAffichee ? { varianteAffichee } : {}), ...extra };
  const tableau = await L.tableauDuDirect(base);
  const details = {};
  for (const e of tableau.matchs) details[e.fotmobId] = await L.matchDuDirect({ ...base, id: e.fotmobId });
  return { tableau, details, base };
}
const reponses = (s, plus = []) => [
  ...plus,
  [/\/api\/direct\/match\?/, (u) => ({ code: 200, corps: s.details[new URL(u).searchParams.get('id')] })],
  [/\/api\/direct(\?|$)/, { code: 200, corps: s.tableau }]
];
const carteDe = (html, id) => {
  const i = html.indexOf(`data-match="${id}"`);
  assert.ok(i >= 0, `la carte ${id}`);
  const debut = html.lastIndexOf('<article', i);
  return html.slice(debut, html.indexOf('</article>', i) + 10);
};
const crests = (html) => [...html.matchAll(/<span class="crest"[^>]*>([\s\S]*?)<\/span>/g)].map((m) => m[1]);
/** Toutes les lignes d'un tableau (un `<tbody>` par famille de marchés). */
const lignesDe = (table) => table.split(/<tr\b/).slice(1).map((x) => `<tr${x.split('</tr>')[0]}</tr>`);
/** Le rendu sans les attributs des styles à portée (data-v-…). */
const net = (rendu) => ({ ...rendu, html: rendu.html.replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '') });

let r;
let Board;
let Encart;
let Carte;
before(async () => {
  if (options.skip) return;
  r = await ouvrirLeRendu({ cibles: /components[\\/]direct[\\/]|views[\\/]LiveView\.vue$/, heure: iso(T), routes: ['/direct'] });
  Board = (await r.charger('/src/components/direct/DirectBoard.vue')).default;
  Encart = (await r.charger('/src/components/direct/DirectEncart.vue')).default;
  Carte = (await r.charger('/src/components/matches/MatchCard.vue')).default;
});
after(async () => {
  if (r) await r.fermer();
});
/** Rend la page Direct à l'adresse `adresse` ; vérifie qu'aucun appel n'est sorti des deux routes du direct. */
async function rendreLaPage(s, adresse = '/direct', plus = []) {
  await r.routeur.push(adresse);
  const rendu = net(await r.rendre(Board, {}, reponses(s, plus)));
  assert.deepEqual(r.interdits, [], 'aucun appel hors des routes du direct');
  return rendu;
}

// ------------------------------------------------------------ T-U1

test('T-U1 les phrases du direct (R3, R5, R6, R8, R9, R10, R11) : exactes, et sur la réponse du serveur qui les produit', options, async () => {
  // R3 point 1 : l'âge de l'état, à la seconde près, ambre après 150 s, gris et « périmé » après 5 min.
  assert.deepEqual([W.ageDit(20), W.ageDit(100), W.ageDit(720), W.ageDit(7500)], ['20 s', '1 min 40', '12 min', '2 h 05']);
  assert.deepEqual(W.ageDeLEtatDit({ ageS: 100, ambre: false, perime: false }), { ton: 'muted', texte: 'état relevé il y a 1 min 40', perime: false });
  assert.equal(W.ageDeLEtatDit({ ageS: 160, ambre: true, perime: false }).ton, 'warning');
  assert.deepEqual(W.ageDeLEtatDit({ ageS: 400, ambre: true, perime: true }), { ton: 'muted', texte: 'état relevé il y a 6 min 40 — périmé', perime: true });
  // R3 point 3 : la phrase fixe du retard.
  assert.equal(
    W.PHRASE_DU_RETARD,
    "Le score et la minute arrivent avec une à deux minutes de retard, les cartons rouges avec jusqu'à cinq ; une cote en direct, elle, bouge en quelques secondes. Ne comparez pas ces chiffres à une cote en direct."
  );
  // R5 : le score de la 90e, affirmé seulement quand il est sûr.
  assert.equal(W.score90Dit({ score90: { home: 1, away: 1, sur: true, vuLe: iso(T - 30 * MIN) } }), 'les paris sur 90 minutes sont réglés sur le score de la 90e : 1-1 (vu à 21 h 04)');
  assert.equal(W.score90Dit({ score90: { home: 1, away: 0, sur: false, vuLe: iso(T - 2 * MIN), libelle: lbl(80) } }), 'score de la 90e non relevé (dernier score vu : 1-0 à la 80e, 21 h 32)');
  assert.equal(W.score90Dit({ score90: null }), 'score de la 90e non relevé');
  assert.equal(
    W.finDite({ statut: 'terminé', raison: 'fini', score: { home: 2, away: 1 }, finReleveeLe: iso(T - 3 * MIN), prolongation: { joueeLe: iso(T - 40 * MIN) }, score90: { home: 1, away: 1, sur: true, vuLe: iso(T - 45 * MIN) } }),
    'Terminé après prolongation : 2-1 ; les paris sur 90 minutes sont réglés sur le score de la 90e : 1-1 (vu à 20 h 49) (FotMob, fin relevée à 21 h 31).'
  );
  // R6 : une minute qu'on ne place pas dit pourquoi.
  assert.equal(W.minuteInconnueDite({ raison: 'sans-duree-max', minute: 47 }), 'Minute 47 publiée sans durée de jeu : arrêts de jeu ou prolongation, on ne sait pas ; score seul, pas de calcul.');
  assert.equal(W.minuteInconnueDite({ raison: 'hors-limites', minute: 140 }), "Minute 140 publiée, au-delà de ce qu'un match peut durer : score seul, pas de calcul.");
  // R9 : le point de départ et sa provenance (trois cas), jamais « la page du match affichait » ni « de la nuit ».
  const depart = (oddsSource, o = {}) => W.avantMatchDit({ trouve: true, calculeLe: iso(T - 6 * H), engineVersion: 5, oddsSource, oddsAt: iso(T - 9 * H), ambre: false, ...o }).texte;
  assert.equal(depart('cotes gratuites : espn, kalshi'), "Point de départ : pronostic d'avant-match (calculé le 14/11 à 15 h 34) ; 1N2 tiré des cotes gratuites ESPN, Kalshi relevées le 14/11 à 12 h 34 · moteur version 5.");
  assert.equal(depart('The Odds API (relevé manuel)'), "Point de départ : pronostic d'avant-match (calculé le 14/11 à 15 h 34) ; 1N2 tiré du relevé The Odds API du 14/11 à 12 h 34 · moteur version 5.");
  assert.equal(depart('aucune cote (modèle de buts)'), "Point de départ : pronostic d'avant-match (calculé le 14/11 à 15 h 34) ; aucune cote pour ce match : 1N2 du modèle de buts, tempéré · moteur version 5.");
  assert.match(depart('cotes gratuites : espn', { ageAuCoupDEnvoiH: 30, coteAgeAuCoupDEnvoiH: 20 }), / — ancien : calculé 30 h avant le coup d'envoi, cotes relevées 20 h avant le coup d'envoi\.$/);
  for (const raison of W.RAISONS_SANS_LIGNE) assert.doesNotMatch(W.avantMatchDit({ trouve: false, raison }).texte, /raison inconnue/, raison);
  // R11 : chaque raison d'un match non suivi a sa phrase.
  for (const raison of ['fini', 'coupure-4h', 'boucle-coupee', 'boucle-suspendue', 'pas-demarree', 'pas-commence', 'pas-encore-vu', 'plus-suivi', 'inconnu']) {
    assert.ok(W.RAISONS_NON_SUIVI_DITES[raison], raison);
    assert.equal(W.nonSuiviDit({ raison }), raison === 'fini' || raison === 'coupure-4h' ? W.RAISONS_NON_SUIVI_DITES[raison] : W.nonSuiviDit({ raison }), raison);
  }
  assert.equal(W.nonSuiviDit({ raison: 'fini', fin: { statut: 'terminé', raison: 'fini', score: { home: 0, away: 2 }, finReleveeLe: iso(T - 10 * MIN) } }), 'Match terminé : 0-2 (FotMob, fin relevée à 21 h 24).');

  // Sur les VRAIES réponses : l'âge, les trois phrases des rouges, le score et son heure, la référence d'avant le but (R2).
  const s = await construire();
  const e = Object.fromEntries(s.tableau.matchs.map((x) => [x.fotmobId, x]));
  assert.equal(W.rougesDits(e['5101']).texte, "Cartons rouges : pas encore lus (le détail de ce match n'a pas encore été relevé).");
  assert.equal(W.rougesDits(e['5102']).texte, 'Cartons rouges : 1 pour Ville C (lu à 21 h 34).');
  assert.deepEqual(W.rougesDits(e['5102']).camps, ['home']);
  const nonPublies = structuredClone(e['5102']);
  Object.assign(nonPublies.etat.rouges, { connus: false, home: null, away: null, phrase: 'non-publies' });
  assert.equal(W.rougesDits(nonPublies).texte, 'Cartons rouges : non publiés par FotMob (détail lu à 21 h 34).');
  assert.deepEqual(W.scoreDit(e['5101']), { texte: '1-0', depuis: 'changement de score vu à 21 h 34' });
  const lignes = s.details['5101'].reference.lignes.map((l) => W.referenceDite(l, { aBlanc: true, noms: { home: 'Ville A', away: 'Ville B' }, etat: s.details['5101'].match.etat }).texte);
  assert.deepEqual(lignes, [
    'Ville A : 1,90 chez Bookmaker A (relevé par ESPN) ; prix relevé à 21 h 29 ; relevé avant le changement de score vu à 21 h 34.',
    'Nul : 3,40 chez Bookmaker A (relevé par ESPN) ; prix relevé à 21 h 29 ; relevé avant le changement de score vu à 21 h 34.',
    'Ville B : 4,20 chez Bookmaker A (relevé par ESPN) ; prix relevé à 21 h 29 ; relevé avant le changement de score vu à 21 h 34.'
  ]);

  // Le rendu : chaque carte dit l'âge, la ligne des rouges, le point de départ ; le détail de 5101 dit la référence.
  const rendu = await rendreLaPage(s, '/direct?match=5101');
  // Mineurs du 13/11 soir (écrans 6) : le bandeau ne promet plus de probabilités ; la charge de la boucle sans jargon ; le
  // titre des cotes relevées sans « en gris ».
  const toutLeTexte = texteDe(rendu.html);
  assert.match(toutLeTexte, /Les probabilités du calcul ne sont montrées que si le banc d'essai les a jugées ; jamais un pari conseillé\./);
  assert.doesNotMatch(toutLeTexte, /ce que le calcul en dit|Des probabilités, jamais un pari conseillé/);
  assert.match(toutLeTexte, /30 relevés de la liste FotMob, 12 fiches de match lues\./);
  assert.doesNotMatch(toutLeTexte, /tours de la boucle|toutes les boucles de l'appli/);
  assert.match(toutLeTexte, /Cotes en direct relevées, pour référence/);
  assert.doesNotMatch(toutLeTexte, /une référence, en gris/);
  const t1 = texteDe(carteDe(rendu.html, '5101'));
  assert.match(t1, /état relevé il y a 20 s · changement de score vu à 21 h 34/);
  assert.match(t1, /Cartons rouges : pas encore lus \(le détail de ce match n'a pas encore été relevé\)\./);
  assert.match(t1, /relevé avant le changement de score vu à 21 h 34\./);
  assert.match(t1, new RegExp(W.PHRASE_DU_RETARD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(texteDe(carteDe(rendu.html, '5102')), /Cartons rouges : 1 pour Ville C \(lu à 21 h 34\)\./);
  assert.match(texteDe(carteDe(rendu.html, '5103')), /Pas de pronostic d'avant-match rangé pour ce match \(aucune ligne calculée avant son coup d'envoi\) : score et minute seulement\./);
  assert.match(texteDe(carteDe(rendu.html, '5103')), /Direct · Mi-temps/);
  assert.match(texteDe(carteDe(rendu.html, '5102')), /Direct · 80e/);
});

// ------------------------------------------------------------ T-U2

test('T-U2 un logo par identifiant FotMob sur chaque ligne qui nomme une équipe : cartes, notes, barres, marchés, référence, courbe, terminés', options, async () => {
  const s = await construire({ note: note() });
  const rendu = await rendreLaPage(s, '/direct?match=5101');
  const tous = crests(rendu.html);
  assert.ok(tous.length >= 20, `des logos partout : ${tous.length}`);
  for (const c of tous) assert.match(c, /<img /, `un logo sans identifiant FotMob (initiales) : ${c.slice(0, 60)}`);
  // La carte : les deux clubs de l'en-tête ; les barres du 1N2 (les deux clubs) ; la ligne d'un rouge lu (son camp).
  assert.ok(crests(carteDe(rendu.html, '5101')).length >= 2 + 2, 'en-tête et barres de 5101');
  assert.equal(crests(carteDe(rendu.html, '5102')).length, 2 + 1, 'en-tête et ligne du rouge lu de 5102 (tranche non montrée : aucune barre)');
  // Le détail : les marchés qui nomment un club, la référence, la légende de la courbe.
  const marches = tableauDe(rendu.html, 'direct-marches');
  for (const tr of lignesDe(marches).filter((x) => /Ville A|Ville B/.test(texteDe(x)))) assert.match(tr, /<span class="crest"[^>]*><img /, texteDe(tr));
  assert.ok(crests(blocDe(rendu.html, 'direct-marches')).length > 10, 'les marchés nommant un club');
  assert.match(rendu.html, /data-courbe="ok"/);
  // Les terminés : la carte commune (deux logos).
  const fini = await construire({ matchs: [], em: F.etatMinute({ maintenant: T, matchs: [], finis: [] }) });
  assert.equal(fini.tableau.finis.length, 0);
  // Le composant pose TeamCrest :team-id partout (jamais par un nom seul).
  for (const nom of COMPOSANTS) for (const m of sourceDe(nom).matchAll(/<TeamCrest[^>]*>/g)) assert.match(m[0], /:team-id="/, `${nom} : ${m[0]}`);
});

// ------------------------------------------------------------ T-U3

test('T-U3 jamais vert : ni --cm-accent, ni --cm-section, ni ProbabilityRing ni ValueBadge ; barres en --cm-info ; référence en gris ; le rouge du direct avec son mot et son point', options, async () => {
  for (const nom of COMPOSANTS) {
    const src = sourceDe(nom);
    assert.doesNotMatch(src, /--cm-accent|--cm-section|ProbabilityRing|ValueBadge|is-accent|is-section/, nom);
  }
  assert.doesNotMatch(lireUi('utils', 'direct.js'), /--cm-accent|--cm-section/);
  assert.match(sourceDe('DirectMatchCard'), /\.direct-card__barre \.cm-bar__fill \{\s*background: var\(--cm-info\);/);
  assert.match(sourceDe('DirectCurve'), /\.direct-curve__serie\.is-home polyline \{\s*stroke: var\(--cm-info\);/);
  assert.match(sourceDe('DirectMarkets'), /\.direct-markets__reference \.direct-markets__lignes \{\s*color: var\(--cm-text-muted\);/);
  const s = await construire({ note: note() });
  const rendu = await rendreLaPage(s, '/direct?match=5101');
  assert.doesNotMatch(rendu.html, /is-accent|cm-accent|is-section|cm-section|prob-ring|value-badge/);
  // Le compte du bandeau : rouge, avec le point ET le mot.
  assert.match(rendu.html, /<span class="cm-chip is-danger" data-compte="en-cours"[^>]*><span class="cm-live-dot"[^>]*><\/span>3 en cours/);
  // La puce de la carte (MatchCard) : le point et le mot « Direct ».
  assert.match(carteDe(rendu.html, '5101'), /mcard__status is-live[^>]*><span class="mcard__live-dot"[^>]*><\/span>Direct(?:<!--\[-->)? · 34e/);
});

// ------------------------------------------------------------ T-U4

test('T-U4 la structure complète dans les 11 états sans chiffre : mêmes blocs, `data-raison`, une phrase qui dit pourquoi', options, async () => {
  const s = await construire();
  const modele = s.tableau.matchs.find((x) => x.fotmobId === '5101');
  const ETATS = [
    ['sans-avant-match', { phase: 'jeu' }, { fait: false, raison: 'sans-avant-match' }, /Pas de pronostic d'avant-match rangé/],
    ['en-attente', { phase: 'jeu' }, { fait: false, enAttente: true, aBlanc: false, raison: 'en-attente' }, /Calcul en cours sur le serveur/],
    ['erreur', { phase: 'jeu' }, { fait: false, raison: 'erreur' }, /Calcul impossible pour cet état/],
    ['prolongation', { phase: 'prolongation' }, { fait: false, raison: 'prolongation' }, /Prolongation — score de la 90e non relevé\. Pas de calcul en prolongation\./],
    ['tirs-au-but', { phase: 'tirs-au-but' }, { fait: false, raison: 'tirs-au-but' }, /Tirs au but — /],
    ['fin-90', { phase: 'fin-90' }, { fait: false, raison: 'fin-90' }, /Fin du temps réglementaire relevée/],
    ['termine', { phase: 'termine' }, { fait: false, raison: 'termine' }, /Terminé chez FotMob : 1-0\. Pas de calcul\./],
    ['interrompu', { phase: 'interrompu' }, { fait: false, raison: 'interrompu' }, /Match interrompu chez FotMob/],
    ['arrete', { phase: 'arrete' }, { fait: false, raison: 'arrete' }, /Match arrêté \(annulé chez FotMob\)/],
    ['attribue', { phase: 'attribue' }, { fait: false, raison: 'attribue' }, /Résultat attribué par FotMob/],
    ['minute-inconnue', { phase: 'minute-inconnue', raison: 'sans-duree-max', minute: 47 }, { fait: false, raison: 'minute-inconnue' }, /Minute 47 publiée sans durée de jeu/]
  ];
  const tableau = structuredClone(s.tableau);
  tableau.matchs = ETATS.map(([cle, etat, calcul], i) => {
    const e = structuredClone(modele);
    e.fotmobId = String(6001 + i);
    Object.assign(e.etat, { score90: null, prolongation: null }, etat);
    e.calcul = { ...structuredClone(modele.calcul), un2: null, plus25: null, lesDeuxMarquent: null, minute0: null, aBlanc: true, enAttente: false, ...calcul };
    if (cle === 'sans-avant-match') e.avantMatch = { trouve: false, raison: 'aucune-ligne', cle: null, nuit: null };
    return e;
  });
  const rendu = await rendreLaPage({ tableau, details: {} });
  for (const [i, [cle, , calcul, phrase]] of ETATS.entries()) {
    const c = carteDe(rendu.html, String(6001 + i));
    assert.match(c, new RegExp(`data-raison="${calcul.raison}"`), cle);
    for (const bloc of ['data-age', 'data-rouges', 'data-depart', 'data-provenance="etat"', 'data-provenance="rouges"', 'data-action="detail"']) assert.ok(c.includes(bloc), `${cle} : ${bloc}`);
    assert.doesNotMatch(c, /data-bloc="direct-chiffres"/, `${cle} : aucun chiffre`);
    assert.match(texteDe(c), phrase, cle);
    assert.doesNotMatch(texteDe(c), /\d\s*%/, `${cle} : aucun pourcentage`);
  }
  // Correctif « écrans 2 » (13/11/2026) : note nulle et `enAttente` (le calcul à blanc attend le budget) → ni la phrase de la
  // carte ni le bandeau « calcul en cours » : aucun chiffre ne viendra. La note allumée, eux seuls le disent.
  const attente = (n) => {
    const t = structuredClone(s.tableau);
    const e = structuredClone(modele);
    e.fotmobId = '6100';
    e.calcul = { ...structuredClone(modele.calcul), un2: null, plus25: null, lesDeuxMarquent: null, minute0: null, fait: false, enAttente: true, aBlanc: n === null, raison: 'en-attente' };
    t.matchs = [e];
    t.calculs = { ...t.calculs, enAttente: 1 };
    if (n) t.note = n;
    return t;
  };
  const ra = await rendreLaPage({ tableau: attente(null), details: {} });
  const texte = texteDe(ra.html);
  assert.doesNotMatch(texte, /Calcul en cours sur le serveur/);
  assert.doesNotMatch(texte, /les chiffres arrivent/, 'note nulle : ni la carte ni le bandeau ne promettent des chiffres');
  assert.doesNotMatch(ra.html, /data-en-attente/);
  assert.match(texteDe(carteDe(ra.html, '6100')), /Pas encore jugé : probabilités calculées à blanc, pas montrées/);
  const allumee = (await construire({ note: note() })).tableau.note;
  const rl = await rendreLaPage({ tableau: attente(allumee), details: {} });
  assert.match(rl.html, /data-en-attente/, 'note allumée : le bandeau dit le calcul en cours');
  assert.match(texteDe(carteDe(rl.html, '6100')), /Calcul en cours sur le serveur/);
  // Le tableau vide est complet : le bandeau, la section « En cours » et sa raison, celle des terminés.
  const vide = await construire({ matchs: [], em: F.etatMinute({ maintenant: T, matchs: [], prochainCoupDEnvoi: iso(T + 50 * MIN) }) });
  const rv = await rendreLaPage(vide);
  assert.match(rv.html, /data-etat="vide"/);
  assert.match(texteDe(rv.html), /Aucun match en cours Aucun match en cours\. Prochain coup d'envoi suivi : 22 h 24 \(liste FotMob relue à 21 h 34, toutes les 10 minutes hors match\)\./);
  // Mineur du 13/11 soir (écrans 7) : la phrase dite une seule fois (l'état vide), plus dans le bandeau de la boucle.
  assert.equal(texteDe(rv.html).split('Prochain coup d').length - 1, 1, 'la phrase du vide une seule fois');
  assert.doesNotMatch(rv.html, /data-boucle[^>]*data-cle="vide"/);
  assert.match(texteDe(rv.html), /Terminés — fin relevée il y a moins de 3 h Aucun match terminé depuis 3 heures\./);
  assert.doesNotMatch(rv.html, /data-boucle[^>]*is-warning/, 'hors match : vide, jamais une alarme');
});

// ------------------------------------------------------------ T-U5

test('T-U5 la provenance : la source réelle et l’heure de l’état, des rouges, de l’avant-match, du calcul et de la référence ; l’ambre au-delà des délais', options, async () => {
  const s = await construire({ note: note() });
  const rendu = await rendreLaPage(s, '/direct?match=5101');
  const c = carteDe(rendu.html, '5101');
  const t = texteDe(c);
  assert.match(t, /FotMob \(liste du jour\) relevé à 21 h 34/);
  assert.match(t, /FotMob \(détail du match\) détail pas encore lu/);
  assert.match(t, /Moteur CôteMaster, pronostic d'avant-match \(version 5\) calculé le 14\/11 à 15 h 00/);
  assert.match(t, /Calcul CôteMaster calculé à 21 h 34/);
  assert.match(t, /1N2 tiré des cotes gratuites ESPN relevées le 14\/11 à 12 h 34/);
  assert.match(t, /Ville A : 1,90 chez Bookmaker A \(relevé par ESPN\), soit 51 % marge retirée ; prix relevé à 21 h 29/);
  assert.match(texteDe(carteDe(rendu.html, '5102')), /FotMob \(détail du match\) lu à 21 h 34/);
  // Aucune pastille ne dit « les cotes ont pu bouger » sur un score ou une minute (seuil désactivé, heure écrite ici).
  assert.doesNotMatch(c, /ont pu bouger/);
  // Mineur du 13/11 soir (écrans 9) : le survol des pastilles au même format d'heure que leur texte (R37 point 2), jamais « 21:34 ».
  assert.match(c, /title="FotMob \(liste du jour\) : relevé à 21 h 34\."/);
  assert.match(c, /title="Calcul CôteMaster : calculé à 21 h 34\."/);
  assert.match(rendu.html, /title="FotMob \(liste du jour\) : liste lue à 21 h 34\."/);
  for (const m of [...c.matchAll(/<span class="prov[^"]*"[^>]*? title="([^"]*)"/g)]) assert.doesNotMatch(m[1], /\d{2}:\d{2}/, `le survol : ${m[1]}`);
  // L'ambre : l'âge de l'état au-delà de 150 s (le décalage depuis la réponse compte).
  const vieux = structuredClone(s.tableau);
  for (const e of vieux.matchs) Object.assign(e.etat, { ageS: 170, ambre: true });
  const rv = await rendreLaPage({ tableau: vieux, details: s.details });
  // (Vue écrit la classe calculée avant la classe fixe : l'ordre des classes n'est pas épinglé.)
  assert.match(carteDe(rv.html, '5101'), /<p class="(?=[^"]*\bis-warning\b)(?=[^"]*\bdirect-card__age\b)[^"]*" data-age><span>état relevé il y a 2 min 50<\/span>/);
});

// ------------------------------------------------------------ T-U6

test('T-U6 la note : nulle → AUCUN pourcentage et « pas encore jugé » ; prouvé, pas prouvé (gris), faits seuls ; paire écartée, à surveiller, tranche et famille non montrées ; les deux variantes (P2)', options, async () => {
  // Sans note : aucun pourcentage nulle part (cartes, détail ouvert, courbe, référence), la phrase « pas encore jugé ».
  const nulle = await construire();
  const rn = await rendreLaPage(nulle, '/direct?match=5101');
  assert.doesNotMatch(texteDe(rn.html), /\d\s*%/, 'aucun pourcentage avec la note nulle');
  assert.match(rn.html, /data-note="non-juge"/);
  assert.match(texteDe(rn.html), /Probabilités en direct : pas encore jugées — calculées à blanc, jamais montrées tant que le banc d'essai n'est pas passé\./);
  assert.match(texteDe(carteDe(rn.html, '5101')), /Pas encore jugé : probabilités calculées à blanc, pas montrées tant que le banc d'essai n'est pas passé\./);
  assert.match(rn.html, /data-courbe="a-blanc"/);
  assert.match(rn.html, /data-bloc="direct-marches" data-a-blanc="oui"/);

  // Prouvée (variante ancrée) : les chiffres de 5101 (34e), la paire écartée de SA tranche, l'ambre « à surveiller », la
  // famille non montrée ; 5102 (80e) est dans une tranche non montrée.
  const s = await construire({ note: note() });
  const rp = await rendreLaPage(s, '/direct?match=5101');
  assert.match(rp.html, /data-note="allume"/);
  assert.match(texteDe(rp.html), /Probabilités en direct : allumées — ce calcul s'est montré meilleur que la simple règle du temps restant sur 812 matchs rejoués \(banc d'essai du 22\/11\/2026, moteur version 5\)\./);
  const c1 = carteDe(rp.html, '5101');
  assert.match(c1, /data-variante="direct-ancre"/);
  assert.match(c1, /data-bloc="direct-chiffres"/);
  const t1 = texteDe(c1);
  assert.match(t1, /pronostic d'avant-match : 45 %/);
  const marches = tableauDe(rp.html, 'direct-marches');
  const ligne = (cle) => lignesDe(marches).find((x) => x.includes(`data-cle="${cle}"`));
  assert.match(texteDe(ligne('totalGoals.2.5.over')), /Plus de 2,5 buts pas montré pas montré entre la 31e et la 45e minute — écarté par le banc d'essai \(annoncé 61 %, arrivé 52 % sur 40 matchs\)/);
  assert.match(ligne('bothTeamsScore.yes'), /class="is-warning"/);
  assert.match(texteDe(ligne('bothTeamsScore.yes')), /à surveiller \(banc d'essai\)/);
  assert.match(texteDe(blocDe(rp.html, 'direct-marches')), /Scores exacts les plus probables · non jugé au banc Pas montré en direct : le banc d'essai l'a écarté\./);
  assert.match(texteDe(ligne('resultAndTotal.2.5.homeOver')), /non jugé au banc/);
  assert.match(texteDe(carteDe(rp.html, '5102')), /Pas de pourcentage entre la 76e et la 90e minute : le banc d'essai ne l'a pas retenu dans cette partie du match\./);
  assert.doesNotMatch(texteDe(carteDe(rp.html, '5102')), /\d\s*%/);

  // Pas prouvé (regard de sûreté) : allumées, « pas encore tranchées », en GRIS (jamais l'ambre : R12 point 3).
  const pp = await construire({ note: note({ verdict: 'pas-prouve' }) });
  const rpp = await rendreLaPage(pp);
  assert.match(rpp.html, /<p class="(?=[^"]*\bis-muted\b)(?=[^"]*\bdirect-board__bandeau\b)[^"]*" data-interrupteur data-note="allume"/);
  assert.match(texteDe(rpp.html), /Probabilités en direct : allumées, pas encore tranchées — sur 812 matchs rejoués, ce calcul n'est ni prouvé meilleur ni prouvé moins bon que la simple règle du temps restant/);
  // Faits seuls : éteintes, aucun pourcentage.
  const fs1 = await construire({ note: note({ verdict: 'faits-seuls' }) });
  const rfs = await rendreLaPage(fs1, '/direct?match=5101');
  assert.match(rfs.html, /data-note="eteint"/);
  assert.doesNotMatch(texteDe(rfs.html), /\d\s*%/);
  assert.match(texteDe(carteDe(rfs.html, '5101')), /Probabilités éteintes par le banc d'essai : le score, la minute et les cartons rouges seulement\./);

  // P2 : sans note, la variante du réglage (« ancre-si-fair » par défaut, « direct-v1 ») — portée par la carte, jamais montrée en chiffres.
  const v1 = await construire({ varianteAffichee: 'direct-v1' });
  const rv1 = await rendreLaPage(v1);
  assert.match(carteDe(rv1.html, '5101'), /data-variante="direct-v1"/);
  assert.match(carteDe(rn.html, '5101'), /data-variante="direct-ancre"/);
  assert.doesNotMatch(texteDe(rv1.html), /\d\s*%/);

  // R8 : l'écart de la minute 0 dit par cause — variante ancrée (« ce calcul part du 1N2 du pronostic d'avant-match ») et
  // variante directe (« au coup d'envoi, ce calcul donnait … »).
  const m0 = (variante) =>
    construire({
      matchs: [suivi(5301, 'fotmob-1301', 'fotmob-1302', { minute: 12, homeName: 'Ville G', awayName: 'Ville H' })],
      note: note({ variante, tranchesNonMontrees: [], famillesNonMontrees: [], paires: { jugees: 24, ecartees: [], aSurveiller: [] } }),
      lignes: { 'fotmob-1301': { lambda: 2.1, mu: 0.7, fair: { home: 0.4, draw: 0.3, away: 0.3 } } },
      cotes: null
    });
  const ancre = await m0('direct-ancre');
  const ra = await rendreLaPage(ancre, '/direct?match=5301');
  assert.match(texteDe(blocDe(ra.html, 'direct-minute0', 'ul')), /Ce calcul part du 1N2 du pronostic d'avant-match ; ce pronostic tirait ces chiffres-là des buts attendus du moteur : 23 points d'écart sur “Ville H marque” dès le coup d'envoi, avant tout fait de jeu/);
  const directe = await m0('direct-v1');
  const rd = await rendreLaPage(directe, '/direct?match=5301');
  assert.match(texteDe(blocDe(rd.html, 'direct-minute0', 'ul')), /Au coup d'envoi, ce calcul donnait 68 % à “Ville G gagne”, le pronostic d'avant-match 40 % : 28 points d'écart qui viennent du point de départ \(les buts attendus du moteur\), pas du match\./);
});

// ------------------------------------------------------------ T-U6 (correctif « écrans 4 », 13/11/2026)

test('T-U6 (écrans 4) la courbe lit la note point par point : tranche « 1-15 » non montrée, match à la 34e, instantané à la 10e → le point de la 10e sans 1N2 (« non-montre »), la courbe tracée sans lui ; sans calcul lu, la courbe reste à blanc', options, async () => {
  const avecLa10e = (db) => {
    COTES_5101(db);
    F.poserUnInstantane(db, { fotmobId: 5101, takenAt: iso(T - 24 * MIN), kickoff: iso(T - 34 * MIN), homeId: 'fotmob-1201', awayId: 'fotmob-1202', homeName: 'Ville A', awayName: 'Ville B', label: lbl(10), minute: 10, h: 0, a: 0, rh: 0, ra: 0 });
  };
  const de10 = (s) => s.details['5101'].courbe.points.find((p) => p.type === 'instantane' && p.minute === 10);
  // Témoin : la même note sans tranche retirée — le point de la 10e porte son 1N2 (c'est bien le filtre qui le retire).
  const temoin = await construire({ note: note({ tranchesNonMontrees: [] }), cotes: avecLa10e });
  const t10 = de10(temoin);
  assert.ok(t10?.un2 && ['home', 'draw', 'away'].every((k) => Number.isFinite(t10.un2[k])), 'sans tranche retirée, la 10e est chiffrée');
  assert.match((await rendreLaPage(temoin, '/direct?match=5101')).html, /data-courbe="ok" data-points="3"/);
  // La note retire la tranche « 1-15 » : le point de la 10e n'a plus de 1N2, ni dans le JSON ni sur la courbe.
  const s = await construire({ note: note({ tranchesNonMontrees: ['1-15'] }), cotes: avecLa10e });
  const c = s.details['5101'].courbe;
  const p10 = de10(s);
  assert.ok(p10, 'le point de la 10e est là');
  assert.deepEqual([p10.un2, p10.raison], [null, 'non-montre']);
  assert.ok(c.points[0].type === 'avant-match' && c.points[0].un2, 'le point d’avant-match garde son 1N2');
  const courant = c.points.at(-1);
  assert.ok(courant.type === 'courant' && courant.un2, 'la 34e (tranche « 31-45 », montrée) garde son 1N2');
  assert.equal(W.geometrieDuDirect(c).points, 2);
  assert.match((await rendreLaPage(s, '/direct?match=5101')).html, /data-courbe="ok" data-points="2"/);
  // Les deux autres branches du filtre : la famille « result » non montrée (aucun point du match chiffré : il ne reste que
  // l'avant-match, la courbe dit « vide ») ; la paire « result.home » écartée de la seule tranche « 1-15 » (la 10e seule).
  const forme = (x) => x.details['5101'].courbe.points.map((p) => [p.type, p.un2 === null, p.raison]);
  const sf = await construire({ note: note({ tranchesNonMontrees: [], famillesNonMontrees: ['result'] }), cotes: avecLa10e });
  assert.deepEqual(forme(sf), [['avant-match', false, null], ['instantane', true, 'non-montre'], ['courant', true, 'non-montre']]);
  assert.match((await rendreLaPage(sf, '/direct?match=5101')).html, /data-courbe="vide" data-points="1"/);
  // § 2.6 point 4 (2e partie, 13/11 soir) : la carte et le détail suivent — le 1N2 de la famille retirée ne sort pas du JSON.
  assert.deepEqual([sf.tableau.matchs.find((e) => e.fotmobId === '5101').calcul.un2, sf.details['5101'].match.calcul.un2, sf.details['5101'].match.calcul.marches.result], [null, null, null]);
  const sp = await construire({ note: note({ tranchesNonMontrees: [], paires: { jugees: 24, ecartees: [{ unite: 'result.home', tranche: '1-15', annonce: 0.5, realise: 0.4, n: 40 }], aSurveiller: [] } }), cotes: avecLa10e });
  assert.deepEqual(forme(sp), [['avant-match', false, null], ['instantane', true, 'non-montre'], ['courant', false, null]]);
  // Sans calcul lu (`calcul` absent), la courbe reste à blanc — jamais « tout passe » ; `aBlanc: false` explicite → tracée.
  const Courbe = (await r.charger('/src/components/direct/DirectCurve.vue')).default;
  const sansCalcul = { ...temoin.details['5101'].match };
  delete sansCalcul.calcul;
  const courbe = temoin.details['5101'].courbe;
  assert.match(net(await r.rendre(Courbe, { courbe, match: sansCalcul }, [])).html, /data-courbe="a-blanc"/);
  assert.match(net(await r.rendre(Courbe, { courbe, match: { ...sansCalcul, calcul: { aBlanc: false } } }, [])).html, /data-courbe="ok" data-points="3"/);
  assert.deepEqual(r.interdits, []);
});

// ------------------------------------------------------------ T-U7

test('T-U7 les seules familles du direct (aucun corner, tir ni carton) ; « déjà acquis », « plus de 99 % » ; jamais « 100 % » ni « 0 % »', options, async () => {
  assert.deepEqual([...W.MARCHES_MONTRES], ['result', 'totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal', 'scoreExact']);
  assert.deepEqual([W.pourcentDit(0.9996), W.pourcentDit(0.0004), W.pourcentDit(0.62), W.pourcentDit(null)], ['plus de 99 %', 'moins de 1 %', '62 %', null]);
  assert.deepEqual(W.un2Dit({ home: 0.996, draw: 0.003, away: 0.001 }), { home: 'plus de 99 %', draw: 'moins de 1 %', away: 'moins de 1 %' });
  assert.deepEqual(W.un2Arrondi({ home: 0.333, draw: 0.333, away: 0.334 }), { home: 33, draw: 33, away: 34 });
  const s = await construire({ note: note({ tranchesNonMontrees: [], famillesNonMontrees: [], paires: { jugees: 24, ecartees: [], aSurveiller: [] } }) });
  const rendu = await rendreLaPage(s, '/direct?match=5101');
  const marches = tableauDe(rendu.html, 'direct-marches');
  const cles = [...marches.matchAll(/data-cle="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(cles.length > 40, `toutes les familles : ${cles.length}`);
  for (const k of cles) assert.match(k, /^(result|totalGoals|bothTeamsScore|teamGoals|resultAndTotal|scoreExact)\./, k);
  assert.doesNotMatch(texteDe(blocDe(rendu.html, 'direct')), /[Cc]orner|\btirs?\b(?! au but)|cartons? jaunes?/);
  // 1-0 à la 34e : « plus de 0,5 but » est acquis, jamais « 100 % ».
  const ligne = (cle) => texteDe(lignesDe(marches).find((x) => x.includes(`data-cle="${cle}"`)));
  assert.match(ligne('totalGoals.0.5.over'), /Plus de 0,5 but déjà acquis \(sauf but annulé\)/);
  assert.match(ligne('totalGoals.0.5.under'), /Moins de 0,5 but impossible \(sauf but annulé\)/);
  assert.match(ligne('teamGoals.home.0.5.over'), /Ville A marque déjà acquis \(sauf but annulé\)/);
  const texte = texteDe(rendu.html);
  const zero = /(?<![\d,])(?:100|0) %/.exec(texte);
  assert.equal(zero, null, `jamais « 100 % » ni « 0 % » : ${zero && texte.slice(Math.max(0, zero.index - 90), zero.index + 6)}`);
});

// ------------------------------------------------------------ T-U8

test('T-U8 375 px : une colonne (les trois issues l’une sous l’autre), aucune largeur fixe au-delà de 343 px dans les cinq composants', () => {
  for (const nom of COMPOSANTS) {
    const style = (sourceDe(nom).split('<style')[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of style.matchAll(/(?<![-\w])(?:min-)?width:\s*(\d+)px/g)) assert.ok(Number(m[1]) <= 343, `${nom} : ${m[0]}`);
  }
  assert.match(sourceDe('DirectMatchCard'), /@media \(max-width: 480px\) \{\s*\.direct-card__un2 \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(sourceDe('DirectBoard'), /grid-template-columns: repeat\(auto-fill, minmax\(min\(100%, 460px\), 1fr\)\);/);
  assert.match(sourceDe('DirectCurve'), /\.direct-curve__svg \{\s*width: 100%;\s*height: auto;/);
  assert.match(lireUi('components', 'layout', 'AppSidebar.vue'), /\.sidebar__nav \{[^}]*overflow-y: auto;/);
});

// ------------------------------------------------------------ T-U9

test('T-U9 l’encart de la page du match : fenêtre −10 min / +4 h (en rejeu : l’heure du rejeu) ; plus aucun appel payant ; monté en rejeu, il lit le direct par les identifiants', options, async () => {
  const K = iso(T - 34 * MIN);
  assert.deepEqual(
    [-11 * MIN, -10 * MIN, 0, 4 * H, 4 * H + MIN].map((d) => W.fenetreDeLEncart(K, Date.parse(K) + d)),
    [false, true, true, true, false]
  );
  assert.equal(W.fenetreDeLEncart(null, T), false);
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  assert.doesNotMatch(vue, /getLiveMatchByName|teamStatsApi|liveMatchDetails|voirLeDirect|MatchStatsPanel|API-Football, sur demande/);
  assert.match(vue, /const encartDuDirect = computed\(\(\) => fenetreDeLEncart\(coupDEnvoi\.value, instantDuRejeu\.value \? Date\.parse\(instantDuRejeu\.value\) : liveNow\.value\)\);/);
  // Correctifs D2 (point 2 e) : l'encart se monte dans la fenêtre OU quand la boucle du direct suit ce match en cours ; il
  // reçoit alors l'identifiant FotMob du match (le gabarit d'avant, `v-if="encartDuDirect"` sans `:fotmob-id`, a changé).
  assert.match(vue, /const encartMonte = computed\(\(\) => Boolean\(fotmobIdDuDirect\.value\) \|\| encartDuDirect\.value\);/);
  assert.match(vue, /<AppCard\s+v-if="encartMonte"\s+id="upcoming-direct"\s+title="En direct"[\s\S]*?<DirectEncart :fotmob-id="fotmobIdDuDirect" :home-id="clubsDeLaPage\.home" :away-id="clubsDeLaPage\.away" :coup-d-envoi="coupDEnvoi" :match-id="matchId" :instant="instantDuRejeu" \/>/);
  assert.doesNotMatch(lireUi('views', 'MyBetsView.vue'), /DirectEncart|directApi/, 'Mes paris n’est pas touché (R31)');

  // L'encart, en rejeu : la lecture par identifiants (jamais un nom), l'instant gardé, la carte et ses deux liens vers Direct.
  const I = iso(T - 2 * MIN);
  const s = await construire();
  const detail = { ...s.details['5101'] };
  await r.routeur.push('/direct');
  const rendu = net(
    await r.rendre(Encart, { homeId: 'fotmob-1201', awayId: 'fotmob-1202', coupDEnvoi: s.details['5101'].match.kickoff, matchId: 'essai-46', instant: I }, [
      [/\/api\/direct\/match\?home=fotmob-1201&away=fotmob-1202&coup=[^&]+&instant=/, { code: 200, corps: detail }]
    ])
  );
  assert.deepEqual(r.interdits, []);
  assert.deepEqual(rendu.appels.map((a) => a.replace(/^GET http:\/\/localhost:4000/, '')), [`/api/direct/match?home=fotmob-1201&away=fotmob-1202&coup=${encodeURIComponent(s.details['5101'].match.kickoff)}&instant=${encodeURIComponent(I)}`]);
  assert.match(rendu.html, /data-bloc="direct-encart" data-etat="suivi"/);
  const href = `/direct?home=fotmob-1201&amp;away=fotmob-1202&amp;coup=${s.details['5101'].match.kickoff}&amp;page=essai-46&amp;instant=${I}`;
  assert.ok(rendu.html.includes(`href="${href}"`), 'le lien « Ouvrir la page Direct, sur ce match »');
  assert.ok(rendu.html.split(`href="${href}"`).length - 1 >= 2, 'le lien du texte ET l’en-tête de la carte');
  assert.match(texteDe(rendu.html), /Le direct de ce match : le score, la minute et les cartons rouges relevés chez FotMob\. Ouvrir la page Direct, sur ce match/);
  // Mineurs du 13/11 soir : l'encart monté « suivi », note nulle — aucun pourcentage (écrans 11) ; « Pas encore jugé » une
  // seule fois, sur la carte (écrans 7 : l'interrupteur « pas encore jugées » n'est plus répété au-dessus).
  assert.doesNotMatch(texteDe(rendu.html), /\d\s*%/, 'l’encart suivi, note nulle : aucun pourcentage');
  assert.doesNotMatch(texteDe(rendu.html), /Probabilités en direct : pas encore jugées/);
  assert.match(texteDe(rendu.html), /Pas encore jugé : probabilités calculées à blanc/);
  // Sans identifiants : la phrase de R11, aucune lecture.
  const sansIds = await r.rendre(Encart, { homeId: null, awayId: null, coupDEnvoi: s.details['5101'].match.kickoff, matchId: 'essai-46' }, []);
  assert.deepEqual(sansIds.appels, []);
  assert.match(texteDe(sansIds.html), /Clubs non reconnus par leur identifiant FotMob : pas de direct pour ce match\./);
  // Un match terminé (non suivi) : sa fin, et le lien.
  const fin = { ...s.details['5101'], suivi: false, raison: 'fini', fin: { statut: 'terminé', raison: 'fini', score: { home: 2, away: 1 }, finReleveeLe: iso(T - 5 * MIN) }, match: null, reference: null, courbe: null };
  const rf = await r.rendre(Encart, { homeId: 'fotmob-1201', awayId: 'fotmob-1202', coupDEnvoi: s.details['5101'].match.kickoff, matchId: 'essai-46' }, [[/\/api\/direct\/match\?/, { code: 200, corps: fin }]]);
  assert.match(texteDe(rf.html), /Match terminé : 2-1 \(FotMob, fin relevée à 21 h 29\)\./);
});

// ------------------------------------------------------------ T-U10

test('T-U10 les appels : la page lit GET /api/direct (avec ?instant= en rejeu), le détail GET /api/direct/match?id= — rien d’autre', options, async () => {
  const s = await construire();
  const rendu = await rendreLaPage(s);
  assert.deepEqual(rendu.appels, ['GET http://localhost:4000/api/direct']);
  const ouvert = await rendreLaPage(s, '/direct?match=5102');
  assert.deepEqual(ouvert.appels, ['GET http://localhost:4000/api/direct', 'GET http://localhost:4000/api/direct/match?id=5102']);
  // Un match demandé qui n'est pas au tableau : la raison, lue une fois par la route du détail.
  const absent = { ...s.details['5101'], suivi: false, raison: 'pas-commence', fin: null, match: null, reference: null, courbe: null };
  const ra = await rendreLaPage(s, `/direct?home=fotmob-1901&away=fotmob-1902&coup=${encodeURIComponent(iso(T + H))}`, [[/\/api\/direct\/match\?home=fotmob-1901&away=fotmob-1902&coup=/, { code: 200, corps: absent }]]);
  assert.equal(ra.appels.length, 2);
  assert.match(texteDe(ra.html), /Le match demandé : Pas encore commencé : le direct démarre au coup d'envoi\./);
  // Les sources n'appellent que ces deux routes.
  for (const nom of COMPOSANTS) assert.doesNotMatch(sourceDe(nom), /httpClient|fetch\(|\b\w+Api\.(?!tableau\(|match\()\w+\(/, nom);
  assert.match(lireUi('services', 'directApi.js'), /httpClient\.get\(`\/direct\$\{avecInstant\(new URLSearchParams\(\), instant\)\}`\)/);
});

// ------------------------------------------------------------ T-U11

test('T-U11 le menu : 9 entrées, « Direct » juste sous « Matchs », active seule sur /direct ; la route ; direct.js est une règle pure', options, async () => {
  const menu = lireUi('components', 'layout', 'AppSidebar.vue');
  const entrees = [...menu.matchAll(/\{ to: '(\/[^']*)'/g)].map((m) => m[1]);
  assert.deepEqual(entrees, ['/matches', '/direct', '/paris', '/bookmakers', '/historique-moteur', '/sante-moteur', '/bulletin', '/feuille-de-route', '/reglages']);
  assert.match(menu, /\{ to: '\/direct', section: 'matches', nav: 'direct', label: 'Direct', hint: 'Score, minute, cartons rouges', icon: 'bolt' \}/);
  assert.doesNotMatch(menu, /minute par minute/, 'R4 : jamais « minute par minute »');
  const routeur = lireUi('router', 'index.js');
  assert.match(routeur, /path: '\/direct',\s*name: 'direct',\s*component: \(\) => import\('@\/views\/LiveView\.vue'\),\s*meta: \{ title: 'Direct', section: 'matches', nav: 'direct' \}/);
  const Menu = (await r.charger('/src/components/layout/AppSidebar.vue')).default;
  r.routeur.addRoute({ path: '/essai-46-direct', meta: { section: 'matches', nav: 'direct' }, component: { render: () => null } });
  r.routeur.addRoute({ path: '/essai-46-matchs', meta: { section: 'matches' }, component: { render: () => null } });
  const actives = async (adresse) => {
    await r.routeur.push(adresse);
    const rendu = net(await r.rendre(Menu, {}, []));
    return [...rendu.html.matchAll(/<a [^>]*href="([^"]+)"[^>]*class="sidebar__link( is-active)?"/g)].filter((m) => m[2]).map((m) => m[1]);
  };
  assert.deepEqual(await actives('/essai-46-direct'), ['/direct'], 'sur /direct : « Direct » seule');
  assert.deepEqual(await actives('/essai-46-matchs'), ['/matches'], 'sur /matches : « Matchs » seule');
  assert.ok(reglesPures('direct.js').has('direct.js'));
});

// ------------------------------------------------------------ P6 bis

test('P6 bis toutes les cartes, cliquables, jamais plafonnées ; le match visé ouvert et marqué ; les favoris d’abord', options, async () => {
  const em = F.etatMinute({ maintenant: T, matchs: F.matchsEnJeu(60, { maintenant: T, minute: 20 }) });
  const s = await construire({ em, sans: [], cotes: null });
  assert.equal(s.tableau.matchs.length, 60);
  const rendu = await rendreLaPage(s, '/direct?match=4700031');
  assert.equal((rendu.html.match(/<article [^>]*class="direct-card/g) ?? []).length, 60, 'les 60 matchs, sans plafond');
  const entetes = rendu.html.match(/<div role="button" tabindex="0" class="mcard[^"]*"/g) ?? [];
  assert.equal(entetes.length, 60, 'chaque carte est cliquable (son en-tête ouvre le détail)');
  const cible = carteDe(rendu.html, '4700031');
  assert.match(cible, /class="direct-card is-cible"/);
  assert.match(cible, /data-bloc="direct-detail"/, 'le détail du match visé est ouvert');
  assert.equal((rendu.html.match(/data-bloc="direct-detail"/g) ?? []).length, 1);
  // Les favoris d'abord (favoritesFirst), sans rien réordonner d'autre.
  assert.match(sourceDe('DirectBoard'), /favoris\.favoritesFirst\(reponse\.value\?\.matchs \?\? \[\], \{/);
});

test('P6 bis la puce « Direct » de MatchCard : un bouton sur chaque match en cours (le mot, la minute), qui ouvre la page Direct sur CE match', options, async () => {
  const carte = { commenceTime: iso(T - 34 * MIN), league: 'Premier League - England', homeName: 'Ville A', awayName: 'Ville B', homeId: 'fotmob-1201', awayId: 'fotmob-1202', homeGoals: 1, awayGoals: 0, status: 'live', minute: '34e' };
  await r.routeur.push('/direct');
  // Correctifs D2 (point 2 c, AJOUT) : la puce suit l'ensemble des matchs en cours (le vrai serveur, GET /api/direct/en-cours,
  // sur le direct fabriqué : 5101 = fotmob-1201 / fotmob-1202 à la 34e), plus le statut que la page calcule.
  const EC = await r.charger('/src/composables/useDirectEnCours.js');
  EC.__poserLesEnCours(await L.enCoursDuDirect((await construire()).base));
  const vivante = net(await r.rendre(Carte, { match: carte, clickable: true }, []));
  assert.match(vivante.html, /<button type="button" class="mcard__status is-live is-direct-link" data-direct-link title="Voir ce match sur la page Direct"><span class="mcard__live-dot"[^>]*><\/span>Direct(?:<!--\[-->)? · 34e(?:<!--\]-->)?<\/button>/);
  const sansLien = net(await r.rendre(Carte, { match: carte, directLink: false }, []));
  assert.doesNotMatch(sansLien.html, /data-direct-link/);
  assert.match(sansLien.html, /<span class="mcard__status is-live"[^>]*><span class="mcard__live-dot"[^>]*><\/span>Direct(?:<!--\[-->)? · 34e(?:<!--\]-->)?<\/span>/);
  // Correctifs D2 (AJOUT) : un match absent de l'ensemble n'a pas de puce.
  EC.__poserLesEnCours(null);
  const aVenir = await r.rendre(Carte, { match: { ...carte, homeGoals: null, awayGoals: null, status: 'scheduled' } }, [[/\/api\/simulation\/enjeux/, { code: 200, corps: { affichage: null, enjeux: [] } }]]);
  assert.doesNotMatch(aVenir.html, /data-direct-link/);
  // Le clic : l'adresse de la page Direct — identifiant FotMob, sinon clubs + coup d'envoi ; la page du match suit.
  const mc = lireUi('components', 'matches', 'MatchCard.vue');
  assert.match(mc, /@click\.stop\.prevent="ouvrirLeDirect"/);
  assert.match(mc, /router\.push\(\s*adresseDuDirect\(\{\s*id: m\.value\.fotmobId \?\? null,\s*home: id\(equipes\.value\[0\]\),\s*away: id\(equipes\.value\[1\]\),\s*coup: heureConnue\.value \? m\.value\.commenceTime : null,\s*page: pageDuMatch\(\)/);
  assert.deepEqual(W.adresseDuDirect({ id: '4700031', page: 'abc', instant: null }), { path: '/direct', query: { match: '4700031', page: 'abc' } });
  assert.deepEqual(W.adresseDuDirect({ home: 'fotmob-1201', away: 'fotmob-1202', coup: iso(T), instant: iso(T) }), { path: '/direct', query: { home: 'fotmob-1201', away: 'fotmob-1202', coup: iso(T), instant: iso(T) } });
  assert.deepEqual(W.adresseDuDirect({ home: 'Arsenal', away: 'fotmob-1202', coup: iso(T) }), { path: '/direct', query: {} }, 'jamais un nom');
  assert.deepEqual(W.cibleDeLAdresse({ home: 'fotmob-1201', away: 'fotmob-1202', coup: iso(T), page: 'abc' }), { id: null, home: 'fotmob-1201', away: 'fotmob-1202', coup: iso(T), page: 'abc' });
  assert.equal(W.cibleDeLAdresse({ match: '12a' }), null);
  assert.equal(W.estLaCible({ fotmobId: '1', home: { id: 'fotmob-1201' }, away: { id: 'fotmob-1202' }, kickoff: iso(T - 2 * H) }, { home: 'fotmob-1201', away: 'fotmob-1202', coup: iso(T) }), true);
  assert.equal(W.estLaCible({ fotmobId: '1', home: { id: 'fotmob-1201' }, away: { id: 'fotmob-1202' }, kickoff: iso(T - 4 * H) }, { home: 'fotmob-1201', away: 'fotmob-1202', coup: iso(T) }), false);
});

test('P6 bis le compte « N en direct » en tête de la page Matchs ouvre la page Direct', () => {
  const vue = lireUi('views', 'MatchesView.vue');
  // Correctifs D3 (point 3) : `:to="lienDuDirect"` (la page Direct, l'instant d'un rejeu gardé) au lieu de `to="/direct"`.
  assert.match(vue, /<RouterLink\s+v-if="resume\.enDirect"\s+:to="lienDuDirect"\s+class="cm-chip is-danger matches-hero__direct"\s+data-direct-link/);
  assert.match(vue, /<span class="cm-live-dot"><\/span>\{\{ resume\.enDirect \}\} en direct\s*<\/RouterLink>/);
  assert.match(vue, /import \{ RouterLink, useRoute, useRouter \} from 'vue-router';/);
});

// ------------------------------------------------------------ R28 et la boucle (R10, R25)

test('R28 l’écran en rejeu : le bandeau ambre, l’instant lu dans l’adresse et gardé dans les liens ; R10 et R25 la boucle dite', options, async () => {
  L.viderLesTables();
  const db = F.baseDuDirect();
  const K = iso(T - 40 * MIN);
  const snap = (id, dt, o) => F.poserUnInstantane(db, { fotmobId: id, takenAt: iso(T - dt * MIN), kickoff: K, homeId: 'fotmob-1401', awayId: 'fotmob-1402', homeName: 'Ville I', awayName: 'Ville J', ...o });
  snap(5401, 12, { label: lbl(28), minute: 28, h: 0, a: 0 });
  snap(5401, 9, { label: lbl(31), minute: 31, h: 1, a: 0, rh: 0, ra: 0, source: 'liste + détail' });
  const I = iso(T - 5 * MIN);
  // Correctifs D2 (AJOUT) : `calendrier` fabriqué vide — jamais le vrai calendrier dans un essai (la page du match, point 3).
  const opts = { maintenant: T, database: db, note: null, instant: I, rejeuPermis: true, ligneDe: (q) => F.ligneFabriquee(q), calendrier: () => [] };
  const tableau = await L.tableauDuDirect(opts);
  const d = await L.matchDuDirect({ ...opts, id: '5401' });
  const rendu = await rendreLaPage({ tableau, details: { 5401: d } }, `/direct?instant=${encodeURIComponent(I)}&match=5401`);
  assert.deepEqual(rendu.appels.map((a) => a.replace('GET http://localhost:4000', '')), [`/api/direct?instant=${encodeURIComponent(I)}`, `/api/direct/match?id=5401&instant=${encodeURIComponent(I)}`]);
  assert.match(rendu.html, /<span class="cm-chip is-warning">Rejeu<\/span>/);
  assert.match(texteDe(rendu.html), /Rejeu du 14\/11 à 21 h 29 : chaque match est refait depuis les instantanés rangés dans la base \(ceux des 6 minutes d'avant\) ; rien n'est en direct\./);
  assert.match(rendu.html, /class="direct-board__bandeau is-warning" data-rejeu/);
  assert.doesNotMatch(rendu.html, /data-boucle/, 'en rejeu, la boucle n’a rien à dire');

  // R10 : la boucle arrêtée, suspendue, sans tour ; R25 : le suivi en panne ; trois erreurs de suite.
  const em = F.etatMinute({ maintenant: T, matchs: PRINCIPAL() });
  const boucle = async (extra) => (await construire({ em, extra })).tableau.boucle;
  assert.equal(W.boucleDite(await boucle({ statut: F.statut({ running: false }) }), { matchs: 3 }).texte, 'Boucle du direct arrêtée : aucun match n’est suivi en ce moment.'.replace('’', "'"));
  const susp = W.boucleDite(await boucle({ statut: F.statut({ suspendu: true, suspenduJusqua: iso(T + 10 * MIN) }) }), { matchs: 3 });
  assert.equal(susp.texte, "FotMob répond mal : la boucle du direct est arrêtée jusqu'à 21 h 44 ; les chiffres ci-dessous sont ceux du dernier relevé, en gris.");
  const erreurs = W.boucleDite(await boucle({ statut: F.statut({ erreursConsecutives: 3, derniereErreur: iso(T - 2 * MIN) }) }), { matchs: 3 });
  assert.match(erreurs?.texte ?? '', /^FotMob ne répond pas( depuis \d+ h \d+)? \(3 erreurs de suite\) : la boucle réessaie à chaque tour\.$/);
  const panne = W.boucleDite({ suivi46: { module: 'indisponible', dernierePanne: { at: iso(T - 3 * MIN) } } }, { matchs: 3 });
  assert.equal(panne.texte, 'Suivi du direct en panne depuis 21 h 31 : score et minute seulement.');
  const bac = W.boucleDite({ pourquoi: 'bac-a-sable', phrase: null }, { matchs: 0 });
  assert.match(bac.texte, /^Boucle du direct coupée dans le bac à sable : aucun match n'est suivi ici ; ouvrez un rejeu \(adresse « \?instant= »\) pour voir l'écran\.$/);
  assert.equal(W.boucleDite({ pourquoi: 'plus-de-tour', dernierTourLe: iso(T - 9 * MIN) }).texte, 'Pas de tour de la boucle depuis 21 h 25 (PC en veille ou boucle arrêtée) : les chiffres ci-dessous sont ceux de ce moment-là, en gris.');
  // Une réponse illisible du serveur (R24) : jamais une page cassée.
  const ri = await rendreLaPage({ tableau: { version: 1, etat: 'illisible', raison: 'module-illisible' }, details: {} });
  assert.match(ri.html, /data-etat="illisible"/);
  assert.match(texteDe(ri.html), /Direct illisible : le direct n'a pas pu démarrer sur le serveur\. Les autres pages de l'appli ne sont pas touchées\./);
});

// ------------------------------------------------------------ correctifs D2 (12/11/2026)

const sansHote = (a) => a.replace(/^GET http:\/\/localhost:4000/, '');
/** Un document de navigateur fabriqué : l'onglet caché ou non, et l'écoute de `visibilitychange`. */
function documentFactice(cache) {
  const ecoutes = new Set();
  return {
    hidden: cache,
    ecoutes,
    addEventListener: (type, fn) => (type === 'visibilitychange' ? ecoutes.add(fn) : undefined),
    removeEventListener: (type, fn) => (type === 'visibilitychange' ? ecoutes.delete(fn) : undefined),
    montrer() {
      this.hidden = false;
      for (const fn of [...ecoutes]) fn();
    }
  };
}
/** `fn(doc)` avec ce document en place (le rendu côté serveur n'en a pas) ; retiré après, quoi qu'il arrive. */
async function avecUnDocument(cache, fn) {
  const doc = documentFactice(cache);
  globalThis.document = doc;
  try {
    return await fn(doc);
  } finally {
    delete globalThis.document;
  }
}
const laisserFiler = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((fin) => setImmediate(fin));
};

test('Correctifs D2, point 1 — monté dans un onglet caché, le direct ne lit rien ; il lit DÈS que l’onglet redevient visible, en rejeu comme en direct (la page et l’encart) ; au tic, il relit tant qu’aucune réponse n’est arrivée ni aucune erreur dite', options, async () => {
  const s = await construire();
  const I = iso(T - 2 * MIN);
  // La page Direct en rejeu, montée cachée : « Lecture du direct… », aucune lecture ; rendue visible : la lecture part.
  for (const [adresse, appel] of [[`/direct?instant=${encodeURIComponent(I)}`, `/api/direct?instant=${encodeURIComponent(I)}`], ['/direct', '/api/direct']]) {
    await avecUnDocument(true, async (doc) => {
      const cachee = await rendreLaPage(s, adresse);
      assert.deepEqual(cachee.appels, [], `${adresse} : onglet caché, aucune lecture`);
      assert.match(cachee.html, /data-bloc="direct" data-etat="chargement"/);
      assert.match(cachee.texte, /Lecture du direct…/);
      assert.equal(doc.ecoutes.size, 1, 'la page écoute visibilitychange');
      doc.montrer();
      await laisserFiler();
      assert.deepEqual(r.appels.map(sansHote), [appel], `${adresse} : visible, la lecture part aussitôt`);
      assert.deepEqual(r.interdits, []);
    });
  }
  // L'encart de la page du match, monté caché : par les identifiants des clubs, et par l'identifiant FotMob du match.
  const d = s.details['5101'];
  const K = d.match.kickoff;
  for (const [props, appel] of [
    [{ homeId: 'fotmob-1201', awayId: 'fotmob-1202', coupDEnvoi: K, matchId: 'essai-46', instant: I }, `/api/direct/match?home=fotmob-1201&away=fotmob-1202&coup=${encodeURIComponent(K)}&instant=${encodeURIComponent(I)}`],
    [{ fotmobId: '5101', matchId: 'essai-46', instant: I }, `/api/direct/match?id=5101&instant=${encodeURIComponent(I)}`],
    [{ fotmobId: '5101', matchId: 'essai-46' }, '/api/direct/match?id=5101']
  ]) {
    await avecUnDocument(true, async (doc) => {
      const cache = net(await r.rendre(Encart, props, [[/\/api\/direct\/match\?/, { code: 200, corps: d }]]));
      assert.deepEqual(cache.appels, [], 'encart caché : aucune lecture');
      assert.match(cache.html, /data-bloc="direct-encart" data-etat="chargement"/);
      doc.montrer();
      await laisserFiler();
      assert.deepEqual(r.appels.map(sansHote), [appel]);
      assert.deepEqual(r.interdits, []);
    });
  }
  // Au tic de l'horloge partagée : tant qu'aucune réponse n'est arrivée ni aucune erreur dite, en direct comme en rejeu ;
  // en rejeu sinon, seulement des calculs en attente ; un match terminé (l'encart), jamais.
  assert.equal(W.relireAuTic({ instant: I, reponse: null, erreur: null }), true, 'rejeu sans réponse ni erreur : relu');
  assert.equal(W.relireAuTic({ instant: null, reponse: null, erreur: null }), true);
  assert.equal(W.relireAuTic({ instant: I, reponse: null, erreur: 'lecture ratée' }), false, 'une erreur dite : « Relire » la reprend');
  assert.equal(W.relireAuTic({ instant: I, reponse: { matchs: [] }, enAttente: 0 }), false);
  assert.equal(W.relireAuTic({ instant: I, reponse: { matchs: [] }, enAttente: 2 }), true);
  assert.equal(W.relireAuTic({ instant: null, reponse: { matchs: [] } }), true, 'en direct, toujours');
  assert.equal(W.relireAuTic({ instant: null, reponse: null, termine: true }), false);
  // Le câblage : les deux composants écoutent la visibilité et passent leur tic par cette règle.
  for (const nom of ['DirectBoard', 'DirectEncart']) {
    const src = sourceDe(nom);
    assert.match(src, /onMounted\(\(\) => \{\n {2}arreterDEcouter = surVisible\(lire\);\n\}\);\nonBeforeUnmount\(\(\) => arreterDEcouter\?\.\(\)\);/, nom);
    assert.match(src, /watch\(liveNow, \(\) => \{\n {2}if \(relireAuTic\(\{ instant: [^\n]*\}\)\) lire\(\);\n\}\);/, nom);
  }
  assert.match(lireUi('composables', 'usePageVisible.js'), /document\.addEventListener\('visibilitychange', ecoute\);/);
});

test('Correctifs D2, point 2 b — l’ensemble PARTAGÉ des matchs en cours : GET /api/direct/en-cours (avec le ?instant= de l’adresse), une lecture par minute pour toute l’appli, aucune quand l’onglet est caché ; indexé par la paire d’identifiants FotMob, jamais un nom', options, async () => {
  const s = await construire();
  const enCours = await L.enCoursDuDirect(s.base);
  assert.deepEqual(enCours.matchs.map((e) => [e.fotmobId, e.homeId, e.awayId, e.phase]).sort(), [['5101', 'fotmob-1201', 'fotmob-1202', 'jeu'], ['5102', 'fotmob-1203', 'fotmob-1204', 'jeu'], ['5103', 'fotmob-1205', 'fotmob-1206', 'mi-temps']]);
  const EC = await r.charger('/src/composables/useDirectEnCours.js');
  const I = iso(T - 2 * MIN);
  const route = [[/\/api\/direct\/en-cours(\?|$)/, { code: 200, corps: enCours }]];
  EC.__poserLesEnCours(null);
  try {
    await r.routeur.push(`/matches?instant=${encodeURIComponent(I)}`);
    // Rendu côté serveur : rien n'est monté — ni lecture, ni minuteur, ni écoute.
    const carte = { commenceTime: null, date: '2026-11-14', league: 'Premier League - England', homeName: 'Ville A', awayName: 'Ville B', homeId: 'fotmob-1201', awayId: 'fotmob-1202', status: 'scheduled' };
    const rendu = await r.rendre(Carte, { match: carte }, route);
    assert.deepEqual(rendu.appels, []);
    const api = EC.useDirectEnCours({ suivre: false });
    assert.equal(api.instant.value, I, 'l’instant du rejeu, lu dans l’adresse courante');
    assert.equal(api.compte.value, 0);
    await api.lire();
    await api.lire();
    assert.deepEqual(r.appels.map(sansHote), [`/api/direct/en-cours?instant=${encodeURIComponent(I)}`], 'une seule lecture : la seconde, moins d’une minute après, n’en fait pas');
    assert.equal(api.compte.value, 3);
    assert.equal(api.dePaire({ homeId: 'fotmob-1201', awayId: 'fotmob-1202', jour: '2026-11-14' })?.fotmobId, '5101');
    assert.equal(api.dePaire({ homeId: 'fotmob-1201', awayId: 'fotmob-1202', jour: '2026-11-14T12:00:00Z' })?.fotmobId, '5101', 'un match du calendrier (midi UTC)');
    assert.equal(api.dePaire({ homeId: 'fotmob-1202', awayId: 'fotmob-1201', jour: '2026-11-14' }), null, 'la paire dans son ordre : qui reçoit, puis l’autre');
    assert.equal(api.dePaire({ homeId: 'Ville A', awayId: 'Ville B', jour: '2026-11-14' }), null, 'jamais un nom');
    assert.equal(api.dePaire({ homeId: 'fotmob-1201', awayId: 'fotmob-1202', jour: '2026-11-17' }), null, 'une autre rencontre des deux mêmes clubs');
    assert.equal(api.dePaire({ homeId: 'fotmob-1201', awayId: 'fotmob-1202', jour: null }), null, 'sans jour');
    // Un autre instant (ici le direct) : l'ensemble lu ne vaut plus, jusqu'à sa propre lecture.
    await r.routeur.push('/matches');
    assert.equal(api.instant.value, null);
    assert.equal(api.compte.value, 0);
    await api.lire();
    assert.equal(sansHote(r.appels.at(-1)), '/api/direct/en-cours');
    assert.equal(api.compte.value, 3);
    // L'onglet caché : aucune lecture.
    EC.__poserLesEnCours(null);
    const avant = r.appels.length;
    await avecUnDocument(true, () => api.lire());
    assert.equal(r.appels.length, avant, 'caché : aucune lecture');
    assert.equal(api.compte.value, 0);
    assert.deepEqual(r.interdits, []);
  } finally {
    EC.__poserLesEnCours(null);
    await r.routeur.push('/direct');
  }
  // La règle (pure) : la clé de la paire, deux entrées pour une paire → aucune, une réponse illisible → un ensemble vide.
  assert.equal(W.cleDeLaPaire('fotmob-1201', 'fotmob-1202'), 'fotmob-1201|fotmob-1202');
  assert.equal(W.cleDeLaPaire('Arsenal', 'fotmob-1202'), null, 'jamais un nom');
  const deux = W.indexDesEnCours({ matchs: [{ fotmobId: '1', homeId: 'fotmob-1', awayId: 'fotmob-2', date: '2026-11-14' }, { fotmobId: '2', homeId: 'fotmob-1', awayId: 'fotmob-2', date: '2026-11-14' }] });
  assert.equal(W.enCoursDeLaPaire(deux, { homeId: 'fotmob-1', awayId: 'fotmob-2', jour: '2026-11-14' }), null, 'deux entrées répondent : aucune');
  assert.equal(W.indexDesEnCours({ version: 1, etat: 'illisible', raison: 'module-illisible' }).size, 0);
  assert.equal(W.compteDesEnCours({ version: 1, etat: 'illisible', raison: 'module-illisible' }), 0);
  assert.equal(W.compteDesEnCours({ version: 1, boucle: { pourquoi: 'coupee' }, matchs: [] }), 0);
  // Le câblage : la seule lecture du composable ; une minute ; minuteur et écoute seulement dans un navigateur ; la route.
  const src = lireUi('composables', 'useDirectEnCours.js');
  assert.deepEqual(src.match(/\b\w+Api\.\w+\(/g), ['directApi.enCours(']);
  assert.match(src, /const LECTURE_MS = 60_000;/);
  assert.match(src, /if \(!ecoutes && typeof window !== 'undefined'\) \{/);
  assert.match(src, /onMounted\(abonner\);\n {6}onBeforeUnmount\(desabonner\);/);
  assert.match(lireUi('services', 'directApi.js'), /enCours: \(\{ instant = null \} = \{\}\) => httpClient\.get\(`\/direct\/en-cours\$\{avecInstant\(new URLSearchParams\(\), instant\)\}`\)/);
  assert.ok(reglesPures('direct.js').has('direct.js'), 'la règle reste pure');
});

test('Correctifs D2, point 2 c — la puce « Direct » de MatchCard suit l’ensemble des matchs en cours, plus le statut de la page : la minute ou la mi-temps, même pour un match du calendrier sans heure ; sans identifiants FotMob, aucune puce ; le clic ouvre /direct?match=<identifiant FotMob> en gardant l’instant', options, async () => {
  const s = await construire();
  const enCours = await L.enCoursDuDirect(s.base);
  const EC = await r.charger('/src/composables/useDirectEnCours.js');
  const PAGE = 'cal-2026-11-14-ville-a-ville-b';
  const ville = (o = {}) => ({ matchId: PAGE, commenceTime: null, date: '2026-11-14', league: 'Premier League - England', homeName: 'Ville A', awayName: 'Ville B', homeId: 'fotmob-1201', awayId: 'fotmob-1202', homeGoals: null, awayGoals: null, status: 'scheduled', ...o });
  /** La puce cliquable d'une carte : son texte (« Direct · 34e »), ou null — et alors aucun bouton du direct sur la carte. */
  const puce = (html) => {
    const b = /<button type="button" class="mcard__status is-live is-direct-link" data-direct-link title="Voir ce match sur la page Direct">([\s\S]*?)<\/button>/.exec(net({ html }).html);
    if (!b) assert.doesNotMatch(html, /data-direct-link/);
    return b ? texteDe(b[1]) : null;
  };
  const rendreLaCarte = async (props) => net(await r.rendre(Carte, props, []));
  const ANNUAIRE = { 'Ville A': 'fotmob-1201', 'Ville B': 'fotmob-1202' };
  const fetchDuRendu = globalThis.fetch;
  try {
    await r.routeur.push('/matches');
    // Le statut que la page calcule n'allume plus la puce à lui seul.
    EC.__poserLesEnCours(null);
    const seule = await rendreLaCarte({ match: ville({ status: 'live', homeGoals: 1, awayGoals: 0, commenceTime: iso(T - 34 * MIN), minute: '34e' }), clickable: true });
    assert.equal(puce(seule.html), null);
    assert.doesNotMatch(seule.html, /data-direct-link|mcard__status is-live/);
    // Correctif « écrans 3 » (13/11/2026) : sans le mot, pas de rouge non plus (ni la bordure de la carte, ni le score).
    assert.doesNotMatch(seule.html, /class="mcard[^"]*\bis-live\b/);
    // Dans l'ensemble (le vrai serveur sur le direct fabriqué) : la minute, la mi-temps — un match du calendrier sans heure
    // (« scheduled », jour seul) compris.
    EC.__poserLesEnCours(enCours);
    assert.equal(puce((await rendreLaCarte({ match: ville(), clickable: true })).html), 'Direct · 34e');
    assert.equal(puce((await rendreLaCarte({ match: ville({ homeName: 'Ville E', awayName: 'Ville F', homeId: 'fotmob-1205', awayId: 'fotmob-1206' }) })).html), 'Direct · Mi-temps');
    // Une autre rencontre des deux mêmes clubs, des identifiants absents, le mot seul de la page Direct : pas de bouton.
    assert.equal(puce((await rendreLaCarte({ match: ville({ date: '2026-11-21' }) })).html), null);
    assert.equal(puce((await rendreLaCarte({ match: ville({ homeId: null, awayId: null, homeName: '', awayName: '' }) })).html), null, 'sans identifiants FotMob, aucune puce');
    assert.equal(puce((await rendreLaCarte({ match: ville({ homeId: 'Ville A', awayId: 'Ville B', homeName: '', awayName: '' }) })).html), null, 'jamais un nom');
    assert.equal(puce((await rendreLaCarte({ match: ville(), directLink: false })).html), null);
    // Une carte de la page Matchs (des noms, aucun identifiant) : la paire vient des logos — l'annuaire du serveur
    // (POST /api/match-stats/team-ids, fabriqué ici), le même rapprocheur que la nuit ; la puce s'allume quand il a répondu.
    globalThis.fetch = async (url, o = {}) => {
      if (o.method === 'POST' && /\/api\/match-stats\/team-ids$/.test(String(url))) {
        const { teams } = JSON.parse(o.body);
        return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ results: teams.map((t) => ({ ...t, teamId: ANNUAIRE[t.name] ?? null })) }) };
      }
      return fetchDuRendu(url, o);
    };
    const parNoms = ville({ homeId: undefined, awayId: undefined });
    assert.equal(puce((await rendreLaCarte({ match: parNoms })).html), null, 'les logos pas encore lus');
    await attendre(150);
    assert.equal(puce((await rendreLaCarte({ match: parNoms })).html), 'Direct · 34e', 'les logos lus : la paire est dans l’ensemble');
    globalThis.fetch = fetchDuRendu;
    // Le clic : /direct?match=<identifiant FotMob du match en cours>, la page du match, et l'instant d'un rejeu.
    const I = iso(T - 2 * MIN);
    await r.routeur.push(`/matches?instant=${encodeURIComponent(I)}`);
    EC.__poserLesEnCours(enCours, { instant: I });
    const { createSSRApp, h } = await imp(path.join(UI, 'node_modules', 'vue', 'index.mjs'));
    const { renderToString } = await imp(path.join(UI, 'node_modules', 'vue', 'server-renderer', 'index.mjs'));
    const { createPinia } = await imp(path.join(UI, 'node_modules', 'pinia', 'dist', 'pinia.mjs'));
    const Faux = await r.charger('/src/router/index.js');
    const poussees = [];
    const pousser = Faux.router.push;
    Faux.router.push = async (to) => {
      poussees.push(to);
      return null;
    };
    try {
      let interne = null;
      const app = createSSRApp({ render: () => h(Carte, { match: ville(), clickable: true }) });
      app.mixin({
        created() {
          if (this.$.type === Carte) interne = this.$;
        }
      });
      app.use(createPinia());
      app.use(r.routeur);
      assert.equal(puce(await renderToString(app)), 'Direct · 34e', 'la puce, en rejeu');
      interne.setupState.ouvrirLeDirect();
      assert.deepEqual(poussees, [{ path: '/direct', query: { match: '5101', page: PAGE, instant: I } }]);
    } finally {
      Faux.router.push = pousser;
    }
  } finally {
    globalThis.fetch = fetchDuRendu;
    EC.__poserLesEnCours(null);
    await r.routeur.push('/direct');
  }
  assert.deepEqual(r.interdits, []);
  // Le câblage : la puce cliquable vient de l'ensemble, le mot seul du statut (la page Direct, qui EST le direct).
  const mc = lireUi('components', 'matches', 'MatchCard.vue');
  assert.match(mc, /v-if="directLink && enCours"/);
  assert.match(mc, /v-else-if="!directLink && statut === 'live'"/);
  assert.match(mc, /const directEnCours = useDirectEnCours\(\{ suivre: props\.directLink \}\);/);
});

// ------------------------------------------------------------ T-U12 (correctif « écrans 1 », 13/11/2026)

test('T-U12 (écrans 1) la boucle suspendue, le relevé vieux de 25 minutes : la route « en cours » dit périmé et l’âge, la puce dit « Direct » seul (jamais une minute figée), le survol dit l’âge ; le match reste compté', options, async () => {
  const kickoff = iso(T - 49 * MIN);
  const unMatch = (dt) =>
    F.matchSuivi({ id: 9101, homeId: 'fotmob-91', awayId: 'fotmob-92', kickoff, homeName: 'Ville A', awayName: 'Ville B', lectures: [{ t: T - dt, liste: F.listeEnJeu({ id: 9101, homeId: 'fotmob-91', awayId: 'fotmob-92', kickoff, homeName: 'Ville A', awayName: 'Ville B', label: lbl(34), maxTime: 45, h: 1, a: 0 }), detail: null }] });
  const db = F.baseDuDirect();
  const suspendue = F.statut({ suspendu: true, suspenduJusqua: iso(T + 5 * MIN), erreursConsecutives: 5 });
  const perime = await L.enCoursDuDirect({ maintenant: T, database: db, note: null, ...F.sourcesActives(F.etatMinute({ maintenant: T, matchs: [unMatch(25 * MIN)] }), { statut: suspendue }) });
  const frais = await L.enCoursDuDirect({ maintenant: T, database: db, note: null, ...F.sourcesActives(F.etatMinute({ maintenant: T, matchs: [unMatch(20_000)] })) });
  assert.equal(perime.boucle.pourquoi, 'suspendue');
  assert.equal(W.compteDesEnCours(perime), 1, 'le match périmé reste compté dans « N en direct »');
  const p = perime.matchs[0];
  assert.deepEqual([p.fotmobId, p.phase, p.minute, p.perime, p.ageS], ['9101', 'jeu', 34, true, 1500]);
  assert.equal(W.minuteDeLaPuce(p), null, 'relevé périmé : aucune minute');
  assert.deepEqual([frais.matchs[0].perime, frais.matchs[0].ageS], [false, 20]);
  assert.equal(W.minuteDeLaPuce(frais.matchs[0]), '34e', 'relevé frais : la minute');
  // La carte de rencontre : « Direct » seul, le survol dit l'âge ; le relevé frais garde le titre d'avant, mot pour mot.
  const EC = await r.charger('/src/composables/useDirectEnCours.js');
  const match = { matchId: 'cal-2026-11-14-ville-a-ville-b', commenceTime: null, date: '2026-11-14', league: 'Premier League - England', homeName: 'Ville A', awayName: 'Ville B', homeId: 'fotmob-91', awayId: 'fotmob-92', homeGoals: null, awayGoals: null, status: 'scheduled' };
  const bouton = (html) => /<button type="button" class="mcard__status is-live is-direct-link" data-direct-link title="([^"]*)">([\s\S]*?)<\/button>/.exec(html);
  try {
    await r.routeur.push('/matches');
    EC.__poserLesEnCours(perime);
    assert.equal(EC.useDirectEnCours({ suivre: false }).compte.value, 1);
    const b = bouton(net(await r.rendre(Carte, { match, clickable: true }, [])).html);
    assert.ok(b, 'la puce cliquable est là');
    assert.equal(texteDe(b[2]), 'Direct');
    assert.equal(b[1], 'État relevé il y a 25 min — périmé : voir ce match sur la page Direct');
    EC.__poserLesEnCours(frais);
    const f = bouton(net(await r.rendre(Carte, { match, clickable: true }, [])).html);
    assert.equal(texteDe(f[2]), 'Direct · 34e');
    assert.equal(f[1], 'Voir ce match sur la page Direct');
  } finally {
    EC.__poserLesEnCours(null);
    await r.routeur.push('/direct');
  }
  assert.deepEqual(r.interdits, []);
});

test('Correctifs D2, point 2 d —« N en direct » en tête de la page Matchs : le compte de l’ensemble (tous les matchs que la boucle suit en cours, 60 → 60), plus l’heure du coup d’envoi ; son lien vers /direct', options, async () => {
  const em = F.etatMinute({ maintenant: T, matchs: F.matchsEnJeu(60, { maintenant: T, minute: 20 }) });
  const s = await construire({ em, sans: [], cotes: null });
  const enCours = await L.enCoursDuDirect(s.base);
  assert.equal(W.compteDesEnCours(enCours), 60);
  const EC = await r.charger('/src/composables/useDirectEnCours.js');
  EC.__poserLesEnCours(enCours);
  try {
    await r.routeur.push('/matches');
    await r.rendre(Carte, { match: { date: '2026-11-14', homeName: 'Ville A', awayName: 'Ville B', homeId: 'fotmob-1201', awayId: 'fotmob-1202' } }, []);
    assert.equal(EC.useDirectEnCours({ suivre: false }).compte.value, 60);
  } finally {
    EC.__poserLesEnCours(null);
    await r.routeur.push('/direct');
  }
  const vue = lireUi('views', 'MatchesView.vue');
  assert.match(vue, /const directEnCours = useDirectEnCours\(\);/);
  assert.match(vue, /return \{ enDirect: directEnCours\.compte\.value, duJour, competitions: competitions\.size \};/);
  assert.doesNotMatch(vue, /enDirect\+\+/, 'plus jamais compté à l’heure du coup d’envoi');
  // Correctifs D3 (point 3) : le lien garde l'instant d'un rejeu (`:to="lienDuDirect"`, essai « Correctifs D3, point 3 »).
  assert.match(vue, /<RouterLink\s+v-if="resume\.enDirect"\s+:to="lienDuDirect"/);
});

test('Correctifs D2, point 2 e — l’encart lit le direct par l’identifiant FotMob du match quand l’ensemble le donne (même sans heure de coup d’envoi) : son adresse le porte, la fin suit R11', options, async () => {
  const s = await construire();
  const I = iso(T - 2 * MIN);
  const PAGE = 'cal-2026-11-14-ville-a-ville-b';
  await r.routeur.push('/direct');
  const parId = net(await r.rendre(Encart, { fotmobId: '5101', matchId: PAGE, instant: I }, [[/\/api\/direct\/match\?id=5101&instant=/, { code: 200, corps: s.details['5101'] }]]));
  assert.deepEqual(r.interdits, []);
  assert.deepEqual(parId.appels.map(sansHote), [`/api/direct/match?id=5101&instant=${encodeURIComponent(I)}`]);
  assert.match(parId.html, /data-bloc="direct-encart" data-etat="suivi"/);
  assert.doesNotMatch(texteDe(parId.html), /\d\s*%/, 'mineur du 13/11 soir (écrans 11) : l’encart suivi, note nulle, aucun pourcentage');
  assert.ok(parId.html.includes(`href="/direct?match=5101&amp;page=${PAGE}&amp;instant=${I}"`), 'l’adresse de la page Direct, par l’identifiant du match');
  // La fin (R11) : « terminé » avec son score et l'heure de la fin ; « coupure-4h ».
  const fin = { ...s.details['5101'], suivi: false, raison: 'fini', fin: { statut: 'terminé', raison: 'fini', score: { home: 2, away: 1 }, finReleveeLe: iso(T - 5 * MIN) }, match: null, reference: null, courbe: null };
  const rf = await r.rendre(Encart, { fotmobId: '5101', matchId: PAGE }, [[/\/api\/direct\/match\?id=5101$/, { code: 200, corps: fin }]]);
  assert.match(texteDe(rf.html), /Match terminé : 2-1 \(FotMob, fin relevée à 21 h 29\)\./);
  // Le câblage de la page : la paire de la page (ses identifiants, sinon ceux de ses logos), le jour ; l'encart reste monté.
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(vue, /const directEnCours = useDirectEnCours\(\);/);
  assert.match(vue, /homeId: clubsDeLaPage\.value\.home \?\? logo\(match\.value\.home\),/);
  assert.match(vue, /jour: coupDEnvoi\.value \?\? match\.value\.commenceTime \?\? null/);
  assert.doesNotMatch(lireUi('views', 'UpcomingMatchView.vue'), /directApi/, 'la page ne lit pas le direct elle-même');
});

test('Correctifs D2, point 3 — chaque carte du direct : un vrai lien « Page du match » quand l’identifiant du match DANS L’APPLI est sûr (ligne de nuit, ou l’unique entrée du calendrier du jour par les identifiants FotMob des deux clubs), qui garde l’instant ; sinon la phrase', options, async () => {
  const PAGE = 'cal-2026-11-14-club-un-club-deux';
  const ANNUAIRE = { 'Club Un': 'fotmob-1201', 'Club Deux': 'fotmob-1202', 'Club Trois': 'fotmob-1203', 'Club Quatre': 'fotmob-1204', 'Trois Bis': 'fotmob-1203', 'Quatre Bis': 'fotmob-1204' };
  const entree = (matchId, homeName, awayName) => ({ matchId, date: '2026-11-14', league: 'Premier League - England', homeName, awayName });
  const CALENDRIER = [entree(PAGE, 'Club Un', 'Club Deux'), entree('cal-2026-11-14-club-trois-club-quatre', 'Club Trois', 'Club Quatre'), entree('cal-2026-11-14-trois-bis-quatre-bis', 'Trois Bis', 'Quatre Bis')];
  const s = await construire({ extra: { calendrier: (jour) => CALENDRIER.filter((c) => c.date === jour), club: (nom) => ANNUAIRE[nom] ?? null } });
  const page = (id) => s.tableau.matchs.find((e) => e.fotmobId === id).page;
  assert.deepEqual(page('5101'), { id: PAGE, source: 'calendrier' });
  assert.equal(page('5102'), null, 'deux entrées répondent');
  assert.equal(page('5103'), null, 'aucune entrée');
  const I = iso(T - 2 * MIN);
  for (const [adresse, suite] of [['/direct', ''], [`/direct?instant=${encodeURIComponent(I)}`, `?instant=${I}`]]) {
    const rendu = await rendreLaPage(s, adresse);
    const carte = carteDe(rendu.html, '5101');
    assert.ok(carte.includes(`<a href="/match-a-venir/${PAGE}${suite}" class="cm-link" data-lien="page-du-match">Page du match</a>`), `${adresse} : le lien de la page du match`);
    assert.doesNotMatch(texteDe(carte), /à ouvrir depuis Matchs/);
    for (const id of ['5102', '5103']) {
      const autre = carteDe(rendu.html, id);
      assert.doesNotMatch(autre, /data-lien="page-du-match"/, id);
      assert.match(texteDe(autre), /Page du match : à ouvrir depuis Matchs/, id);
    }
  }
});

test('Correctifs D2, point 4 — en rejeu, la provenance de l’en-tête dit « instantanés rangés · rejeu du … », jamais la liste du jour d’une boucle coupée ; en direct, la liste du jour de FotMob', options, async () => {
  assert.deepEqual(W.provenanceDeLEnTete({ instant: '2026-11-07T15:40:00.000Z', listeLueLe: null }), { source: 'instantanés rangés', quand: 'rejeu du 07/11 à 16 h 40', releveLe: '2026-11-07T15:40:00.000Z', rejeu: true, titre: 'Instantanés rangés dans la base : rejeu du 07/11 à 16 h 40.' });
  assert.deepEqual(W.provenanceDeLEnTete({ instant: null, listeLueLe: null }), { source: 'FotMob (liste du jour)', quand: 'liste pas encore lue', releveLe: null, rejeu: false, titre: 'FotMob (liste du jour) : liste pas encore lue.' });
  L.viderLesTables();
  const db = F.baseDuDirect();
  const K = iso(T - 40 * MIN);
  F.poserUnInstantane(db, { fotmobId: 5401, takenAt: iso(T - 9 * MIN), kickoff: K, homeId: 'fotmob-1401', awayId: 'fotmob-1402', homeName: 'Ville I', awayName: 'Ville J', label: lbl(31), minute: 31, h: 1, a: 0 });
  const I = iso(T - 5 * MIN);
  const opts = { maintenant: T, database: db, note: null, instant: I, rejeuPermis: true, ligneDe: (q) => F.ligneFabriquee(q), calendrier: () => [] };
  const tableau = await L.tableauDuDirect(opts);
  /** Les puces de l'en-tête de la page : du bloc des puces au bouton « Relire ». */
  const puces = (html) => {
    const [i, j] = [html.indexOf('class="cm-hero__chips"'), html.indexOf('data-action="relire"')];
    assert.ok(i >= 0 && j > i, 'les puces de l’en-tête');
    return html.slice(i, j);
  };
  const rendu = await rendreLaPage({ tableau, details: {} }, `/direct?instant=${encodeURIComponent(I)}`);
  const chips = puces(rendu.html);
  assert.match(chips, /data-provenance="instantanes"/);
  assert.match(chips, /<span class="prov__source">(?:<!--\[-->)?instantanés rangés(?:<!--\]-->)?<\/span><span class="prov__when">(?:<!--\[-->)?rejeu du 14\/11 à 21 h 29(?:<!--\]-->)?<\/span>/);
  assert.doesNotMatch(chips, /liste du jour|liste pas encore lue|liste lue/);
  // Le « · » entre les deux, c'est la pastille qui le dessine.
  assert.match(lireUi('components', 'common', 'ProvenanceChip.vue'), /\.prov__when::before \{\n {2}content: '·';/);
  // En direct : la liste du jour de FotMob.
  const vivant = await rendreLaPage(await construire(), '/direct');
  const chipsVivant = puces(vivant.html);
  assert.match(chipsVivant, /data-provenance="liste"/);
  assert.match(texteDe(chipsVivant), /FotMob \(liste du jour\) (liste lue à \d\d h \d\d|liste pas encore lue)/);
});

// ------------------------------------------------------------ correctifs D3 (12/11/2026)

/** Le bloc d'un match terminé de la page : sa carte, sa fin, sa page (jusqu'au terminé suivant ou à la fin de la section). */
const finiDe = (html, id) => {
  const i = html.indexOf(`<div class="direct-board__fini" data-match="${id}">`);
  assert.ok(i >= 0, `le terminé ${id}`);
  const j = html.indexOf('<div class="direct-board__fini"', i + 1);
  return html.slice(i, j < 0 ? html.indexOf('</section>', i) : j);
};

test('Correctifs D3, point 2 — sous chaque match terminé : le lien « Page du match terminé » (/match/<clé> : la fiche du magasin que le serveur a trouvée par les identifiants FotMob et le jour), qui garde l’instant d’un rejeu ; sans fiche, pas de lien et la phrase « pas encore rangée » ; jamais la page d’un match à venir, jamais un nom', options, async () => {
  const JOUR = '2026-11-14';
  const K = iso(T - 130 * MIN);
  const fini = (id, homeId, awayId, homeName, awayName) => ({
    id: String(id),
    league: 'Premier League - England',
    leagueKey: 'ENG|Premier League',
    date: JOUR,
    kickoff: K,
    homeId,
    awayId,
    homeName,
    awayName,
    at: T - 10 * MIN,
    liste: F.listeEnJeu({ id, homeId, awayId, kickoff: K, label: 'FT', h: 2, a: 0, finished: true }),
    fin: { status: 'terminé', homeGoals: 2, awayGoals: 0 },
    memoire: null
  });
  const CLE = `${JOUR}-ville-k-ville-l`;
  const fiches = (db) => {
    COTES_5101(db);
    F.poserUneFiche(db, { matchKey: CLE, date: JOUR, homeId: 'fotmob-1901', awayId: 'fotmob-1902', fotmobId: 5901, homeName: 'Ville K', awayName: 'Ville L' });
    // Le piège du nom : une fiche aux MÊMES noms que 5902, mais d'autres clubs (identifiants) → jamais sa page.
    F.poserUneFiche(db, { matchKey: `${JOUR}-ville-m-ville-n`, date: JOUR, homeId: 'fotmob-1993', awayId: 'fotmob-1994', homeName: 'Ville M', awayName: 'Ville N' });
  };
  const em = F.etatMinute({ maintenant: T, matchs: PRINCIPAL(), finis: [fini(5901, 'fotmob-1901', 'fotmob-1902', 'Ville K', 'Ville L'), fini(5902, 'fotmob-1903', 'fotmob-1904', 'Ville M', 'Ville N')] });
  const s = await construire({ em, cotes: fiches });
  assert.deepEqual(Object.fromEntries(s.tableau.finis.map((f) => [f.fotmobId, f.page])), { 5901: { id: CLE, source: 'magasin' }, 5902: null });
  const I = iso(T - 2 * MIN);
  for (const [adresse, suite] of [['/direct', ''], [`/direct?instant=${encodeURIComponent(I)}`, `?instant=${I}`]]) {
    const rendu = await rendreLaPage(s, adresse);
    const avec = finiDe(rendu.html, '5901');
    assert.ok(avec.includes(`<a href="/match/${CLE}${suite}" class="cm-link" data-lien="page-du-fini">Page du match terminé</a>`), `${adresse} : le lien de la page du match terminé`);
    assert.doesNotMatch(texteDe(avec), /pas encore rangée/);
    const sans = finiDe(rendu.html, '5902');
    assert.doesNotMatch(sans, /<a\b/, `${adresse} : aucun lien sans fiche`);
    assert.match(texteDe(sans), /Page du match terminé pas encore rangée : elle arrive avec une prochaine actualisation des résultats\./, `${adresse} : la phrase dit pourquoi`);
    assert.ok(texteDe(sans).includes(W.PHRASE_SANS_PAGE_DU_FINI));
    assert.doesNotMatch(blocDe(rendu.html, 'direct-finis'), /match-a-venir/, 'jamais la page d’un match à venir');
  }
  // La règle de l'écran : seulement l'identifiant que le serveur donne ; l'instant d'un rejeu gardé, jamais un instant illisible.
  assert.deepEqual(W.lienDuFini({ page: { id: CLE, source: 'magasin' } }, I), { path: `/match/${CLE}`, query: { instant: I } });
  assert.deepEqual(W.lienDuFini({ page: { id: 'clé à/part', source: 'magasin' } }), { path: `/match/${encodeURIComponent('clé à/part')}`, query: {} });
  assert.deepEqual(W.lienDuFini({ page: { id: CLE, source: 'magasin' } }, 'pas une date'), { path: `/match/${CLE}`, query: {} });
  for (const f of [{ page: null }, { page: { id: '' } }, { page: { id: 5901 } }, {}, null]) assert.equal(W.lienDuFini(f, I), null, JSON.stringify(f));
});

test('Correctifs D3, point 3 — « N en direct » en rejeu : la page Matchs rendue, son lien garde l’instant de l’adresse (/direct?instant=…), comme la puce « Direct » des cartes ; hors rejeu, /direct tout court', options, async () => {
  const em = F.etatMinute({ maintenant: T, matchs: F.matchsEnJeu(3, { maintenant: T, minute: 20 }) });
  const s = await construire({ em, sans: [], cotes: null });
  const enCours = await L.enCoursDuDirect(s.base);
  assert.equal(W.compteDesEnCours(enCours), 3);
  const I = iso(T - 2 * MIN);
  const Matchs = (await r.charger('/src/views/MatchesView.vue')).default;
  const EC = await r.charger('/src/composables/useDirectEnCours.js');
  /** Le lien « N en direct » de la page Matchs rendue à `adresse`, l'ensemble des matchs en cours posé pour `instant`. */
  const lien = async (adresse, instant) => {
    EC.__poserLesEnCours(enCours, { instant });
    await r.routeur.push(adresse);
    const rendu = net(await r.rendre(Matchs, {}, []));
    assert.deepEqual(r.interdits, [], 'la page Matchs rendue sans aucun appel');
    const m = /<a href="([^"]*)" class="cm-chip is-danger matches-hero__direct" data-direct-link[^>]*>([\s\S]*?)<\/a>/.exec(rendu.html);
    assert.ok(m, `${adresse} : le lien « N en direct »`);
    return { href: m[1], texte: texteDe(m[2]) };
  };
  try {
    assert.deepEqual(await lien(`/matches?instant=${encodeURIComponent(I)}`, I), { href: `/direct?instant=${I}`, texte: '3 en direct' });
    assert.deepEqual(await lien('/matches', null), { href: '/direct', texte: '3 en direct' });
  } finally {
    EC.__poserLesEnCours(null);
    await r.routeur.push('/direct');
  }
  // La règle : celle de la puce (adresseDuDirect) ; un instant illisible n'est jamais recopié.
  assert.deepEqual(W.adresseDuDirect({ instant: I }), { path: '/direct', query: { instant: I } });
  assert.deepEqual(W.adresseDuDirect({ instant: null }), { path: '/direct', query: {} });
  assert.deepEqual(W.adresseDuDirect({ instant: 'pas une date' }), { path: '/direct', query: {} });
  const vue = lireUi('views', 'MatchesView.vue');
  assert.match(vue, /const lienDuDirect = computed\(\(\) => adresseDuDirect\(\{ instant: directEnCours\.instant\.value \}\)\);/);
  assert.match(vue, /<RouterLink\s+v-if="resume\.enDirect"\s+:to="lienDuDirect"/);
  assert.doesNotMatch(vue, /\bto="\/direct"/, 'plus aucun lien vers le direct qui perd l’instant');
});
