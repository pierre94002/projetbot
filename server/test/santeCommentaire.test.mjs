/**
 * Le texte minute par minute de FotMob dans la santé des sources (lot 3,
 * 07/10/2026).
 *   node --test test/santeCommentaire.test.mjs        (depuis server/)
 *
 * Depuis l'étape 43, la revue d'après-match lit le texte minute par minute de
 * FotMob chez data.fotmob.com (providers/fotMobCommentaire.js). Ces requêtes ne
 * passaient pas par les notes de la santé des sources (étape 14) : une panne du
 * texte, ou un changement de sa forme, ne se voyait nulle part. Maintenant
 * chaque réponse est NOTÉE par le mécanisme de FotMob (relevesDesSources.js),
 * sans requête de plus, sous la sorte « commentaire » ; un 403 — FotMob répond
 * ainsi à un fichier qui n'existe pas dans cette langue — est compté à part
 * (« langue absente »), jamais une panne ; et la ligne FotMob de « Santé des
 * sources » le dit.
 *
 * Tout tourne dans une copie ISOLÉE (test/aides/isolement.mjs : base d'essai,
 * data/runtime à part, réseau coupé, heure figée au 05/10/2026 12 h UTC) : le
 * script test/aides/script-sante-commentaire.mjs lance le VRAI lecteur du
 * texte, les VRAIES notes et le VRAI état des sources, avec un faux `fetch`
 * passé à la lecture. Aucune adresse n'est jamais jointe.
 *
 *  1. Le type d'une adresse ; un 403 de l'API de FotMob reste un échec.
 *  2. Une lecture notée : deux requêtes, deux notes — aucune requête de plus.
 *  3. Un 403 attendu (langue absente) n'est jamais une panne ; un 401, 404,
 *     429, 5xx en est un échec, avec sa nature ; la nature de chaque échec de lecture.
 *  4. Trois échecs de suite : « à surveiller », jamais « en panne » ; une
 *     lecture réussie remet la série à zéro ; une série de plus de 24 h ne compte plus.
 *  5. Une forme inattendue ; l'API de FotMob que le texte ne masque pas.
 *  6. Le suivi enregistré, relu après un redémarrage ; la ligne FotMob.
 *  7. Lecture du code : une note par requête, jamais une requête de plus.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const script = path.join(SERVEUR, 'test', 'aides', 'script-sante-commentaire.mjs');
const src = (...p) => fs.readFileSync(path.join(SERVEUR, 'src', ...p), 'utf8').replace(/\r\n/g, '\n');
/**
 * Le code sans ses commentaires (les motifs de lecture du code ne doivent pas se prendre à un commentaire). Seuls les blocs qui
 * commencent une ligne et les lignes de `//` sont retirés : la valeur « étoile, barre, étoile » de l'en-tête Accept ne doit pas passer pour un début de commentaire.
 */
const sansCommentaires = (code) => code.replace(/^[ \t]*\/\*[\s\S]*?\*\/[ \t]*$/gm, '').replace(/^[ \t]*\/\/.*$/gm, '');

let sortie;
/** Les sorties du script, produites une fois dans une copie neuve. */
function lancer() {
  if (sortie) return sortie;
  const copie = preparerCopie({});
  try {
    const r = executer(copie, script, { timeout: 180_000 });
    assert.equal(r.code, 0, `${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.ok(r.json?.ok, `sortie illisible\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    sortie = r.json;
    return sortie;
  } finally {
    copie.nettoyer();
  }
}

const ADRESSES = {
  'https://data.fotmob.com/webcl/ltc/gsm/5071387_en_gen.json.gz': 'commentaire',
  'https://data.fotmob.com/webcl/ltc/gsm/5071387_pt-BR_gen.json.gz': 'commentaire',
  'https://www.fotmob.com/api/data/matches?date=20261005': 'liste-du-jour',
  'https://www.fotmob.com/api/data/matchDetails?matchId=1': 'feuille-de-match',
  'https://www.fotmob.com/api/data/leagues?id=47': 'competition',
  'https://www.fotmob.com/api/data/teams?id=8456': 'equipe',
  'https://www.fotmob.com/api/data/playerData?id=1': 'joueur',
  'https://www.fotmob.com/api/data/autre?x=1': 'autre',
  'https://data.fotmob.com/autre/chose.json': 'autre'
};

// ====================================================================== 1. le type d'une adresse

test('le texte minute par minute est une sorte de réponse à part (« commentaire ») ; les autres adresses gardent la leur ; un 403 de l’API de FotMob reste un échec « accès refusé »', () => {
  const s = lancer();
  assert.deepEqual(s.types, ADRESSES);
  assert.equal(s.libelle, 'Texte minute par minute');
  // Un 403 de l'API (une page de compétition) : un échec, dans les totaux et dans la série de FotMob ; celui du texte : une langue absente, nulle part ailleurs.
  assert.deepEqual(s.deuxRefus.global, { requetes: 1, echecs: 1, erreursDeSuite: 1, nature: 'acces-refuse' });
  assert.deepEqual([s.deuxRefus.competition.echecs, s.deuxRefus.competition.derniereErreur.nature, s.deuxRefus.competition.absentes], [1, 'acces-refuse', 0]);
  assert.deepEqual([s.deuxRefus.commentaire.requetes, s.deuxRefus.commentaire.echecs, s.deuxRefus.commentaire.absentes, s.deuxRefus.commentaire.erreursDeSuite], [0, 0, 1, 0]);
  assert.equal(s.deuxRefus.commentaire.derniereErreur, null);
});

// ====================================================================== 2. une lecture notée

test('une lecture est notée sans requête de plus : « en » absent (403) puis « en_gen » lu = deux requêtes (celles d’avant), une langue absente, un fichier lu ; les totaux de FotMob ne bougent pas', () => {
  const s = lancer().lecture;
  assert.equal(s.langue, 'en_gen');
  assert.equal(s.evenements, 1);
  assert.deepEqual(s.demandes, ['5071387_en.json.gz', '5071387_en_gen.json.gz'], 'les deux requêtes d’avant, pas une de plus');
  const t = s.suivi.texte;
  assert.deepEqual([t.requetes, t.reussites, t.echecs, t.absentes, t.erreursDeSuite], [1, 1, 0, 1, 0]);
  assert.equal(t.requetes + t.absentes, s.demandes.length, 'une note par requête : lues + en échec + absentes = demandées');
  assert.equal(t.derniereForme.attendue, true);
  // Les totaux de FotMob (son API) sont ceux de la seule liste du jour notée avant : le texte est à part.
  assert.deepEqual(s.suivi.global, { requetes: 1, reussites: 1, echecs: 0, erreursDeSuite: 0, derniereReussite: '2026-10-05T12:00:00.000Z', derniereErreur: null });
  assert.deepEqual(s.suivi.types, ['liste-du-jour', 'commentaire']);
  // La forme des réponses, sorte par sorte : « commentaire » y est, avec ses langues absentes (l'API n'en a jamais).
  assert.deepEqual(s.etat.formes.map((f) => [f.type, f.libelle, f.requetes, f.reussites, f.echecs, f.absentes]), [['liste-du-jour', 'Liste du jour', 1, 1, 0, 0], ['commentaire', 'Texte minute par minute', 1, 1, 0, 1]]);
  // L'état : en bon état, le texte dit ce qu'il a lu.
  assert.deepEqual([s.etat.etat, s.etat.enPanne, s.etat.requetes, s.etat.echecs, s.etat.erreursDeSuite], ['ok', false, 1, 0, 0]);
  const c = s.etat.commentaire;
  assert.deepEqual([c.lus, c.absentes, c.echecs, c.erreursDeSuite, c.derniereErreur, c.notes], [1, 1, 0, 0, null, true]);
  // Une lecture en JSON non compressé (l'autre forme que le lecteur accepte) : une requête, une note de plus.
  const j = lancer().lectureJson;
  assert.deepEqual([j.langue, j.demandes, j.texte.reussites, j.texte.absentes], ['en', ['5071388_en.json.gz'], 2, 1]);
});

// ====================================================================== 3. le 403 attendu, et ce qui n'est pas lui

test('un 403 attendu (langue absente) n’est jamais une panne : vingt fichiers absents = vingt langues absentes, aucun échec, aucune série, FotMob « en bon état »', () => {
  const s = lancer().absentes;
  assert.equal(s.demandes, 20, 'dix matchs, deux langues essayées chacun : vingt requêtes, comme avant');
  const t = s.suivi.texte;
  assert.deepEqual([t.requetes, t.reussites, t.echecs, t.absentes, t.erreursDeSuite, t.derniereErreur], [0, 0, 0, 20, 0, null]);
  assert.deepEqual(s.suivi.global, { requetes: 1, reussites: 1, echecs: 0, erreursDeSuite: 0, derniereReussite: '2026-10-05T12:00:00.000Z', derniereErreur: null });
  assert.deepEqual([s.etat.etat, s.etat.enPanne, s.etat.erreursDeSuite, s.etat.raison], ['ok', false, 0, null]);
  assert.deepEqual([s.etat.commentaire.lus, s.etat.commentaire.absentes, s.etat.commentaire.echecs, s.etat.commentaire.notes], [0, 20, 0, true]);
  assert.match(s.ligne.details.find((d) => d.startsWith('texte minute par minute')), /: 0 fichier lu, 20 langues absentes \(403 attendu : le fichier n’existe pas dans cette langue, jamais une panne\), 0 échec$/);
  // Une lecture réussie ensuite : les absences restent comptées, rien d'autre ne change.
  const apres = lancer().absentesPuisLue;
  assert.deepEqual([apres.suivi.texte.reussites, apres.suivi.texte.absentes, apres.suivi.texte.erreursDeSuite, apres.etat.etat], [1, 21, 0, 'ok']);
  // Au démarrage du serveur, avant la moindre réponse de l'API : des langues absentes sont déjà des notes (lues en mémoire, pas dans l'ancien fichier).
  const d = lancer().absentesSeulesAuDemarrage;
  assert.deepEqual([d.source, d.requetes, d.etat, d.commentaire.absentes, d.commentaire.lus, d.commentaire.echecs], ['memoire', 0, 'inconnu', 6, 0, 0]);
  assert.match(d.ligne, /: 0 fichier lu, 6 langues absentes \(403 attendu/);
});

test('ce qui n’est pas un 403 est un échec, avec sa nature : 401 accès refusé, 404 introuvable, 429 limite, 5xx serveur ; et la nature de chaque échec de lecture (réseau, délai, JSON illisible, fichier compressé abîmé)', () => {
  const s = lancer();
  const attendu = { 401: 'acces-refuse', 404: 'introuvable', 429: 'limite', 500: 'serveur', 503: 'serveur' };
  for (const [statut, nature] of Object.entries(attendu)) {
    const n = s.inattendus[statut];
    assert.deepEqual([n.requetes, n.reussites, n.echecs, n.absentes, n.nature, n.statut], [1, 0, 1, 0, nature, Number(statut)], `HTTP ${statut}`);
    assert.equal(n.message, `HTTP ${statut}`);
  }
  const natures = { reseau: 'reseau', delai: 'reseau', jsonIllisible: 'illisible', fichierAbime: 'illisible', erreurAutre: 'autre' };
  for (const [cas, nature] of Object.entries(natures)) {
    const n = s.natures[cas];
    assert.equal(n.lu, null, `${cas} : pas de texte, jamais une exception`);
    assert.deepEqual(n.demandes, ['400_en.json.gz'], `${cas} : une seule requête`);
    assert.deepEqual([n.requetes, n.reussites, n.echecs, n.nature], [1, 0, 1, nature], cas);
  }
  assert.match(s.natures.delai.message, /^délai dépassé \(30 ms\)$/);
  assert.match(s.natures.fichierAbime.message, /^fichier compressé illisible/);
});

// ====================================================================== 4. la série d'échecs du texte

test('trois fichiers de suite en échec : la ligne FotMob est « à surveiller », jamais « en panne » — la série d’échecs de FotMob (celle de l’API) n’est jamais touchée', () => {
  const { pas } = lancer().serie;
  assert.deepEqual(pas.map((p) => p.serieDuTexte), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(pas.map((p) => p.etat), ['ok', 'ok', 'a-surveiller', 'a-surveiller', 'a-surveiller', 'a-surveiller', 'a-surveiller', 'a-surveiller']);
  assert.ok(pas.every((p) => p.enPanne === false), 'jamais « en panne », même après huit échecs');
  assert.ok(pas.every((p) => p.serieDeFotMob === 0), 'la série de l’API reste à zéro');
  assert.equal(pas[2].raison, 'texte minute par minute de la revue (data.fotmob.com) : 3 fichiers en échec de suite (serveur FotMob en panne (5xx)), le dernier le 05/10/2026 à 14:00');
  assert.equal(pas[0].raison, null);
  const g = lancer().serie.suivi.global;
  assert.deepEqual([g.requetes, g.echecs, g.erreursDeSuite, g.derniereErreur], [1, 0, 0, null], 'les totaux de FotMob : la seule liste du jour notée avant les échecs du texte');
});

test('la série du texte : une langue absente au milieu ne la remet pas à zéro ni ne l’allonge ; une lecture réussie la remet à zéro ; plus de 24 h après, elle ne compte plus', () => {
  const s = lancer().serie;
  assert.deepEqual(s.apresAbsente, { serieDuTexte: 8, etat: 'a-surveiller' });
  assert.deepEqual(s.apresLecture, { serieDuTexte: 0, etat: 'ok', raison: null });
  // La raison compte la SÉRIE (3 de suite), pas tous les échecs depuis le démarrage (11 : huit avant la lecture réussie, trois depuis).
  assert.deepEqual(s.aVingtCinqHeures.aujourdhui, { etat: 'a-surveiller', serieDuTexte: 3, echecsEnTout: 11, raison: 'texte minute par minute de la revue (data.fotmob.com) : 3 fichiers en échec de suite (serveur FotMob en panne (5xx)), le dernier le 05/10/2026 à 14:00' });
  assert.deepEqual(s.aVingtCinqHeures.plusTard, { etat: 'ok', serieDuTexte: 3, raison: null }, 'trois échecs vieux de 25 heures : plus rien à surveiller');
});

// ====================================================================== 5. la forme, l'API

test('un fichier qui n’a pas la forme attendue (pas de « Events ») est noté lu mais de forme inattendue : FotMob « à surveiller », les champs manquants dits', () => {
  const s = lancer().forme;
  assert.equal(s.lu, null);
  assert.deepEqual(s.demandes, ['800_en.json.gz', '800_en_gen.json.gz']);
  assert.deepEqual([s.texte.requetes, s.texte.reussites, s.texte.formeInattendue, s.texte.erreursDeSuite], [2, 2, 2, 0]);
  assert.equal(s.etat, 'a-surveiller');
  assert.equal(s.raison, 'forme des réponses inattendue (texte minute par minute : Events)');
  assert.deepEqual(s.forme.manques, [{ champ: 'Events', n: 2 }]);
  assert.equal(s.forme.aSurveiller, true);
});

test('une panne de l’API de FotMob n’est jamais masquée par une lecture du texte : cinq refus de l’API, puis un fichier lu — toujours « en panne », la même série, la même dernière erreur', () => {
  const s = lancer().api;
  assert.deepEqual(s.avant, { etat: 'en-panne', enPanne: true, erreursDeSuite: 5, requetes: 5, echecs: 5 });
  assert.deepEqual(s.apresUneLectureDuTexte, { etat: 'en-panne', enPanne: true, erreursDeSuite: 5, requetes: 5, echecs: 5, lus: 1 });
  assert.deepEqual([s.derniereErreur.type, s.derniereErreur.nature, s.derniereErreur.statut], ['feuille-de-match', 'acces-refuse', 403]);
  // Un échec du texte ne devient pas non plus la dernière erreur de FotMob ; l'API qui répond remet SA série à zéro (l'accès refusé récent reste à surveiller, comme avant).
  assert.deepEqual(s.apresUnEchecDuTexte, { derniereErreur: 'feuille-de-match', erreursDeSuite: 5 });
  assert.deepEqual(s.apresRetour, { etat: 'a-surveiller', erreursDeSuite: 0 });
  // La dernière réponse réussie de FotMob est celle de l'API : un fichier du texte lu PLUS TARD ne la remplace pas, son échec ne devient pas la dernière erreur de FotMob.
  assert.deepEqual(lancer().derniereReussite, { fotmob: '2026-10-05T12:00:00.000Z', derniereErreur: null, texteLuLe: '2026-10-05T13:00:00.000Z', texteEnEchecLe: '2026-10-05T14:00:00.000Z', etat: 'ok' });
});

// ====================================================================== 6. le suivi enregistré, la ligne FotMob

test('le suivi enregistré en fin de passe garde le texte ; après un redémarrage (mémoire vide) la ligne FotMob le relit du fichier', () => {
  const s = lancer().persistance;
  assert.equal(s.ecrit, true);
  assert.deepEqual(s.dansLeFichier, s.enMemoire, 'le fichier de data/runtime porte la sorte « commentaire », absentes comprises');
  assert.deepEqual([s.dansLeFichier.reussites, s.dansLeFichier.echecs, s.dansLeFichier.absentes, s.dansLeFichier.erreursDeSuite], [1, 1, 1, 1]);
  assert.equal(s.source, 'fichier');
  assert.deepEqual([s.commentaire.lus, s.commentaire.absentes, s.commentaire.echecs, s.commentaire.erreursDeSuite, s.commentaire.derniereErreur.nature], [1, 1, 1, 1, 'serveur']);
  assert.equal(s.ligne, 'texte minute par minute (revue d’après-match, data.fotmob.com) : 1 fichier lu, 1 langue absente (403 attendu : le fichier n’existe pas dans cette langue, jamais une panne), 1 échec ; dernier échec le 05/10/2026 à 14:00 : serveur FotMob en panne (5xx) (HTTP 500)');
});

test('la ligne FotMob de « Santé des sources » : sans note, l’API seule, un fichier lu et une langue absente, trois échecs — la ligne de détail du texte, sa provenance, et l’état', () => {
  const l = lancer().lignes;
  const detail = (ligne) => ligne.details.filter((d) => d.startsWith('texte minute par minute'));
  const PROVENANCE = 'chaque réponse que l’actualisation reçoit déjà, notée par le serveur (aucune requête de plus) — le texte minute par minute que lit la revue d’après-match aussi, noté à part';
  for (const cle of ['sansNote', 'apiSeule', 'lectureEtAbsente', 'troisEchecs']) {
    assert.equal(detail(l[cle]).length, 1, `${cle} : une seule ligne de détail du texte`);
    assert.equal(l[cle].provenance, PROVENANCE, cle);
    assert.equal(l[cle].details.at(-1), 'si FotMob coupe l’accès : docs/plan-secours-fotmob.md', `${cle} : le reste du détail est là`);
  }
  assert.equal(detail(l.sansNote)[0], 'texte minute par minute (revue d’après-match, data.fotmob.com) : aucune lecture notée');
  assert.equal(detail(l.apiSeule)[0], 'texte minute par minute (revue d’après-match, data.fotmob.com) : aucune lecture notée');
  assert.equal(l.lectureEtAbsente.etat, 'ok');
  assert.equal(detail(l.lectureEtAbsente)[0], 'texte minute par minute (revue d’après-match, data.fotmob.com) : 1 fichier lu, 1 langue absente (403 attendu : le fichier n’existe pas dans cette langue, jamais une panne), 0 échec');
  assert.match(l.lectureEtAbsente.details.find((d) => d.startsWith('forme des réponses')), /liste du jour 1\/1 attendues, texte minute par minute 1\/1 attendues/);
  // Trois échecs : « à surveiller » (orange, jamais rouge), la raison dans le résumé ; les notes de l'API, elles, ne bougent pas.
  assert.deepEqual([l.troisEchecs.etat, l.troisEchecs.couleur, l.troisEchecs.libelleEtat], ['a-surveiller', 'orange', 'À surveiller']);
  assert.equal(l.troisEchecs.resume, 'À surveiller : texte minute par minute de la revue (data.fotmob.com) : 3 fichiers en échec de suite (serveur FotMob en panne (5xx)), le dernier le 05/10/2026 à 14:00.');
  assert.match(detail(l.troisEchecs)[0], /: 1 fichier lu, 1 langue absente \(.*\), 3 échecs ; dernier échec le 05\/10\/2026 à 14:00 : serveur FotMob en panne \(5xx\) \(HTTP 500\)$/);
  assert.equal(l.troisEchecs.details[0], l.lectureEtAbsente.details[0], 'les notes de l’API (réponses, échecs) : les mêmes avec ou sans les échecs du texte');
  assert.equal(l.troisEchecs.details[1], 'aucun échec noté', 'la dernière erreur de FotMob est celle de l’API : aucune');
  assert.deepEqual(l.troisEchecs.dernierReleve, l.lectureEtAbsente.dernierReleve, 'la dernière réponse réussie est celle de l’API');
});

// ====================================================================== 7. lecture du code

test('le code : chaque requête du texte est notée une fois (réponse refusée, réponse lue, exception), jamais une requête de plus ; relevesDesSources.js reste une feuille sans réseau', () => {
  const lecteur = sansCommentaires(src('data', 'providers', 'fotMobCommentaire.js'));
  assert.match(lecteur, /import \{ noterReponseFotmob \} from '\.\.\/relevesDesSources\.js';/);
  assert.equal((lecteur.match(/noterReponseFotmob\(/g) ?? []).length, 3, 'trois endroits : refusée, lue, exception');
  assert.match(lecteur, /noterReponseFotmob\(\{ url, ok: false, statut, erreur: new Error\(`HTTP \$\{statut \?\? 'sans statut'\}`\) \}\);\n\s+continue;/);
  assert.match(lecteur, /noterReponseFotmob\(\{ url, ok: true, payload: json \}\);/);
  assert.match(lecteur, /\} catch \(error\) \{\n\s+noterReponseFotmob\(\{ url, ok: false, statut, erreur: error \}\);/);
  // Une seule requête par langue : `fetchImpl` n'est appelé qu'à un endroit ; le seul `fetch` du fichier est celui de sa valeur par défaut ; rien d'autre ne sort.
  assert.equal((lecteur.match(/fetchImpl\(/g) ?? []).length, 1);
  assert.equal((lecteur.match(/\bfetch\(/g) ?? []).length, 1);
  assert.match(lecteur, /fetchImpl = \(\.\.\.a\) => globalThis\.fetch\(\.\.\.a\)/);
  assert.doesNotMatch(lecteur, /http\.request|https\.request|node:http/);
  // Les notes : aucune requête, aucun écrit autre que le suivi atomique de FotMob et le compteur d'API-Football.
  const notes = sansCommentaires(src('data', 'relevesDesSources.js'));
  assert.doesNotMatch(notes, /\bfetch\(|writeFileSync|fs\.write/);
  // Le 403 attendu n'est reconnu que pour le texte.
  assert.match(notes, /if \(!ok && type === 'commentaire' && Number\(statut\) === 403\) \{/);
});
