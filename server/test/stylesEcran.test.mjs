/**
 * Les STYLES DE JEU À L'ÉCRAN SE RENDENT (étape 37 du plan, 22/10/2026) : le bloc « Style de jeu » de la page d'une
 * équipe (TeamStyleCard.vue) et le bloc « Duel de styles » de la page d'un match (StyleDuelCard.vue).
 *   node --test test/stylesEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : test/aides/script-styles-de-jeu.mjs (phase « ecran ») plante une carte des
 * tirs et des entraîneurs dans une copie isolée de la base d'essai, appelle les routes avant puis après le calcul de
 * nuit. Le rendu est fait côté serveur, sans navigateur (test/aides/rendu.mjs) : `fetch` remplacé — seule la route du
 * bloc répond, tout le reste est refusé et compté.
 *
 * Règles de ui/DESIGN.md vérifiées : la vraie provenance et l'heure ; le bloc et ses tableaux affichés même vides
 * (Σ et ⌀ compris) ; les logos sur chaque ligne qui nomme un club ; français simple, virgule décimale ; « Explication
 * seulement » tant que le banc n'a rien prouvé ; jamais le vert hors d'un effet prouvé ; jetons seulement.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, corps, pied, entetes, tableauDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const U = await imp(path.join(UI, 'src', 'utils', 'stylesDeJeu.js'));
const S = await imp(path.join(SERVEUR, 'src', 'data', 'db', 'teamStyle.js'));

function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-styles-de-jeu.mjs'), { args: ['ecran'], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json.reponses;
  } finally {
    copie.nettoyer();
  }
}

const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');
const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const ROUTE_STYLE = /\/api\/match-stats\/team-style\?club=/;
const ROUTE_DUEL = /\/api\/match-stats\/style-duel\?/;
let R;
let rendu;

before(async () => {
  R = reponsesDuServeur();
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /(TeamStyleCard|StyleDuelCard)\.vue$/ });
});
after(async () => {
  await rendu?.fermer();
});

// ================================================ 1. les règles (pures), recomptées à la main

test('règles : pures ; les cinq étiquettes = celles du serveur ; les huit chiffres lisent les colonnes du serveur ; virgule décimale ; l’écart en mots, jamais en écarts-types', () => {
  assert.deepEqual([...reglesPures('stylesDeJeu.js')].sort(), ['leagueDisplay.js', 'stylesDeJeu.js']);
  assert.deepEqual(U.STYLES.map((s) => s.id), S.STYLES_ET_EQUILIBRE);
  for (const s of U.STYLES) assert.equal(s.libelle, S.libelleDuStyle(s.id));
  for (const c of U.CHIFFRES) {
    assert.ok(S.COLONNES_STYLE.includes(c.cle), c.cle);
    assert.ok(S.COLONNES_STYLE.includes(c.ligue), c.ligue);
    if (c.z) assert.ok(S.COLONNES_STYLE.includes(c.z), c.z);
  }
  assert.equal(U.valeurDite('pourcentage', 61.4), '61 %');
  assert.equal(U.valeurDite('part', 0.0737), '7,4 %');
  assert.equal(U.valeurDite('decimal', 4.25), fr(4.25, 1));
  assert.equal(U.valeurDite('nombre', 53.13), '53');
  assert.equal(U.valeurDite('part', null), null);
  assert.deepEqual([1.6, 0.8, 0.2, -0.8, -1.6, null].map((z) => U.ecartDit(z).texte), ['très au-dessus', 'au-dessus', 'dans la moyenne', 'en dessous', 'très en dessous', '—']);
  assert.equal(U.moisDit('2026-09-01'), 'septembre 2026');
  assert.equal(U.duChampionnat('Bundesliga - Germany'), 'du championnat (Bundesliga)');
});

test('règles sur la réponse du serveur : le tableau des chiffres, Σ et ⌀ ; la phrase qui justifie ; les prudences ; l’historique (Σ mois, ⌀ matchs) ; l’entraîneur', () => {
  const corpsDuClub = R.pret.equipeDuel.corps;
  const s = corpsDuClub.style;
  assert.equal(s.style, 'direct');
  const lignes = U.lignesDesChiffres(s);
  assert.equal(lignes.length, 8);
  const longs = lignes.find((l) => l.id === 'longs');
  assert.deepEqual([longs.club, longs.ligue, longs.justifie], [`${fr(100 * s.longs, 1)} %`, `${fr(100 * s.l_longs, 1)} %`, true]);
  const mesures = lignes.filter((l) => !l.vide).length;
  assert.deepEqual(U.piedDesChiffres(s, lignes), { sigma: `${mesures} sur 8 mesurés · ${s.n} matchs lus, dont ${s.n_carte} avec la carte des tirs`, moyenne: `moyennes par match sur ses ${s.n} derniers matchs de championnat` });
  assert.equal(U.pourquoiCeStyle(s), `Il joue long : part des longs ballons ${fr(100 * s.longs, 1)} % (moyenne du championnat (EPL) : ${fr(100 * s.l_longs, 1)} %), possession ${fr(s.poss)} % (moyenne du championnat (EPL) : ${fr(s.l_poss)} %).`);
  // Début de saison : 5 matchs depuis la trêve sur 16 lus.
  assert.deepEqual(U.prudences(s, corpsDuClub.reglages).map((p) => p.cle), ['debut-saison']);
  const h = U.historiqueDit(corpsDuClub.historique);
  assert.equal(h.lignes.length, corpsDuClub.historique.length);
  const changements = corpsDuClub.historique.filter((x, i, a) => i > 0 && x.style !== a[i - 1].style).length;
  const nDirect = corpsDuClub.historique.filter((x) => x.style === 'direct').length;
  assert.equal(h.sigma, `${corpsDuClub.historique.length} mois · jeu direct ${nDirect} fois · ${changements} changement${changements > 1 ? 's' : ''}`);
  assert.equal(h.moyenne, `${fr(corpsDuClub.historique.reduce((a, x) => a + x.n, 0) / corpsDuClub.historique.length, 1)} matchs lus par mois`);
  const e = U.entraineurDit(corpsDuClub);
  assert.equal(e.nom, corpsDuClub.entraineur.nom);
  assert.equal(e.libelle, 'jeu direct');
  assert.match(e.texte, new RegExp(`^${corpsDuClub.entraineur.nom}, aux commandes depuis le \\d{2}/\\d{2}/2026 \\(\\d+ matchs de championnat relevés avec ce club\\)\\. Son style sur ses \\d+ derniers matchs de championnat : jeu direct\\.$`));
  // L'homonyme : dit en mots.
  const homonyme = U.entraineurDit(R.pret.equipe.corps);
  assert.equal(homonyme.homonyme, true);
  assert.match(homonyme.note, /Un autre entraîneur porte le même nom/);
  // Le club sans carte des tirs : contre-attaque et coups de pied arrêtés « non mesuré », jamais 0.
  const sansCarte = U.lignesDesChiffres(R.pret.sansCarte.corps.style);
  assert.equal(sansCarte.find((l) => l.id === 'contre').club, 'non mesuré (carte des tirs absente)');
  assert.ok(U.prudences(R.pret.sansCarte.corps.style).some((p) => p.cle === 'sans-carte'));
});

test('règles du duel : « Explication seulement » tant que le banc n’a rien prouvé (avec ce qu’il a mesuré, en mots) ; « Effet mesuré » et l’effet en points avec une case retenue ; les états', () => {
  const d = U.duelDit(R.pret.duel.corps);
  assert.equal(d.mention, 'Explication seulement');
  assert.equal(d.mesure, false);
  assert.equal(d.titre, `${U.libelleDe(R.pret.duel.corps.duel.dom)} contre ${U.libelleDe(R.pret.duel.corps.duel.ext)}`);
  assert.equal(d.bancTexte, `Au banc d’essai (${fr(12105)} matchs de 2025-2026 jugés face à la cote de clôture, 53 essais comptés, seuil sévère), aucun duel de styles ne surprend le marché : 29 duels jugés « pas prouvé », 21 trop rares pour être jugés.`);
  const m = U.duelDit(R.pret.mesure.corps);
  assert.equal(m.mention, 'Effet mesuré');
  assert.equal(m.effetTexte, `Effet mesuré : +${fr(3.1, 1)} points de chance de victoire du club qui reçoit par rapport à la cote, sur 412 matchs vérifiés.`);
  assert.equal(U.scenarioDuDuel('possession', 'contre'), 'L’une aura le ballon, l’autre attendra de le récupérer pour partir en contre : les pertes de balle compteront.');
  assert.equal(U.scenarioDuDuel('equilibre', 'equilibre'), 'Aucune des deux équipes n’a de style marqué : pas de duel particulier à lire.');
  assert.equal(U.etatDuDuel({ reponse: R.avant.duel.corps }).cle, 'jamais');
  assert.equal(U.etatDuDuel({ erreur: 'Club inconnu du magasin : « X ».' }).cle, 'club-inconnu');
  assert.equal(U.etatDuBloc({ clubId: null }).cle, 'sans-club');
  assert.equal(U.etatDuBloc({ clubId: 'fotmob-1', reponse: R.avant.equipe.corps }).cle, 'jamais');
  assert.equal(U.etatDuBloc({ clubId: 'fotmob-1', reponse: R.pret.equipe.corps }).cle, 'pret');
  assert.equal(U.etatDuBloc({ clubId: 'fotmob-1', erreur: "Le serveur n'est pas à jour : relancez" }).cle, 'pas-a-jour-serveur');
});

// ================================================ 2. les blocs rendus

test('style de jeu rendu — prêt : le club (logo), l’étiquette, la phrase avec ses chiffres, la provenance et l’heure, le tableau des huit chiffres avec Σ et ⌀, l’entraîneur (logo de son club), le style mois par mois, « explication seulement »', options, async () => {
  const c = R.pret.equipeDuel.corps;
  const club = R.cibles.deux[0];
  const Carte = (await rendu.charger('/src/components/matches/TeamStyleCard.vue')).default;
  const r = await rendu.rendre(Carte, { clubId: club, clubName: R.cibles.noms[0], league: 'EPL' }, [[ROUTE_STYLE, R.pret.equipeDuel]]);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.deepEqual(r.appels, [`GET http://localhost:4000/api/match-stats/team-style?club=${club}`]);
  trouve(r.html, /data-etat="pret"/);
  const t = espaces(r.texte);
  assert.ok(t.startsWith('Calculé chaque nuit · explication seulement Style de jeu'), t.slice(0, 120));
  // Le logo du club sur la ligne qui le nomme, lu par son identifiant (jamais par son nom : aucune autre lecture).
  const ligneDuClub = r.html.split('class="tst__club')[1]?.split('</p>')[0] ?? '';
  assert.ok(ligneDuClub.includes(`https://images.fotmob.com/image_resources/logo/teamlogo/${club.replace('fotmob-', '')}.png`), 'le logo du club, sur sa ligne');
  trouve(r.html, /data-style-id="direct"[^>]*>jeu direct</);
  assert.ok(t.includes(U.pourquoiCeStyle(c.style)), 'la phrase qui justifie, avec les chiffres du club et du championnat');
  assert.ok(t.includes('FotMob (magasin) · styles de jeu calculé le 05/10 à 14:00'), 'la vraie provenance et l’heure');
  assert.ok(t.includes(`Matchs pris en compte jusqu’au ${U.jourDit(c.etat.jusqua)}`));
  const tab = tableauDe(r.html, 'chiffres-du-style');
  assert.deepEqual(entetes(tab), ['Chiffre', 'Le club', 'Son championnat', 'Écart']);
  const lignes = corps(tab).map((x) => espaces(U.jourDit ? x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : x));
  assert.equal(lignes.length, 8);
  for (const [i, l] of U.lignesDesChiffres(c.style).entries()) assert.ok(espaces(lignes[i]).includes(`${l.libelle} ${l.club} ${l.ligue} ${l.ecart.texte}`), `${l.id} : ${lignes[i]}`);
  const [sigma, moyenne] = pied(tab).map((x) => espaces(x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
  assert.ok(sigma.startsWith('Σ Total ') && sigma.includes('sur 8 mesurés'), sigma);
  assert.ok(moyenne.startsWith('⌀ Moyenne moyennes par match'), moyenne);
  assert.ok(t.includes(`${c.entraineur.nom} jeu direct`), 'l’entraîneur et son style');
  assert.ok(r.html.split('data-bloc="entraineur"')[1].includes('teamlogo/'), 'le logo du club de l’entraîneur');
  const histo = tableauDe(r.html, 'style-par-mois');
  assert.deepEqual(entetes(histo), ['Mois', 'Style', 'Matchs lus']);
  assert.equal(corps(histo).length, c.historique.length);
  assert.equal(pied(histo).length, 2);
  assert.ok(t.includes('Explication seulement : le style n’entre dans aucun chiffre du moteur.'));
  assert.ok(t.includes('Début de saison : 5 matchs joués depuis la trêve'), 'la prudence du début de saison');
});

test('style de jeu rendu — jamais calculé, serveur en erreur, serveur pas à jour, club inconnu (sans style), sans identifiant : la raison est dite et les tableaux gardent leur structure (huit lignes, Σ et ⌀)', options, async () => {
  const Carte = (await rendu.charger('/src/components/matches/TeamStyleCard.vue')).default;
  const props = { clubId: 'fotmob-9879', clubName: 'Fulham', league: 'EPL' };
  const cas = [
    ['jamais', R.avant.equipe, /Pas encore calculé Les styles de jeu n’ont pas encore été calculés/, 'pas encore calculé', 'heure du calcul inconnue'],
    ['erreur', { code: 500, corps: { error: 'Erreur interne du serveur.' } }, /Style de jeu illisible Erreur interne du serveur\. Le tableau ci-dessous reste affiché, sans valeurs\./, 'pas encore calculé', 'heure du calcul inconnue'],
    ['pas-a-jour-serveur', { code: 404, corps: { error: 'Route introuvable : GET /api/match-stats/team-style' } }, /Serveur à relancer Le serveur n'est pas à jour/, 'pas encore calculé', 'heure du calcul inconnue'],
    ['sans-style', R.pret.inconnu, /Pas de style pour ce club Il faut au moins 6 matchs de championnat/, 'pas assez de matchs', 'calculé le 05/10 à 14:00']
  ];
  for (const [cle, reponse, motif, mot, heure] of cas) {
    const r = await rendu.rendre(Carte, props, [[ROUTE_STYLE, reponse]]);
    const t = espaces(r.texte);
    trouve(r.html, new RegExp(`data-etat="${cle}"`), cle);
    assert.match(t, motif, cle);
    const tab = tableauDe(r.html, 'chiffres-du-style');
    assert.equal(corps(tab).length, 8, `${cle} : les huit lignes restent`);
    assert.ok(corps(tab).every((x) => x.includes(mot)), `${cle} : chaque ligne dit « ${mot} »`);
    assert.equal(pied(tab).length, 2, `${cle} : Σ et ⌀ restent`);
    assert.equal(pied(tableauDe(r.html, 'style-par-mois')).length, 2);
    assert.ok(t.includes(`FotMob (magasin) · styles de jeu ${heure}`), `${cle} : la provenance dit son heure, ou qu’elle n’en a pas`);
  }
  const sans = await rendu.rendre(Carte, { clubId: null, clubName: '', league: null }, []);
  assert.deepEqual(sans.appels, [], 'sans identifiant, aucune lecture');
  trouve(sans.html, /data-etat="sans-club"/);
  assert.equal(corps(tableauDe(sans.html, 'chiffres-du-style')).length, 8);
  assert.deepEqual(rendu.interdits, []);
});

test('duel de styles rendu — prêt : « Explication seulement », les deux clubs (logos, styles), le scénario, ce que le banc a mesuré, la provenance ; une case RETENUE : « Effet mesuré » et l’effet ; jamais calculé et club inconnu : dit, les deux camps restent', options, async () => {
  const Carte = (await rendu.charger('/src/components/matches/StyleDuelCard.vue')).default;
  const [h, a] = R.cibles.deux;
  const props = { homeName: R.cibles.noms[0], awayName: R.cibles.noms[1], league: 'EPL', homeId: h, awayId: a };
  const r = await rendu.rendre(Carte, props, [[ROUTE_DUEL, R.pret.duel]]);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(r.appels, [`GET http://localhost:4000/api/match-stats/style-duel?home=${h}&away=${a}`]);
  const t = espaces(r.texte);
  trouve(r.html, /data-etat="pret"/);
  assert.ok(t.startsWith('Styles de jeu Duel de styles'));
  trouve(r.html, /data-duel="mention"[^>]*>[\s\S]*?Explication seulement/);
  for (const id of [h, a]) assert.ok(r.html.includes(`teamlogo/${id.replace('fotmob-', '')}.png`), `logo ${id}`);
  assert.ok(t.includes(`${R.cibles.noms[0]} à domicile`) && t.includes(`${R.cibles.noms[1]} à l’extérieur`));
  const d = U.duelDit(R.pret.duel.corps);
  assert.ok(t.includes(d.titre) && t.includes(d.scenario));
  assert.ok(t.includes(espaces(d.bancTexte)), 'ce que le banc a mesuré');
  assert.ok(t.includes(`possession ${fr(R.pret.duel.corps.home.poss)} %`), 'possession, virgule décimale');
  assert.ok(t.includes('FotMob (magasin) · styles de jeu'));
  assert.ok(!/is-mesure/.test(r.html), 'pas de vert sans preuve');
  const m = await rendu.rendre(Carte, props, [[ROUTE_DUEL, R.pret.mesure]]);
  trouve(m.html, /class="(?=[^"]*sdc__mention)(?=[^"]*is-mesure)[^"]*"/, 'la mention en vert : un effet prouvé');
  assert.ok(espaces(m.texte).includes(espaces(U.duelDit(R.pret.mesure.corps).effetTexte)));
  // Sans identifiants : la page envoie les noms et le championnat (l'annuaire du serveur les reconnaît).
  const parNoms = await rendu.rendre(Carte, { ...props, homeId: null, awayId: null }, [[ROUTE_DUEL, R.pret.duel]]);
  assert.deepEqual(parNoms.appels, [`GET http://localhost:4000/api/match-stats/style-duel?homeName=${encodeURIComponent(R.cibles.noms[0]).replace(/%20/g, '+')}&awayName=${encodeURIComponent(R.cibles.noms[1]).replace(/%20/g, '+')}&league=EPL`]);
  for (const [cle, rep, motif] of [
    ['jamais', R.avant.duel, /Pas encore calculé/],
    ['club-inconnu', { code: 404, corps: { error: 'Club inconnu du magasin : « Inconnu » (EPL).' } }, /Club inconnu du magasin/]
  ]) {
    const x = await rendu.rendre(Carte, props, [[ROUTE_DUEL, rep]]);
    trouve(x.html, new RegExp(`data-etat="${cle}"`), cle);
    assert.match(espaces(x.texte), motif);
    assert.equal((x.html.match(/data-camp="/g) ?? []).length, 2, `${cle} : les deux camps restent`);
    assert.match(espaces(x.texte), /Explication seulement/);
  }
  assert.deepEqual(rendu.interdits, []);
});

// ================================================ 3. le câblage et l'hygiène

test('câblage : le style dans la page de l’équipe (sous l’indice de force), le duel dans la page du match (avant les meilleures statistiques), nulle part ailleurs ; les lectures sont des GET', () => {
  const equipe = lireUi('views', 'TeamView.vue');
  assert.equal((equipe.match(/<TeamStyleCard /g) ?? []).length, 1);
  assert.match(equipe, /<TeamStyleCard :club-id="idClub \?\? null" :club-name="nom" :league="ligue" \/>/);
  assert.ok(equipe.indexOf('<TeamStrengthCard') < equipe.indexOf('<TeamStyleCard') && equipe.indexOf('<TeamStyleCard') < equipe.indexOf('<div class="team__grid">'));
  const match = lireUi('views', 'UpcomingMatchView.vue');
  assert.equal((match.match(/<StyleDuelCard /g) ?? []).length, 1);
  assert.ok(match.indexOf('<StyleDuelCard') < match.indexOf('title="Meilleures statistiques"'));
  assert.match(match, /:home-id="idsDesClubs\.home" :away-id="idsDesClubs\.away"/);
  assert.match(match, /\/\^fotmob-\\d\+\$\/\.test\(/, 'seuls les identifiants FotMob passent');
  const toutes = fs.readdirSync(path.join(UI, 'src'), { recursive: true }).filter((f) => /\.(vue|js)$/.test(f)).map((f) => String(f).split(path.sep).join('/'));
  const emplois = (nom) => toutes.filter((f) => lireUi(...f.split('/')).includes(nom) && !f.endsWith(`${nom}.vue`));
  // (les règles pures les nomment dans leur en-tête)
  assert.deepEqual(emplois('TeamStyleCard'), ['utils/stylesDeJeu.js', 'views/TeamView.vue']);
  assert.deepEqual(emplois('StyleDuelCard'), ['utils/stylesDeJeu.js', 'views/UpcomingMatchView.vue']);
  const api = lireUi('services', 'matchStatsApi.js');
  assert.match(api, /teamStyle: \(club\) => httpClient\.get\(`\/match-stats\/team-style\?club=\$\{encodeURIComponent\(club\)\}`\),/);
  assert.match(api, /return httpClient\.get\(`\/match-stats\/style-duel\?\$\{params\.toString\(\)\}`\);/);
});

test('hygiène : jetons seulement, pas de !important, polices ≥ 10 px, icônes connues, aucune écriture ni appel payant, le bloc relit quand le club change et ignore une réponse arrivée trop tard ; le vert seulement pour un effet prouvé', () => {
  const jetons = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  for (const nom of ['TeamStyleCard.vue', 'StyleDuelCard.vue']) {
    const vue = lireUi('components', 'matches', nom);
    const style = vue.split('<style scoped>')[1];
    assert.ok(style, nom);
    assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, `${nom} : aucune couleur en dur`);
    assert.doesNotMatch(style, /rgba?\(/, `${nom} : aucune transparence en dur`);
    assert.doesNotMatch(vue, /!important/, nom);
    for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `${nom} : police de ${m[1]} px`);
    for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `${nom} : jeton inconnu ${m[1]}`);
    for (const m of vue.matchAll(/<AppIcon :?name="(\w+)"|\bicon="(\w+)"/g)) assert.ok(connues.has(m[1] ?? m[2]), `${nom} : l’icône ${m[1] ?? m[2]} n’existe pas`);
    for (const m of lireUi('utils', 'stylesDeJeu.js').matchAll(/icone: '(\w+)'/g)) assert.ok(connues.has(m[1]), `l’icône ${m[1]} n’existe pas`);
    assert.doesNotMatch(vue, /\.(post|put|patch|delete)\(/, `${nom} : aucune écriture`);
    assert.doesNotMatch(vue, /lineups-by-name|API-Football|apiFootball|anthropic|claude/i, `${nom} : aucun appel payant`);
  }
  const equipe = lireUi('components', 'matches', 'TeamStyleCard.vue');
  assert.match(equipe, /watch\(\s*\(\) => props\.clubId,/);
  assert.match(equipe, /if \(props\.clubId === club\) etat\.value = \{ loading: false, error: null, data \};/);
  assert.match(equipe, /if \(!club\) \{\s*etat\.value = \{ loading: false, error: null, data: null \};\s*return;\s*\}/);
  assert.doesNotMatch(equipe, /--cm-accent|--cm-danger\b(?!-)/, 'ni vert ni rouge sur un style');
  const duel = lireUi('components', 'matches', 'StyleDuelCard.vue');
  assert.match(duel, /watch\(cle,/);
  assert.match(duel, /if \(cle\(\) === demande\) etat\.value = \{ loading: false, error: null, data \};/);
  assert.equal((duel.match(/--cm-accent/g) ?? []).length, 2, 'le vert : la mention « Effet mesuré » seulement');
  assert.match(duel, /\.sdc__mention\.is-mesure \{\s*color: var\(--cm-accent\);\s*border-color: var\(--cm-accent\);\s*\}/);
});

test('aucun fichier du moteur n’est touché par l’étape : les nouveaux fichiers n’en font pas partie, aucun fichier du moteur ne les nomme ; le moteur compte toujours 37 fichiers', async () => {
  const V = await imp(path.join(SERVEUR, 'src', 'core', 'engine', 'engineVersions.js'));
  const moteur = new Set(V.fichiersDuMoteur());
  for (const f of ['data/db/teamStyle.js', 'data/db/teamStyleBanc.js', 'data/db/teamStyleEnfant.js', 'api/controllers/matchStats.controller.js', 'jobs/matchStatsAutoRefresh.js', 'data/providers/fotMobProvider.js', 'bench/lancements.js', 'data/db/matchStatsDb.js']) {
    assert.ok(!moteur.has(f), `${f} n’est pas un fichier du moteur`);
  }
  for (const f of moteur) assert.doesNotMatch(fs.readFileSync(path.join(SERVEUR, 'src', f), 'utf8'), /teamStyle|TeamStyleCard|StyleDuelCard|team_style|coach_style/, f);
  assert.equal(moteur.size, 37);
});
