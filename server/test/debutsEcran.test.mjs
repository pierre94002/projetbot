/**
 * LE DÉBUT DE SAISON À L'ÉCRAN (étape 35, lot 1b, 10/11/2026) — la lecture, le bloc « Début de saison » de l'encadré
 * « Contexte du match » et la carte « Arrivées et départs » de la page de l'équipe, rendus côté serveur, sans navigateur ni
 * serveur de développement (aides/rendu.mjs : `fetch` remplacé, tout appel refusé et compté ; horloge figée) :
 *   node --test test/debutsEcran.test.mjs        (depuis server/)
 *
 * Les réponses ne sont pas écrites à la main : le VRAI serveur les produit dans une copie isolée (aides/script-debuts-nuit.mjs,
 * phase « ecran ») — trois vraies passes de nuit sur le MAGASIN FABRIQUÉ (aides/debutsNuitFabrique.mjs : des clubs et des
 * joueurs inventés, aucun résultat réel), puis la lecture de chaque match (debutsRead.debutsDuMatch) et celle de la carte (la
 * vraie route GET /api/match-stats/effectif, effectif.controller.js). Les variantes partent de ces vraies formes.
 *   T-E1  chaque phrase, exacte : début de saison (saison à cheval et saison civile), promu, relégué, nouveau venu (l'effet
 *         mesuré, à blanc), premier au magasin, en saison (la ligne grise), match de coupe, l'oubli à la trêve retenu ;
 *   T-E2  les pastilles : « Effet mesuré » + « pas encore dans le pourcentage » pour une famille UTILE qui concerne CE match (les
 *         nouveaux venus) — le seul vert ; « Explication seulement » sinon ; « pas encore mesuré » sans note ; la puce « À blanc »
 *         sur la force de l'effectif ; jamais de vert pour une valeur ni dans le tableau du banc ;
 *   T-E3  la provenance de chaque ligne (la table de la nuit, l'heure du calcul, les fiches des joueurs, la note du banc) ;
 *         l'ambre au-delà de 24 h ; le banc et la liste FotMob, un jour sans heure, jamais en ambre ;
 *   T-E4  les états vides, dits en mots avec leur raison ; le bloc garde TOUJOURS ses deux lignes, la carte ses deux tableaux ;
 *   T-E5  une seule place : sous les neuf lignes de « Contexte du match » (jamais une dixième) ; joint APRÈS l'analyse (import()
 *         dynamique dans un try/catch) ; ni l'IA, ni le verdict, ni le gel, ni la mise ne le lisent ; rien de la 35 dans
 *         MarketPicksBoard, ScorePredictionCard, la saisie express ni le verdict par marché ;
 *   T-E6  la carte rendue sur la vraie réponse de la route : ses deux tableaux, « parti » (club et date), « pas revu » (et
 *         pourquoi), en gras ceux qui comptent, les doubles jamais réunis, les minutes sans identifiant, la force à blanc, Σ et ⌀ ;
 *         le logo du club et le drapeau sur chaque ligne qui nomme un club ou un joueur ;
 *   T-E7  le tableau du banc : 18 lignes (10 variantes, 6 « 1N2 seul » rapportés sans verdict, le poids par championnat, le
 *         second tournoi), Σ « au moins », ⌀ de l'ampleur sans les contrôles, 11 essais comptés (jamais 17), ni continuité ni
 *         mercato jugés ;
 *   T-E8  aucune requête de plus : le bloc et ses mots n'importent aucun service ; la carte, une seule
 *         (GET /api/match-stats/effectif?club=fotmob-N), aucune sans identifiant, et la route lue par la carte seulement (jamais
 *         par la page du match ni ailleurs) ; un serveur d'avant l'étape 35 le dit ; leur
 *         place sur la page de l'équipe ; le paragraphe de DESIGN.md ;
 *   T-E9  les clubs par identifiant FotMob : la fiche retrouvée quand les noms changent, rien par les noms seuls, « Bocage United
 *         FC » n'emprunte rien à « Bocage United », la route refuse un nom ; le logo sur chaque ligne qui nomme un club ; chaque
 *         lecture en moins de 25 ms.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, texteDe, blocDe, tableauDe, corps, pied, entetes } from './aides/rendu.mjs';

const U = await imp(path.join(UI, 'src', 'utils', 'debutsDeSaison.js'));
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
const lireSrc = (...p) => fs.readFileSync(path.join(SERVEUR, 'src', ...p), 'utf8');
const copie = (x) => JSON.parse(JSON.stringify(x));
const compter = (texte, motif) => (texte.match(motif) ?? []).length;
/** Le vrai signe moins (U+2212), fabriqué : jamais écrit en séquence d'échappement dans ce fichier. */
const MOINS = String.fromCharCode(0x2212);
/** Les classes vertes de l'appli (ce qui ferait passer une valeur pour « mesurée ») ; le bloc n'a que la sienne, `dds__vert`. */
const VERT = /is-mesure|is-compte|is-accent|cm-positive|is-positive|vbadge|is-value/;
const ANALYSE = Object.freeze({ loading: false, error: null, result: {} });
const LIMITE_DU_ONZE = 'L’exemple des titulaires majeurs absents relève de la force du onze du jour (étapes 30 et 34), pas de l’effectif de la saison.';
const PRUDENCE = 'Le magasin de 2023 à 2026 a déjà servi à d’autres réglages : un effet mesuré là est un jugement prudent.';
const INCONNU = 'non reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).';

/** Les vraies réponses du serveur, sur le magasin fabriqué (une copie isolée, base neuve, trois nuits). */
function lancer() {
  const c = preparerCopie({ base: false });
  try {
    const r = executer(c, path.join(SERVEUR, 'test', 'aides', 'script-debuts-nuit.mjs'), { args: ['ecran', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `script-debuts-nuit ecran :\n${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    return r.json;
  } finally {
    c.nettoyer();
  }
}
let memo = null;
const serveur = () => (memo ??= lancer());
const lecture = (k) => copie(serveur().lectures[k]);
const bloc = (k) => lecture(k).r;
const dits = (k, debuts = bloc(k)) => U.debutsDits({ debuts, analyse: ANALYSE, match: lecture(k).match ?? null });
const ligne = (d, camp) => d.lignes.find((l) => l.camp === camp);
const phrases = (d, camp) => ligne(d, camp).phrases.map((p) => espaces(p.texte));
const reponse = (k) => copie(serveur().effectifs[k].r);
const carte = (k, extra = {}) => U.effectifDit({ reponse: reponse(k), clubId: reponse(k).club?.teamId ?? null, clubName: reponse(k).club?.nom ?? '', ...extra });
const PRETS = ['promu', 'relegue', 'nouveaux', 'releguesEtNouveau', 'premier', 'enSaison', 'civile', 'debut', 'nouveau', 'coupe', 'ligaMx', 'serieA', 'parIdentifiants', 'sansNote', 'rappelUtile'];
const VIDES = ['premiereNuit', 'absent', 'hors', 'inconnu', 'procheDUnAutre', 'nomsSeuls', 'basePanne', 'autreVersion', 'ficheIllisible', 'ligneIllisible'];

// ---------------------------------------------------------------- le rendu (un seul pour tout le fichier)
let rendu = null;
const ouvrir = async () => (rendu ??= await ouvrirLeRendu({ cibles: /EffectifCard\.vue$/, heure: '2025-09-08T10:00:00.000Z' }));
after(async () => {
  if (rendu) await rendu.fermer();
});
/** Le rendu sans les attributs des styles scopés (data-v-…), comme contexteEcran.test.mjs. */
const net = (r) => ({ ...r, html: r.html.replace(/ data-v-[a-z0-9]+(?==|\s|>)/g, '') });
const composant = async (chemin) => (await (await ouvrir()).charger(chemin)).default;
const rendreLeBloc = async (k, debuts = bloc(k)) => net(await (await ouvrir()).rendre(await composant('/src/components/analysis/DebutDeSaisonBloc.vue'), { debuts, analyse: ANALYSE, match: lecture(k).match ?? null }));
const ADRESSE = (n) => new RegExp(`/api/match-stats/effectif\\?club=fotmob-${n}$`);
const rendreLaCarte = async (props, reponses = []) => net(await (await ouvrir()).rendre(await composant('/src/components/matches/EffectifCard.vue'), { clubId: null, clubName: '', league: null, ...props }, reponses));
const routeDe = (k) => copie(serveur().route[k]);
/** Les lignes rendues du bloc : { home, away } → leur HTML. */
const lignesDuBloc = (html) => Object.fromEntries([...html.matchAll(/<li class="dds__ligne" data-club="(home|away)"[\s\S]*?<\/li>/g)].map((m) => [m[1], m[0]]));
const crests = (html) => compter(html, /<span class="crest"/g);

test('T-E1 — chaque phrase, exacte : début de saison, promu, relégué, nouveau venu, premier au magasin, en saison, coupe, oubli à la trêve retenu', () => {
  // Début de saison (saison à cheval) : le rang, la saison, la force ramenée vers la moyenne, l'effectif, la force à blanc.
  const debut = dits('debut');
  assert.deepEqual(phrases(debut, 'home'), [
    'Ardenne Athletic : 5e match de championnat de la saison 2025-26 (EPL).',
    'Le modèle de buts en essai ramène déjà sa force, tirée de tout ce qui précède, de 29 % (attaque) et 30 % (défense) vers la moyenne du championnat ; le banc d’essai n’a pas trouvé mieux.'
  ]);
  assert.equal(espaces(ligne(debut, 'home').effectif.texte), 'Effectif d’Ardenne Athletic : 98 % des minutes de cette saison jouées par des joueurs déjà là la saison passée (moyenne du championnat : 100 %) ; 0 arrivé et 0 départ qui comptent, 0 pas revu — détail sur la page de l’équipe.');
  assert.equal(espaces(ligne(debut, 'away').effectif.texte), 'Effectif de Bocage United : 100 % des minutes de cette saison jouées par des joueurs déjà là la saison passée (moyenne du championnat : 100 %) ; 0 arrivé et 1 départ qui comptent, 1 pas revu — détail sur la page de l’équipe.');
  assert.equal(espaces(ligne(debut, 'away').force.texte), `Effectif utilisé (fiches des joueurs) : apport offensif ${MOINS}0,05 but par match par rapport à la saison passée, défensif +0,02. Pas dans les chiffres : à votre décision.`);
  assert.equal(ligne(debut, 'away').force.limite, LIMITE_DU_ONZE);
  assert.equal(espaces(ligne(debut, 'home').force.texte), 'Effectif utilisé (fiches des joueurs) : apport offensif 0,00 but par match par rapport à la saison passée, défensif 0,00. Pas dans les chiffres : à votre décision.');
  // Promu (et « d'EPL » : l'élision), relégué, l'effet d'une famille non utile dit tel quel.
  assert.deepEqual(phrases(dits('promu'), 'home'), ['Gatinais FC : promu de Championship — 3e match en EPL. Le modèle de buts en essai le place à la moyenne d’EPL et l’ajuste à mesure de ses matchs.', 'Effet des promus et relégués : pas prouvé au banc d’essai.']);
  assert.equal(phrases(dits('promu'), 'away')[0], 'Ardenne Athletic : 3e match de championnat de la saison 2024-25 (EPL).');
  assert.deepEqual(phrases(dits('relegue'), 'home'), ['Esterel Town : relégué d’EPL — 5e match en Championship. Le modèle de buts en essai le place à la moyenne de Championship et l’ajuste à mesure de ses matchs.', 'Effet des promus et relégués : pas prouvé au banc d’essai.']);
  // Nouveau venu : l'effet mesuré, à blanc, dans CE match (B − A, pour lui et pour l'adversaire) ; rien à comparer pour l'effectif.
  const nv = dits('nouveaux');
  assert.deepEqual(phrases(nv, 'home'), [
    'Morvan Orient : nouveau venu en Championship — sa division de la saison passée n’est pas suivie par CôteMaster ; 5e match. Le modèle de buts en essai le place à la moyenne du championnat, total des buts ramené vers celui du championnat tant qu’il a moins de 8 matchs au magasin.',
    'Nouveau venu : effet mesuré dans ce match, à blanc : +0,08 but pour Morvan Orient, +0,05 pour Nivernais Rangers (la valeur apprise sur les promus suivis du magasin ; sur 2 228 matchs de nouveaux venus jugés au banc, magasin 2023-2026 : un jugement prudent).'
  ]);
  assert.equal(phrases(nv, 'away')[1], 'Nouveau venu : effet mesuré dans ce match, à blanc : +0,05 but pour Nivernais Rangers, +0,08 pour Morvan Orient (la valeur apprise sur les promus suivis du magasin ; sur 2 228 matchs de nouveaux venus jugés au banc, magasin 2023-2026 : un jugement prudent).');
  assert.deepEqual(ligne(nv, 'home').phrases.map((p) => p.mesure ?? null), [null, true]);
  assert.equal(ligne(nv, 'home').effectif.texte, 'Effectif de Morvan Orient : aucune saison d’avant au magasin — rien à comparer.');
  assert.equal(ligne(nv, 'home').force, null, 'aucune saison d’avant : aucune force de l’effectif');
  const rn = dits('releguesEtNouveau');
  assert.deepEqual([ligne(rn, 'home').cas, ligne(rn, 'away').cas], ['relegue', 'nouveau']);
  assert.match(phrases(rn, 'away')[0], /^Morvan Orient : nouveau venu en Championship — .* ; 6e match\./);
  assert.equal(phrases(rn, 'away')[1].split(' (')[0], 'Nouveau venu : effet mesuré dans ce match, à blanc : +0,02 but pour Morvan Orient, +0,06 pour Forez Albion');
  // Premier au magasin, en saison (la ligne grise, les deux lignes gardées), saison civile, première journée, coupe.
  assert.deepEqual(phrases(dits('premier'), 'home'), ['Oland IF : première saison d’Allsvenskan au magasin — rien à comparer.']);
  assert.equal(ligne(dits('premier'), 'home').effectif.texte, 'Effectif d’Oland IF : aucune saison d’avant au magasin — rien à comparer.');
  const es = dits('enSaison');
  assert.equal(es.grise, 'Pas un début de saison : Bormio Calcio joue son 11e match de championnat de la saison, Cesena Vecchia son 11e.');
  assert.deepEqual(es.lignes.map((l) => [l.cas, l.phrases[0].texte, l.effectif, l.force]), [
    ['en-saison', 'Bormio Calcio : 11e match de championnat de la saison — plus un début de saison.', null, null],
    ['en-saison', 'Cesena Vecchia : 11e match de championnat de la saison — plus un début de saison.', null, null]
  ]);
  assert.equal(dits('debut').grise, null);
  assert.equal(phrases(dits('civile'), 'home')[0], 'Salta Unidos : 7e match de championnat de la saison 2025 (Primera División).');
  assert.equal(ligne(dits('civile'), 'home').effectif.texte, 'Effectif de Salta Unidos : aucune feuille de match de la saison passée au magasin — rien à comparer.');
  assert.equal(phrases(dits('serieA'), 'home')[0], 'Bormio Calcio : 1er match de championnat de la saison 2025-26 (Serie A).');
  assert.equal(phrases(dits('ligaMx'), 'away')[0], 'Zacatecas Deportivo : 7e match de championnat de la saison 2025-26 (Liga MX).');
  const cp = bloc('coupe');
  assert.deepEqual([cp.etat, cp.raison, cp.coupe, cp.fiche ?? null], ['pret', 'coupe', true, null]);
  assert.deepEqual(dits('coupe').lignes.map((l) => [l.cas, l.phrases.map((p) => espaces(p.texte))]), [
    ['coupe', ['Ardenne Athletic : match de coupe — un second tournoi n’est pas un début de saison. En championnat (EPL), 4 matchs joués cette saison.']],
    ['coupe', ['Morvan Orient : match de coupe — un second tournoi n’est pas un début de saison. En championnat (Championship), 4 matchs joués cette saison.']]
  ]);
  // L'oubli à la trêve, s'il était retenu (une note d'essai, jamais la vraie) : la force avec et sans, deux ou trois décimales.
  const ru = dits('rappelUtile');
  assert.equal(phrases(ru, 'home')[1], 'À blanc, sa force de la saison passée est ramenée un peu plus vers la moyenne : attaque 0,948 au lieu de 0,946, défense 1,020 au lieu de 1,021 (le modèle de buts en essai).');
  assert.equal(phrases(ru, 'away')[1], 'À blanc, sa force de la saison passée est ramenée un peu plus vers la moyenne : attaque 1,02 au lieu de 1,01, défense 0,95 au lieu de 0,96 (le modèle de buts en essai).');
  // Les nombres : l'ordinal, le signe, l'élision.
  assert.deepEqual([U.ordinal(1), U.ordinal(2), U.ordinal(11), U.ordinal(null)], ['1er', '2e', '11e', null]);
  assert.deepEqual([U.butsSignes(-0.051), U.butsSignes(0.004), U.butsSignes(0.02)], [`${MOINS}0,05`, '0,00', '+0,02']);
  assert.deepEqual([U.deNom('EPL'), U.deNom('Allsvenskan'), U.deNom('Championship'), U.deNom('Ligue 1')], ['d’EPL', 'd’Allsvenskan', 'de Championship', 'de Ligue 1']);
});

test('T-E2 — les pastilles : « Effet mesuré » seulement pour une famille utile qui concerne ce match ; « Explication seulement » sinon ; la puce « À blanc » ; jamais d’autre vert', async (t) => {
  const BANC_NOUVEAUX = 'Mesuré au banc : sur 2 228 matchs de nouveaux venus (magasin 2023-2026), ce calcul se trompe moins que le modèle de buts en essai (0,070 % d’erreur en moins sur le score exact, fourchette 0,022 à 0,119 %, ampleur 0,52 point, en tenant compte des 11 essais faits). Avec les cotes du 1N2 : rapporté sans verdict (711 matchs, +0,019 %).';
  for (const k of ['nouveaux', 'releguesEtNouveau', 'nouveau']) {
    const d = dits(k);
    assert.deepEqual([d.pastille.cle, d.pastille.libelle, d.pastille.sous, d.pastille.vert, d.pastille.familles], ['mesure', 'Effet mesuré', 'pas encore dans le pourcentage', true, ['nouveaux']], k);
    assert.equal(espaces(d.banc), BANC_NOUVEAUX, k);
    assert.equal(d.prudence, PRUDENCE, k);
  }
  // Une famille utile qui ne concerne pas ce match (aucun nouveau venu) : « Explication seulement », sans phrase du banc.
  for (const k of PRETS.filter((x) => !['nouveaux', 'releguesEtNouveau', 'nouveau', 'sansNote', 'rappelUtile'].includes(x))) {
    const d = dits(k);
    assert.deepEqual([d.pastille.cle, d.pastille.libelle, d.pastille.sous, d.pastille.vert], ['explication', 'Explication seulement', null, false], k);
    assert.deepEqual([d.banc, d.prudence], [null, null], k);
  }
  assert.deepEqual([dits('sansNote').pastille.cle, dits('sansNote').pastille.libelle, dits('sansNote').pastille.sous], ['non-mesure', 'Explication seulement', 'pas encore mesuré au banc d’essai']);
  for (const k of VIDES) assert.equal(dits(k).pastille.vert, false, k);
  // L'oubli à la trêve retenu (note d'essai) : sa phrase du banc, aux décimales de ses chiffres (jamais « 0,420 % »).
  const ru = dits('rappelUtile');
  assert.deepEqual(ru.pastille.familles, ['rappel'], 'la famille des nouveaux est utile mais ne concerne pas ce match');
  assert.equal(espaces(ru.banc), 'Mesuré au banc : sur 11 149 matchs de début de saison (magasin 2023-2026), ce calcul se trompe moins que le modèle de buts en essai (0,42 % d’erreur en moins sur le score exact, fourchette 0,21 à 0,63 %, ampleur 1,80 point, en tenant compte des 11 essais faits). Avec les cotes du 1N2 : rapporté sans verdict (4 323 matchs, +0,003 %).');
  assert.equal(U.pastilleDesDebuts(bloc('nouveaux')).aria, 'Début de saison : Effet mesuré, pas encore dans le pourcentage.');
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  const mesure = await rendreLeBloc('nouveaux');
  const b = blocDe(mesure.html, 'debut-de-saison');
  assert.match(b, /<span class="(?=[^"]*dds__pastille)(?=[^"]*dds__vert)[^"]*" role="note" aria-label="Début de saison : Effet mesuré, pas encore dans le pourcentage\." data-pastille="mesure">/);
  assert.equal(compter(b, /dds__vert/g), 1, 'le seul vert : la pastille');
  assert.match(espaces(texteDe(b)), /Effet mesuré pas encore dans le pourcentage Mesuré au banc : sur 2 228 matchs de nouveaux venus/);
  assert.match(b, /data-debuts="prudence">Le magasin de 2023 à 2026/);
  for (const k of ['debut', 'promu', 'enSaison', 'coupe', 'premier', 'nouveaux']) {
    const r = k === 'nouveaux' ? mesure : await rendreLeBloc(k);
    const h = blocDe(r.html, 'debut-de-saison');
    assert.doesNotMatch(h, VERT, `${k} : une classe verte de l’appli`);
    if (k !== 'nouveaux') assert.doesNotMatch(h, /dds__vert/, k);
    // La puce « À blanc » sur chaque force de l'effectif, lisible sans la couleur.
    const forces = dits(k).lignes.filter((l) => l.force).length;
    assert.equal(compter(h, /<span class="dds__puce" role="note" aria-label="Force de l’effectif [^"]*: à blanc, pas dans les chiffres\.">À blanc<\/span>/g), forces, k);
    // Le tableau du banc (replié) : jamais de vert, même pour la ligne retenue.
    const banc = h.slice(h.indexOf('data-debuts="banc-d-essai"'));
    assert.doesNotMatch(banc, /dds__vert|is-mesure|is-accent|cm-positive|<strong/, `${k} : le tableau du banc sans vert`);
  }
});

test('T-E3 — la provenance de chaque ligne ; l’ambre au-delà de 24 h ; le banc, un jour sans heure, jamais en ambre', async (t) => {
  const vu = (l) => l.provenances.map((p) => [p.source, p.action, p.releveLe, p.fichier ?? null]);
  const NUIT_A = '2025-09-08T00:40:00.000Z';
  const d = dits('debut');
  assert.deepEqual(vu(ligne(d, 'home')), [
    [U.SOURCES_DEBUTS.magasin, 'calculé', NUIT_A, 'la base du magasin (match-stats.db), table debuts_fiches'],
    [U.SOURCES_DEBUTS.modele, 'calculé', NUIT_A, null],
    [U.SOURCES_DEBUTS.magasin, 'calculé', NUIT_A, 'la base du magasin (match-stats.db), table debuts_clubs'],
    [U.SOURCES_DEBUTS.fiches, 'calculées', NUIT_A, null]
  ]);
  assert.deepEqual(ligne(d, 'home').provenances.map((p) => espaces(p.quand)), ['calculé le 08/09 à 2 h 40', 'calculé le 08/09 à 2 h 40 · banc du 09/11/2026', 'calculé le 08/09 à 2 h 40', 'calculées la nuit du 08/09']);
  assert.deepEqual(ligne(d, 'home').provenances.map((p) => p.detail ?? null), [null, 'La note du banc d’essai, calculée le 09/11/2026.', null, 'Fiches des joueurs du 07/09/2025.']);
  assert.deepEqual(U.SOURCES_DEBUTS, { magasin: 'magasin FotMob (feuilles des matchs déjà joués)', modele: 'modèle de buts en essai (étape 27) et banc d’essai de l’étape 35', fiches: 'fiches des joueurs (étape 30)', liste: 'FotMob, liste du jour', banc: 'banc d’essai de l’étape 35 (magasin 2023-2026 ; football-data 2019-2023)' });
  // Une seule phrase (pas de modèle à citer), rien à comparer (pas de fiches des joueurs), en saison, la coupe (la ligne du club seule).
  assert.deepEqual(vu(ligne(dits('premier'), 'home')).map((p) => p[3]), ['la base du magasin (match-stats.db), table debuts_fiches', 'la base du magasin (match-stats.db), table debuts_clubs']);
  assert.deepEqual(vu(ligne(dits('enSaison'), 'home')).map((p) => p[3]), ['la base du magasin (match-stats.db), table debuts_fiches']);
  assert.deepEqual(vu(ligne(dits('coupe'), 'home')), [[U.SOURCES_DEBUTS.magasin, 'calculé', NUIT_A, 'la base du magasin (match-stats.db), table debuts_clubs']]);
  // Rien lu au magasin : aucune provenance (jamais une date vide) ; le pied : le banc, un jour sans heure, jamais ancien.
  for (const k of VIDES) for (const l of dits(k).lignes) assert.deepEqual(l.provenances, [], `${k} ${l.camp}`);
  for (const k of [...PRETS, ...VIDES]) for (const l of dits(k).lignes) for (const p of l.provenances) assert.ok(p.source && p.releveLe && p.quand, `${k} ${l.camp} : ${JSON.stringify(p)}`);
  assert.deepEqual(d.pied, [{ cle: 'banc', source: U.SOURCES_DEBUTS.banc, releveLe: '2026-11-09', jourSeul: '09/11/2026', action: 'calculé', vieuxApresHeures: null }]);
  assert.deepEqual(dits('sansNote').pied, [], 'sans note du banc : aucune pastille du banc');
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  const r = await ouvrir();
  try {
    const neuf = blocDe((await rendreLeBloc('debut')).html, 'debut-de-saison');
    assert.equal(compter(neuf, /class="prov is-recent/g), 9, 'huit pastilles de ligne et celle du banc, toutes de moins de 24 h');
    assert.equal(compter(neuf, /class="prov is-ancien/g), 0);
    assert.ok(neuf.includes('Lu dans la base du magasin (match-stats.db), table debuts_fiches.'), 'le vrai endroit, au survol');
    assert.ok(neuf.includes('Lu dans la base du magasin (match-stats.db), table debuts_clubs.'));
    assert.match(espaces(texteDe(neuf)), /banc d’essai de l’étape 35 \(magasin 2023-2026 ; football-data 2019-2023\) calculé le 09\/11\/2026/);
    r.horloge.liveNow.value = Date.parse('2025-09-09T10:00:00.000Z');
    const vieux = blocDe((await rendreLeBloc('debut')).html, 'debut-de-saison');
    assert.equal(compter(vieux, /class="prov is-ancien/g), 8, 'un jour plus tard : les huit relevés de la nuit en ambre');
    assert.equal(compter(vieux, /class="prov is-recent/g), 1, 'le banc, un jour sans heure, jamais en ambre');
    // La carte : le magasin et les fiches des joueurs passent à l'ambre, la liste FotMob du jour (un jour sans heure) jamais.
    const c = await rendreLaCarte({ clubId: 'fotmob-2', clubName: 'Bocage United', league: 'EPL' }, [[ADRESSE(2), { code: 200, corps: routeDe('c2').corps }]]);
    const p = c.html.slice(c.html.indexOf('class="efc__pied"'));
    assert.equal(compter(p, /class="prov is-ancien/g), 2);
    assert.equal(compter(p, /class="prov is-recent/g), 1);
    assert.match(espaces(texteDe(p)), /FotMob, liste du jour relevé le 05\/09\/2025/);
  } finally {
    r.horloge.liveNow.value = Date.parse('2025-09-08T10:00:00.000Z');
  }
});

test('T-E4 — les états vides, dits en mots avec leur raison ; toujours deux lignes au bloc, deux tableaux à la carte', async (t) => {
  const note = (k, debuts) => dits(k, debuts).etat.texte;
  assert.equal(note('premiereNuit'), 'Pas encore calculé : la prochaine passe de nuit le fera.');
  assert.equal(note('absent'), 'Pas encore calculé : la dernière passe de nuit (le 08/09) n’a pas fait de fiche pour ce match (absent du calendrier de saison, ou sans ses deux identifiants FotMob) ; la suivante le reprendra.');
  assert.equal(note('absent', { ...bloc('absent'), raison: 'apres-la-derniere-nuit' }), 'Pas encore calculé : la dernière passe de nuit date du 08/09 ; la prochaine le fera.');
  assert.equal(note('hors'), 'Paraîtra la nuit du 13/09 (14 jours avant le match).');
  assert.deepEqual(phrases(dits('hors'), 'home'), ['Ardenne Athletic : paraîtra la nuit du 13/09.']);
  assert.equal(note('inconnu'), `Ombres Inconnues FC n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).`);
  assert.deepEqual(phrases(dits('inconnu'), 'away'), ['Forez Albion : pas de fiche — le match n’a pas ses deux identifiants FotMob.']);
  assert.equal(note('nomsSeuls'), 'Ardenne Athletic et Bocage United ne sont pas reconnus par leur identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).');
  for (const [k, pourquoi] of [['basePanne', 'la base n’a pas répondu'], ['autreVersion', 'la fiche vient d’une autre version de l’appli'], ['ficheIllisible', 'la fiche rangée par la passe de nuit ne se lit pas'], ['ligneIllisible', 'la ligne d’un des deux clubs, rangée par la passe de nuit, ne se lit pas']]) {
    assert.equal(note(k), `Début de saison illisible : ${pourquoi}. Les autres lignes ne sont pas touchées.`, k);
    assert.deepEqual(phrases(dits(k), 'home'), ['Ardenne Athletic : illisible.'], k);
  }
  // Le bloc d'une lecture ratée (analysis.controller.js : { version, etat: 'illisible', raison }), d'un serveur d'avant l'étape 35,
  // d'une analyse en échec ou en cours : chacun dit le sien, et garde ses deux lignes.
  const autre = (debuts, analyse = ANALYSE) => U.debutsDits({ debuts, analyse, match: { home: 'Lens', away: 'Lille' } });
  const rate = autre({ version: 1, etat: 'illisible', raison: 'lecture-ratee' });
  assert.equal(rate.etat.texte, 'Début de saison illisible : la lecture n’a pas abouti. Les autres lignes ne sont pas touchées.');
  assert.deepEqual(rate.lignes.map((l) => l.phrases[0].texte), ['Lens : illisible.', 'Lille : illisible.']);
  assert.equal(autre(undefined).etat.texte, 'Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour voir le début de saison.');
  assert.equal(autre(undefined, { loading: false, error: 'Erreur HTTP 500', result: null }).etat.texte, 'L’analyse du moteur n’a pas répondu : le début de saison arrive avec elle. Les autres lignes ne sont pas touchées.');
  assert.equal(autre(undefined, { loading: true, error: null, result: null }).etat.cle, 'chargement');
  for (const d of [rate, autre(undefined), autre(null)]) {
    assert.equal(d.lignes.length, 2);
    assert.deepEqual(d.tableau.lignes.map((l) => l.cle), ['poids-par-championnat', 'second-tournoi'], 'sans note : les deux lignes jamais mesurées, dites');
    assert.deepEqual([d.tableau.somme, d.tableau.moyenne, d.tableau.pied], ['Σ pas encore mesuré', '⌀ pas encore mesuré', 'Banc d’essai : pas encore passé.']);
  }
  for (const k of [...PRETS, ...VIDES]) {
    const d = dits(k);
    assert.equal(d.lignes.length, 2, k);
    assert.equal(d.tableau.lignes.length, k === 'sansNote' ? 2 : 18, `${k} : sans note, les deux lignes jamais mesurées`);
    assert.ok(d.etat.cle === 'pret' ? d.etat.texte === null : d.etat.texte.length > 20, k);
  }
  // La carte : chaque état dit sa raison ; ses deux tableaux toujours là (une ligne « aucun » s'il le faut).
  const etat = (k, extra) => carte(k, extra).etat;
  assert.equal(etat('premiereNuit').texte, 'Pas encore calculé : la prochaine passe de nuit le fera.');
  assert.equal(etat('c99').texte, 'Pas calculé pour ce club : la dernière passe de nuit (le 08/09) ne prend que les clubs vus jouer au magasin dans les 400 derniers jours.');
  assert.equal(etat('premier').texte, 'Aucune saison d’avant au magasin pour ce club : rien à comparer.');
  assert.equal(etat('c14').texte, 'Aucune saison d’avant au magasin pour ce club : rien à comparer.');
  assert.equal(etat('c61').texte, 'Aucune feuille de match de la saison passée au magasin pour ce club (ses compositions n’ont pas été relevées) : rien à comparer.');
  assert.equal(espaces(carte('c14').resume), 'Saison 2025-26 en Championship : 4 matchs de championnat joués (nouveau venu).');
  assert.equal(espaces(carte('premier').resume), 'Saison 2024 en Allsvenskan : 6 matchs de championnat joués (première saison du championnat au magasin).');
  assert.equal(espaces(carte('c61').resume), 'Saison 2025-26 en Serie A : 0 match de championnat joué (en début de saison).');
  assert.equal(etat('sansIdentifiant', { clubName: 'Bocage United' }).texte, 'Bocage United n’est pas reconnu par son identifiant FotMob (l’appli ne rapproche jamais deux noms qui se ressemblent).');
  for (const [k, pourquoi] of [['basePanne', 'la base n’a pas répondu'], ['ligneIllisible', 'la ligne rangée par la passe de nuit ne se lit pas'], ['autreVersion', 'la ligne vient d’une autre version de l’appli']]) {
    assert.equal(etat(k, { clubId: 'fotmob-2' }).texte, `Arrivées et départs illisibles : ${pourquoi}. Les autres cartes ne sont pas touchées.`, k);
  }
  const avantLePremier = reponse('c2');
  avantLePremier.mouvements = { ...avantLePremier.mouvements, matchsSaison: 0 };
  const apl = U.effectifDit({ reponse: avantLePremier, clubId: 'fotmob-2', clubName: 'Bocage United' });
  assert.equal(apl.etat.texte, 'Aucun match joué cette saison ; les arrivées et les départs se verront aux premières feuilles de match.');
  assert.equal(apl.arrives.vide, 'Aucun match joué cette saison : les arrivées se verront aux premières feuilles de match.');
  for (const c of [carte('premiereNuit'), carte('c99'), carte('sansIdentifiant'), carte('basePanne', { clubId: 'fotmob-2' })]) {
    assert.deepEqual([c.reference.lignes, c.arrives.lignes, c.resume, c.force, c.doubles], [[], [], null, null, []]);
    assert.match(c.reference.vide, /^Rien à montrer : /);
    assert.equal(c.reference.somme, 'Σ 0 joueur : 0 joue, 0 parti, 0 pas revu');
    assert.equal(c.arrives.somme, 'Σ 0 arrivé, dont 0 qui compte');
  }
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  for (const k of ['premiereNuit', 'absent', 'hors', 'inconnu', 'basePanne', 'enSaison']) {
    const h = blocDe((await rendreLeBloc(k)).html, 'debut-de-saison');
    assert.equal(compter(h, /<li class="dds__ligne"/g), 2, `${k} : toujours deux lignes`);
    assert.match(h, new RegExp(`data-debuts-etat="${dits(k).etat.cle}"`), k);
    if (k !== 'enSaison') assert.match(h, new RegExp(`<div class="[^"]*cm-note[^"]*" data-raison="${dits(k).etat.cle}">`), k);
    assert.match(h, /data-tableau="banc-des-debuts"/, `${k} : le tableau du banc, même vide`);
  }
  for (const [props, reponses, cle] of [
    [{ clubId: 'fotmob-99', clubName: 'Valletta Fabbrica' }, [[ADRESSE(99), { code: 200, corps: routeDe('c99').corps }]], 'pas-encore-calcule'],
    [{ clubId: 'fotmob-14', clubName: 'Jura Borough' }, [[ADRESSE(14), { code: 200, corps: routeDe('c14').corps }]], 'sans-saison-d-avant'],
    [{ clubId: null, clubName: 'Ombres Inconnues FC' }, [], 'clubs-inconnus'],
    [{ clubId: 'fotmob-2', clubName: 'Bocage United' }, [[ADRESSE(2), { code: 500, corps: { error: 'Erreur interne' } }]], 'illisible'],
    [{ clubId: 'fotmob-2', clubName: 'Bocage United' }, [[ADRESSE(2), { code: 404, corps: { error: 'Route introuvable : GET /api/match-stats/effectif?club=fotmob-2' } }]], 'serveur-a-relancer']
  ]) {
    const r = await rendreLaCarte(props, reponses);
    assert.match(r.html, new RegExp(`data-effectif-etat="${cle}"`), cle);
    assert.ok(tableauDe(r.html, 'reference') && tableauDe(r.html, 'arrives'), `${cle} : les deux tableaux`);
    for (const tab of ['reference', 'arrives']) {
      assert.equal(corps(tableauDe(r.html, tab)).length, 1, `${cle} ${tab}`);
      assert.match(corps(tableauDe(r.html, tab))[0], /data-vide="oui"/, `${cle} ${tab} : la ligne « aucun »`);
      assert.equal(pied(tableauDe(r.html, tab)).length, 1, `${cle} ${tab} : Σ et ⌀ même vides`);
    }
    assert.match(r.html, new RegExp(`data-raison="${cle}"`), `${cle} : la note dit pourquoi`);
  }
  const ancien = await rendreLaCarte({ clubId: 'fotmob-2', clubName: 'Bocage United' }, [[ADRESSE(2), { code: 404, corps: { error: 'Route introuvable : GET /api/match-stats/effectif?club=fotmob-2' } }]]);
  assert.ok(espaces(ancien.texte).includes('Le serveur n’est pas à jour : relancez demarrer-cotemaster.bat pour voir les arrivées et départs.'));
});

test('T-E5 — une seule place : sous les neuf lignes de « Contexte du match », jamais une dixième ; joint après l’analyse ; ni l’IA, ni le verdict, ni le gel, ni la mise', async (t) => {
  const ctrl = lireSrc('api', 'controllers', 'analysis.controller.js');
  const iAnalyse = ctrl.indexOf('const analyse = await analyzeMatch(');
  const iCoupe = ctrl.indexOf("const coupe = sportId === 'football' ? await coupeDuMatchAnalyse(avecFraicheur, analyse, getEngineConfig(sportId)) : null;");
  const iDebuts = ctrl.indexOf("const debutsDeSaison = sportId === 'football' ? await debutsDeSaisonDuMatchAnalyse(avecFraicheur) : null;");
  const iReponse = ctrl.indexOf('...(coupe ? { coupe } : {}), ...(debutsDeSaison ? { debutsDeSaison } : {}) };');
  assert.ok(iAnalyse > 0 && iCoupe > iAnalyse && iDebuts > iCoupe && iReponse > iDebuts, 'le bloc lu APRÈS l’analyse, joint à la réponse en dernier');
  assert.equal(compter(ctrl, /debutsDeSaisonDuMatchAnalyse\(/g), 2, 'un appel, une définition');
  assert.match(ctrl, /async function debutsDeSaisonDuMatchAnalyse\(match\) \{\n {2}try \{\n {4}const \{ debutsDuMatch \} = await import\('\.\.\/\.\.\/data\/debutsDeSaison\/debutsRead\.js'\);\n {4}return debutsDuMatch\(\{ match, database: openDb\(\), maintenant: Date\.now\(\) \}\);\n {2}\} catch \{\n {4}return \{ version: 1, etat: 'illisible', raison: 'lecture-ratee' \};\n {2}\}\n\}/);
  assert.doesNotMatch(ctrl, /^import [^;]*debutsDeSaison/m, 'aucun import statique : une erreur dans data/debutsDeSaison/ n’empêche jamais l’analyse');
  // L'IA ne reçoit que des champs nommés du moteur ; ni le moteur, ni le verdict, ni le gel, ni la mise ne lisent le bloc.
  const service = lireSrc('core', 'ai', 'matchAiAnalysisService.js');
  const resume = service.slice(service.indexOf('function resumeDuMoteur('), service.indexOf('\n}\n', service.indexOf('function resumeDuMoteur(')));
  assert.ok(resume.length > 200 && !/debuts|effectif|\.\.\.engineResult/.test(resume), 'le résumé donné à l’IA : des champs nommés, jamais le début de saison');
  const TRACES = /debutsDeSaison|debutsRead|data\/debutsDeSaison|effectifDuClub|squadChanges|DebutDeSaison|EffectifCard|effectifDit|debutsDits/;
  for (const f of ['core/ai/compactContext.js', 'core/ai/matchAiAnalysisService.js', 'core/ai/autoMatchAiTrigger.js', 'core/ai/matchAiAnalysisPrompt.js', 'core/engine/oddsEngine.js', 'core/engine/verdictPari.js', 'data/enregistreurs/gelPronostics.js', 'data/mise/miseRead.js']) {
    assert.doesNotMatch(lireSrc(...f.split('/')), TRACES, `${f} : ne lit jamais le début de saison`);
  }
  for (const racine of ['core', 'sports']) {
    for (const f of fs.readdirSync(path.join(SERVEUR, 'src', racine), { recursive: true }).map(String).filter((x) => /\.(m?js|json)$/.test(x))) {
      assert.doesNotMatch(fs.readFileSync(path.join(SERVEUR, 'src', racine, f), 'utf8'), TRACES, `${racine}/${f}`);
    }
  }
  for (const f of [['components', 'analysis', 'MarketPicksBoard.vue'], ['components', 'analysis', 'ScorePredictionCard.vue'], ['components', 'analysis', 'ManualOddsEntry.vue'], ['components', 'analysis', 'MarketVerdictBoard.vue'], ['utils', 'verdictParMarche.js'], ['views', 'UpcomingMatchView.vue']]) {
    assert.doesNotMatch(lireUi(...f), TRACES, `${f.join('/')} : rien de l’étape 35`);
  }
  // La page du match : le bloc vient avec l'encadré « Contexte du match » (une seule fois), qui reçoit l'analyse entière.
  const vue = lireUi('views', 'UpcomingMatchView.vue');
  assert.equal(compter(vue, /<MatchContextCard\b/g), 1);
  assert.match(vue, /<MatchContextCard\n {10}id="upcoming-contexte"\n {10}class="upcoming__block"\n {10}:contexte="analyse\.result\?\.contexte"\n {10}:analyse="analyse"/);
  const mcc = lireUi('components', 'analysis', 'MatchContextCard.vue');
  assert.equal(compter(mcc, /<DebutDeSaisonBloc /g), 1);
  assert.match(mcc, /<DebutDeSaisonBloc :debuts="analyse\?\.result\?\.debutsDeSaison" :analyse="analyse" :match="match" \/>\n {4}<\/div>\n {2}<\/AppCard>/, 'à la fin de l’encadré');
  assert.ok(mcc.indexOf('data-contexte="banc-d-essai"') < mcc.indexOf('<DebutDeSaisonBloc '), 'sous les neuf lignes et sous leur banc d’essai');
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  const Carte = await composant('/src/components/analysis/MatchContextCard.vue');
  for (const k of ['nouveaux', 'enSaison', 'hors']) {
    const r = net(await (await ouvrir()).rendre(Carte, { contexte: undefined, analyse: { loading: false, error: null, result: { debutsDeSaison: bloc(k) } }, page: null, simulation: null, match: lecture(k).match }));
    assert.equal(compter(r.html, /<li class="mcc__ligne"/g), 9, `${k} : toujours neuf lignes`);
    assert.equal(compter(r.html, /data-bloc="debut-de-saison"/g), 1, k);
    assert.ok(r.html.indexOf('data-contexte="banc-d-essai"') < r.html.indexOf('data-bloc="debut-de-saison"'), `${k} : sous les neuf lignes et leur banc`);
    assert.match(r.html, new RegExp(`data-debuts-etat="${dits(k).etat.cle}"`), k);
    assert.deepEqual(r.appels, [], `${k} : aucune requête de plus`);
  }
  // Un serveur d'avant l'étape 35 : l'encadré garde ses neuf lignes, le bloc le dit.
  const avant = net(await (await ouvrir()).rendre(Carte, { contexte: undefined, analyse: { loading: false, error: null, result: {} }, page: null, simulation: null, match: { home: 'Lens', away: 'Lille' } }));
  assert.equal(compter(avant.html, /<li class="mcc__ligne"/g), 9);
  assert.match(avant.html, /data-debuts-etat="serveur-a-relancer"/);
});

test('T-E6 — la carte « Arrivées et départs » sur la vraie réponse de la route : deux tableaux, parti, pas revu, arrivés, doubles, Σ et ⌀, logos et drapeaux', async (t) => {
  const c2 = carte('c2', { clubName: 'Bocage United' });
  assert.equal(espaces(c2.resume), 'Saison 2025-26 en EPL : 4 matchs de championnat joués (en début de saison). 100 % des minutes de cette saison ont été jouées par des joueurs déjà là la saison passée (moyenne du championnat : 100 %).');
  const parti = c2.reference.lignes.find((j) => j.id === 2005);
  assert.deepEqual([parti.nom, parti.pays, parti.cetteSaison], ['Émile Varenne', 'FRA', { etat: 'parti', avant: 'parti — vu jouer pour', club: { nom: 'Morvan Orient', teamId: 'fotmob-21', league: 'Championship' }, apres: 'le 16/08' }]);
  assert.deepEqual(c2.reference.lignes.find((j) => j.id === 2007).cetteSaison, { etat: 'pas-revu', avant: 'pas revu depuis la reprise · blessé (liste FotMob du 05/09)', club: null, apres: null });
  assert.deepEqual([c2.reference.somme, c2.reference.moyenne, c2.reference.moyenneSaison], ['Σ 14 joueurs : 12 jouent, 1 parti, 1 pas revu', '⌀ 79 % des minutes qu’il pouvait jouer', '⌀ 75 % pour ceux qui jouent']);
  assert.deepEqual([c2.arrives.lignes, c2.arrives.vide, c2.arrives.somme, c2.arrives.moyenne], [[], 'Aucun joueur arrivé depuis la saison passée.', 'Σ 0 arrivé, dont 0 qui compte', '⌀ sans objet']);
  // « parti » seulement vu jouer ailleurs, avec le club ET la date : sans eux, « pas revu » (jamais un départ deviné).
  const sansDate = reponse('c2');
  sansDate.reference.find((j) => j.id === 2005).date = null;
  assert.equal(U.effectifDit({ reponse: sansDate, clubId: 'fotmob-2' }).reference.lignes.find((j) => j.id === 2005).cetteSaison.etat, 'pas-revu');
  const c3 = carte('c3');
  assert.deepEqual(c3.arrives.lignes.map((j) => [j.id, j.nom, j.minutes, j.compte, j.dOu]), [[3015, 'Tomás Arriaga', '20 min (6 %)', false, { avant: 'pas vu dans un autre club au magasin', club: null, apres: null }]]);
  assert.deepEqual(c3.doubles.map((d) => d.texte), ['Tomas Arriaga (pas revu) et Tomás Arriaga (arrivé) ont la même date de naissance et le même poste : peut-être le même joueur sous deux identifiants FotMob. Ils ne sont pas réunis.']);
  assert.equal(c3.reference.lignes.find((j) => j.id === 3099).cetteSaison.avant, 'pas revu depuis la reprise', 'sans liste FotMob du jour : aucune raison inventée');
  assert.equal(espaces(carte('c5').sansIdentifiant), 'Minutes sans identifiant FotMob : 2,9 % (jamais comptées).');
  assert.equal(carte('c2').sansIdentifiant, null, 'aucune minute sans identifiant : rien à dire');
  assert.equal(carte('promu').reference.lignes[0].nom, 'joueur n° 11004', 'un joueur sans nom dans l’annuaire : son numéro, jamais un vide');
  assert.equal(espaces(c2.force.texte), `Effectif utilisé (fiches des joueurs) : apport offensif ${MOINS}0,05 but par match par rapport à la saison passée, défensif +0,02. Pas dans les chiffres : à votre décision.`);
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  const r = await rendreLaCarte({ clubId: 'fotmob-2', clubName: 'Bocage United', league: 'EPL' }, [[ADRESSE(2), { code: 200, corps: routeDe('c2').corps }]]);
  assert.deepEqual(r.appels, ['GET http://localhost:4000/api/match-stats/effectif?club=fotmob-2'], 'une seule lecture');
  const h = blocDe(r.html, 'arrivees-departs');
  assert.ok(h, 'la carte porte data-bloc="arrivees-departs"');
  assert.match(h, /data-effectif-etat="pret"/);
  const ref = tableauDe(h, 'reference');
  assert.deepEqual(entetes(ref), ['Joueur', 'Poste', 'Minutes la saison passée (part)', 'Cette saison']);
  const lignes = corps(ref);
  assert.equal(lignes.length, 14);
  for (const l of lignes) {
    const id = Number(/data-joueur="(\d+)"/.exec(l)[1]);
    const j = reponse('c2').reference.find((x) => x.id === id);
    assert.equal(crests(l), j.etat === 'parti' ? 2 : 1, `${id} : le logo du club (et celui du club où il a joué)`);
    assert.equal(compter(l, /<span class="flag"/g), j.pays ? 1 : 0, `${id} : son drapeau quand son pays est connu`);
  }
  assert.match(espaces(texteDe(lignes.find((l) => l.includes('data-joueur="2005"')))), /Émile Varenne Milieu 900 min \(100 %\) parti — vu jouer pour Morvan Orient le 16\/08/);
  assert.match(lignes.find((l) => l.includes('data-joueur="2007"')), /data-devenu="pas-revu"/);
  assert.match(espaces(texteDe(pied(ref)[0])), /^Σ 14 joueurs : 12 jouent, 1 parti, 1 pas revu ⌀ 79 % des minutes qu’il pouvait jouer ⌀ 75 % pour ceux qui jouent$/);
  const arr = tableauDe(h, 'arrives');
  assert.deepEqual(entetes(arr), ['Joueur', 'Poste', 'Minutes cette saison (part)', 'D’où']);
  assert.match(espaces(texteDe(corps(arr)[0])), /^Aucun joueur arrivé depuis la saison passée\.$/);
  assert.match(h, /<p class="efc__force" data-effectif="force-effectif"><span class="efc__puce" role="note" aria-label="Force de l’effectif de Bocage United : à blanc, pas dans les chiffres\.">À blanc<\/span>/);
  assert.ok(espaces(texteDe(h)).includes(LIMITE_DU_ONZE));
  assert.doesNotMatch(h, VERT, 'jamais de vert pour une valeur');
  // Les arrivés : en gras ceux qui comptent ; d'où ils viennent, avec le logo du club ; les doubles, deux drapeaux et le logo.
  const venu = copie(routeDe('c3').corps);
  venu.arrives[0] = { ...venu.arrives[0], compte: true, dOu: { club: { id: 21, teamId: 'fotmob-21', nom: 'Morvan Orient', league: 'Championship' }, date: '2025-05-10', recent: true } };
  const r3 = await rendreLaCarte({ clubId: 'fotmob-3', clubName: 'Causses City', league: 'EPL' }, [[ADRESSE(3), { code: 200, corps: venu }]]);
  const a3 = corps(tableauDe(r3.html, 'arrives'))[0];
  assert.match(a3, /data-joueur="3015" data-compte="oui"/);
  assert.match(a3, /<span class="(?=[^"]*efc__joueur)(?=[^"]*efc__qui-compte)[^"]*">[\s\S]*<strong>Tomás Arriaga<\/strong>/);
  assert.equal(crests(a3), 2, 'le logo du club et celui d’où il vient');
  assert.match(espaces(texteDe(a3)), /vu la saison passée à Morvan Orient/);
  const double = /<p class="efc__mention" data-effectif="double">[\s\S]*?<\/p>/.exec(r3.html)[0];
  assert.deepEqual([crests(double), compter(double, /<span class="flag"/g)], [1, 2]);
  const r5 = await rendreLaCarte({ clubId: 'fotmob-5', clubName: 'Esterel Town', league: 'Championship' }, [[ADRESSE(5), { code: 200, corps: routeDe('c5').corps }]]);
  assert.equal(espaces(texteDe(/<p class="efc__mention" data-effectif="sans-identifiant">[\s\S]*?<\/p>/.exec(r5.html)[0])), 'Minutes sans identifiant FotMob : 2,9 % (jamais comptées).');
});

test('T-E7 — le tableau du banc : 18 lignes, le 1N2 rapporté sans verdict, Σ « au moins », ⌀ sans les contrôles, 11 essais comptés', async (t) => {
  const tab = dits('debut').tableau;
  assert.deepEqual(tab.lignes.map((l) => l.cle), [
    'magasin-rappel-sans-cote', 'magasin-rappel-sans-cote-1n2', 'magasin-placebo-fausse-rentree', 'magasin-promus-sans-cote', 'magasin-promus-sans-cote-1n2',
    'magasin-nouveaux-sans-cote', 'magasin-nouveaux-sans-cote-1n2', 'magasin-placebo-faux-promu', 'magasin-force-effectif-sans-cote', 'magasin-force-effectif-sans-cote-1n2',
    'magasin-placebo-faux-effectif', 'fd-promus-sans-cote', 'fd-promus-sans-cote-1n2', 'fd-nouveaux-sans-cote', 'fd-nouveaux-sans-cote-1n2', 'fd-placebo-faux-promu',
    'poids-par-championnat', 'second-tournoi'
  ]);
  const l = (cle) => tab.lignes.find((x) => x.cle === cle);
  assert.deepEqual(['matchs', 'erreur', 'ampleur', 'verdict'].map((c) => espaces(l('magasin-nouveaux-sans-cote')[c])), ['2 228', '+0,070 % (+0,022 % à +0,119 %)', '0,52 point', 'effet mesuré (jugement prudent)']);
  assert.equal(l('magasin-nouveaux-sans-cote').mesure, true);
  assert.equal(espaces(l('magasin-placebo-fausse-rentree').erreur), `0,000 % (${MOINS}0,004 % à +0,004 %)`, 'jamais « −0,000 % »');
  assert.equal(l('magasin-force-effectif-sans-cote').verdict, 'pas prouvé (jugement toujours prudent)');
  assert.equal(l('fd-nouveaux-sans-cote').verdict, 'pas prouvé', 'la prudence tient au magasin, jamais à football-data');
  assert.equal(l('magasin-rappel-sans-cote').verdict, 'pas prouvé');
  for (const x of tab.lignes.filter((y) => y.controle)) assert.equal(x.verdict, 'rien trouvé, comme il se doit', x.cle);
  assert.equal(tab.lignes.filter((y) => y.controle).length, 4);
  for (const x of tab.lignes.filter((y) => y.cle.endsWith('-1n2'))) {
    assert.deepEqual([x.regime, x.ampleur, x.verdict, x.mesure], ['1N2 seul (rapporté)', '—', 'rapporté, sans verdict', false], x.cle);
  }
  assert.deepEqual([l('poids-par-championnat').verdict, l('second-tournoi').verdict], ['non mesurable au banc d’essai : une ou deux rentrées par championnat', 'non mesuré : votre choix (pas un début de saison)']);
  assert.equal(espaces(tab.somme), 'Σ magasin 2023-2026 : au moins 11 149 matchs distincts jugés ; football-data 2019-2023 : au moins 1 969 matchs distincts jugés');
  assert.equal(tab.moyenne, '⌀ ampleur 1,45 point (6 variantes, sans les contrôles)');
  assert.equal(tab.portee, 'Σ et ⌀ sur les 10 lignes jugées (sans le 1N2 rapporté)');
  assert.equal(tab.pied, 'Banc d’essai : magasin de juillet 2023 à septembre 2026, deux moitiés croisées (des matchs déjà vus par d’autres étapes : un jugement prudent) ; football-data de juillet 2019 à juin 2023, appris sur 2005-2019 (jamais vu pour cette question ; sans xG) ; 11 essais comptés, seuil sévère (calcul du 09/11/2026).');
  assert.equal(tab.limites.length, 6);
  assert.equal(tab.limites[0], PRUDENCE);
  assert.equal(tab.limites[3], LIMITE_DU_ONZE);
  assert.doesNotMatch(JSON.stringify(tab), /continuit|mercato|17 essais|\b17\b/, 'le lot allégé : ni continuité ni mercato jugés, 11 essais');
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  const h = blocDe((await rendreLeBloc('debut')).html, 'debut-de-saison');
  const banc = tableauDe(h, 'banc-des-debuts');
  assert.deepEqual(entetes(banc), ['Ce qui a été comparé', 'Fenêtre', 'Régime', 'Matchs jugés', 'Erreur en moins (fourchette)', 'Ampleur', 'Verdict']);
  assert.equal(corps(banc).length, 18);
  assert.equal(compter(banc, /data-controle="oui"/g), 4);
  assert.equal(pied(banc).length, 1);
  assert.match(espaces(texteDe(pied(banc)[0])), /^Σ et ⌀ sur les 10 lignes jugées \(sans le 1N2 rapporté\) Σ magasin 2023-2026 : au moins 11 149 matchs distincts jugés/);
  assert.match(h, /<details class="dds__details" data-debuts="banc-d-essai">/, 'replié');
  assert.equal(compter(h, /data-debuts="limites"/g), 1);
});

test('T-E8 — aucune requête de plus : le bloc n’importe aucun service ; la carte, une seule lecture, aucune sans identifiant ; leur place ; DESIGN.md', async (t) => {
  assert.deepEqual([...reglesPures('debutsDeSaison.js')].sort(), ['contexteDuMatch.js', 'debutsDeSaison.js', 'ficheJoueur.js', 'fotmobLabels.js', 'indiceDeForce.js', 'leagueDisplay.js']);
  const imports = (texte) => [...texte.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  const blocVue = lireUi('components', 'analysis', 'DebutDeSaisonBloc.vue');
  assert.doesNotMatch(blocVue, /services\/|fetch\(|Api\.|axios|onMounted|stores\//);
  assert.deepEqual(imports(blocVue), ['vue', '@/components/common/AppIcon.vue', '@/components/common/LoadingSpinner.vue', '@/components/common/ProvenanceChip.vue', '@/components/matches/TeamCrest.vue', '@/utils/debutsDeSaison.js']);
  const carteVue = lireUi('components', 'matches', 'EffectifCard.vue');
  assert.deepEqual(imports(carteVue), ['vue', '@/components/common/AppCard.vue', '@/components/common/AppIcon.vue', '@/components/common/HelpTip.vue', '@/components/common/LoadingSpinner.vue', '@/components/common/ProvenanceChip.vue', '@/components/matches/LeagueBadge.vue', '@/components/matches/PlayerFlag.vue', '@/components/matches/TeamCrest.vue', '@/services/matchStatsApi.js', '@/utils/debutsDeSaison.js']);
  assert.deepEqual([...carteVue.matchAll(/matchStatsApi\.(\w+)\(/g)].map((m) => m[1]), ['effectif'], 'une seule lecture');
  assert.doesNotMatch(carteVue, /fetch\(|axios|stores\//);
  assert.match(carteVue, /watch\(\n {2}\(\) => props\.clubId,/, 'la carte relit quand le club change');
  assert.match(lireUi('services', 'matchStatsApi.js'), /\n {2}effectif: \(club\) => httpClient\.get\(`\/match-stats\/effectif\?club=\$\{encodeURIComponent\(club\)\}`\),\n/);
  const routes = lireSrc('api', 'routes', 'matchStats.routes.js');
  assert.match(routes, /^import \{ getEffectif \} from '\.\.\/controllers\/effectif\.controller\.js';$/m);
  assert.match(routes, /^router\.get\('\/effectif', asyncHandler\(getEffectif\)\);$/m);
  assert.doesNotMatch(lireSrc('api', 'controllers', 'matchStats.controller.js'), /getEffectif|effectifDuClub|debutsRead|debutsDeSaison/, 'le contrôleur du magasin n’est pas touché : la route a le sien');
  // Les deux composants ne sont employés qu'à leur place.
  const fichiersUi = fs.readdirSync(path.join(UI, 'src'), { recursive: true }).map(String).filter((f) => /\.(vue|js)$/.test(f));
  const emplois = (nom) => fichiersUi.filter((f) => !f.endsWith(`${nom}.vue`) && new RegExp(`\\b${nom}\\b`).test(fs.readFileSync(path.join(UI, 'src', f), 'utf8'))).map((f) => f.split(path.sep).join('/')).sort();
  assert.deepEqual(emplois('DebutDeSaisonBloc'), ['components/analysis/MatchContextCard.vue']);
  assert.deepEqual(emplois('EffectifCard'), ['views/TeamView.vue']);
  // Une seule porte vers la route /effectif : la carte (par le service). La page du match, et tout le reste de l'interface, ne
  // l'appellent jamais — commentaires retirés (ils citent la route).
  const sansCommentairesUi = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
  const appelants = fichiersUi.filter((f) => /\.effectif\(|match-stats\/effectif/.test(sansCommentairesUi(fs.readFileSync(path.join(UI, 'src', f), 'utf8')))).map((f) => f.split(path.sep).join('/')).sort();
  assert.deepEqual(appelants, ['components/matches/EffectifCard.vue', 'services/matchStatsApi.js'], 'la route /effectif lue par la carte seulement');
  const equipe = lireUi('views', 'TeamView.vue');
  assert.match(equipe, /^import EffectifCard from '@\/components\/matches\/EffectifCard\.vue';$/m);
  assert.equal(compter(equipe, /<EffectifCard /g), 1);
  assert.match(equipe, /<EffectifCard :club-id="idClub \?\? null" :club-name="nom" :league="ligue" \/>/);
  assert.ok(equipe.indexOf('<TeamStrengthCard') < equipe.indexOf('<EffectifCard') && equipe.indexOf('<EffectifCard') < equipe.indexOf('<TeamStyleCard'), 'juste après « Indice de force », avant « Style de jeu »');
  // DESIGN.md : un paragraphe, à sa place (après ceux des étapes 37, 32 et 36, avant celui de la 44).
  const design = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  assert.equal(compter(design, /^Depuis l'étape 35 du plan \(lot 1b, 10\/11\/2026\) : \*\*les débuts de saison, à blanc\*\*/gm), 1);
  const ou = (n) => design.indexOf(`Depuis l'étape ${n} du plan`);
  assert.ok(ou(37) > 0 && ou(37) < ou(32) && ou(32) < ou(35) && ou(35) < ou(44), 'l’ordre des paragraphes');
  for (const mot of ['« Effet mesuré »', 'pas encore dans le pourcentage', '« À blanc »', 'GET /api/match-stats/effectif', 'MarketPicksBoard']) assert.ok(design.slice(ou(35), ou(44)).replace(/\s+/g, ' ').includes(mot), mot);
  if (optionsDuRendu.skip) return t.skip(optionsDuRendu.skip);
  // Le rendu : le bloc ne fait aucun appel ; la carte, un seul, et aucun sans identifiant FotMob.
  for (const k of ['debut', 'nouveaux', 'basePanne']) assert.deepEqual((await rendreLeBloc(k)).appels, [], k);
  for (const clubId of [null, 'fotmob-0', 'Bocage United', '2']) {
    const r = await rendreLaCarte({ clubId, clubName: 'Bocage United' });
    assert.deepEqual(r.appels, [], `${clubId} : aucune lecture`);
    assert.match(r.html, /data-effectif-etat="clubs-inconnus"/, String(clubId));
    assert.match(r.html, /class="efc__sans-logo"/, `${clubId} : jamais un logo cherché d’après le nom`);
  }
  assert.deepEqual((await ouvrir()).interdits, [], 'aucune requête refusée dans tout le fichier');
});

test('T-E9 — les clubs par identifiant FotMob ; le logo sur chaque ligne qui nomme un club ; chaque lecture en moins de 25 ms', async (t) => {
  // La fiche retrouvée par les identifiants quand les noms changent ; rien par les noms seuls.
  const pi = bloc('parIdentifiants');
  const de = bloc('debut');
  assert.equal(pi.etat, 'pret');
  assert.deepEqual([pi.clubs.home.id, pi.clubs.away.id], [1, 2]);
  assert.deepEqual([pi.fiche.calculeLe, pi.clubs.home.rang, pi.clubs.away.rang, pi.clubs.away.ligne.continuite], [de.fiche.calculeLe, de.clubs.home.rang, de.clubs.away.rang, de.clubs.away.ligne.continuite]);
  assert.equal(phrases(dits('parIdentifiants'), 'home')[0], 'Un autre nom : 5e match de championnat de la saison 2025-26 (EPL).', 'le nom de la page, les chiffres de l’identifiant');
  const ns = bloc('nomsSeuls');
  assert.deepEqual([ns.etat, ns.raison, ns.clubs.home.id, ns.clubs.away.id, ns.fiche ?? null], ['clubs-inconnus', 'sans-identifiant', null, null, null]);
  // « Bocage United FC » sans identifiant n'emprunte rien à « Bocage United » (fotmob-2), le nom le plus proche.
  const pr = dits('procheDUnAutre');
  assert.deepEqual(ligne(pr, 'home'), { camp: 'home', cas: 'sans-identifiant', club: { nom: 'Bocage United FC', teamId: null, league: 'EPL' }, phrases: [{ cle: 'statut', texte: `Bocage United FC : ${INCONNU}` }], effectif: null, force: null, provenances: [] });
  assert.equal(bloc('procheDUnAutre').clubs.home.id, null);
  // La route : un identifiant FotMob ou un numéro, jamais un nom.
  assert.deepEqual([routeDe('c2').code, routeDe('c3').code, routeDe('c3').corps.club.teamId], [200, 200, 'fotmob-3']);
  assert.deepEqual(routeDe('nom'), { code: 400, message: 'Le paramètre "club" doit être un identifiant FotMob (« fotmob-123 » ou 123), reçu « Bocage United ».' });
  assert.deepEqual(routeDe('vide'), { code: 400, message: 'Le paramètre "club" est requis (chaîne non vide).' });
  assert.deepEqual(reponse('nombre').reference, reponse('c2').reference, 'le numéro seul lit la même ligne');
  for (const k of ['sansIdentifiant', 'zero', 'nom']) assert.deepEqual([reponse(k).etat, reponse(k).raison], ['clubs-inconnus', 'sans-identifiant'], k);
  // Chaque ligne qui nomme un club porte son logo : le sien en tête, celui d'en face dans la phrase qui le nomme.
  for (const k of PRETS) {
    const d = dits(k);
    for (const l of d.lignes) {
      const textes = [...l.phrases.map((p) => p.texte), l.effectif?.texte, l.force?.texte].filter(Boolean);
      const logos = [l.club, ...l.phrases.flatMap((p) => p.clubs ?? [])];
      for (const c of d.lignes.map((x) => x.club)) {
        if (textes.some((x) => x.includes(c.nom))) assert.ok(logos.some((x) => x.nom === c.nom && x.teamId === c.teamId), `${k} ${l.camp} : ${c.nom} nommé sans son logo`);
      }
    }
  }
  if (!optionsDuRendu.skip) {
    const r = await rendreLeBloc('nouveaux');
    const L = lignesDuBloc(blocDe(r.html, 'debut-de-saison'));
    assert.deepEqual([crests(L.home), crests(L.away)], [2, 2], 'son logo et celui du club d’en face');
    assert.match(L.home, /<span class="dds__logos" data-logos="clubs">/);
    const g = blocDe((await rendreLeBloc('enSaison')).html, 'debut-de-saison');
    assert.equal(crests(/<p class="dds__grise"[\s\S]*?<\/p>/.exec(g)[0]), 2, 'la ligne grise nomme les deux clubs : deux logos');
    const inc = lignesDuBloc(blocDe((await rendreLeBloc('procheDUnAutre')).html, 'debut-de-saison'));
    assert.deepEqual([crests(inc.home), compter(inc.home, /class="dds__sans-logo"/g), crests(inc.away)], [0, 1, 1], 'sans identifiant : jamais un logo cherché d’après le nom');
  }
  // La lecture : quelques lectures par clé, jamais un calcul (règle des 25 ms) ; un minutage tombé sous la charge se relance une fois, et le dit.
  const lents = (j) => [...Object.entries(j.lectures), ...Object.entries(j.effectifs).map(([k, v]) => [`carte ${k}`, v])].filter(([, v]) => Number.isFinite(v.ms) && !(v.ms < 25)).map(([k, v]) => `${k} ${Math.round(v.ms)} ms`);
  let trop = lents(serveur());
  if (trop.length) {
    t.diagnostic(`minutage relancé (sous la charge ?) : ${trop.join(', ')}`);
    trop = lents(lancer());
  }
  assert.deepEqual(trop, [], 'chaque lecture en moins de 25 ms');
  assert.ok(Object.values(serveur().lectures).filter((v) => Number.isFinite(v.ms)).length >= 20);
});
