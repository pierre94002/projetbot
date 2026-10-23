/**
 * LA MÉMOIRE DE L'IA À L'ÉCRAN SE REND (étape 44 du plan, 23/10/2026) : le bloc « Mémoire de l'IA » de la page d'une équipe
 * (AiDossierCard.vue), réutilisable par la page « Bulletin » de l'étape 45.
 *   node --test test/aiMemoireEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : test/aides/script-memoire-ia.mjs (phase « ecran ») plante des analyses et leurs
 * leçons dans une copie isolée de la base d'essai, appelle la route avant puis après la nuit des dossiers. Le rendu est
 * fait côté serveur, sans navigateur (test/aides/rendu.mjs) : `fetch` remplacé — seule la route du bloc répond, tout le
 * reste est refusé et compté.
 *
 * Règles de ui/DESIGN.md vérifiées : la vraie provenance et l'heure ; le bloc et ses tableaux affichés même vides (Σ et ⌀
 * compris) ; le logo sur chaque ligne qui nomme un club ; français simple ; jetons seulement ; jamais le vert ; aucune écriture.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, corps, pied, entetes, tableauDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const U = await imp(path.join(UI, 'src', 'utils', 'dossiersIA.js'));

function reponsesDuServeur() {
  const copie = preparerCopie({});
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-memoire-ia.mjs'), { args: ['ecran'], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');
const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const ROUTE = /\/api\/match-ai-analysis\/dossiers\?club=/;
const logo = (id) => `teamlogo/${String(id).replace('fotmob-', '')}.png`;
const TABLEAUX = ['forme', 'absents', 'lecons', 'retirees', 'lecons-championnat'];
let S;
let R;
let rendu;

before(async () => {
  S = reponsesDuServeur();
  R = S.reponses;
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /AiDossierCard\.vue$/ });
});
after(async () => {
  await rendu?.fermer();
});

// ================================================ 1. les règles (pures), recomptées à la main

test('règles : pures ; les états du bloc ; la provenance réelle ; la forme (Σ points, buts, ⌀ par match), les leçons et les absents avec leur pied ; le jour de Paris', () => {
  assert.deepEqual([...reglesPures('dossiersIA.js')], ['dossiersIA.js']);
  assert.equal(U.etatDuDossier({ clubId: null }).cle, 'sans-club');
  assert.equal(U.etatDuDossier({ clubId: 'fotmob-1', erreur: "Le serveur n'est pas à jour : relancez" }).cle, 'pas-a-jour-serveur');
  assert.equal(U.etatDuDossier({ clubId: 'fotmob-1', erreur: 'boum' }).cle, 'erreur');
  assert.equal(U.etatDuDossier({ clubId: 'fotmob-1', chargement: true }).cle, 'chargement');
  assert.equal(U.etatDuDossier({ clubId: 'fotmob-1', reponse: R.jamais }).cle, 'jamais');
  assert.equal(U.etatDuDossier({ clubId: 'fotmob-1', reponse: R.autreVersion }).cle, 'autre-version');
  assert.equal(U.etatDuDossier({ clubId: 'fotmob-1', reponse: R.sansDossier }).cle, 'sans-dossier');
  assert.equal(U.etatDuDossier({ clubId: 'fotmob-1', reponse: R.pret }).cle, 'pret');
  const p = U.provenanceDuDossier(R.pret);
  assert.deepEqual([p.source, p.releveLe, p.action, p.fichier], ['Écrit par le code · magasin FotMob et carnet de l’IA', R.pret.dossier.majLe, 'mis à jour', 'data/runtime/ai-dossiers.json']);
  assert.match(p.detail, /Refait chaque nuit, seulement quand l’équipe a joué\.$/);
  const b = R.pret.dossier.forme.bilan;
  const f = U.lignesDeForme(R.pret.dossier);
  assert.equal(f.lignes.length, R.pret.dossier.forme.derniers.length);
  assert.equal(f.pied.sigma, `${b.matchs} matchs · ${b.v} V, ${b.n} N, ${b.d} D · buts ${b.bp}-${b.bc} · ${b.points} points`);
  const v = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
  assert.equal(f.pied.moyenne, `${v(b.points / b.matchs)} point par match · ${v(b.bp / b.matchs)} but marqué et ${v(b.bc / b.matchs)} encaissé par match`);
  assert.deepEqual(U.lignesDeForme(null).pied, { sigma: '0 match relevé', moyenne: '—' });
  const l = U.lignesDesLecons(R.pret.dossier.lecons, R.pret.phrases.preuves);
  assert.equal(l.lignes.length, 1);
  assert.equal(l.pied.sigma, '1 confirmée · 0 en attente du carnet · 0 retirée');
  assert.equal(l.pied.moyenne, '4 matchs suivants comptés par leçon confirmée');
  assert.equal(l.lignes[0].preuve, 'sur 4 matchs suivants, le moteur annonçait 80 % en moyenne ; c’est passé 0 fois sur 4');
  assert.equal(l.lignes[0].confirmeeLe, '05/10/2026');
  assert.deepEqual(U.lignesDesAbsents(null).pied, { sigma: '0 absent · 0 blessé · 0 autre', moyenne: '—' });
  assert.equal(U.jourDit('2026-10-22T23:30:00.000Z'), '23/10/2026');
  assert.equal(U.jourDit(null), 'jour inconnu');
});

// ================================================ 2. le bloc rendu

test('mémoire de l’IA rendue — prêt : le club (logo), la provenance et l’heure, les faits du moment, la forme (logos, Σ et ⌀), les absents, la leçon CONFIRMÉE avec sa date, son match d’origine (deux logos) et ce que le carnet a vu, les retirées (aucune), le championnat, ce que l’IA en lit, la règle', options, async () => {
  const club = S.plantes.C;
  const Carte = (await rendu.charger('/src/components/analysis/AiDossierCard.vue')).default;
  const r = await rendu.rendre(Carte, { clubId: club, clubName: 'LDU', league: 'Serie A - Ecuador' }, [[ROUTE, { code: 200, corps: R.pret }]]);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.deepEqual(r.appels, [`GET http://localhost:4000/api/match-ai-analysis/dossiers?club=${club}`]);
  trouve(r.html, /data-etat="pret"/);
  const t = espaces(r.texte);
  assert.ok(t.startsWith('Écrit par le code chaque nuit · lu par l’IA seule Mémoire de l’IA'), t.slice(0, 120));
  const ligneDuClub = r.html.split('class="aid__club')[1]?.split('</p>')[0] ?? '';
  assert.ok(ligneDuClub.includes(logo(club)), 'le logo du club, sur sa ligne');
  assert.ok(t.includes('Écrit par le code · magasin FotMob et carnet de l’IA mis à jour le 05/10 à 14:00'), 'la vraie provenance et l’heure');
  assert.ok(t.includes(`Matchs pris en compte jusqu’au ${U.jourDit(R.pret.dossier.jusquAu)}`));
  assert.ok(t.includes(espaces(R.pret.phrases.classement)), 'le classement');
  assert.ok(t.includes(espaces(R.pret.phrases.forme)), 'la forme en une phrase');
  assert.ok(t.includes('Entraîneur : inconnu des compositions relevées.'), 'l’entraîneur absent est dit');
  const forme = tableauDe(r.html, 'forme');
  assert.deepEqual(entetes(forme), ['Jour', 'Adversaire', 'Compétition', 'Lieu', 'Score', 'Issue']);
  const lignes = corps(forme);
  assert.equal(lignes.length, R.pret.dossier.forme.derniers.length);
  R.pret.dossier.forme.derniers.forEach((m, i) => assert.ok(lignes[i].includes(logo(m.adversaireId)), `le logo de l’adversaire, ligne ${i}`));
  assert.equal(pied(forme).length, 2);
  const lecons = tableauDe(r.html, 'lecons');
  assert.deepEqual(entetes(lecons), ['Jour', 'Match d’origine', 'Marché et pronostic', 'Leçon', 'Ce que le carnet a vu', 'Confirmée le']);
  const [ligne] = corps(lecons);
  const l = R.pret.dossier.lecons.confirmees[0];
  assert.ok(ligne.includes(logo(l.match.homeId)) && ligne.includes(logo(l.match.awayId)), 'les deux logos du match d’origine');
  const lt = espaces(ligne.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  for (const morceau of [U.jourDit(l.date), l.match.home, l.match.away, 'Total corners', l.texte, 'le moteur s’y est trompé', R.pret.phrases.preuves[l.id], '05/10/2026']) assert.ok(lt.includes(espaces(morceau)), `${morceau} : ${lt}`);
  const [sigma, moyenne] = pied(lecons).map((x) => espaces(x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
  assert.equal(sigma, 'Σ Total 1 confirmée · 0 en attente du carnet · 0 retirée');
  assert.equal(moyenne, '⌀ Moyenne 4 matchs suivants comptés par leçon confirmée');
  const retirees = tableauDe(r.html, 'retirees');
  assert.equal(corps(retirees).length, 1);
  assert.ok(corps(retirees)[0].includes('aucune leçon retirée'));
  assert.equal(pied(retirees).length, 2);
  for (const tete of R.pret.championnat.tete) assert.ok(r.html.includes(logo(tete.id)), `le logo de ${tete.nom} en tête`);
  assert.ok(t.includes(`1 ${R.pret.championnat.tete[0].nom} ${R.pret.championnat.tete[0].points} pts`), 'la tête du championnat, nommée avec ses logos');
  assert.ok(t.includes('Ce que l’IA lit de ce dossier'));
  trouve(r.html, /<pre class="aid__pre"[^>]*>[\s\S]*Leçon : \[/);
  assert.ok(t.includes(`${R.pret.texteIA.mots} mots, environ ${R.pret.texteIA.tokens} tokens`));
  assert.ok(t.includes('Écrit par le code, jamais par l’IA'));
  assert.ok(t.includes('elle ne fournit jamais un chiffre au moteur, et le moteur ne lit pas les dossiers. Votre note manuscrite d’un match n’y entre pas.'));
});

test('mémoire de l’IA rendue — une leçon DÉMENTIE est dans « Leçons retirées » (avec pourquoi), jamais dans les confirmées', options, async () => {
  const Carte = (await rendu.charger('/src/components/analysis/AiDossierCard.vue')).default;
  const r = await rendu.rendre(Carte, { clubId: S.plantes.D, clubName: 'D', league: null }, [[ROUTE, { code: 200, corps: R.dementie }]]);
  const lecons = tableauDe(r.html, 'lecons');
  assert.ok(corps(lecons)[0].includes('aucune leçon confirmée pour l’instant'));
  const retirees = tableauDe(r.html, 'retirees');
  assert.equal(corps(retirees).length, 1);
  const lt = espaces(corps(retirees)[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  assert.ok(lt.includes('démentie par les matchs suivants'), lt);
  assert.ok(lt.includes('05/10/2026'));
  assert.ok(!espaces(r.texte).includes('Leçon D : le total de corners'), 'son texte ne s’affiche pas comme une leçon');
  assert.match(espaces(pied(retirees)[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')), /Σ Total 1 retirée · 1 démentie par le carnet/);
});

test('mémoire de l’IA rendue — jamais calculé, autre forme, club sans dossier, fichier illisible, serveur pas à jour, sans identifiant : la raison est dite et les cinq tableaux gardent leur structure (Σ et ⌀)', options, async () => {
  const Carte = (await rendu.charger('/src/components/analysis/AiDossierCard.vue')).default;
  const props = { clubId: S.plantes.C, clubName: 'LDU', league: null };
  const cas = [
    ['jamais', { code: 200, corps: R.jamais }, /Pas encore calculé Les dossiers de l’IA n’ont pas encore été écrits/],
    ['autre-version', { code: 200, corps: R.autreVersion }, /Dossier d’une autre forme/],
    ['sans-dossier', { code: 200, corps: R.sansDossier }, /Pas de dossier pour ce club/],
    ['erreur', { code: R.codeIllisible, corps: R.illisible }, /Dossier illisible Les dossiers de l’IA sont illisibles pour l’instant/],
    ['pas-a-jour-serveur', { code: 404, corps: { error: 'Route introuvable : GET /api/match-ai-analysis/dossiers' } }, /Serveur à relancer Le serveur n'est pas à jour/]
  ];
  for (const [cle, reponse, motif] of cas) {
    const r = await rendu.rendre(Carte, props, [[ROUTE, reponse]]);
    trouve(r.html, new RegExp(`data-etat="${cle}"`), cle);
    assert.match(espaces(r.texte), motif, cle);
    for (const nom of TABLEAUX) {
      const tab = tableauDe(r.html, nom);
      assert.ok(tab, `${cle} : le tableau ${nom} reste`);
      assert.equal(pied(tab).length, 2, `${cle} : Σ et ⌀ de ${nom}`);
      assert.ok(corps(tab).length >= 1, `${cle} : ${nom} dit qu’il est vide`);
    }
    assert.ok(espaces(r.texte).includes('Écrit par le code · magasin FotMob et carnet de l’IA'), `${cle} : la provenance reste`);
  }
  const sans = await rendu.rendre(Carte, { clubId: null, clubName: '', league: null }, []);
  assert.deepEqual(sans.appels, [], 'sans identifiant, aucune lecture');
  trouve(sans.html, /data-etat="sans-club"/);
  for (const nom of TABLEAUX) assert.equal(pied(tableauDe(sans.html, nom)).length, 2);
  assert.deepEqual(rendu.interdits, []);
});

// ================================================ 3. le câblage et l'hygiène

test('câblage : le bloc sur la page de l’équipe, juste sous le style de jeu, avant les derniers matchs ; nulle part ailleurs ; une lecture GET par identifiant', () => {
  const equipe = lireUi('views', 'TeamView.vue');
  assert.equal((equipe.match(/<AiDossierCard /g) ?? []).length, 1);
  assert.match(equipe, /<AiDossierCard :club-id="idClub \?\? null" :club-name="nom" :league="ligue" \/>/);
  assert.ok(equipe.indexOf('<TeamStyleCard') < equipe.indexOf('<AiDossierCard') && equipe.indexOf('<AiDossierCard') < equipe.indexOf('<div class="team__grid">'));
  const toutes = fs.readdirSync(path.join(UI, 'src'), { recursive: true }).filter((f) => /\.(vue|js)$/.test(f)).map((f) => String(f).split(path.sep).join('/'));
  const emplois = toutes.filter((f) => lireUi(...f.split('/')).includes('AiDossierCard') && !f.endsWith('AiDossierCard.vue'));
  assert.deepEqual(emplois, ['utils/dossiersIA.js', 'views/TeamView.vue']);
  const api = lireUi('services', 'matchAiAnalysisApi.js');
  assert.match(api, /dossierEquipe: \(clubId\) => httpClient\.get\(`\/match-ai-analysis\/dossiers\?club=\$\{encodeURIComponent\(clubId\)\}`\),/);
});

test('hygiène : jetons seulement, pas de !important, polices ≥ 10 px, icônes connues, aucune écriture ni appel payant, relecture quand le club change, réponse tardive ignorée ; jamais le vert ni le rouge', () => {
  const jetons = lireUi('assets', 'styles', 'tokens.css');
  const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
  const vue = lireUi('components', 'analysis', 'AiDossierCard.vue');
  const style = vue.split('<style scoped>')[1];
  assert.ok(style);
  assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(style, /rgba?\(/);
  assert.doesNotMatch(vue, /!important/);
  for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `police de ${m[1]} px`);
  for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `jeton inconnu ${m[1]}`);
  for (const m of vue.matchAll(/<AppIcon :?name="(\w+)"|\bicon="(\w+)"/g)) assert.ok(connues.has(m[1] ?? m[2]), `l’icône ${m[1] ?? m[2]} n’existe pas`);
  assert.doesNotMatch(vue, /\.(post|put|patch|delete)\(/);
  assert.doesNotMatch(vue, /lineups-by-name|API-Football|apiFootball|anthropic/i);
  assert.doesNotMatch(vue, /--cm-accent|--cm-danger\b(?!-)|is-success|is-value/, 'ni vert ni rouge');
  assert.match(vue, /watch\(\s*\(\) => props\.clubId,/);
  assert.match(vue, /if \(props\.clubId === club\) etat\.value = \{ loading: false, error: null, data \};/);
});
