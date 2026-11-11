/**
 * LA FICHE DU PRONOSTIC À L'ÉCRAN (étape 40 du plan, lot 1, 10/11/2026) — « Pourquoi ce pourcentage ? » sur la page d'un match
 * à venir, et l'avis de l'IA rattaché au pronostic qu'il explique (le même marché ET le même choix), rendus côté serveur, sans
 * navigateur ni serveur de développement (aides/rendu.mjs : `fetch` remplacé, tout appel refusé et compté ; horloge figée au
 * 05/10/2026 12 h Z) :
 *   node --test test/ficheDuPronosticEcran.test.mjs        (depuis server/)
 *
 * Les réponses ne sont pas écrites à la main : le VRAI serveur les produit (aides/donneesPageMatch.mjs, payloadsDuServeur :
 * copie isolée, base d'essai, relevé The Odds API fabriqué) ; l'avis de l'IA est l'analyse archivée de l'étape 45
 * (fixtures/analyses-etape-45.json, `complete`) ; les 4 avis RÉELS dont le choix diffère de celui du pronostic figé de leur
 * marché (critique, constat 8 : 4 sur 21 851) sont dans fixtures/avis-autre-choix-etape-40.json (matchId, marché, pick et
 * libellé figé seulement). Chaque cas part de ces vraies formes, retouchées une à une ; chaque attendu est recalculé de la
 * charge (ou écrit ici en entier pour les phrases décidées), jamais par l'utilitaire testé. Aucun test n'ouvre une base.
 *   T-F1  ficheDuPronostic.js est une règle pure ; ses imports de proche en proche ; ni code Unicode échappé ni toFixed ; ses
 *         huit exports, et rien de ce que le lot 1 a retiré (« Ce qui manque », la part de chaque estimation, le suivi) ;
 *   T-F2  les 15 avis de `complete` rattachés à leur pronostic par le libellé exact, chacun à sa clé (marché, choix) ;
 *   T-F3  les variantes : libellé souple seul, deux qui répondent, aucun, deux pronostics départagés par le pick ; le choix
 *         comparé (accents et casse ignorés) ; les 4 avis réels : 2 fautes de nom rattachées, 2 « autre choix » ;
 *   T-F4  clubsDuMatch : la compo de la page d'abord, sinon combinaison.clubs ; « fotmob-0 » et un nom refusés ;
 *   T-F6  l'origine du 1 / N / 2 et le relevé de ses cotes : juges, puis referenceBooks ; moyenne ; statistiques ; origine non
 *         dite ; l'heure payante et la gratuite, la plus ancienne, une heure manquante, le fournisseur, le délai réglé ;
 *   T-F7  la fiche rendue sur la vraie réponse : ses trois familles et leurs lignes, l'heure ET l'âge du relevé, aucun chiffre
 *         inventé, aucun mot interdit, ni jauge ni barre, un logo par identifiant et aucune lecture ; ses phrases tiennent au
 *         code du serveur (10 et 6 matchs, avantage du terrain, une loi par type apprise sur 2024-25) ;
 *   T-F8  chaque état : chargement, erreur, sans analyse, origine non dite, relevé trop vieux, heure inconnue, match commencé,
 *         cotes gratuites seules, moyenne, sans cote, candidate de l'étape 27, statistiques ou buts absents, sans identifiant,
 *         coupe — les trois familles toujours là, et la ligne du bas ;
 *   T-F9  les cartes de l'IA : « cote juste », « aucune cote de bookmaker relevée automatiquement » hors du 1 / N / 2,
 *         « À vérifier » par l'identifiant du marché à côté du verdict ; l'avis sur un autre choix dans l'onglet ;
 *   T-F12 le câblage de la page (balises exactes), la phrase des 90 minutes à sa seule place, aucun service ;
 *   T-F14 le paragraphe de DESIGN.md, à sa place (35 < 40 < 44).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SERVEUR } from './aides/isolement.mjs';
import { UI, imp, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, texteDe, blocDe } from './aides/rendu.mjs';
import * as D from './aides/donneesPageMatch.mjs';

const F = await imp(path.join(UI, 'src', 'utils', 'ficheDuPronostic.js'));
const M = F.MOTS_DE_LA_FICHE;
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const lireSrc = (...p) => fs.readFileSync(path.join(SERVEUR, 'src', ...p), 'utf8');
const copie = (x) => JSON.parse(JSON.stringify(x));
const compter = (texte, motif) => texte.split(motif).length - 1;
const FIXTURES = path.join(SERVEUR, 'test', 'fixtures');
const COMPLETE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'analyses-etape-45.json'), 'utf8')).complete;
const CAS_REELS = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'avis-autre-choix-etape-40.json'), 'utf8'));

// Les phrases DÉCIDÉES (orchestrateur : O2 et O4 ; critique : constats 3, 5 et 8), écrites ici en entier.
const LIGNE_DU_BAS = 'Hors du 1 / N / 2, aucune cote de vos bookmakers n’est relevée automatiquement : la cote montrée est la cote juste du moteur (1 divisée par sa probabilité). Une cote vue chez votre bookmaker se saisit à la main dans l’onglet Marchés : elle sert au verdict, sans changer ce pourcentage.';
const NE_LIT_PAS = 'Le moteur ne lit pas les compositions : elles ne comptent dans ce pourcentage qu’à travers les cotes.';
const AVANT_ANNONCE = (h) => `Cotes de référence relevées avant l’annonce des compositions, attendue vers ${h} : elles n’en tiennent pas compte.`;
const APRES_ANNONCE = 'Cotes de référence relevées après l’heure habituelle de l’annonce des compositions : elles peuvent en tenir compte.';
const STATS_LOI = 'Le pourcentage de chaque ligne (plus ou moins de…) en sort par une loi de comptage réglée une seule fois, pour tous les championnats, sur la saison 2024-25.';
const BUTS_SANS_COTE = 'Les pourcentages du total de buts, de « les deux équipes marquent » et des buts d’une équipe sortent des buts attendus ci-dessus (chaque score possible y reçoit sa probabilité) : aucune cote n’y entre.';
const BUTS_COMBINE = 'Pour « Résultat + total buts », la part du résultat vient du 1 / N / 2 ci-dessus ; le partage des buts vient du modèle.';
const AUTRE_CHOIX = (avis, moteur) => `Cet avis porte sur un autre choix (« ${avis} ») que le pronostic du moteur sur ce marché (« ${moteur} ») : aucun pourcentage du moteur ne lui correspond.`;
const SANS_LIVRE = 'aucune cote de bookmaker relevée automatiquement';
/** Ce que la fiche n'écrit jamais (critique : constats 1 à 4 et 9, mineurs 12 et 16 ; O2 ; O3 ; la candidate de la 27 ; les coupes). */
const INTERDITS = [
  /sûr/i,
  /fragile/i,
  /pas encore mesurée/,
  /officielle/i,
  /chaque championnat/,
  /Ce qui manque/,
  /ni de Pinnacle/,
  /Cotes marché \(Odds API\)/,
  /The Odds API ne relève que/,
  /ni la prolongation, ni les tirs au but/,
  /palier/i,
  /puissance/,
  /demarrer-cotemaster/,
  /confiance/i,
  /Place réservée/i,
  /à venir · étape 40/,
  /Ce que disent les/,
  /autre score/,
  /Modèle de buts unique/,
  /calé sur/i,
  /lot 2|étape 38/
];

// ---------------------------------------------------------------- les vraies réponses du serveur (une fois)
let memo = null;
const P = () => (memo ??= D.payloadsDuServeur());
const resultatA = () => copie(P().analyses['essai-a'].corps);
const matchA = () => copie(P().liste.corps.matches.find((m) => m.matchId === 'essai-a'));
const lu = (result) => ({ loading: false, error: null, result });
/** Les identifiants FotMob de Man City et de Liverpool : ceux de la composition de la page (aides/donneesPageMatch.mjs). */
const IDS = Object.freeze({ home: D.compositionPubliee(45).home.teamId, away: D.compositionPubliee(45).away.teamId });

// Les nombres et les heures, recalculés ici (jamais par l'utilitaire testé).
const fr = (x, n) => x.toLocaleString('fr-FR', { minimumFractionDigits: n, maximumFractionDigits: n });
const PARIS = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Paris' });
const aParis = (t) => {
  const p = Object.fromEntries(PARIS.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { jour: `${p.day}/${p.month}`, heure: `${p.hour} h ${p.minute}` };
};
const heureDite = (t) => `le ${aParis(t).jour} à ${aParis(t).heure}`;

// ---------------------------------------------------------------- le rendu (un seul pour tout le fichier)
let rendu = null;
const ouvrir = async () => (rendu ??= await ouvrirLeRendu({ cibles: /nothing\.vue$/, heure: new Date(D.MAINTENANT).toISOString() }));
after(async () => {
  if (rendu) await rendu.fermer();
});
/** Le rendu sans les attributs des styles scopés (data-v-…). */
const net = (r) => ({ ...r, html: r.html.replace(/ data-v-[a-z0-9]+(?:="")?/g, '') });
const composant = async (chemin) => (await (await ouvrir()).charger(chemin)).default;
/** La fiche rendue avec `props` ; `a` : l'heure de l'horloge de l'appli pendant ce rendu (puis remise). */
async function rendreLaFiche(props, { a = null } = {}) {
  const r = await ouvrir();
  const avant = r.horloge.liveNow.value;
  if (a !== null) r.horloge.liveNow.value = a;
  try {
    return net(await r.rendre(await composant('/src/components/analysis/PercentageWhyCard.vue'), props, []));
  } finally {
    r.horloge.liveNow.value = avant;
  }
}
const fiche = (result, extra = {}) => ({ analyse: lu(result), match: matchA(), homeId: IDS.home, awayId: IDS.away, provenanceButs: null, ...extra });
/** Chaque famille : son HTML, du titre à la famille suivante (ou à la ligne du bas). */
function famillesDe(html) {
  return Object.fromEntries(
    html
      .split('data-famille="')
      .slice(1)
      .map((m) => [m.slice(0, m.indexOf('"')), m.slice(m.indexOf('>') + 1).split('class="why__hors"')[0].replace(/<[^>]*$/, '')])
  );
}
const texte = (html) => espaces(texteDe(html));
const lignesDe = (html) => [...html.matchAll(/data-ligne="([^"]+)"/g)].map((m) => m[1]);
/** Le contenu (dd) d'une ligne de la fiche, en texte (sans son intitulé). */
const ligne = (html, cle) => {
  const i = html.indexOf(`data-ligne="${cle}"`);
  if (i < 0) return null;
  const j = html.indexOf('<dd', i);
  return texte(html.slice(html.indexOf('>', j) + 1, html.indexOf('</dd>', j)));
};
const logos = (html) => [...html.matchAll(/<span class="crest"[\s\S]*?<\/span>/g)].map((m) => m[0]);

// ================================================================ T-F1

test('T-F1 — ficheDuPronostic.js est une règle pure : ses imports de proche en proche, ni code Unicode échappé ni toFixed, ses huit exports, rien de ce que le lot 1 a retiré', () => {
  assert.deepEqual([...reglesPures('ficheDuPronostic.js')].sort(), ['avantDeParier.js', 'ficheDuPronostic.js', 'langageParis.js', 'matchStatus.js']);
  const source = lireUi('utils', 'ficheDuPronostic.js');
  assert.ok(!source.includes(`${String.fromCharCode(92)}u`), 'aucun code Unicode échappé (les caractères se construisent par String.fromCharCode)');
  assert.doesNotMatch(source, /toFixed/, 'nombres à la virgule (toLocaleString)');
  // L'instant est reçu : l'horloge n'est lue qu'en valeur par défaut de `maintenant` (comme dans langageParis.js).
  assert.deepEqual([...source.matchAll(/(\w+) = Date\.now\(\)/g)].map((m) => m[1]), ['maintenant', 'maintenant']);
  assert.equal(compter(source, 'Date.now()'), 2);
  assert.deepEqual(Object.keys(F).sort(), ['MOTS_DE_LA_FICHE', 'butsDuMatch', 'clubsDuMatch', 'figeDeLAvis', 'origineDuResultat', 'pourquoiDuPourcentage', 'releveDuResultat', 'statsDuMatch']);
  assert.ok(Object.isFrozen(M) && Object.isFrozen(M.libelles), 'les mots sont figés');
  // O3 (« Ce qui manque » reste dans l'encadré « Avant de parier — à blanc »), O4 (aucune part d'estimation), O7 (le suivi, la
  // version et le dépliant de l'IA au lot 2) : rien de cela dans l'utilitaire.
  assert.doesNotMatch(source, /manqueDuResultat|rienNeManque|notePart|versionDite|suiviDuPronostic|rattacherAuBilan|avisDeLIA|cleDeSelection|combinaison\.mots/);
  for (const v of Object.values(M).filter((x) => typeof x === 'string')) for (const motif of INTERDITS) assert.doesNotMatch(v, motif, v);
});

// ================================================================ T-F2

test('T-F2 — les 15 avis de l’analyse archivée rattachés à leur pronostic par le libellé exact, chacun à sa clé (marché, choix), sur le même choix', () => {
  const figes = COMPLETE.engineSnapshot.marketPredictions;
  const vues = COMPLETE.analysis.marketViews;
  assert.equal(vues.length, 15);
  const cle = (p) => `${p.marketId}${p.params?.team ? `:${p.params.team}` : ''} ${p.params?.side ?? p.params?.outcome ?? p.params?.key ?? ''}@${p.params?.line ?? ''}`;
  const r = vues.map((v) => F.figeDeLAvis(v, figes));
  assert.deepEqual(r.map((x) => x.rattachement), Array(15).fill('libelle-exact'));
  assert.deepEqual(r.map((x) => x.raison), Array(15).fill(null));
  assert.deepEqual(r.map((x) => x.choix), Array(15).fill(null));
  assert.deepEqual(
    r.map((x) => cle(x.fige)),
    [
      'result home@',
      'totalGoals under@2.5',
      'bothTeamsScore no@',
      'resultAndTotal homeUnder@3.5',
      'teamGoals:home under@1.5',
      'teamGoals:away under@0.5',
      'totalCorners over@5.5',
      'teamCorners:home over@2.5',
      'teamCorners:away over@1.5',
      'totalShots over@20.5',
      'teamShots:home under@19.5',
      'teamShots:away under@15.5',
      'totalShotsOnTarget over@5.5',
      'teamShotsOnTarget:home over@2.5',
      'teamShotsOnTarget:away under@5.5'
    ]
  );
  r.forEach((x, i) => {
    assert.equal(x.fige, figes.find((f) => f.market === vues[i].market), vues[i].market);
    assert.equal(x.fige.predictedLabel, vues[i].pick, `${vues[i].market} : le même choix`);
    assert.equal(x.candidat, x.fige);
  });
});

// ================================================================ T-F3

test('T-F3 — les variantes : libellé souple seul, deux qui répondent, aucun, deux pronostics départagés par le pick ; le choix comparé ; les 4 avis réels (2 fautes de nom rattachées, 2 sur un autre choix)', () => {
  const figes = COMPLETE.engineSnapshot.marketPredictions;
  const vue = (market) => copie(COMPLETE.analysis.marketViews.find((v) => v.market === market));
  const fige = (market) => figes.find((f) => f.market === market);
  // Le libellé souple (tiret simple, sans accent, autre casse), quand UN seul pronostic y répond.
  const souple = { ...vue('Tirs cadrés — Girona'), market: 'TIRS CADRES - Girona' };
  assert.deepEqual(F.figeDeLAvis(souple, figes), { fige: fige('Tirs cadrés — Girona'), rattachement: 'libelle-souple', raison: null, candidat: fige('Tirs cadrés — Girona'), choix: null });
  // Deux qui répondent au libellé souple : jamais « le premier trouvé ».
  const double = [...figes, { ...copie(fige('Tirs cadrés — Girona')), market: 'Tirs cadres — Girona' }];
  assert.deepEqual(F.figeDeLAvis({ ...souple, market: 'Tirs cadrés - Girona' }, double), { fige: null, rattachement: null, raison: 'ambigu', candidat: null, choix: null });
  // Aucun pronostic de ce marché.
  assert.equal(F.figeDeLAvis({ market: 'Cartons — Girona', pick: 'Girona — Plus de 1.5 cartons' }, figes).raison, 'sans-pronostic');
  assert.equal(F.figeDeLAvis({ market: 'Total buts', pick: 'Moins de 2.5 buts' }, null).raison, 'sans-pronostic');
  // Deux pronostics de même libellé : départagés par le pick ; un pick inconnu → ambigu.
  const deux = [...figes, { ...copie(fige('Total buts')), params: { line: 3.5, side: 'under' }, predictedLabel: 'Moins de 3.5 buts' }];
  const parPick = F.figeDeLAvis(vue('Total buts'), deux);
  assert.deepEqual([parPick.rattachement, parPick.fige.predictedLabel, parPick.fige.params.line], ['libelle-exact+pick', 'Moins de 2.5 buts', 2.5]);
  assert.equal(F.figeDeLAvis({ ...vue('Total buts'), pick: 'Plus de 1.5 buts' }, deux).raison, 'ambigu');
  // Le choix est comparé : la partie après le dernier tiret, sans accents ni casse.
  const memeChoix = F.figeDeLAvis({ ...vue('Buts — Girona'), pick: 'GIRONA — moins de 1.5 BUTS' }, figes);
  assert.deepEqual([memeChoix.raison, memeChoix.fige], [null, fige('Buts — Girona')]);
  const autre = F.figeDeLAvis({ ...vue('Total buts'), pick: 'Plus de 2.5 buts' }, figes);
  assert.deepEqual(autre, { fige: null, rattachement: 'libelle-exact', raison: 'autre-choix', candidat: fige('Total buts'), choix: { avis: 'Plus de 2.5 buts', moteur: 'Moins de 2.5 buts' } });
  assert.equal(F.figeDeLAvis({ ...vue('Total buts'), pick: '' }, figes).fige, fige('Total buts'), 'sans pick, rien à comparer');
  assert.equal(F.figeDeLAvis({ ...vue('Résultat + Total buts'), pick: 'Mallorca & Moins de 3.5 buts' }, figes).raison, 'autre-choix', 'sans tiret, le libellé entier');
  // Les 4 avis réels (archive du 10/11/2026, 21 851 avis) : « NK Istra 1061 » (faute de l'IA) garde son pronostic, le choix
  // étant le même ; « Palermo — Plus de 0.5 buts » sous « Tirs — Palermo » et « 0.5 corners » sous « 2.5 corners » : autre choix.
  assert.equal(CAS_REELS.length, 4);
  for (const c of CAS_REELS) assert.deepEqual(Object.keys(c), ['matchId', 'market', 'pick', 'predictedLabel'], 'quatre champs seulement');
  const issues = CAS_REELS.map((c) => [c.matchId, F.figeDeLAvis({ market: c.market, pick: c.pick }, [{ market: c.market, predictedLabel: c.predictedLabel }])]);
  assert.deepEqual(
    issues.map(([m, r]) => [m, r.rattachement, r.raison, r.fige?.predictedLabel ?? null]),
    [
      ['cal-2026-10-26-nk-istra-1961-hajduk-split', 'libelle-exact', null, 'NK Istra 1961 — Plus de 2.5 tirs cadrés'],
      ['cal-2026-11-07-nk-istra-1961-rijeka', 'libelle-exact', null, 'NK Istra 1961 — Moins de 7.5 tirs cadrés'],
      ['cal-2026-11-06-ascoli-palermo', 'libelle-exact', 'autre-choix', null],
      ['cal-2026-10-21-atletico-de-san-luis-queretaro-fc', 'libelle-exact', 'autre-choix', null]
    ]
  );
  const [, , palermo, queretaro] = issues.map(([, r]) => r);
  assert.equal(M.autreChoix(palermo.choix.avis, palermo.choix.moteur), AUTRE_CHOIX('Plus de 0.5 buts', 'Plus de 9.5 tirs'));
  assert.equal(M.autreChoix(queretaro.choix.avis, queretaro.choix.moteur), AUTRE_CHOIX('Plus de 0.5 corners', 'Plus de 2.5 corners'));
});

// ================================================================ T-F4

test('T-F4 — clubsDuMatch : la compo de la page d’abord, sinon combinaison.clubs ; « fotmob-0 », « 0 », vide et un nom refusés ; le désaccord dit', () => {
  const compo = D.compositionPubliee(45);
  const combinaison = P().analyses['essai-a'].corps.combinaison;
  assert.deepEqual([combinaison.clubs.home, combinaison.clubs.away].map(String), ['8456', '8650'], 'la vraie réponse du serveur porte les clubs');
  assert.deepEqual(F.clubsDuMatch({ compo, combinaison }), { home: IDS.home, away: IDS.away, sources: { home: 'compo', away: 'compo' }, ecart: false });
  assert.deepEqual(F.clubsDuMatch({ compo: D.derniereComposition(), combinaison: null }), { home: IDS.home, away: IDS.away, sources: { home: 'compo', away: 'compo' }, ecart: false });
  assert.deepEqual(F.clubsDuMatch({ compo: null, combinaison }), { home: IDS.home, away: IDS.away, sources: { home: 'combinaison', away: 'combinaison' }, ecart: false });
  for (const x of [8634, '8634', 'fotmob-8634']) assert.equal(F.clubsDuMatch({ combinaison: { clubs: { home: x, away: null } } }).home, 'fotmob-8634', String(x));
  for (const x of ['fotmob-0', '0', 0, '', null, 'Man City', 'fotmob-', '86a34']) {
    const r = F.clubsDuMatch({ compo: { home: { teamId: x } }, combinaison: { clubs: { home: x } } });
    assert.deepEqual([r.home, r.sources.home], [null, null], `« ${x} » refusé`);
  }
  // La compo refuse « fotmob-0 » : la combinaison prend le relais ; en désaccord, la compo (ce match) et l'écart dit.
  assert.equal(F.clubsDuMatch({ compo: { home: { teamId: 'fotmob-0' } }, combinaison: { clubs: { home: 8456 } } }).home, IDS.home);
  assert.deepEqual(F.clubsDuMatch({ compo: { home: { teamId: 'fotmob-1' } }, combinaison: { clubs: { home: 2 } } }), { home: 'fotmob-1', away: null, sources: { home: 'compo', away: null }, ecart: true });
  assert.deepEqual(F.clubsDuMatch(), { home: null, away: null, sources: { home: null, away: null }, ecart: false });
});

// ================================================================ T-F6

test('T-F6 — l’origine du 1 / N / 2 et le relevé de ses cotes : juges puis referenceBooks, moyenne, statistiques, origine non dite ; l’heure payante et la gratuite, la plus ancienne, une heure manquante, le fournisseur, le délai réglé', () => {
  const a = resultatA();
  const fc = a.fraicheurCotes;
  // Les juges du verdict (la vraie réponse : Pinnacle, palier « Pinnacle ») ; leur heure, celle du relevé payant.
  assert.deepEqual(F.origineDuResultat(a), { cle: 'reference', livres: a.verdicts.home.juges.livres });
  const r = F.releveDuResultat(a, matchA(), D.MAINTENANT);
  assert.deepEqual([r.libelle, r.source, r.retenue, r.payant, r.vieuxApresHeures, r.code, r.phrase], ['Cotes de référence relevées', 'Pinnacle (The Odds API)', fc.parBookmaker.pinnacle.releveAt, true, fc.reglage.maxAgeMinutes / 60, 'fraiche', null]);
  assert.equal(r.quand, heureDite(fc.parBookmaker.pinnacle.releveAt));
  assert.equal(r.detail, `${M.titreReleve} Pinnacle : ${heureDite(fc.parBookmaker.pinnacle.releveAt)}.`);
  // Le palier 3 (trois livres) : dans l'ordre des juges, sans leur marge.
  const b = copie(P().analyses['essai-b'].corps);
  assert.deepEqual(b.verdicts.home.juges.livres, ['William Hill', 'Betsson', 'Unibet (NL)']);
  assert.equal(F.releveDuResultat(b, null, D.MAINTENANT).source, 'William Hill, Betsson et Unibet (NL) (The Odds API)');
  // Sans juges : les livres de referenceBooks (leurs titres) ; sans l'un ni l'autre : la moyenne de toutes les lignes complètes.
  const sansJuges = copie(a);
  delete sansJuges.verdicts;
  assert.deepEqual(F.origineDuResultat(sansJuges), { cle: 'reference', livres: ['Pinnacle'] });
  assert.equal(F.releveDuResultat(sansJuges, null, D.MAINTENANT).source, 'Pinnacle (The Odds API)');
  const moyenne = copie(sansJuges);
  moyenne.prediction.referenceBooks = [];
  moyenne.market.byBookmaker.push({ key: 'incomplet', title: 'Incomplet', odds1: 2.1, oddsDraw: null, odds2: 3.4 });
  assert.deepEqual(F.origineDuResultat(moyenne), { cle: 'moyenne', livres: [] });
  const rm = F.releveDuResultat(moyenne, null, D.MAINTENANT);
  assert.deepEqual([rm.libelle, rm.source], ['Cotes relevées', 'William Hill, Pinnacle et Betclic (FR) (The Odds API)'], 'les trois lignes complètes, pas l’incomplète');
  // Plus de trois livres : trois, puis « N autres ».
  const cinq = copie(moyenne);
  cinq.market.byBookmaker.push({ key: 'k4', title: 'Livre 4', odds1: 2, oddsDraw: 3.5, odds2: 3.6 }, { key: 'k5', title: 'Livre 5', odds1: 2, oddsDraw: 3.5, odds2: 3.6 });
  cinq.fraicheurCotes.parBookmaker.k4 = { releveAt: '2026-10-05T11:00:00.000Z' };
  cinq.fraicheurCotes.parBookmaker.k5 = { releveAt: '2026-10-05T11:00:00.000Z' };
  assert.equal(F.releveDuResultat(cinq, null, D.MAINTENANT).source, 'William Hill, Pinnacle, Betclic (FR) et 2 autres (The Odds API)');
  // Sans cote : le modèle de buts, aucun relevé ; une réponse qui ne dit pas l'origine : « inconnue », aucun relevé.
  const sc = copie(P().sansCotes.analyse);
  assert.equal(sc.prediction.source, 'statistiques');
  assert.deepEqual(F.origineDuResultat(sc), { cle: 'statistiques', livres: [] });
  assert.equal(F.releveDuResultat(sc, null, D.MAINTENANT), null);
  const ancien = copie(a);
  delete ancien.prediction;
  assert.deepEqual(F.origineDuResultat(ancien), { cle: 'inconnue', livres: [] });
  assert.equal(F.releveDuResultat(ancien, null, D.MAINTENANT), null);
  assert.equal(F.origineDuResultat({ prediction: { source: 'autre' } }).cle, 'inconnue');
  // Une ligne GRATUITE (son heure dans la ligne, son fournisseur après le dernier « · ») à côté de la payante : la plus ancienne
  // des deux est retenue, The Odds API d'abord.
  const mixte = copie(a);
  mixte.market.byBookmaker.push({ key: 'espn_draftkings', title: 'DraftKings · ESPN', odds1: 2, oddsDraw: 3.6, odds2: 3.9, referenceOnly: true, source: 'espn', releveAt: '2026-10-05T09:30:00.000Z' });
  mixte.verdicts.home.juges = { palier: 'essai', livres: ['Pinnacle', 'DraftKings · ESPN'], cles: ['espn_draftkings', 'pinnacle'] };
  const rx = F.releveDuResultat(mixte, null, D.MAINTENANT);
  assert.deepEqual([rx.source, rx.retenue, rx.payant], ['DraftKings et Pinnacle (The Odds API et ESPN)', '2026-10-05T09:30:00.000Z', true]);
  assert.equal(rx.detail, `${M.titreReleve} DraftKings : ${heureDite('2026-10-05T09:30:00.000Z')} · Pinnacle : ${heureDite(fc.parBookmaker.pinnacle.releveAt)}.`);
  // Une gratuite sans « · » dans son titre : sa source, sinon « source non indiquée ».
  const seule = copie(a);
  seule.market.byBookmaker = [{ key: 'x', title: 'Livre X', odds1: 2, oddsDraw: 3.6, odds2: 3.9, referenceOnly: true, releveAt: '2026-10-05T10:00:00.000Z' }];
  seule.verdicts.home.juges = { palier: 'essai', livres: ['Livre X'], cles: ['x'] };
  delete seule.fraicheurCotes;
  assert.equal(F.releveDuResultat(seule, null, D.MAINTENANT).source, 'Livre X (source non indiquée)');
  seule.market.byBookmaker[0].source = 'smarkets';
  assert.deepEqual([F.releveDuResultat(seule, null, D.MAINTENANT).source, F.releveDuResultat(seule, null, D.MAINTENANT).payant], ['Livre X (smarkets)', false]);
  // Une heure manquante : l'âge est inconnu (jamais l'heure des autres à sa place).
  const trou = copie(mixte);
  delete trou.fraicheurCotes.parBookmaker.pinnacle.releveAt;
  const rt = F.releveDuResultat(trou, null, D.MAINTENANT);
  assert.deepEqual([rt.retenue, rt.quand, rt.code, rt.phrase], [null, null, 'heure-inconnue', M.releveHeureInconnue]);
  assert.match(rt.detail, /Pinnacle : heure inconnue\.$/);
  // Le délai réglé (Réglages) : 60 min → 1 h ; absent ou hors bornes → 3 h, la valeur par défaut.
  const reglee = copie(a);
  reglee.fraicheurCotes.reglage = { maxAgeMinutes: 60, avantCompos: true };
  const r60 = F.releveDuResultat(reglee, null, D.MAINTENANT + 90 * D.MIN);
  assert.deepEqual([r60.vieuxApresHeures, r60.code, r60.phrase], [1, 'trop-vieille', 'Relevé il y a 1 h 40, au-delà du délai de 1 h : le marché a pu bouger depuis, et ce pourcentage avec lui.']);
  for (const reglage of [undefined, null, { maxAgeMinutes: 5 }, { maxAgeMinutes: '60' }]) {
    const x = copie(a);
    x.fraicheurCotes.reglage = reglage;
    assert.equal(F.releveDuResultat(x, null, D.MAINTENANT).vieuxApresHeures, 3, JSON.stringify(reglage));
  }
});

// ================================================================ T-F7

test('T-F7 — la fiche rendue sur la vraie réponse : trois familles et leurs lignes, l’heure ET l’âge, aucun chiffre inventé, aucun mot interdit, ni jauge ni barre, un logo par identifiant, aucune lecture ; ses phrases tiennent au code', optionsDuRendu, async () => {
  const a = resultatA();
  const m = matchA();
  const r = await rendreLaFiche(fiche(a));
  assert.deepEqual(r.avertissements, [], 'aucun avertissement de Vue');
  assert.deepEqual(r.appels, [], 'aucune lecture : la page lui donne tout (aucun logo cherché d’après un nom)');
  const carte = blocDe(r.html, 'pourquoi-du-pourcentage');
  assert.ok(carte && carte.includes('data-etat="pret"'));
  assert.deepEqual([...carte.matchAll(/data-famille="(\w+)"/g)].map((x) => x[1]), ['resultat', 'buts', 'stats']);
  assert.deepEqual(lignesDe(carte), ['origine', 'releve', 'compos', 'attendus', 'buts-origine', 'stat-corners', 'stat-shots', 'stat-shotsOnTarget', 'stats-origine', 'cotes-hors-1n2']);
  const t = texte(carte);
  assert.ok(t.startsWith('Explication Pourquoi ce pourcentage ? D’où vient chaque pourcentage du verdict — seulement ce que l’analyse porte vraiment.'), t.slice(0, 200));
  // Résultat : d'où il vient, les cotes de référence relevées (le bookmaker, où il a été lu, l'heure ET l'âge), les compos.
  const fc = a.fraicheurCotes;
  const releve = fc.parBookmaker.pinnacle.releveAt;
  const age = Math.floor((D.MAINTENANT - Date.parse(releve)) / D.MIN);
  const annonce = aParis(Date.parse(fc.coupDEnvoi) - 60 * D.MIN).heure;
  assert.equal(annonce, '19 h 30', 'coup d’envoi à 20 h 30 à Paris');
  assert.equal(ligne(carte, 'origine'), 'Des cotes de Pinnacle, le bookmaker de référence de ce match, sans sa marge.');
  assert.equal(ligne(carte, 'releve'), `Pinnacle (The Odds API) ${heureDite(releve)} · il y a ${age} min payant`);
  assert.match(ligne(carte, 'releve'), /référence|Pinnacle/);
  assert.ok(/Cotes de référence relevées/.test(texte(famillesDe(carte).resultat)) && /Pinnacle/.test(ligne(carte, 'releve')), 'la ligne dit « référence » et le bookmaker');
  assert.equal(ligne(carte, 'compos'), `${NE_LIT_PAS} ${AVANT_ANNONCE(annonce)}`);
  // Buts : les attendus (deux décimales) avec les logos, leur source ; puis les deux phrases, dans cet ordre.
  const eg = a.expectedGoals;
  assert.equal(eg.source, 'fotmob');
  assert.equal(ligne(carte, 'attendus'), `${m.home} ${fr(eg.home, 2)} · ${m.away} ${fr(eg.away, 2)} — buts attendus par le modèle, à partir des moyennes de buts des deux équipes au magasin FotMob.`);
  assert.equal(ligne(carte, 'buts-origine'), `${BUTS_SANS_COTE} ${BUTS_COMBINE}`);
  assert.ok(t.indexOf(BUTS_SANS_COTE) > 0 && t.indexOf(BUTS_SANS_COTE) < t.indexOf(BUTS_COMBINE), 'butsSansCote, puis butsCombine');
  // Corners et tirs : une décimale, le total ; d'où ils viennent ; la loi, une seule fois pour tous les championnats.
  const se = a.statExpectations;
  for (const [cle, nom] of [['corners', 'Corners attendus'], ['shots', 'Tirs attendus'], ['shotsOnTarget', 'Tirs cadrés attendus']]) {
    assert.equal(ligne(carte, `stat-${cle}`), `${m.home} ${fr(se[cle].home, 1)} · ${m.away} ${fr(se[cle].away, 1)} (${fr(se[cle].total, 1)} au total)`, cle);
    assert.ok(t.includes(`${nom} ${m.home}`), nom);
  }
  assert.equal(ligne(carte, 'stats-origine'), `${M.statsOrigine} ${STATS_LOI}`);
  assert.equal(compter(t, LIGNE_DU_BAS), 1, 'la ligne des cotes hors du 1 / N / 2, une fois, en bas');
  assert.ok(t.endsWith(LIGNE_DU_BAS));
  // Aucun chiffre inventé : le texte, moins les mots de la fiche et les nombres recalculés de la réponse, n'en garde aucun.
  let reste = t;
  const mots = [...Object.values(M).filter((x) => typeof x === 'string'), ...Object.values(M.libelles), NE_LIT_PAS, AVANT_ANNONCE(annonce)].sort((x, y) => y.length - x.length);
  for (const s of mots) reste = reste.split(s).join(' ');
  const nombres = [heureDite(releve), `il y a ${age} min`, fr(eg.home, 2), fr(eg.away, 2), ...['corners', 'shots', 'shotsOnTarget'].flatMap((k) => ['home', 'away', 'total'].map((c) => fr(se[k][c], 1)))];
  for (const s of nombres.sort((x, y) => y.length - x.length)) reste = reste.split(s).join(' ');
  assert.doesNotMatch(reste, /\d/, `un chiffre que la réponse ne donne pas : ${reste}`);
  // Aucun mot interdit ; ni jauge, ni barre, ni pastille de value, ni vert.
  for (const motif of INTERDITS) assert.doesNotMatch(t, motif, String(motif));
  assert.doesNotMatch(carte, /cgauge|vbadge|<progress|width:\s*[\d.]+%|is-value|cm-positive|is-accent/);
  // Un logo par club sur chaque ligne qui le nomme (buts attendus, corners, tirs, tirs cadrés), par son identifiant FotMob.
  const l = logos(carte);
  assert.equal(l.length, 8);
  assert.deepEqual(l.map((x) => /teamlogo\/(\d+)\.png/.exec(x)?.[1]), ['8456', '8650', '8456', '8650', '8456', '8650', '8456', '8650']);
  // Les phrases tiennent au code du serveur : 10 et 6 matchs (statInputsRead.js), l'avantage du terrain (1,1 / 0,9) et UNE loi
  // par type de statistique, apprise sur 2024-25 (statMarkets.js) — aucun réglage par championnat.
  const lecture = lireSrc('data', 'db', 'statInputsRead.js');
  const echantillon = Number(/^export const STAT_SAMPLE = (\d+);$/m.exec(lecture)?.[1]);
  const minimum = Number(/^export const STAT_MIN_SAMPLE = (\d+);$/m.exec(lecture)?.[1]);
  assert.deepEqual([echantillon, minimum], [10, 6]);
  assert.ok(M.statsOrigine.includes(`sur ses ${echantillon} derniers matchs`) && M.statsOrigine.includes(`${minimum} matchs au moins`) && M.statsOrigine.includes('avantage du terrain'));
  assert.ok(M.statsAbsentes.includes(`pas ${minimum} matchs relevés`) && M.statAbsente('Tirs') === `Tirs : pas assez de matchs relevés (${minimum} au moins) pour l’une des deux équipes.`);
  const marches = lireSrc('sports', 'football', 'statMarkets.js');
  assert.match(marches, /^const FACTEUR_TERRAIN = \{ home: 1\.1, away: 0\.9 \};$/m);
  assert.match(marches, /appris sur 2024-25\. \*\/\nexport const STAT_KINDS = \{/);
  const types = /export const STAT_KINDS = \{\n([\s\S]*?)\n\};/.exec(marches)[1].split('\n');
  assert.deepEqual(types.map((x) => /^ {2}(\w+): \{ unit: '[^']+', invKTeam: [\d.]+, invKTotal: [\d.]+ \},?$/.exec(x)?.[1]), ['corners', 'shots', 'shotsOnTarget']);
  assert.equal(M.statsLoi, STATS_LOI);
  assert.equal(M.cotesHors1N2, LIGNE_DU_BAS);
});

// ================================================================ T-F8

test('T-F8 — chaque état : les trois familles toujours là (chacune dit l’état) et la ligne du bas ; relevé trop vieux, heure inconnue, match commencé ; cotes gratuites seules, moyenne, sans cote ; candidate de l’étape 27 ; absents ; sans identifiant ; coupe', optionsDuRendu, async () => {
  const a = resultatA();
  const etat = async (props, opts) => {
    const r = await rendreLaFiche(props, opts);
    assert.deepEqual(r.avertissements, []);
    assert.deepEqual(r.appels, []);
    const carte = blocDe(r.html, 'pourquoi-du-pourcentage');
    assert.deepEqual([...carte.matchAll(/data-famille="(\w+)"/g)].map((x) => x[1]), ['resultat', 'buts', 'stats'], 'les trois familles, toujours');
    assert.ok(texte(carte).endsWith(LIGNE_DU_BAS), 'la ligne du bas, toujours');
    for (const motif of INTERDITS) assert.doesNotMatch(texte(carte), motif, String(motif));
    return { carte, etat: /data-etat="([\w-]+)"/.exec(carte)[1], f: famillesDe(carte) };
  };
  // Chargement, erreur, sans analyse : chaque famille dit l'état, aucune ligne.
  for (const [analyse, cle, phrase] of [
    [{ loading: true, error: null, result: null }, 'chargement', 'Le pourquoi arrive avec l’analyse du moteur…'],
    [null, 'chargement', 'Le pourquoi arrive avec l’analyse du moteur…'],
    [{ loading: false, error: "Le moteur n'a pas pu analyser ce match (essai).", result: null }, 'erreur', "L’analyse du moteur n’a pas pu être lue (Le moteur n'a pas pu analyser ce match (essai)) : rien n’est expliqué à la place."],
    [{ loading: false, error: null, result: null }, 'sans-analyse', 'Pas d’analyse du moteur pour ce match : aucun pourcentage à expliquer.']
  ]) {
    const e = await etat({ analyse, match: matchA(), homeId: IDS.home, awayId: IDS.away });
    assert.equal(e.etat, cle);
    for (const fam of ['resultat', 'buts', 'stats']) assert.ok(texte(e.f[fam]).endsWith(phrase), `${cle} / ${fam}`);
    assert.deepEqual(lignesDe(e.carte), ['cotes-hors-1n2'], cle);
  }
  // L'origine non dite (une analyse sans `prediction`) : le Résultat le dit ; les Buts et les Stats, qui n'en dépendent pas, restent.
  const ancien = copie(a);
  delete ancien.prediction;
  const sa = await etat(fiche(ancien));
  assert.equal(sa.etat, 'serveur-ancien');
  assert.equal(texte(sa.f.resultat), 'Résultat (1 / N / 2) L’analyse ne dit pas d’où vient ce pourcentage.');
  assert.deepEqual(lignesDe(sa.carte), ['attendus', 'buts-origine', 'stat-corners', 'stat-shots', 'stat-shotsOnTarget', 'stats-origine', 'cotes-hors-1n2']);
  // Trop vieux (4 h 10 plus tard, délai de 3 h) : l'ambre, l'horloge et la phrase ; l'âge à côté de l'heure.
  const releve = a.fraicheurCotes.parBookmaker.pinnacle.releveAt;
  const vieux = await etat(fiche(a), { a: Date.parse('2026-10-05T16:00:00Z') });
  assert.match(vieux.carte, /data-ligne="releve" data-alerte="trop-vieille"/);
  assert.match(vieux.carte, /class="prov is-ancien prov--ligne"/, 'la pastille passe à l’ambre');
  assert.match(vieux.carte, /<p class="why__alerte"><svg[\s\S]*?<\/svg>Relevé il y a 4 h 10, au-delà du délai de 3 h : le marché a pu bouger depuis, et ce pourcentage avec lui\.<\/p>/);
  assert.ok(ligne(vieux.carte, 'releve').startsWith(`Pinnacle (The Odds API) ${heureDite(releve)} · il y a 4 h payant`), ligne(vieux.carte, 'releve'));
  // Au relevé frais, pas d'ambre ni de phrase.
  const frais = await etat(fiche(a));
  assert.match(frais.carte, /data-ligne="releve" data-alerte="fraiche"/);
  assert.doesNotMatch(frais.carte, /why__alerte|is-ancien/);
  // Une heure inconnue : dite, sans âge ; la seconde phrase des compos tombe (rien à comparer).
  const trou = copie(a);
  delete trou.fraicheurCotes.parBookmaker.pinnacle.releveAt;
  const hi = await etat(fiche(trou));
  assert.match(hi.carte, /data-alerte="heure-inconnue"/);
  assert.equal(ligne(hi.carte, 'releve'), `Pinnacle (The Odds API) heure du relevé inconnue payant ${M.releveHeureInconnue}`);
  assert.equal(ligne(hi.carte, 'compos'), NE_LIT_PAS);
  // Deux livres dont un sans heure : l'heure reste inconnue, jamais celle de l'autre à sa place.
  const deux = copie(trou);
  deux.market.byBookmaker.push({ key: 'espn_draftkings', title: 'DraftKings · ESPN', odds1: 2, oddsDraw: 3.6, odds2: 3.9, referenceOnly: true, source: 'espn', releveAt: '2026-10-05T09:30:00.000Z' });
  deux.verdicts.home.juges = { ...deux.verdicts.home.juges, livres: ['Pinnacle', 'DraftKings · ESPN'], cles: ['espn_draftkings', 'pinnacle'] };
  const hd = await etat(fiche(deux));
  assert.match(hd.carte, /data-alerte="heure-inconnue"/);
  assert.equal(ligne(hd.carte, 'releve'), `DraftKings et Pinnacle (The Odds API et ESPN) heure du relevé inconnue payant ${M.releveHeureInconnue}`);
  // Le match a commencé : les cotes d'avant-match ; relevées APRÈS l'heure habituelle de l'annonce : elles peuvent en tenir compte.
  const commence = await etat(fiche(a), { a: Date.parse('2026-10-05T18:40:00Z') });
  assert.match(commence.carte, /data-alerte="match-commence"/);
  assert.ok(ligne(commence.carte, 'releve').endsWith(M.releveMatchCommence));
  const tard = copie(a);
  tard.fraicheurCotes.parBookmaker.pinnacle.releveAt = '2026-10-05T17:45:00.000Z';
  assert.equal(ligne((await etat(fiche(tard), { a: Date.parse('2026-10-05T17:50:00Z') })).carte, 'compos'), `${NE_LIT_PAS} ${APRES_ANNONCE}`);
  // Un coup d'envoi sans heure sûre (le calendrier ne donne que le jour) : aucune heure d'annonce supposée.
  const jour = copie(a);
  jour.fraicheurCotes.heureSure = false;
  assert.equal(ligne((await etat(fiche(jour))).carte, 'compos'), NE_LIT_PAS);
  // Cotes gratuites seules (Pinnacle lu chez ESPN) : le bookmaker sans sa source dans l'origine, ESPN dans le relevé, pas
  // « payant » ; sans relevé The Odds API, aucune heure d'annonce supposée.
  const gratuites = copie(a);
  gratuites.market.byBookmaker = [{ key: 'pinnacle', title: 'Pinnacle · ESPN', odds1: 2, oddsDraw: 3.6, odds2: 3.9, referenceOnly: true, source: 'espn', releveAt: '2026-10-05T09:30:00.000Z' }];
  gratuites.verdicts.home.juges = { palier: 'Pinnacle', livres: ['Pinnacle · ESPN'], cles: ['pinnacle'] };
  gratuites.prediction.referenceBooks = ['Pinnacle · ESPN'];
  delete gratuites.fraicheurCotes;
  const g = await etat(fiche(gratuites));
  assert.equal(ligne(g.carte, 'origine'), 'Des cotes de Pinnacle, le bookmaker de référence de ce match, sans sa marge.');
  assert.equal(ligne(g.carte, 'releve'), `Pinnacle (ESPN) ${heureDite('2026-10-05T09:30:00.000Z')} · il y a 2 h`);
  assert.equal(ligne(g.carte, 'compos'), NE_LIT_PAS);
  // La moyenne (aucun bookmaker de référence ne cote le match) : « Cotes relevées », toutes les lignes complètes.
  const moyenne = copie(a);
  delete moyenne.verdicts;
  moyenne.prediction.referenceBooks = [];
  const mo = await etat(fiche(moyenne));
  assert.equal(ligne(mo.carte, 'origine'), 'De la moyenne des cotes relevées pour ce match, chacune sans la marge du bookmaker : aucun bookmaker de référence ne le cote.');
  assert.match(texte(mo.f.resultat), /Cotes relevées William Hill, Pinnacle et Betclic \(FR\) \(The Odds API\)/);
  assert.doesNotMatch(texte(mo.f.resultat), /Cotes de référence/);
  assert.equal(ligne(mo.carte, 'compos'), NE_LIT_PAS, 'pas de cotes de référence : pas de phrase sur leur heure');
  // Sans cote : le modèle de buts (sa source), aucun relevé, la phrase des compos du modèle.
  const sc = copie(P().sansCotes.analyse);
  const s = await etat({ analyse: lu(sc), match: { ...P().sansCotes.match, commenceTime: '2026-10-07T12:00:00Z' }, homeId: null, awayId: null });
  assert.equal(s.etat, 'pret');
  assert.deepEqual(lignesDe(s.carte).slice(0, 2), ['origine', 'compos']);
  assert.equal(ligne(s.carte, 'origine'), `Du modèle de buts, à partir des ${sc.expectedGoals.source === 'league-baseline' ? 'valeurs de base du championnat, faute de moyennes des deux équipes' : 'moyennes de buts des deux équipes au magasin FotMob'}, faute de cote pour ce match ; ramené vers les fréquences habituelles du 1, du nul et du 2, parce que, seul, il exagère les écarts entre les équipes.`);
  assert.equal(ligne(s.carte, 'compos'), 'Le modèle de buts ne lit pas les compositions : ce pourcentage n’en tient pas compte.');
  assert.equal(logos(s.carte).length, 0, 'sans identifiant : le nom seul, aucun logo');
  for (const [source, dit] of [['league-baseline', 'à partir des valeurs de base du championnat, faute de moyennes des deux équipes'], ['api-football', 'à partir des moyennes de buts des deux équipes chez API-Football'], [null, 'source des buts attendus non dite par l’analyse']]) {
    const x = copie(sc);
    x.expectedGoals.source = source;
    assert.ok(ligne((await etat({ analyse: lu(x), match: P().sansCotes.match })).carte, 'origine').startsWith(`Du modèle de buts, ${dit}, faute de cote`), String(source));
  }
  // La candidate de l'étape 27 adoptée : sa provenance (la pastille du modèle), jamais « aucune cote n'y entre ».
  const { provenanceDuRegime } = await imp(path.join(UI, 'src', 'utils', 'modeleDeButs.js'));
  const provenanceButs = provenanceDuRegime({ code: 'cotes-xg', plusMoins: { source: 'football-data (moyenne du marché)', releveAt: '2026-10-05T10:00:00.000Z' }, livres: ['Pinnacle'], phrase: 'le total de buts part de la cote plus/moins 2,5' });
  const cand = await etat(fiche(a, { provenanceButs }));
  assert.deepEqual(lignesDe(cand.carte).slice(3, 5), ['provenance-buts', 'buts-origine']);
  assert.match(ligne(cand.carte, 'provenance-buts'), /^Moteur CôteMaster · cote 1N2 Pinnacle \+ plus\/moins 2,5 football-data \(moyenne du marché\) \+ xG FotMob /);
  assert.equal(ligne(cand.carte, 'buts-origine'), BUTS_COMBINE);
  assert.doesNotMatch(texte(cand.f.buts), /aucune cote n’y entre|aucune cote de bookmaker n’est relevée/);
  // Statistiques absentes, ou en partie ; buts attendus absents.
  const sansStats = copie(a);
  sansStats.statExpectations = null;
  const ss = await etat(fiche(sansStats));
  assert.deepEqual(lignesDe(ss.f.stats), ['stats-absentes']);
  assert.equal(ligne(ss.carte, 'stats-absentes'), 'Aucun pronostic de corners ni de tirs pour ce match : l’une des deux équipes n’a pas 6 matchs relevés au magasin FotMob, ou le magasin ne la connaît pas.');
  const partielles = copie(a);
  partielles.statExpectations = { corners: a.statExpectations.corners };
  const sp = await etat(fiche(partielles));
  assert.deepEqual(lignesDe(sp.f.stats), ['stat-corners', 'stats-absentes', 'stats-origine']);
  assert.equal(ligne(sp.carte, 'stats-absentes'), 'Tirs : pas assez de matchs relevés (6 au moins) pour l’une des deux équipes. Tirs cadrés : pas assez de matchs relevés (6 au moins) pour l’une des deux équipes.');
  const sansButs = copie(a);
  sansButs.expectedGoals = null;
  const sb = await etat(fiche(sansButs));
  assert.equal(ligne(sb.carte, 'attendus'), 'Les buts attendus ne figurent pas dans l’analyse : ces pourcentages ne peuvent pas être expliqués ici.');
  assert.equal(ligne(sb.carte, 'buts-origine'), BUTS_COMBINE);
  // Sans identifiant : les noms seuls, aucun logo (jamais cherché d'après le nom).
  const sansIds = await etat(fiche(a, { homeId: null, awayId: null }));
  assert.equal(logos(sansIds.carte).length, 0);
  assert.ok(ligne(sansIds.carte, 'attendus').startsWith(`${matchA().home} ${fr(a.expectedGoals.home, 2)}`));
  // Une coupe : la fiche ne dit rien de plus (la phrase des 90 minutes reste à sa seule place, l'onglet Marchés).
  const coupe = copie(a);
  coupe.coupe = { tour: 'Quarts de finale', nature: 'unique' };
  const cp = await etat(fiche(coupe));
  assert.equal(cp.etat, 'pret');
  assert.doesNotMatch(texte(cp.carte), /90 minutes|prolongation|tirs au but/);
});

// ================================================================ T-F9

test('T-F9 — les cartes de l’IA : « cote juste », « aucune cote de bookmaker relevée automatiquement » hors du 1 / N / 2, « À vérifier » par l’identifiant du marché à côté du verdict ; l’avis sur un autre choix ; l’onglet passe les identifiants et « à vérifier »', optionsDuRendu, async () => {
  const r = await ouvrir();
  const Carte = await composant('/src/components/analysis/AiMarketCard.vue');
  const Panneau = await composant('/src/components/analysis/MatchAiAnalysisPanel.vue');
  const E = COMPLETE;
  const p = (market) => E.engineSnapshot.marketPredictions.find((x) => x.market === market);
  const v = (market) => E.analysis.marketViews.find((x) => x.market === market);
  const carte = async (props) => {
    const x = net(await r.rendre(Carte, { home: E.homeName, away: E.awayName, league: E.league, ...props }, []));
    assert.deepEqual(x.avertissements, []);
    return x;
  };
  // Sans les propriétés neuves : rien de neuf sur la carte.
  const avant = await carte({ view: v('Total corners'), probability: 82, prediction: p('Total corners') });
  assert.doesNotMatch(avant.html, /averif|aimc__sans-livre|aimc__autre|data-ligne="autre-choix"/);
  // « À vérifier » : par l'identifiant du marché (« Total corners » → corners, jamais « buts » d'après son libellé), dans les
  // deux branches, APRÈS le verdict (jamais à sa place) ; sans identifiant de marché, aucun.
  const aVerifier = { raisons: [{ code: 'corners', texte: 'Corners non relevés dans ce championnat', familles: ['corners'] }, { code: 'score', texte: 'Un score à vérifier', familles: ['buts'] }] };
  for (const sansAvis of [false, true]) {
    const c = await carte({ view: v('Total corners'), probability: 82, prediction: p('Total corners'), aVerifier, sansAvis });
    assert.equal(compter(c.html, 'class="averif averif--'), 1, `sansAvis ${sansAvis}`);
    assert.match(c.html, /title="À vérifier : Corners non relevés dans ce championnat\. /);
    assert.doesNotMatch(c.html, /Un score à vérifier/);
    const verdict = /<div class="aimc__verdict"[\s\S]*?<\/div>/.exec(c.html)[0];
    assert.ok(verdict.indexOf('class="aimc__badge') >= 0 && verdict.indexOf('class="aimc__badge') < verdict.indexOf('class="averif'), 'à côté du verdict, après lui');
  }
  const resultat = await carte({ view: v('Résultat'), probability: 46, prediction: p('Résultat'), aVerifier });
  assert.match(resultat.html, /title="À vérifier : Un score à vérifier\. /, 'le Résultat : les raisons des buts');
  const sansId = await carte({ view: v('Total corners'), probability: 82, prediction: { ...p('Total corners'), marketId: undefined }, aVerifier });
  assert.doesNotMatch(sansId.html, /averif/, 'sans identifiant de marché, pas de badge (jamais toutes les raisons)');
  assert.doesNotMatch((await carte({ view: v('Total corners'), probability: 82, prediction: null, aVerifier })).html, /averif/);
  // La cote : « cote juste 1,39 », « pas de cote » ; hors du 1 / N / 2, « aucune cote de bookmaker relevée automatiquement ».
  const juste = await carte({ view: v('Buts — Girona'), probability: 72, prediction: p('Buts — Girona'), cote: 1.39 });
  assert.match(espaces(juste.texte), new RegExp(`cote juste 1,39 ${SANS_LIVRE}`));
  assert.match(juste.html, /<span class="aimc__sans-livre" title="Aucune cote de bookmaker n’est relevée automatiquement pour ce marché : la cote montrée est la cote juste du moteur\. Une cote vue chez votre bookmaker se saisit à la main dans l’onglet Marchés\.">aucune cote de bookmaker relevée automatiquement<\/span>/);
  assert.match(juste.html, /title="Cote juste du moteur : 1 divisée par sa probabilité, sans marge de bookmaker\."/);
  const surLeResultat = await carte({ view: v('Résultat'), probability: 46, prediction: p('Résultat'), cote: 2.17 });
  assert.match(espaces(surLeResultat.texte), /cote juste 2,17/);
  assert.doesNotMatch(surLeResultat.html, /aimc__sans-livre/, 'le 1 / N / 2 a des cotes de bookmakers relevées');
  const pasDeCote = await carte({ view: v('Buts — Girona'), probability: 72, prediction: p('Buts — Girona'), cote: 1 });
  assert.match(pasDeCote.texte, /pas de cote/);
  assert.doesNotMatch(pasDeCote.html, /aimc__sans-livre|cote juste/);
  // L'avis sur un autre choix : la phrase, sous l'en-tête, sans couleur.
  const phrase = AUTRE_CHOIX('Plus de 0.5 buts', 'Moins de 19.5 tirs');
  const autre = await carte({ view: { ...v('Tirs — Girona'), pick: 'Girona — Plus de 0.5 buts' }, probability: null, prediction: null, autreChoix: phrase });
  assert.match(autre.html, /<p class="aimc__autre" data-ligne="autre-choix"><svg[\s\S]*?<\/svg>/);
  assert.ok(espaces(autre.texte).includes(phrase));
  // L'onglet Analyse IA : un avis (« Tirs — Girona ») sur un autre choix garde sa famille (Tirs) et son verdict, sans
  // pourcentage du moteur ; les identifiants donnent les logos ; « à vérifier » sur les seules cartes de corners.
  const entree = copie(E);
  entree.analysis.marketViews.find((x) => x.market === 'Tirs — Girona').pick = 'Girona — Plus de 0.5 buts';
  const ids = { home: E.lineupSnapshot.home.teamId, away: E.lineupSnapshot.away.teamId };
  const corners = { raisons: [aVerifier.raisons[0]] };
  const onglet = net(await r.rendre(Panneau, { connected: false, entry: entree, allowPreMatch: true, hasResult: false, homeId: ids.home, awayId: ids.away, aVerifier: corners }, []));
  assert.deepEqual(onglet.avertissements, []);
  const cartes = [...onglet.html.matchAll(/<article class="aimc[^"]*"[\s\S]*?<\/article>/g)].map((x) => x[0]);
  assert.equal(cartes.length, 15);
  const marche = (c) => /class="aimc__market">([^<]*)</.exec(c)[1];
  const tirs = cartes.find((c) => marche(c) === 'Tirs — Girona');
  assert.ok(espaces(texteDe(tirs)).includes(phrase), 'la phrase de l’autre choix');
  assert.match(tirs, /class="ring__value">—</, 'aucun pourcentage du moteur');
  assert.match(tirs, /class="aimc__badge"/, 'le verdict de l’IA reste');
  assert.equal(cartes.filter((c) => c.includes('data-ligne="autre-choix"')).length, 1);
  const familleTirs = onglet.html.slice(onglet.html.indexOf('<p class="ai-family__title">Tirs</p>'), onglet.html.indexOf('<p class="ai-family__title">Tirs cadrés</p>'));
  assert.ok(familleTirs.includes('Girona — Plus de 0.5 buts'), 'dans la famille de son marché');
  assert.deepEqual(cartes.filter((c) => c.includes('class="averif')).map(marche), ['Total corners', 'Corners — Girona', 'Corners — Mallorca']);
  assert.ok(cartes.filter((c) => /teamlogo\/(7732|8661)\.png/.test(c)).length >= 9, 'les logos par identifiant');
  // Sans ces propriétés (onglet Historique moteur) : ni badge, ni rien d'autre de neuf.
  const sans = net(await r.rendre(Panneau, { connected: false, entry: E, allowPreMatch: true, hasResult: false }, []));
  assert.doesNotMatch(sans.html, /averif|aimc__autre|aimc__sans-livre/);
});

// ================================================================ T-F12

test('T-F12 — le câblage : la page passe les identifiants des clubs au verdict, à la fiche, aux deux panneaux de l’IA et à l’onglet Marchés (balises exactes) ; la phrase des 90 minutes à sa seule place ; aucun service dans les fichiers de l’étape', () => {
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(page, /^import \{ clubsDuMatch \} from '@\/utils\/ficheDuPronostic\.js';$/m);
  assert.ok(
    page.includes(
      "const clubsDeLaPage = computed(() =>\n  clubsDuMatch({ compo: page.value.data?.lineups ?? page.value.data?.lastLineups ?? null, combinaison: analyse.value.result?.combinaison ?? null })\n);"
    ),
    'la compo de la page d’abord, sinon combinaison.clubs'
  );
  assert.equal(compter(page, '\n            <MarketVerdictBoard :result="analyse.result" :match="match" :saisies="saisies.data" :home-id="clubsDeLaPage.home" :away-id="clubsDeLaPage.away" @saisir="saisirUneCote" />\n'), 1);
  assert.equal(compter(page, '\n        <PercentageWhyCard id="upcoming-pourquoi" class="upcoming__block" :analyse="analyse" :match="match" :home-id="clubsDeLaPage.home" :away-id="clubsDeLaPage.away" :provenance-buts="provenanceButs" />\n'), 1);
  assert.equal(compter(page, '<PercentageWhyCard '), 1);
  assert.equal(
    compter(page, '\n            <MarketPicksBoard :predictions="analyse.result.marketPredictions ?? []" :match="match" :views="aiEntry?.analysis?.marketViews ?? []" :home-id="clubsDeLaPage.home" :away-id="clubsDeLaPage.away" :a-verifier="analyse.result.aVerifier ?? null" :provenance-buts="provenanceButs" />\n'),
    1
  );
  const panneaux = [...page.matchAll(/<MatchAiAnalysisPanel\n([\s\S]*?)\/>/g)].map((x) => x[1].split('\n').map((l) => l.trim()).filter(Boolean));
  assert.equal(panneaux.length, 2);
  for (const attributs of panneaux) {
    assert.deepEqual(attributs, [':connected="aiStore.connected"', ':running="aiStore.running"', ':entry="aiEntry"', ':has-result="false"', ':home-id="clubsDeLaPage.home"', ':away-id="clubsDeLaPage.away"', ':a-verifier="analyse.result?.aVerifier ?? null"', '@run-pre-match="lancerAnalyseIa"']);
  }
  // La phrase des 90 minutes : une seule place (l'onglet Marchés), jamais dans les fichiers de l'étape.
  assert.equal(compter(page, '{{ PHRASE_90_MINUTES }}'), 1);
  const FICHIERS = [['utils', 'ficheDuPronostic.js'], ['components', 'analysis', 'PercentageWhyCard.vue'], ['components', 'analysis', 'AiMarketCard.vue'], ['components', 'analysis', 'MatchAiAnalysisPanel.vue']];
  for (const f of FICHIERS) {
    const source = lireUi(...f);
    assert.doesNotMatch(source, /PHRASE_90_MINUTES|ni la prolongation, ni les tirs au but|coupeDuMatch/, f.join('/'));
    assert.doesNotMatch(source, /@\/services\/|\bfetch\(|httpClient|@\/stores\//, `${f.join('/')} : aucune lecture`);
    assert.ok(!source.includes(`${String.fromCharCode(92)}u`), `${f.join('/')} : aucun code Unicode échappé`);
    assert.doesNotMatch(source, /toFixed\(/, `${f.join('/')} : la virgule par toLocaleString`);
  }
  // Les services de la page : ceux d'avant, aucun de plus.
  assert.deepEqual([...page.matchAll(/^import \{ (\w+) \} from '@\/services\/(\w+)\.js';$/gm)].map((x) => x[2]), ['analysisApi', 'matchesApi', 'matchStatsApi', 'oddsApi', 'teamStatsApi']);
  // La fiche ne reçoit que ce que la page a déjà lu ; aucune puce de composition, ni « Ce qui manque », ni dépliant de l'IA.
  const carte = lireUi('components', 'analysis', 'PercentageWhyCard.vue');
  assert.match(carte, /^ {2}analyse: \{ type: Object, default: null \},/m);
  assert.doesNotMatch(carte, /why__compo|data-compo|etatComposition|<details|ConfidenceGauge|MarketPicksBoard|encadreAvantDeParier/);
  assert.doesNotMatch(lireUi('components', 'analysis', 'MatchAiAnalysisPanel.vue'), /\.find\(\(p\) => p\.market === /, 'plus jamais « le premier trouvé » par libellé');
});

// ================================================================ T-F14

test('T-F14 — DESIGN.md : le paragraphe de l’étape 40, entre celui de la 35 et celui de la 44 ; la place réservée a disparu', () => {
  const design = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  const ou = (n) => design.indexOf(`Depuis l'étape ${n} du plan`);
  assert.equal(compter(design, "\nDepuis l'étape 40 du plan (lot 1, 10/11/2026) : **la fiche du pronostic**"), 1);
  assert.ok(ou(35) > 0 && ou(35) < ou(40) && ou(40) < ou(44), 'l’ordre des paragraphes');
  const paragraphe = design.slice(ou(40), ou(44)).replace(/\s+/g, ' ');
  for (const mot of ['`utils/ficheDuPronostic.js`', 'seul le 1 / N / 2 a une cote de bookmaker relevée automatiquement', 'aucune jauge', '`MarketPicksBoard`', 'lot 2', '`components/analysis/PercentageWhyCard.vue`', '`AVerifierBadge`', '`MOTS_DE_LA_FICHE`', 'server/test/ficheDuPronosticEcran.test.mjs']) {
    assert.ok(paragraphe.includes(mot), mot);
  }
  assert.doesNotMatch(design, /place réservée|à venir · étape 40/i);
  assert.match(design.replace(/\s+/g, ' '), /\*\*`PercentageWhyCard`\*\* : « Pourquoi ce pourcentage \? » — pour le résultat, les buts, les corners et les tirs/);
});
