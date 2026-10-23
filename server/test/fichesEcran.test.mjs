/**
 * Les FICHES À L'ÉCRAN SE RENDENT (étape 31 du plan, 22/10/2026) : le bloc « Indice de force » de la page d'une équipe
 * (étape 29), la « Note par poste » de la fiche d'un joueur (étape 30) et le tableau « Ce qui prédit, ce qui trompe » de
 * l'onglet Statistiques ligue (étape 18).
 *   node --test test/fichesEcran.test.mjs        (depuis server/)
 *
 * Les réponses sont celles du VRAI serveur : test/aides/script-fiches-ecran.mjs calcule, dans une copie isolée de la
 * base d'essai (table du jour J construite, indice de force dans un processus à part, fiches des joueurs, valeur des
 * statistiques sur les périodes de la base d'essai), puis appelle les routes (application Express, sans réseau) :
 * phase « vide » = avant tout calcul, phase « pret » = après. Le rendu est fait côté serveur, sans navigateur
 * (test/aides/rendu.mjs) : `fetch` remplacé — seule la route du bloc répond, tout le reste est refusé et compté.
 *
 *  1. Les règles de l'indice de force, de la fiche et du tableau (ui/src/utils/*.js), recomptées à la main sur les
 *     réponses du serveur : places, points forts et faibles, Σ et ⌀ (jamais une somme de pourcentages), courbes.
 *  2. Les trois blocs rendus dans CHACUN de leurs états — prêt, jamais calculé, serveur en erreur, serveur pas à jour,
 *     sans club ou sans fiche — avec leur provenance, leur heure et tous leurs tableaux, même vides.
 *  3. Le câblage (une seule place par information) et l'hygiène : jetons, aucune écriture, aucune note de joueur sur le
 *     terrain des compositions, aucun fichier du moteur touché.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { UI, imp, interfacePrete, optionsDuRendu, ouvrirLeRendu, reglesPures, espaces, blocDe, corps, pied, entetes, tableauDe, texteDe } from './aides/rendu.mjs';

const options = optionsDuRendu;
const I = await imp(path.join(UI, 'src', 'utils', 'indiceDeForce.js'));
const J = await imp(path.join(UI, 'src', 'utils', 'ficheJoueur.js'));
const P = await imp(path.join(UI, 'src', 'utils', 'predicteurs.js'));
const TS = await imp(path.join(SERVEUR, 'src', 'data', 'db', 'teamStrength.js'));
const PR = await imp(path.join(SERVEUR, 'src', 'data', 'db', 'playerRatings.js'));
const SV = await imp(path.join(SERVEUR, 'src', 'bench', 'statValue.js'));

/** Les réponses du vrai serveur, produites une fois par phase dans une copie isolée. */
function reponsesDuServeur(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-fiches-ecran.mjs'), { args: [phase], timeout: 300_000 });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}

const fr = (x, d = 0) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const lireUi = (...chemin) => fs.readFileSync(path.join(UI, 'src', ...chemin), 'utf8');
let pret;
let vide;
let rendu;

before(async () => {
  pret = reponsesDuServeur('pret');
  vide = reponsesDuServeur('vide');
  if (!interfacePrete) return;
  rendu = await ouvrirLeRendu({ cibles: /(TeamStrengthCard|PlayerRatingCard|PredictorsTable)\.vue$/ });
});

after(async () => {
  await rendu?.fermer();
});

const ROUTE_EQUIPE = /\/api\/match-stats\/team-strength\?club=/;
const ROUTE_JOUEUR = /\/api\/match-stats\/player-ratings\?player=/;
const ROUTE_VALEUR = /\/api\/bench\/stat-value$/;
const idClub = () => `fotmob-${pret.cibles.club}`;
/** Un motif dans du HTML : le message d'échec ne recopie jamais la page entière. */
const trouve = (html, motif, message) => assert.ok(motif.test(html), message ?? `motif absent : ${motif}`);
const absent = (html, motif, message) => assert.ok(!motif.test(html), message ?? `motif présent : ${motif}`);
/** Les tuiles de la fiche (data-tuile) : { id, poste ('oui' : ce qui compte à son poste), classe, texte }. */
const tuilesDe = (html) =>
  [...html.matchAll(/<div ([^>]*\bdata-tuile="(\w+)"[^>]*)>([\s\S]*?)<\/div>/g)].map((m) => ({
    id: m[2],
    poste: /data-poste="(oui|non)"/.exec(m[1])?.[1] ?? null,
    classe: /class="([^"]*)"/.exec(m[1])?.[1] ?? '',
    texte: espaces(texteDe(m[3]))
  }));

// ================================================ 1. les règles de l'indice de force

test('indice de force : les treize statistiques, les trois lieux et les seuils sont ceux du serveur ; les mots d’une place, d’une note et d’un rang', () => {
  assert.deepEqual(
    I.STATISTIQUES.map((s) => [s.id, s.libelle, s.cote]),
    TS.STATISTIQUES_INDICE.map((s) => [s.id, s.libelle, s.cote])
  );
  assert.deepEqual(I.LIEUX.map((l) => l.cle), [...TS.LIEUX]);
  assert.deepEqual(I.SEUILS, { pointFort: TS.SEUILS_INDICE.pointFort, pointFaible: TS.SEUILS_INDICE.pointFaible });
  assert.equal(I.rangDit(1, 20), '1er sur 20');
  assert.equal(I.rangDit(3, 18), '3e sur 18');
  assert.equal(I.rangDit(null, 18), 'place inconnue');
  assert.equal(espaces(I.noteDite(0.93)), '+0,93 but');
  assert.equal(I.noteDite(-0.045), '−0,04 but', 'le vrai signe moins');
  assert.equal(I.noteDite(2.4), '+2,40 buts', 'deux buts et plus : le pluriel');
  assert.equal(I.noteDite(0), '+0,00 but');
  assert.equal(I.noteDite(null), 'pas calculée');
  assert.equal(espaces(I.valeurDite('possession', 61.98)), '62,0 %');
  assert.equal(espaces(I.valeurDite('xg_p', 1.2)), '1,20');
  assert.equal(I.valeurDite('xg_p', null), null);
  assert.deepEqual([100, 75, 74, 50, 26, 25, 0].map(I.tonDeLaPlace), ['is-fort', 'is-fort', '', '', '', 'is-faible', 'is-faible']);
  assert.equal(I.tonDeLaPlace(null), '');
  assert.equal(I.phraseDeLaPlace('Tirs', 'pour', 8), 'Tirs : devant 8 % des clubs de son championnat.');
  assert.equal(I.phraseDeLaPlace('Tirs concédés', 'contre', 68), 'Tirs concédés : il en concède moins que 68 % des clubs de son championnat.');
  assert.equal(I.jourDit('2026-09-21'), '21/09/2026');
  assert.equal(I.jourDit(null), 'jour inconnu');
  assert.match(I.formuleDite({ sansXg: true }), /Sans xG : FotMob n’en publie pas/);
  assert.match(I.formuleDite({ sansXg: false, formule: 'xg' }), /Avec les xG/);
});

test('indice de force : le tableau, Σ et ⌀ du pied sont recomptés à la main sur la réponse du serveur — jamais une somme de pourcentages', () => {
  const lecture = pret.equipe.corps.lecture;
  const lignes = I.lignesDuTableau(lecture, 'pret');
  assert.equal(lignes.length, 13, 'toujours les treize statistiques');
  assert.deepEqual(lignes.map((l) => l.id), TS.STATISTIQUES_INDICE.map((s) => s.id));
  for (const lieu of ['tous', 'dom', 'ext']) {
    const ligne = lecture.lignes[lieu];
    for (const l of lignes) {
      const c = ligne.composantes[l.id];
      const case_ = l.cases[lieu];
      assert.equal(case_.valeur, c.valeur, `${l.id} ${lieu}`);
      assert.equal(case_.percentile, c.percentile, `${l.id} ${lieu}`);
      assert.equal(case_.valeurTexte, I.valeurDite(l.id, c.valeur));
    }
  }
  const p = I.piedDuTableau(lignes);
  for (const lieu of ['tous', 'dom', 'ext']) {
    const places = Object.values(lecture.lignes[lieu].composantes).map((c) => c.percentile);
    const forts = places.filter((x) => x >= 75).length;
    const faibles = places.filter((x) => x <= 25).length;
    assert.deepEqual(p.sigma[lieu], { n: 13, forts, faibles, milieu: 13 - forts - faibles }, `Σ ${lieu}`);
    assert.ok(Math.abs(p.moyenne[lieu] - places.reduce((t, x) => t + x, 0) / places.length) < 1e-9, `⌀ ${lieu}`);
    assert.ok(p.moyenne[lieu] >= 0 && p.moyenne[lieu] <= 100, 'une moyenne de places reste entre 0 et 100 : jamais une somme');
  }
  assert.equal(I.sigmaDit(p.sigma.tous), `13 sur 13 · ${p.sigma.tous.forts} fort${p.sigma.tous.forts > 1 ? 's' : ''} · ${p.sigma.tous.faibles} faible${p.sigma.tous.faibles > 1 ? 's' : ''}`);
  assert.equal(I.moyenneDite(null), 'aucune place à moyenner');
  // Sans lecture : les treize lignes, trois cases chacune, chaque case dit pourquoi elle est vide.
  const sans = I.lignesDuTableau(null, 'jamais');
  assert.equal(sans.length, 13);
  assert.ok(sans.every((l) => ['tous', 'dom', 'ext'].every((lieu) => l.cases[lieu].vide && l.cases[lieu].valeurTexte === 'pas encore calculé')));
  const manque = I.lignesDuTableau({ lignes: { tous: lecture.lignes.tous, dom: null, ext: null } }, 'pret');
  assert.ok(manque.every((l) => l.cases.dom.valeurTexte === 'pas assez de matchs' && !l.cases.tous.vide));
  // Une composante absente (FotMob ne publie pas les xG) : « non relevé », jamais un zéro.
  const sansXg = JSON.parse(JSON.stringify(lecture));
  sansXg.lignes.tous.composantes.xg_p.valeur = null;
  assert.equal(I.lignesDuTableau(sansXg, 'pret')[0].cases.tous.valeurTexte, 'non relevé');
  const piedSansXg = I.piedDuTableau(I.lignesDuTableau(sansXg, 'pret'));
  assert.equal(piedSansXg.sigma.tous.n, 12, 'une statistique non relevée n’est pas comptée');
});

test('indice de force : points forts et faibles = ceux du serveur ; les chiffres clés ; la forme (courbe, repères, phrase)', () => {
  const lecture = pret.equipe.corps.lecture;
  const tous = lecture.lignes.tous;
  const pts = I.pointsDeLaLigne(tous);
  assert.deepEqual(pts.forts.map((p) => [p.id, p.percentile]), tous.pointsForts.map((p) => [p.id, p.percentile]));
  assert.deepEqual(pts.faibles.map((p) => [p.id, p.percentile]), tous.pointsFaibles.map((p) => [p.id, p.percentile]));
  assert.ok(pts.forts.every((p) => p.percentile >= 75) && pts.faibles.every((p) => p.percentile <= 25));
  const cles = I.chiffresCles(lecture);
  assert.equal(cles.note.valeur, I.noteDite(tous.force));
  assert.equal(cles.place.valeur, I.rangDit(tous.rang, tous.equipes));
  // Le championnat se dit comme la fiche du joueur le dit (« des milieux du championnat (EPL) ») : « des clubs du championnat (MLS) », jamais « des clubs de MLS ».
  assert.equal(cles.place.detail, `devant ${fr(tous.percentileForce)} % des clubs du championnat (${tous.championnat})`);
  assert.equal(tous.championnat, 'MLS', 'dans l’essai, le club est de MLS : son nom affiché est son code');
  assert.doesNotMatch(cles.place.detail, /des clubs de MLS/);
  // Le nom que l'appli donne au championnat (celui du badge de la compétition) : le pays du libellé brut « Bundesliga - Germany » n'est pas répété.
  assert.equal(I.duChampionnat('EPL'), 'du championnat (EPL)');
  assert.equal(I.duChampionnat('Bundesliga - Germany'), 'du championnat (Bundesliga)');
  assert.equal(I.duChampionnat('Primeira Liga - Portugal'), 'du championnat (Primeira Liga)');
  assert.equal(I.duChampionnat(null), 'de son championnat', 'sans championnat connu, aucune parenthèse vide');
  const allemand = JSON.parse(JSON.stringify(lecture));
  allemand.lignes.tous.championnat = 'Bundesliga - Germany';
  assert.equal(I.chiffresCles(allemand).place.detail, `devant ${fr(tous.percentileForce)} % des clubs du championnat (Bundesliga)`);
  allemand.lignes.tous.percentileForce = null;
  assert.equal(I.chiffresCles(allemand).place.detail, 'clubs du championnat (Bundesliga)', 'sans place en pourcentage : le championnat seul, par son nom');
  assert.equal(cles.terrain.dom, `${I.noteDite(lecture.lignes.dom.force)} · ${I.rangDit(lecture.lignes.dom.rang, lecture.lignes.dom.equipes)}`);
  assert.equal(cles.memoire.valeur, `${fr(tous.matchs)} matchs`);
  assert.match(cles.memoire.detail, new RegExp(`dont ${tous.matchsXg} avec xG`));
  // Sans lecture : « pas encore calculé », jamais un faux zéro.
  const rien = I.chiffresCles(null);
  assert.deepEqual([rien.note.valeur, rien.place.valeur, rien.terrain.dom, rien.memoire.valeur], ['pas encore calculée', 'pas encore calculée', 'pas encore calculé', 'non lu']);
  // La forme : la courbe va de la plus ancienne à la plus récente, la plus haute note est en haut du dessin.
  const h = lecture.historique;
  const fin = h.filter((x) => Number.isFinite(x.force));
  assert.ok(fin.length >= 10, `${fin.length} jours de match avec une note dans la base d’essai`);
  assert.ok(h.length >= fin.length, 'un jour sans note (trop peu de matchs) ne se dessine pas');
  const c = I.courbeDeForme(h, { largeur: 600, hauteur: 110, derniers: 30 });
  assert.equal(c.vide, false);
  assert.equal(c.points.length, Math.min(30, fin.length));
  assert.deepEqual(c.points.map((p) => p.jour), fin.slice(-30).map((x) => x.jour));
  assert.ok(c.points.every((p, i) => i === 0 || p.x > c.points[i - 1].x), 'de gauche à droite');
  assert.ok(c.points.every((p) => p.y >= 0 && p.y <= 110), 'dans le cadre');
  const haut = c.points.reduce((a, b) => (b.force > a.force ? b : a));
  assert.equal(Math.min(...c.points.map((p) => p.y)), haut.y, 'plus haut dans le dessin = plus forte note');
  assert.match(c.chemin, /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+){14,}$/);
  assert.equal(I.courbeDeForme([h[0]]).vide, true, 'un seul jour : pas de courbe');
  assert.equal(I.courbeDeForme([]).vide, true);
  assert.equal(I.noteSignee(-0.22), '−0,22');
  assert.equal(I.noteSignee(0.3), '+0,30');
  const r = I.reperesDeForme(h);
  assert.equal(r.maintenant.note, I.noteSignee(fin.at(-1).force));
  const cinq = r.reperes.find((x) => x.n === 5);
  assert.equal(cinq.note, I.noteSignee(fin.at(-6).force), 'il y a 5 matchs = la 6e ligne en partant de la fin');
  assert.ok(Math.abs(cinq.ecartNombre - (fin.at(-1).force - fin.at(-6).force)) < 1e-12);
  assert.equal(r.reperes.find((x) => x.n === 20).note, fin.length > 20 ? I.noteSignee(fin.at(-21).force) : 'pas assez d’historique');
  assert.match(I.formeDite(h), /^Sa note est (en hausse|en baisse|stable) sur ses dix derniers matchs : /);
  assert.match(I.formeDite([]), /Pas encore de forme/);
  // Le banc d’essai : pas encore mesuré, ou le verdict en mots.
  assert.match(I.bancDit(null).texte, /^pas encore mesuré/);
  const banc = I.bancDit({ jugements: [{ id: 'v1-xg', periode: 'P3', preuve: true, matchs: 4210, gainPourcent: 0.42, fourchettePourcent: [-0.1, 0.9], verdict: 'pas-prouve' }] });
  assert.equal(banc.mesure, true);
  assert.equal(espaces(banc.texte), 'face au classement corrigé par les xG : +0,4 % [−0,1 ; +0,9] d’erreur de prévision sur 4 210 matchs, pas prouvé.');
});

test('indice de force : l’état du bloc — chargement, club inconnu, jamais calculé, pas d’indice pour ce club, serveur en erreur ou pas à jour, prêt', () => {
  const e = (x) => I.etatDuBloc({ clubId: 'fotmob-6001', ...x });
  assert.equal(I.etatDuBloc({ clubId: null }).cle, 'sans-club');
  assert.equal(e({ chargement: true }).cle, 'chargement');
  assert.equal(e({ reponse: vide.equipe.corps }).cle, 'jamais');
  assert.match(e({ reponse: vide.equipe.corps }).texte, /Pas encore calculé|n’a pas encore été calculé/);
  assert.equal(e({ reponse: pret.equipeInconnue.corps }).cle, 'sans-ligne');
  assert.equal(e({ reponse: pret.equipe.corps }).cle, 'pret');
  assert.equal(e({ reponse: pret.equipe.corps }).aRefaire, false);
  assert.equal(e({ reponse: { ...pret.equipe.corps, etat: 'pas-a-jour' } }).aRefaire, true);
  const panne = e({ erreur: 'Erreur interne du serveur.' });
  assert.deepEqual([panne.cle, panne.ton], ['erreur', 'is-danger']);
  assert.match(panne.texte, /Les tableaux ci-dessous restent affichés, sans valeurs\.$/);
  const ancien = e({ erreur: 'Le serveur n\'est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' });
  assert.deepEqual([ancien.cle, ancien.ton], ['pas-a-jour-serveur', 'is-warning']);
  const prov = I.provenanceDuBloc(pret.equipe.corps);
  assert.equal(prov.source, 'FotMob (magasin) · indice de force');
  assert.equal(prov.releveLe, pret.equipe.corps.calculeLe);
  assert.equal(prov.fichier, pret.equipe.corps.base);
  assert.match(prov.detail, /jusqu’au 21\/09\/2026/);
});

// ================================================ 1 bis. les règles de la fiche du joueur

test('fiche du joueur : les composantes sont celles du serveur ; les entiers de la route redeviennent des nombres ; les postes', () => {
  assert.deepEqual(J.COMPOSANTES.map((c) => c.id), PR.COMPOSANTES.map((c) => c.id));
  assert.deepEqual(Object.keys(J.POSTES).map(Number), [1, 2, 3, 4]);
  assert.deepEqual(PR.LIGNES, ['gardien', 'defense', 'milieu', 'attaque']);
  assert.equal(J.posteDit(1), 'Gardien');
  assert.equal(J.posteDit(4), 'Attaquant');
  assert.equal(J.posteDit(9), 'poste inconnu');
  const fiche = pret.joueurEtabli.corps.lecture.fiche;
  const t = J.composantesDuPoste(fiche);
  const par = Object.fromEntries(t.map((c) => [c.id, c]));
  for (const def of J.COMPOSANTES) {
    if (fiche[def.champ] === null || fiche[def.champ] === undefined) assert.equal(par[def.id], undefined, `${def.id} : absente, pas de tuile vide`);
    else {
      assert.equal(par[def.id].valeur, fiche[def.champ] / 1000, def.id);
      assert.equal(par[def.id].valeurTexte, fr(fiche[def.champ] / 1000, def.chiffres), def.id);
    }
  }
  // Ce qui compte au poste d’abord (un milieu : xA, passes clés, récupérations, xG hors penalty, note).
  assert.equal(fiche.poste, 3, 'le joueur essayé est un milieu');
  assert.deepEqual(t.filter((c) => c.cle).map((c) => c.id), ['xa', 'pc', 'recup', 'xgnp', 'note']);
  assert.ok(t.findIndex((c) => !c.cle) > t.findLastIndex((c) => c.cle), 'les composantes du poste passent en tête');
  const poids = J.composantesDuPoste(fiche).find((c) => c.id === 'xa').memoire;
  assert.match(poids, /^mémoire : \d+(,\d)? match(s)? de 90 min$/);
  const gk = pret.gardien.corps.lecture.fiche;
  assert.equal(gk.poste, 1);
  const tg = J.composantesDuPoste(gk);
  assert.deepEqual(tg.map((c) => c.id).sort(), tg.map((c) => c.id).filter((id) => J.PERTINENTES_DU_GARDIEN.includes(id)).sort(), 'un gardien : pas de zéros de joueur de champ');
  assert.equal(tg[0].id, 'buts_evites', 'les buts évités d’abord');
  assert.equal(J.composantesVides().length, J.COMPOSANTES.length);
  assert.ok(J.composantesVides('pas encore calculée').every((c) => c.valeurTexte === 'pas encore calculée' && c.valeur === null));
});

test('fiche du joueur : les apports, leur place, l’identité ; un gardien n’a pas d’apport offensif ; peu joué = pas de place', () => {
  const fiche = pret.joueurEtabli.corps.lecture.fiche;
  const a = J.apportsDuJoueur(fiche);
  assert.equal(a.offensif.valeur, fiche.apport_off / 1000);
  assert.equal(a.defensif.valeur, fiche.apport_def / 1000);
  assert.equal(a.offensif.valeurTexte, `${a.offensif.valeur < 0 ? '−' : '+'}${fr(Math.abs(a.offensif.valeur), 2)} but`);
  assert.equal(a.offensif.place, `devant ${fiche.pct_off} % des milieux du championnat (${fiche.league})`);
  assert.equal(a.defensif.place, `devant ${fiche.pct_def} % des milieux du championnat (${fiche.league})`);
  assert.equal(J.placeDite(null, 3, 'EPL'), null);
  // Le championnat par le nom que l'appli lui donne : « (Bundesliga) » pour « Bundesliga - Germany », comme l'indice de force.
  assert.equal(J.placeDite(99, 3, 'EPL'), 'devant 99 % des milieux du championnat (EPL)');
  assert.equal(J.placeDite(99, 3, 'Bundesliga - Germany'), 'devant 99 % des milieux du championnat (Bundesliga)');
  assert.equal(J.placeDite(40, 1, 'La Liga - Spain'), 'devant 40 % des gardiens du championnat (La Liga)');
  assert.equal(J.placeDite(40, 4, null), 'devant 40 % des attaquants du championnat', 'sans championnat connu, aucune parenthèse vide');
  assert.deepEqual([99, 75, 50, 25, 3, null].map(J.tonDeLaPlace), ['is-fort', 'is-fort', '', 'is-faible', 'is-faible', '']);
  const gk = J.apportsDuJoueur(pret.gardien.corps.lecture.fiche);
  assert.deepEqual([gk.offensif.valeurTexte, gk.offensif.place, gk.offensif.percentile], ['sans objet', null, null]);
  assert.match(gk.defensif.place, /^devant \d+ % des gardiens du championnat/);
  const id = J.identiteDeLaFiche(fiche);
  assert.deepEqual([id.poste, id.etablie, id.minutes, id.apparitions], ['Milieu', true, fr(fiche.minutes), fr(fiche.apparitions)]);
  assert.equal(id.formule, 'avec les xG');
  assert.equal(id.dernierMatch, `${fiche.dernier_match.slice(8, 10)}/${fiche.dernier_match.slice(5, 7)}/${fiche.dernier_match.slice(0, 4)}`);
  assert.equal(id.facteur, fiche.facteur / 1000);
  const peu = pret.joueurPeuJoue.corps.lecture.fiche;
  assert.equal(peu.etablie, 0);
  assert.deepEqual([peu.pct_off, peu.pct_def], [null, null], 'pas de place sous 270 minutes');
  assert.equal(J.apportsDuJoueur(peu).offensif.place, null);
  assert.equal(J.identiteDeLaFiche(peu).etablie, false);
  assert.equal(J.identiteDeLaFiche(null), null);
});

test('fiche du joueur : la courbe de forme (vingt dernières apparitions), le tableau, Σ et ⌀ — recomptés à la main', () => {
  const fiche = pret.joueurEtabli.corps.lecture.fiche;
  const c = fiche.courbe;
  assert.ok(Array.isArray(c) && c.length >= 2 && c.length <= 20);
  const courbe = J.courbeDeForme(c, { largeur: 600, hauteur: 120 });
  assert.equal(courbe.vide, false);
  assert.equal(courbe.points.length, c.length);
  assert.deepEqual(courbe.points.map((p) => p.jour), c.map((p) => p[0]), 'de la plus ancienne à la plus récente');
  assert.equal(courbe.points[0].off, c[0][1] / 1000);
  assert.ok(courbe.zeroY >= 0 && courbe.zeroY <= 120, 'la ligne du zéro (la moyenne du poste) est dans le cadre');
  assert.ok(courbe.min <= 0 && courbe.max >= 0, 'l’échelle contient toujours zéro');
  assert.match(courbe.offensif, /^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+$/);
  const gk = J.courbeDeForme(pret.gardien.corps.lecture.fiche.courbe, { gardien: true });
  assert.equal(gk.offensif, '', 'un gardien : le seul apport défensif');
  assert.notEqual(gk.defensif, '');
  assert.equal(J.courbeDeForme([['2026-09-01', 0, 0]]).vide, true);
  assert.equal(J.apportSigne(-0.072), '−0,07');
  assert.equal(J.apportSigne(0), '+0,00');
  const adversaire = { date: c.at(-1)[0], home: true, awayId: 'fotmob-8455', homeId: 'fotmob-6001', opponent: 'Adversaire Essai', league: 'MLS', matchKey: 'm1' };
  const lignes = J.lignesDeLaCourbe(c, { matchs: [adversaire] });
  assert.equal(lignes.length, c.length);
  assert.equal(lignes[0].jour, c.at(-1)[0], 'la plus récente d’abord');
  assert.deepEqual(lignes[0].adversaire, { nom: 'Adversaire Essai', id: 'fotmob-8455', championnat: 'MLS', domicile: true, cle: 'm1' });
  assert.equal(lignes[1].adversaire, null, 'un match inconnu de la page : la date seule');
  const p = J.piedDeLaCourbe(lignes);
  const offs = c.map((x) => x[1] / 1000);
  const defs = c.map((x) => x[2] / 1000);
  assert.equal(p.n, c.length);
  assert.equal(p.sigma.texte, `${c.length} apparition${c.length > 1 ? 's' : ''}`);
  assert.equal(p.sigma.offensif, `de ${J.apportSigne(Math.min(...offs))} à ${J.apportSigne(Math.max(...offs))}`);
  assert.equal(p.moyenne.offensif, J.apportSigne(offs.reduce((t, x) => t + x, 0) / offs.length));
  assert.equal(p.moyenne.defensif, J.apportSigne(defs.reduce((t, x) => t + x, 0) / defs.length));
  const pg = J.piedDeLaCourbe(J.lignesDeLaCourbe(pret.gardien.corps.lecture.fiche.courbe, { gardien: true }), { gardien: true });
  assert.deepEqual([pg.sigma.offensif, pg.moyenne.offensif], ['sans objet', 'sans objet']);
  assert.deepEqual(J.piedDeLaCourbe([]).sigma, { texte: '0 apparition', offensif: 'aucune apparition', defensif: 'aucune apparition' });
  assert.match(J.formeDite(c), /^Son dernier apport offensif \(.+\) est (dans sa moyenne|au-dessus de sa moyenne|en dessous de sa moyenne) des \d+ dernières apparitions/);
  assert.match(J.formeDite([]), /Pas assez d’apparitions/);
});

test('fiche du joueur : l’état du bloc — chargement, jamais calculé, sans fiche (404), serveur en erreur ou pas à jour, établie ou peu jouée', () => {
  assert.equal(J.etatDeLaFiche({ chargement: true }).cle, 'chargement');
  assert.equal(J.etatDeLaFiche({ reponse: vide.joueur.corps }).cle, 'jamais');
  assert.equal(J.etatDeLaFiche({ erreur: pret.joueurInconnu.corps.error }).cle, 'sans-fiche', 'un joueur sans fiche n’est pas une panne');
  assert.equal(J.etatDeLaFiche({ erreur: 'Erreur interne du serveur.' }).cle, 'erreur');
  assert.equal(J.etatDeLaFiche({ erreur: 'Le serveur n\'est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' }).cle, 'pas-a-jour-serveur');
  const ok = J.etatDeLaFiche({ reponse: pret.joueurEtabli.corps });
  assert.deepEqual([ok.cle, ok.peuJoue, ok.aRefaire], ['pret', false, false]);
  assert.equal(J.etatDeLaFiche({ reponse: pret.joueurPeuJoue.corps }).peuJoue, true);
  assert.equal(J.etatDeLaFiche({ reponse: { ...pret.joueurEtabli.corps, etat: 'pas-a-jour' } }).aRefaire, true);
  const prov = J.provenanceDeLaFiche(pret.joueurEtabli.corps);
  assert.deepEqual([prov.source, prov.releveLe, prov.fichier], ['FotMob (magasin) · fiches des joueurs', pret.joueurEtabli.corps.calculeLe, pret.joueurEtabli.corps.base]);
});

// ================================================ 1 ter. les règles du tableau « ce qui prédit / ce qui trompe »

test('ce qui prédit : le catalogue (équipes, joueurs, fenêtres du moteur) est celui du serveur ; les quatre tableaux et leurs sources', () => {
  assert.deepEqual(
    P.CATALOGUE_EQUIPE.map((c) => [c.id, c.libelle, [...c.sources]]),
    SV.STATISTIQUES_EQUIPE.map((s) => [s.id, s.libelle, [...s.sources]])
  );
  assert.deepEqual(P.CATALOGUE_JOUEUR.map((c) => [c.id, c.libelle]), SV.STATISTIQUES_JOUEUR.map((s) => [s.id, s.libelle]));
  assert.deepEqual(P.CATALOGUE_MOTEUR.map((c) => c.id), ['moteur_corners', 'moteur_tirs', 'moteur_cadres']);
  assert.deepEqual(P.SECTIONS.map((s) => s.cle), ['equipes-fotmob', 'equipes-fd', 'joueurs-fotmob', 'fenetre-moteur']);
  assert.deepEqual(Object.keys(P.VERDICTS), ['compte', 'faible', 'trompe', 'pas-assez']);
  const attendus = pret.valeur.corps.regles.verdicts;
  for (const cle of Object.keys(P.VERDICTS)) assert.ok(attendus[cle], `le serveur connaît le verdict ${cle}`);
  assert.deepEqual(Object.keys(P.VERDICTS_FENETRE), Object.keys(pret.valeur.corps.regles.fenetre));
  // Les tons : vert pour ce qui compte, rouge pour ce qui trompe (demande de Pierre), ambre pour trop peu de matchs.
  assert.deepEqual(Object.values(P.VERDICTS).map((v) => v.ton), ['is-accent', '', 'is-danger', 'is-warning']);
});

test('ce qui prédit : chaque case est lue sur la ligne du serveur ; la ligne manquante dit « pas mesuré » ; Σ et ⌀ recomptés', () => {
  const lignes = pret.valeur.corps.lignes;
  const section = P.SECTIONS[0];
  const rangees = P.lignesDeLaSection(section, lignes);
  assert.equal(rangees.length, P.CATALOGUE_EQUIPE.filter((c) => c.sources.includes('magasin')).length, 'toutes les statistiques du catalogue, mesurées ou non');
  const brut = (id) => lignes.find((l) => l.echelle === 'equipe' && l.source === 'magasin' && l.statistique === id);
  for (const r of rangees) {
    const l = brut(r.id);
    assert.equal(r.mesuree, Boolean(l), r.id);
    if (!l) continue;
    assert.equal(r.verdict.cle, l.verdict, `${r.id} : le verdict du serveur`);
    assert.equal(r.fiabilite.valeur, l.fiabilite.fiabilite10);
    assert.equal(r.fiabilite.texte, `${fr(l.fiabilite.fiabilite10 * 100, 0).replace(/^-/, '−')} %`);
    assert.equal(r.demiVie.valeur, l.demiVie?.sansFin ? null : l.demiVie?.valeur ?? null);
    if (l.comparaisons?.pouvoir) assert.equal(r.pouvoir.valeur, l.comparaisons.pouvoir.gainRelatif);
  }
  // Le verdict « compte » ou « faible » demande une fourchette au-dessus de zéro ; « trompe » : pas prouvé.
  for (const r of rangees.filter((x) => x.mesuree && x.verdict.cle === 'compte')) assert.ok(brut(r.id).comparaisons.pouvoir.fourchetteRelative[0] >= 0.01, `${r.id} compte : borne basse ≥ 1 %`);
  for (const r of rangees.filter((x) => x.mesuree && x.verdict.cle === 'trompe')) assert.ok(!(brut(r.id).comparaisons.pouvoir?.fourchetteRelative?.[0] > 0), `${r.id} trompe : rien de prouvé`);
  const pied = P.piedDeLaSection(rangees);
  const mesurees = rangees.filter((r) => r.mesuree);
  assert.deepEqual(pied.n, {
    total: rangees.length,
    mesurees: mesurees.length,
    compte: mesurees.filter((r) => r.ligne.verdict === 'compte').length,
    faible: mesurees.filter((r) => r.ligne.verdict === 'faible').length,
    trompe: mesurees.filter((r) => r.ligne.verdict === 'trompe').length,
    pasAssez: mesurees.filter((r) => r.ligne.verdict === 'pas-assez').length
  });
  assert.equal(pied.n.compte + pied.n.faible + pied.n.trompe + pied.n.pasAssez, pied.n.mesurees, 'tout verdict est compté une fois');
  const fiabs = mesurees.map((r) => r.ligne.fiabilite.fiabilite10).filter(Number.isFinite);
  assert.ok(Math.abs(pied.moyenne.fiabilite - fiabs.reduce((t, x) => t + x, 0) / fiabs.length) < 1e-12, '⌀ fiabilité = moyenne, jamais une somme de pourcentages');
  assert.ok(pied.moyenne.fiabilite <= 1);
  // La section football-data n’est pas dans le calcul d’essai : ses lignes restent, « pas mesuré ».
  const fd = P.lignesDeLaSection(P.SECTIONS[1], lignes);
  assert.equal(fd.length, P.CATALOGUE_EQUIPE.filter((c) => c.sources.includes('football-data')).length);
  assert.ok(fd.every((r) => !r.mesuree));
  assert.equal(P.piedDeLaSection(fd).texte.verdicts, 'aucune statistique mesurée');
  const moteur = P.lignesDeLaSection(P.SECTIONS[3], lignes);
  assert.equal(moteur.length, 6, 'trois marchés × deux sources');
  const pm = P.piedDuMoteur(moteur);
  assert.equal(pm.n.mesurees, moteur.filter((r) => r.mesuree).length);
  assert.equal(pm.n.confirmees + pm.n.proposees + pm.n.pasAssez, pm.n.mesurees);
  // Les mots : la fenêtre confirmée ou proposée, le pouvoir, la stabilisation.
  assert.equal(P.fenetreDite({ fenetre: { verdict: 'proposee', conseillee: 50, actuelle: 10, indicatif: true } }).texte, '50 matchs');
  assert.equal(P.fenetreDite({ fenetre: { verdict: 'proposee', conseillee: 50, actuelle: 10, indicatif: true } }).detail, 'au lieu de 10 · indicatif');
  assert.equal(P.fenetreDite({ fenetre: { verdict: 'confirmee', conseillee: 10, actuelle: 10 } }).detail, 'confirmée');
  assert.equal(P.stabilisationDite({ fiabilite: { stabilisationSansFin: true } }).texte, 'jamais');
  assert.equal(P.demiVieDite({ demiVie: { sansFin: true } }).texte, 'tous les matchs comptent autant');
  assert.equal(P.pouvoirDit({}).texte, 'trop peu de matchs');
  assert.equal(P.pouvoirDit({ comparaisons: { pouvoir: { gainRelatif: -0.012, fourchetteRelative: [-0.03, 0.005], n: { matchs: 800 } } }, libelleCible: 'les buts' }).texte, '1,2 % d’erreur en plus');
  assert.equal(P.verdictDe(null).texte, 'pas mesuré');
});

test('ce qui prédit : l’état du bloc et la phrase de chaque tableau, lue dans les périodes RÉELLES du calcul', () => {
  const e = (x) => P.etatDuBloc(x);
  assert.equal(e({ chargement: true }).cle, 'chargement');
  assert.equal(e({ reponse: vide.valeur.corps }).cle, 'jamais');
  assert.equal(e({ reponse: pret.valeur.corps }).cle, 'pret');
  assert.equal(e({ reponse: { ...pret.valeur.corps, enCours: { id: 2 } } }).enCours, true);
  assert.equal(e({ erreur: 'Erreur interne du serveur.' }).cle, 'erreur');
  assert.equal(e({ erreur: 'Le serveur n\'est pas à jour : relancez demarrer-cotemaster.bat pour activer cette fonction.' }).cle, 'pas-a-jour-serveur');
  const lignes = pret.valeur.corps.lignes;
  assert.equal(P.phraseDeLaSection(P.SECTIONS[0], lignes), 'Calculé du 01/02/2026 au 31/07/2026, jugé sur les matchs depuis le 01/08/2026 : des matchs qui n’ont pas servi au calcul.');
  assert.match(P.phraseDeLaSection(P.SECTIONS[2], lignes), /Tout est ramené à 90 minutes/);
  assert.match(P.phraseDeLaSection(P.SECTIONS[1], lignes), /^La statistique est calculée sur une période/, 'football-data n’est pas dans ce calcul : la phrase générale');
  const cles = P.chiffresCles(pret.valeur.corps);
  const tout = lignes.filter((l) => l.verdict);
  assert.equal(cles.mesurees.valeur, fr(tout.length));
  assert.equal(cles.comptent.valeur, fr(tout.filter((l) => l.verdict === 'compte').length));
  assert.equal(cles.trompent.valeur, fr(tout.filter((l) => l.verdict === 'trompe').length));
  assert.equal(P.chiffresCles(vide.valeur.corps).mesurees.valeur, 'non lu');
  const prov = P.provenanceDuBloc(pret.valeur.corps);
  assert.equal(prov.releveLe, pret.valeur.corps.dernier.finiLe);
  assert.equal(prov.source, 'FotMob (magasin) · football-data.co.uk');
  assert.equal(P.provenanceDuBloc(vide.valeur.corps).releveLe, null);
});

// ================================================ 2. les trois blocs rendus

test('indice de force rendu — prêt : le club (logo), les chiffres clés, la provenance et l’heure, les points forts et faibles, le tableau des treize statistiques avec Σ et ⌀, la forme', options, async () => {
  const equipe = pret.equipe.corps;
  const lecture = equipe.lecture;
  const tous = lecture.lignes.tous;
  const Carte = (await rendu.charger('/src/components/matches/TeamStrengthCard.vue')).default;
  const r = await rendu.rendre(Carte, { clubId: idClub(), clubName: lecture.nom, league: tous.championnat }, [[ROUTE_EQUIPE, pret.equipe]]);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, [], 'aucune autre lecture que celle de l’indice');
  assert.deepEqual(r.appels, [`GET http://localhost:4000/api/match-stats/team-strength?club=${idClub()}&historique=oui`]);
  const bloc = blocDe(r.html, 'indice-de-force');
  trouve(bloc, /data-etat="pret"/);
  const t = espaces(r.texte);
  assert.ok(t.startsWith('Calculé chaque nuit Indice de force'), 'le titre et le sur-titre');
  // Le club : son logo FotMob (par identifiant), son nom, son championnat, sa place.
  assert.ok(r.html.includes(`https://images.fotmob.com/image_resources/logo/teamlogo/${pret.cibles.club}.png`), 'le logo du club sur la ligne qui le nomme');
  assert.ok(t.includes(`${lecture.nom} ${tous.championnat}`), 'le nom du club, puis son championnat');
  // Les chiffres clés.
  assert.ok(t.includes(`Note de force ${I.noteDite(tous.force)}`), t.slice(0, 600));
  assert.ok(t.includes(`Place dans son championnat ${I.rangDit(tous.rang, tous.equipes)} devant ${fr(tous.percentileForce)} % des clubs du championnat (MLS)`), 'la place, dite comme la fiche du joueur : « des clubs du championnat (MLS) »');
  assert.ok(!/des clubs de MLS/.test(t), 'jamais « des clubs de MLS »');
  assert.ok(t.includes(`À domicile ${I.noteDite(lecture.lignes.dom.force)} · ${I.rangDit(lecture.lignes.dom.rang, lecture.lignes.dom.equipes)}`));
  assert.ok(t.includes(`À l’extérieur ${I.noteDite(lecture.lignes.ext.force)} · ${I.rangDit(lecture.lignes.ext.rang, lecture.lignes.ext.equipes)}`));
  assert.ok(t.includes(`Matchs en mémoire ${fr(tous.matchs)} matchs`));
  // La provenance réelle, avec l’heure du calcul (horloge figée au 22/10 18 h UTC).
  assert.ok(t.includes('FotMob (magasin) · indice de force calculé le 05/10 à 14:00'), 'le vrai fournisseur et l’heure');
  assert.ok(t.includes('il y a 17 jours'), 'ancien : dit en mots');
  trouve(bloc, /prov is-ancien/, 'ambre au-delà de 48 h');
  assert.ok(t.includes('Matchs pris en compte jusqu’au 21/09/2026'));
  assert.ok(t.includes('Avec les xG : la force est faite des xG'));
  // Les points forts et faibles = ceux du serveur.
  const liste = (cle) => [...(bloc.split(`data-points="${cle}"`)[1] ?? '').split('</section>')[0].matchAll(/<li[^>]*>[\s\S]*?<\/li>/g)].map((m) => espaces(texteDe(m[0])));
  assert.deepEqual(liste('forts'), tous.pointsForts.map((p) => `${p.libelle} ${p.percentile} %`));
  assert.deepEqual(liste('faibles'), tous.pointsFaibles.map((p) => `${p.libelle} ${p.percentile} %`));
  // Le tableau : les treize statistiques, trois lieux, Σ puis ⌀.
  const tab = tableauDe(r.html, 'statistiques');
  assert.deepEqual(entetes(tab), ['Statistique', 'Au total', 'À domicile', 'À l’extérieur']);
  const lignes = corps(tab).map((x) => espaces(texteDe(x)));
  assert.equal(lignes.length, 13);
  for (const [i, s] of TS.STATISTIQUES_INDICE.entries()) {
    assert.ok(lignes[i].startsWith(s.libelle), lignes[i]);
    for (const lieu of ['tous', 'dom', 'ext']) {
      const c = lecture.lignes[lieu].composantes[s.id];
      assert.ok(lignes[i].includes(`${I.valeurDite(s.id, c.valeur)} place ${c.percentile} %`), `${s.id} ${lieu} : ${lignes[i]}`);
    }
  }
  const [sigma, moyenne] = pied(tab).map((x) => espaces(texteDe(x)));
  assert.match(sigma, /^Σ Total statistiques relevées sur 13 13 sur 13 · \d+ forts? · \d+ faibles? 13 sur 13/);
  assert.match(moyenne, /^⌀ Moyenne place moyenne des statistiques relevées \d+ % \d+ % \d+ %$/);
  // La forme : phrase, courbe (un point par jour de match, le dernier cerclé), repères.
  assert.ok(t.includes('La forme'));
  assert.match(t, /Sa note est (en hausse|en baisse|stable) sur ses dix derniers matchs : /);
  // (Vue range les classes dans l'ordre qu'il veut : on les cherche, on ne les suppose pas dans un ordre.)
  const nPoints = (bloc.match(/class="[^"]*\btsc__point\b[^"]*"/g) ?? []).length;
  assert.equal(nPoints, Math.min(30, lecture.historique.filter((x) => Number.isFinite(x.force)).length));
  assert.equal((bloc.match(/class="[^"]*\bis-actuel\b[^"]*"/g) ?? []).length, 1, 'le jour d’aujourd’hui est cerclé');
  trouve(bloc, /<path class="tsc__ligne" d="M[\d.,LM ]+"/);
  assert.ok(t.includes('Aujourd’hui') && t.includes('Il y a 5 matchs') && t.includes('Il y a 10 matchs') && t.includes('Il y a 20 matchs'));
  assert.ok(t.includes('Mesure au banc d’essai — pas encore mesuré'), 'ce qui n’est pas mesuré est dit');
  assert.ok(t.includes('Affichage seulement : aucun chiffre du moteur ne dépend de cet indice.'));
  absent(bloc, /apport_off|note de joueur/, 'rien du joueur ici');
});

test('indice de force rendu — jamais calculé, serveur en erreur, serveur pas à jour, club inconnu, pas d’indice pour ce club : la raison est dite et les tableaux gardent leur structure', options, async () => {
  const Carte = (await rendu.charger('/src/components/matches/TeamStrengthCard.vue')).default;
  const props = { clubId: idClub(), clubName: 'Columbus Crew', league: 'MLS' };
  const cas = [
    ['jamais', vide.equipe, /Pas encore calculé L’indice de force n’a pas encore été calculé/, 'pas encore calculé', 'heure du calcul inconnue'],
    ['erreur', { code: 500, corps: { error: 'Erreur interne du serveur.' } }, /Indice de force illisible Erreur interne du serveur\. Les tableaux ci-dessous restent affichés, sans valeurs\./, 'pas encore calculé', 'heure du calcul inconnue'],
    ['pas-a-jour-serveur', { code: 404, corps: { error: 'Route introuvable : GET /api/match-stats/team-strength' } }, /Serveur à relancer Le serveur n'est pas à jour : relancez demarrer-cotemaster\.bat/, 'pas encore calculé', 'heure du calcul inconnue'],
    // Le calcul existe (son heure se lit) : c'est ce club qui n'a pas de ligne.
    ['sans-ligne', pret.equipeInconnue, /Pas d’indice pour ce club L’indice n’existe pas pour ce club/, 'pas assez de matchs', 'calculé le 05/10 à 14:00']
  ];
  for (const [cle, reponse, motif, mot, heure] of cas) {
    const r = await rendu.rendre(Carte, props, [[ROUTE_EQUIPE, reponse]]);
    const t = espaces(r.texte);
    trouve(r.html, new RegExp(`data-etat="${cle}"`), cle);
    assert.match(t, motif, cle);
    const tab = tableauDe(r.html, 'statistiques');
    assert.deepEqual(entetes(tab), ['Statistique', 'Au total', 'À domicile', 'À l’extérieur'], `${cle} : l’en-tête reste`);
    assert.equal(corps(tab).length, 13, `${cle} : les treize lignes restent`);
    assert.ok(corps(tab).every((x) => (texteDe(x).match(new RegExp(mot, 'g')) ?? []).length === 3), `${cle} : chaque case dit « ${mot} »`);
    assert.equal(pied(tab).length, 2, `${cle} : Σ et ⌀ restent`);
    assert.ok(espaces(texteDe(pied(tab)[0])).includes('aucune statistique relevée'), `${cle} : Σ dit qu’il n’y a rien`);
    assert.ok(t.includes(`FotMob (magasin) · indice de force ${heure}`), `${cle} : la provenance dit son heure, ou qu’elle n’en a pas`);
    const vides = cle === 'sans-ligne' ? 'pas d’indice pour ce club' : 'pas encore calculé';
    assert.ok(t.includes(`Points forts ${vides}`) && t.includes(`Points faibles ${vides}`), `${cle} : les deux listes restent`);
    assert.ok(t.includes('Pas encore de forme'), `${cle} : la forme dit pourquoi`);
    trouve(r.html, /tsc__texte/, `${cle}`);
  }
  // Le club n’est pas reconnu : aucune lecture ne part.
  const sans = await rendu.rendre(Carte, { clubId: null, clubName: '', league: null }, []);
  assert.deepEqual(sans.appels, [], 'sans identifiant, aucune lecture');
  trouve(sans.html, /data-etat="sans-club"/);
  assert.match(espaces(sans.texte), /Club non reconnu La page n’a pas trouvé l’identifiant FotMob de ce club/);
  trouve(sans.html, /<button[^>]*disabled[^>]*>[\s\S]*?Relire/, '« Relire » est désactivé sans club');
  assert.equal(corps(tableauDe(sans.html, 'statistiques')).length, 13);
  // Un calcul d’une autre forme : lu, et la page le dit.
  const autre = await rendu.rendre(Carte, props, [[ROUTE_EQUIPE, { code: 200, corps: { ...pret.equipe.corps, etat: 'pas-a-jour' } }]]);
  trouve(autre.html, /data-raison="autre-version"/);
  assert.match(espaces(autre.texte), /Calcul d’une autre version L’indice lu a été fait par une autre forme du calcul/);
  assert.equal(corps(tableauDe(autre.html, 'statistiques')).length, 13);
  assert.deepEqual(rendu.interdits, []);
});

test('le championnat se dit par le nom que l’appli lui donne — « du championnat (Bundesliga) », jamais le libellé brut « Bundesliga - Germany » — sur l’indice de force comme sur la fiche du joueur', options, async () => {
  const brut = 'Bundesliga - Germany';
  const Equipe = (await rendu.charger('/src/components/matches/TeamStrengthCard.vue')).default;
  const equipe = JSON.parse(JSON.stringify(pret.equipe));
  equipe.corps.lecture.lignes.tous.championnat = brut;
  const e = await rendu.rendre(Equipe, { clubId: idClub(), clubName: 'Club Essai', league: brut }, [[ROUTE_EQUIPE, equipe]]);
  const te = espaces(e.texte);
  assert.deepEqual(e.avertissements, []);
  assert.ok(te.includes(`devant ${fr(equipe.corps.lecture.lignes.tous.percentileForce)} % des clubs du championnat (Bundesliga)`), te.slice(0, 600));
  assert.ok(!te.includes(brut), 'le libellé brut n’apparaît nulle part dans le texte de l’indice');
  assert.ok(!/\bde Bundesliga\b/.test(te), 'jamais « des clubs de Bundesliga »');
  const Joueur = (await rendu.charger('/src/components/matches/PlayerRatingCard.vue')).default;
  const joueur = JSON.parse(JSON.stringify(pret.joueurEtabli));
  const fiche = joueur.corps.lecture.fiche;
  fiche.league = brut;
  const j = await rendu.rendre(Joueur, { playerId: `fotmob-${fiche.joueur}`, playerName: 'Joueur Essai', countryCode: null, countryName: null, team: null, teamId: null, league: brut, matches: [] }, [[ROUTE_JOUEUR, joueur]]);
  const tj = espaces(j.texte);
  assert.deepEqual(j.avertissements, []);
  assert.equal(fiche.poste, 3);
  assert.ok(tj.includes(`devant ${fiche.pct_off} % des milieux du championnat (Bundesliga)`), tj.slice(0, 600));
  assert.ok(tj.includes(`devant ${fiche.pct_def} % des milieux du championnat (Bundesliga)`));
  assert.ok(!tj.includes(brut), 'le libellé brut n’apparaît nulle part dans le texte de la fiche');
  assert.deepEqual(rendu.interdits, []);
});

test('fiche du joueur rendue — milieu établi : le joueur (drapeau, club et logo), les deux apports et leur place, les tuiles du poste, la courbe et le tableau avec l’adversaire (logo), Σ et ⌀', options, async () => {
  const fiche = pret.joueurEtabli.corps.lecture.fiche;
  const Carte = (await rendu.charger('/src/components/matches/PlayerRatingCard.vue')).default;
  const dernier = fiche.courbe.at(-1)[0];
  const props = {
    playerId: `fotmob-${fiche.joueur}`,
    playerName: 'Joueur Essai',
    countryCode: 'FRA',
    countryName: 'France',
    team: 'Club Essai',
    teamId: 'fotmob-8455',
    league: fiche.league,
    matches: [{ date: dernier, home: false, homeId: 'fotmob-777', awayId: 'fotmob-8455', opponent: 'Adversaire Essai', league: fiche.league, matchKey: 'm1' }]
  };
  const r = await rendu.rendre(Carte, props, [[ROUTE_JOUEUR, pret.joueurEtabli]]);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.deepEqual(r.appels, [`GET http://localhost:4000/api/match-stats/player-ratings?player=fotmob-${fiche.joueur}`]);
  const bloc = blocDe(r.html, 'note-par-poste');
  trouve(bloc, /data-etat="pret"/);
  const t = espaces(r.texte);
  assert.ok(t.startsWith('Calculé chaque nuit Note par poste'));
  // Le joueur : drapeau (FotMob), nom, club avec son logo, poste, fiche établie.
  assert.ok(r.html.includes('https://images.fotmob.com/image_resources/logo/teamlogo/8455.png'), 'le logo du club du joueur');
  trouve(bloc, /<img[^>]*flag|class="flag"/, 'le drapeau de nationalité');
  assert.ok(t.includes('Joueur Essai Club Essai Milieu fiche établie'));
  // Les apports.
  const a = J.apportsDuJoueur(fiche);
  assert.ok(t.includes(`Apport offensif ${a.offensif.valeurTexte} ${a.offensif.place}`), t.slice(200, 700));
  assert.ok(t.includes(`Apport défensif ${a.defensif.valeurTexte} ${a.defensif.place}`));
  assert.ok(t.includes(`Minutes ${fr(fiche.minutes)} ${fr(fiche.apparitions)} apparitions`));
  assert.ok(t.includes('Son poste Milieu 58 % de ses minutes à ce poste'));
  assert.ok(t.includes('FotMob (magasin) · fiches des joueurs calculé le 05/10 à 14:00'), 'le vrai fournisseur et l’heure du calcul');
  // Les tuiles : celles du poste d’abord, avec la mémoire derrière.
  const tuiles = tuilesDe(bloc);
  assert.deepEqual(tuiles.map((x) => [x.id, x.poste]), [['xa', 'oui'], ['pc', 'oui'], ['recup', 'oui'], ['xgnp', 'oui'], ['note', 'oui'], ['xgot', 'non'], ['tirs', 'non'], ['duels', 'non'], ['xga', 'non']], 'celles du poste d’abord, puis les autres');
  assert.ok(tuiles[0].texte.includes(`${fr(fiche.xa / 1000, 2)} mémoire : `), tuiles[0].texte);
  assert.ok(tuiles.every((x) => /^.+ \d+,\d+ mémoire : \d+(,\d)? match(s)? de 90 min$/.test(x.texte)), 'chaque tuile dit sa valeur et la mémoire derrière');
  assert.equal((bloc.match(/data-poste="oui"/g) ?? []).length, 5, 'cinq tuiles du poste');
  assert.ok(tuiles.filter((x) => x.poste === 'oui').every((x) => x.classe.includes('is-section')) && tuiles.filter((x) => x.poste === 'non').every((x) => !x.classe.includes('is-section')), 'les tuiles du poste, et elles seules, en couleur de section');
  // La courbe et le tableau.
  assert.equal((bloc.match(/<path class="prc__ligne/g) ?? []).length, 2, 'deux traits : offensif et défensif');
  trouve(bloc, /prc__zero/);
  const tab = tableauDe(r.html, 'apparitions');
  assert.deepEqual(entetes(tab), ['Apparition', 'Apport offensif', 'Apport défensif']);
  const lignes = corps(tab).map((x) => espaces(texteDe(x)));
  assert.equal(lignes.length, fiche.courbe.length);
  assert.ok(lignes[0].startsWith(`${dernier.slice(8, 10)}/${dernier.slice(5, 7)}/${dernier.slice(2, 4)} à Adversaire Essai`), lignes[0]);
  assert.ok(r.html.includes('https://images.fotmob.com/image_resources/logo/teamlogo/777.png'), 'le logo de l’adversaire sur sa ligne');
  const [sigma, moyenne] = pied(tab).map((x) => espaces(texteDe(x)));
  const offs = fiche.courbe.map((x) => x[1] / 1000);
  assert.ok(sigma.startsWith(`Σ Total ${fiche.courbe.length} apparition`), sigma);
  assert.ok(sigma.includes(`de ${J.apportSigne(Math.min(...offs))} à ${J.apportSigne(Math.max(...offs))}`));
  assert.ok(moyenne.includes(J.apportSigne(offs.reduce((s, x) => s + x, 0) / offs.length)), moyenne);
  assert.ok(t.includes('Affichage seulement : aucun chiffre du moteur ne dépend de cette fiche'));
  assert.ok(t.includes('jamais sur le terrain des compositions'));
});

test('fiche du joueur rendue — gardien, peu joué, jamais calculé, sans fiche (404), serveur en erreur : les tuiles, la courbe et le tableau gardent leur structure', options, async () => {
  const Carte = (await rendu.charger('/src/components/matches/PlayerRatingCard.vue')).default;
  const base = { playerName: 'Joueur Essai', countryCode: null, countryName: null, team: null, teamId: null, league: 'EPL', matches: [] };
  // Un gardien : pas d’apport offensif, un seul trait, « sans objet » dans le tableau.
  const gk = pret.gardien.corps.lecture.fiche;
  const g = await rendu.rendre(Carte, { ...base, playerId: `fotmob-${gk.joueur}` }, [[ROUTE_JOUEUR, pret.gardien]]);
  const tg = espaces(g.texte);
  assert.ok(tg.includes('Apport offensif sans objet un gardien n’a pas d’apport offensif'));
  assert.equal((g.html.match(/<path class="prc__ligne/g) ?? []).length, 1, 'un seul trait pour un gardien');
  assert.ok(corps(tableauDe(g.html, 'apparitions')).every((x) => texteDe(x).includes('sans objet')));
  const tuilesGk = tuilesDe(g.html);
  assert.equal(tuilesGk[0].id, 'buts_evites', 'les buts évités passent en tête');
  assert.deepEqual(tuilesGk.map((x) => x.id).sort(), tuilesGk.map((x) => x.id).filter((id) => J.PERTINENTES_DU_GARDIEN.includes(id)).sort());
  assert.ok(!tuilesGk.some((x) => ['xgnp', 'xa', 'xgot', 'tirs', 'pc'].includes(x.id)), 'pas de zéros de joueur de champ chez un gardien');
  // Peu joué : pas de place, dite.
  const pj = pret.joueurPeuJoue.corps.lecture.fiche;
  const p = await rendu.rendre(Carte, { ...base, playerId: `fotmob-${pj.joueur}` }, [[ROUTE_JOUEUR, pret.joueurPeuJoue]]);
  trouve(p.html, /data-etat="pret"/);
  assert.ok(espaces(p.texte).includes('peu joué'));
  assert.ok(espaces(p.texte).includes('pas de place : fiche pas encore établie'));
  // Les états sans fiche : la raison est dite, les tuiles et le tableau restent.
  const cas = [
    ['jamais', vide.joueur, /Pas encore calculé Les fiches des joueurs n’ont pas encore été calculées/],
    ['erreur', { code: 500, corps: { error: 'Erreur interne du serveur.' } }, /Fiche illisible Erreur interne du serveur\./],
    ['pas-a-jour-serveur', { code: 404, corps: { error: 'Route introuvable : GET /api/match-stats/player-ratings' } }, /Serveur à relancer Le serveur n'est pas à jour/],
    ['sans-fiche', pret.joueurInconnu, /Pas de fiche pour ce joueur Les fiches n’existent que pour les joueurs qui ont joué/]
  ];
  for (const [cle, reponse, motif] of cas) {
    const r = await rendu.rendre(Carte, { ...base, playerId: 'fotmob-424242' }, [[ROUTE_JOUEUR, reponse]]);
    trouve(r.html, new RegExp(`data-etat="${cle}"`), cle);
    assert.match(espaces(r.texte), motif, cle);
    const tuiles = tuilesDe(r.html);
    assert.deepEqual(tuiles.map((x) => x.id), J.COMPOSANTES.map((c) => c.id), `${cle} : les dix tuiles restent`);
    assert.ok(tuiles.every((x) => /pas encore calculée/.test(x.texte)), `${cle} : chaque tuile dit pourquoi elle est vide`);
    const tab = tableauDe(r.html, 'apparitions');
    assert.deepEqual(entetes(tab), ['Apparition', 'Apport offensif', 'Apport défensif']);
    assert.equal(pied(tab).length, 2, `${cle} : Σ et ⌀ restent`);
    assert.ok(espaces(texteDe(corps(tab)[0])).includes('pas encore calculé'), `${cle} : le tableau dit pourquoi il est vide`);
    assert.ok(espaces(r.texte).includes('FotMob (magasin) · fiches des joueurs heure du calcul inconnue'), `${cle} : la provenance dit qu’elle n’a pas d’heure`);
  }
  assert.deepEqual(rendu.interdits, []);
});

test('ce qui prédit rendu — après le calcul : quatre tableaux, toutes leurs lignes, les verdicts (vert, rouge), Σ et ⌀, la période réelle, la provenance et l’heure', options, async () => {
  const Table = (await rendu.charger('/src/components/analysis/PredictorsTable.vue')).default;
  const r = await rendu.rendre(Table, {}, [[ROUTE_VALEUR, pret.valeur]]);
  assert.deepEqual(r.avertissements, []);
  assert.deepEqual(rendu.interdits, []);
  assert.deepEqual(r.appels, ['GET http://localhost:4000/api/bench/stat-value']);
  const t = espaces(r.texte);
  trouve(r.html, /data-etat="pret"/);
  assert.ok(t.startsWith('Calculé à la main, jamais chaque nuit Ce qui prédit, ce qui trompe'));
  assert.ok(t.includes('Mesuré sur tous les championnats réunis, pas sur celui choisi plus haut'), 'le bloc dit qu’il ne dépend pas du championnat');
  const lignes = pret.valeur.corps.lignes;
  const tout = lignes.filter((l) => l.verdict);
  assert.ok(t.includes(`Statistiques mesurées ${tout.length} statistiques d’équipe et de joueur jugées`));
  assert.ok(t.includes(`Celles qui comptent ${tout.filter((l) => l.verdict === 'compte').length}`));
  assert.ok(t.includes(`Celles qui trompent ${tout.filter((l) => l.verdict === 'trompe').length}`));
  assert.ok(t.includes('FotMob (magasin) · football-data.co.uk calculé le 05/10 à 14:00'), 'la vraie provenance et l’heure');
  assert.ok(t.includes('Calculé du 01/02/2026 au 31/07/2026, jugé sur les matchs depuis le 01/08/2026'), 'la période réelle, lue dans le calcul');
  // Les quatre tableaux et leurs lignes : toutes, mesurées ou non.
  const attendu = { 'equipes-fotmob': 26, 'equipes-fd': 18, 'joueurs-fotmob': 16, 'fenetre-moteur': 6 };
  for (const [cle, n] of Object.entries(attendu)) {
    const tab = tableauDe(r.html, cle);
    assert.ok(tab, cle);
    assert.equal(corps(tab).length, n, `${cle} : ${n} lignes`);
    assert.equal(pied(tab).length, 2, `${cle} : Σ et ⌀`);
  }
  const equipes = tableauDe(r.html, 'equipes-fotmob');
  assert.deepEqual(entetes(equipes), ['Statistique', 'Fiabilité', 'Matchs nécessaires', 'Pouvoir de prédiction', 'Demi-vie', 'Bonne fenêtre', 'Verdict']);
  const rangs = corps(equipes);
  // La dernière puce de la ligne est son verdict : sa classe (le ton) et son texte.
  const verdictDeLaLigne = (x) => {
    const puces = [...x.matchAll(/<span class="([^"]*\bcm-chip\b[^"]*)"[^>]*>([\s\S]*?)<\/span>/g)];
    return [null, puces.at(-1)[1], texteDe(puces.at(-1)[2])];
  };
  let comptent = 0;
  let trompent = 0;
  for (const [i, c] of P.CATALOGUE_EQUIPE.filter((x) => x.sources.includes('magasin')).entries()) {
    const ligne = lignes.find((l) => l.echelle === 'equipe' && l.source === 'magasin' && l.statistique === c.id);
    assert.ok(texteDe(rangs[i]).startsWith(c.libelle), c.id);
    const m = verdictDeLaLigne(rangs[i]);
    assert.equal(m[2], P.VERDICTS[ligne.verdict].texte, `${c.id} : le verdict du serveur`);
    assert.ok(m[1].includes(P.VERDICTS[ligne.verdict].ton) || P.VERDICTS[ligne.verdict].ton === '', `${c.id} : le ton ${P.VERDICTS[ligne.verdict].ton}`);
    if (ligne.verdict === 'compte') comptent++;
    if (ligne.verdict === 'trompe') trompent++;
  }
  assert.ok(comptent >= 1 && trompent >= 1, 'le calcul d’essai a des statistiques qui comptent ET qui trompent');
  const puces = (ton) => [...r.html.matchAll(/<span class="([^"]*)"/g)].filter((m) => m[1].split(' ').includes('cm-chip') && m[1].split(' ').includes(ton)).length;
  assert.ok(puces('is-accent') >= comptent, 'le vert pour celles qui comptent');
  assert.ok(puces('is-danger') >= trompent, 'le rouge pour celles qui trompent');
  // Le pied : Σ par verdict, ⌀ des colonnes chiffrées.
  const [sigma, moyenne] = pied(equipes).map((x) => espaces(texteDe(x)));
  const pe = P.piedDeLaSection(P.lignesDeLaSection(P.SECTIONS[0], lignes));
  assert.ok(sigma.startsWith(`Σ Total ${pe.texte.sigma}`), sigma);
  assert.ok(sigma.includes(pe.texte.verdicts), sigma);
  assert.ok(moyenne.includes(pe.texte.fiabilite) && moyenne.includes(pe.texte.stabilisation), moyenne);
  // football-data : pas dans ce calcul — ses 18 lignes restent, « pas mesuré dans ce calcul ».
  assert.ok(corps(tableauDe(r.html, 'equipes-fd')).every((x) => texteDe(x).includes('pas mesuré dans ce calcul')));
  // La fenêtre du moteur : marché, source, fenêtre actuelle, meilleure fenêtre, verdict.
  const moteur = tableauDe(r.html, 'fenetre-moteur');
  assert.deepEqual(entetes(moteur), ['Marché', 'Source', 'Fenêtre actuelle', 'Meilleure fenêtre', 'Verdict']);
  const rm = corps(moteur).map((x) => espaces(texteDe(x)));
  assert.ok(rm[0].startsWith('Les corners du match FotMob (magasin) 10 matchs 10 matchs'), rm[0]);
  assert.ok(rm.slice(3).every((x) => x.includes('football-data.co.uk') && x.includes('pas mesuré dans ce calcul')));
  assert.ok(t.includes('Mesuré seulement : le moteur garde sa fenêtre de 10 matchs'));
  assert.ok(t.includes('cette page ne le lance jamais'), 'rien ne se lance d’ici');
  absent(r.html, /<button[^>]*>[^<]*Lancer/, 'aucun bouton qui lance le calcul');
});

test('ce qui prédit rendu — jamais calculé, serveur en erreur, serveur pas à jour : les quatre tableaux gardent toutes leurs lignes, « pas encore mesuré » et Σ ⌀', options, async () => {
  const Table = (await rendu.charger('/src/components/analysis/PredictorsTable.vue')).default;
  const cas = [
    ['jamais', vide.valeur, /Pas encore mesuré La valeur des statistiques n’a pas encore été calculée : ce calcul se lance à la main/],
    ['erreur', { code: 500, corps: { error: 'Erreur interne du serveur.' } }, /Mesure illisible Erreur interne du serveur\./],
    ['pas-a-jour-serveur', { code: 404, corps: { error: 'Route introuvable : GET /api/bench/stat-value' } }, /Serveur à relancer Le serveur n'est pas à jour/]
  ];
  for (const [cle, reponse, motif] of cas) {
    const r = await rendu.rendre(Table, {}, [[ROUTE_VALEUR, reponse]]);
    trouve(r.html, new RegExp(`data-etat="${cle}"`), cle);
    assert.match(espaces(r.texte), motif, cle);
    for (const [tab, n] of [['equipes-fotmob', 26], ['equipes-fd', 18], ['joueurs-fotmob', 16], ['fenetre-moteur', 6]]) {
      const t = tableauDe(r.html, tab);
      assert.equal(corps(t).length, n, `${cle} ${tab} : toutes les lignes`);
      assert.ok(corps(t).every((x) => /pas encore mesuré/.test(texteDe(x))), `${cle} ${tab} : « pas encore mesuré »`);
      assert.equal(pied(t).length, 2, `${cle} ${tab} : Σ et ⌀`);
    }
    assert.ok(espaces(r.texte).includes('FotMob (magasin) · football-data.co.uk heure du calcul inconnue'));
    assert.ok(espaces(r.texte).includes('Statistiques mesurées non lu pas encore mesuré'));
  }
  // Un nouveau calcul en cours : le dernier reste lu, la page le dit.
  const enCours = await rendu.rendre(Table, {}, [[ROUTE_VALEUR, { code: 200, corps: { ...pret.valeur.corps, enCours: { id: 2, debut: '2026-10-22T17:00:00.000Z', partie: 'statistiques', fait: 3, total: 66 } } }]]);
  trouve(enCours.html, /data-raison="en-cours"/);
  assert.equal(corps(tableauDe(enCours.html, 'equipes-fotmob')).length, 26);
  const refus = await rendu.rendre(Table, {}, [[ROUTE_VALEUR, { code: 200, corps: { ...pret.valeur.corps, dernierRefus: { le: '2026-10-22T17:00:00.000Z', raison: 'Une actualisation tient la base.' } } }]]);
  trouve(refus.html, /data-raison="dernier-refus"/);
  assert.match(espaces(refus.texte), /Le dernier lancement a été refusé Une actualisation tient la base\./);
  assert.deepEqual(rendu.interdits, []);
});

// ================================================ 3. le câblage et l’hygiène

test('câblage : une seule place par information — l’indice dans la page de l’équipe, la note du joueur sur sa fiche, « ce qui prédit » dans Statistiques ligue et nulle part ailleurs', () => {
  const equipe = lireUi('views', 'TeamView.vue');
  assert.match(equipe, /import TeamStrengthCard from '@\/components\/matches\/TeamStrengthCard\.vue';/);
  assert.equal((equipe.match(/<TeamStrengthCard /g) ?? []).length, 1, 'une seule fois');
  assert.match(equipe, /<TeamStrengthCard :club-id="idClub \?\? null" :club-name="nom" :league="ligue" \/>/);
  assert.ok(equipe.indexOf('title="Meilleures statistiques"') < equipe.indexOf('<TeamStrengthCard') && equipe.indexOf('<TeamStrengthCard') < equipe.indexOf('<div class="team__grid">'), 'dans le Résumé, après les meilleures statistiques');
  assert.match(equipe, /watch\(\(\) => \[props\.name, props\.league, props\.matchId\], load, \{ immediate: true \}\);/, 'la page recharge d’un club à l’autre');
  const joueur = lireUi('views', 'PlayerView.vue');
  assert.match(joueur, /import PlayerRatingCard from '@\/components\/matches\/PlayerRatingCard\.vue';/);
  assert.equal((joueur.match(/<PlayerRatingCard\b/g) ?? []).length, 1);
  assert.match(joueur, /:player-id="j\.playerId \?\? props\.playerId"/);
  assert.match(joueur, /:matches="j\.matches"/);
  assert.match(joueur, /watch\(\(\) => \[props\.playerId, props\.season\], charger, \{ immediate: true \}\);/);
  const ligue = lireUi('views', 'TeamStatsView.vue');
  assert.match(ligue, /import PredictorsTable from '@\/components\/analysis\/PredictorsTable\.vue';/);
  assert.equal((ligue.match(/<PredictorsTable \/>/g) ?? []).length, 1);
  assert.ok(ligue.indexOf('<LeagueBenchmarksPanel') < ligue.indexOf('<PredictorsTable'), 'après les repères du championnat');
  assert.match(ligue, /<\/AppCard>\s*<!--[\s\S]*?-->\s*<PredictorsTable \/>/, 'hors de la partie qui dépend du classement : à la suite des repères');
  // Nulle part ailleurs : ni Santé du moteur, ni Historique moteur, ni la page des bookmakers.
  const toutes = fs.readdirSync(path.join(UI, 'src'), { recursive: true }).filter((f) => /\.(vue|js)$/.test(f)).map((f) => String(f).split(path.sep).join('/'));
  const emplois = (nom) => toutes.filter((f) => lireUi(...f.split('/')).includes(nom) && !f.endsWith(`${nom}.vue`));
  assert.deepEqual(emplois('PredictorsTable'), ['views/TeamStatsView.vue'], 'le tableau « ce qui prédit » vit à UN seul endroit');
  assert.deepEqual(emplois('TeamStrengthCard'), ['views/TeamView.vue']);
  assert.deepEqual(emplois('PlayerRatingCard'), ['views/PlayerView.vue']);
  // La route de lecture : appelée par le composant seul, jamais une écriture.
  const api = lireUi('services', 'matchStatsApi.js');
  assert.match(api, /teamStrength: \(club, \{ historique = false \} = \{\}\) =>\s*httpClient\.get\(`\/match-stats\/team-strength\?club=\$\{encodeURIComponent\(club\)\}\$\{historique \? '&historique=oui' : ''\}`\),/);
  assert.match(api, /playerRatings: \(player\) => httpClient\.get\(`\/match-stats\/player-ratings\?player=\$\{encodeURIComponent\(player\)\}`\),/);
  assert.match(lireUi('services', 'benchApi.js'), /valeurDesStatistiques: \(\) => httpClient\.get\('\/bench\/stat-value'\)/);
});

test('hygiène : jetons seulement, pas de !important, polices ≥ 10 px, aucune écriture ni appel payant, watch sur le club et le joueur, rien pour le terrain des compositions', () => {
  const jetons = lireUi('assets', 'styles', 'tokens.css');
  const composants = [
    ['components', 'matches', 'TeamStrengthCard.vue'],
    ['components', 'matches', 'PlayerRatingCard.vue'],
    ['components', 'analysis', 'PredictorsTable.vue']
  ];
  for (const f of composants) {
    const vue = lireUi(...f);
    const nom = f.at(-1);
    const style = vue.split('<style scoped>')[1];
    assert.ok(style, `${nom} : un style`);
    assert.doesNotMatch(style, /#[0-9a-f]{3,8}\b/i, `${nom} : aucune couleur en dur`);
    assert.doesNotMatch(style.replace(/rgba?\(var\(--[^)]+\)[^)]*\)/g, '').replace(/rgb\(var\(--[^)]+\) \/ var\(--[^)]+\)\)/g, ''), /rgba?\(/, `${nom} : une transparence passe par un jeton`);
    assert.doesNotMatch(vue, /!important/, `${nom}`);
    for (const m of style.matchAll(/font-size:\s*([\d.]+)px/g)) assert.ok(Number(m[1]) >= 10, `${nom} : police de ${m[1]} px`);
    for (const m of style.matchAll(/var\((--cm-[a-z0-9-]+)/g)) assert.ok(jetons.includes(`${m[1]}:`), `${nom} : jeton inconnu ${m[1]}`);
    assert.doesNotMatch(vue, /\.(post|put|patch|delete)\(/, `${nom} : aucune écriture`);
    assert.doesNotMatch(vue, /lineups-by-name|resolveTeamAverages|API-Football|apiFootball/i, `${nom} : aucun appel payant`);
    assert.doesNotMatch(vue, /<select\b/, `${nom} : pas de liste native`);
    // Les icônes nommées existent dans AppIcon.
    const connues = new Set([...lireUi('components', 'common', 'AppIcon.vue').matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]));
    for (const m of vue.matchAll(/<AppIcon name="(\w+)"|\bicon="(\w+)"/g)) assert.ok(connues.has(m[1] ?? m[2]), `${nom} : l’icône ${m[1] ?? m[2]} n’existe pas`);
  }
  // Ni vert de value ni rouge d’erreur sur l’indice et la fiche : les points forts sont bleus, les faibles ambre.
  for (const f of composants.slice(0, 2)) {
    const vue = lireUi(...f);
    assert.doesNotMatch(vue, /--cm-accent|--cm-danger\b(?!-)|ValueBadge/, `${f.at(-1)} : jamais le vert ni le rouge d’une value`);
  }
  assert.match(lireUi('components', 'matches', 'TeamStrengthCard.vue'), /watch\(\s*\(\) => props\.clubId,/, 'le bloc relit quand le club change');
  assert.match(lireUi('components', 'matches', 'PlayerRatingCard.vue'), /watch\(\s*\(\) => props\.playerId,/, 'la fiche relit quand le joueur change');
  // Une réponse arrivée après un changement de club ou de joueur est ignorée (d'une équipe à l'autre, jamais la fiche de la précédente).
  assert.match(lireUi('components', 'matches', 'TeamStrengthCard.vue'), /if \(props\.clubId === club\) etat\.value = \{ loading: false, error: null, data \};/);
  assert.match(lireUi('components', 'matches', 'TeamStrengthCard.vue'), /if \(props\.clubId === club\) etat\.value = \{ loading: false, error: error\.message, data: null \};/);
  assert.match(lireUi('components', 'matches', 'PlayerRatingCard.vue'), /if \(props\.playerId === joueur\) etat\.value = \{ loading: false, error: null, data \};/);
  assert.match(lireUi('components', 'matches', 'PlayerRatingCard.vue'), /if \(props\.playerId === joueur\) etat\.value = \{ loading: false, error: error\.message, data: null \};/);
  // Sans identifiant, aucune lecture ne part : le bloc le dit et garde ses tableaux.
  assert.match(lireUi('components', 'matches', 'TeamStrengthCard.vue'), /if \(!club\) \{\s*etat\.value = \{ loading: false, error: null, data: null \};\s*return;\s*\}/);
  // Aucune note de joueur sur le terrain des compositions : ni le terrain, ni le banc, ni les compositions n’emploient la fiche.
  for (const f of [['components', 'matches', 'LineupPitch.vue'], ['components', 'matches', 'LineupBench.vue'], ['components', 'matches', 'MatchLineups.vue'], ['components', 'analysis', 'AiLineupSnapshot.vue']]) {
    const vue = lireUi(...f);
    assert.doesNotMatch(vue, /ficheJoueur|PlayerRatingCard|player-ratings|playerRatings|apport_off|apportsDuJoueur/, `${f.at(-1)} : aucune fiche sur le terrain`);
  }
  // Les règles sont PURES : elles ne lisent que d'autres règles pures du même dossier (le nom des championnats, celui de l'appli).
  assert.deepEqual([...reglesPures('ficheJoueur.js')].sort(), ['ficheJoueur.js', 'indiceDeForce.js', 'leagueDisplay.js'], 'les règles de la fiche sont pures');
  assert.deepEqual([...reglesPures('indiceDeForce.js')].sort(), ['indiceDeForce.js', 'leagueDisplay.js']);
  assert.deepEqual([...reglesPures('predicteurs.js')], ['predicteurs.js']);
});

test('aucun fichier du moteur n’est touché par l’étape : les nouveaux fichiers n’en font pas partie, aucun fichier du moteur ne les importe', async () => {
  const V = await imp(path.join(SERVEUR, 'src', 'core', 'engine', 'engineVersions.js'));
  const moteur = new Set(V.fichiersDuMoteur());
  for (const f of ['api/controllers/marketKnowledge.controller.js', 'api/routes/marketKnowledge.routes.js']) {
    assert.ok(!moteur.has(f), `${f} n’est pas un fichier du moteur`);
  }
  // Aucun fichier du moteur n’importe un de ces nouveaux fichiers (ni les fichiers de l’interface : le moteur est du serveur).
  for (const f of moteur) {
    const texte = fs.readFileSync(path.join(SERVEUR, 'src', f), 'utf8');
    assert.doesNotMatch(texte, /marketKnowledge\.controller|marketKnowledge\.routes|TeamStrengthCard|PlayerRatingCard|PredictorsTable|BookmakersView/, `${f}`);
  }
  assert.equal(moteur.size, 37, 'le moteur compte 37 fichiers, comme avant l’étape');
});
