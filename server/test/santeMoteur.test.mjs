/**
 * « Santé du moteur » et les 6 s de la calibration (étape 24 du plan, 14/10/2026) : le serveur.
 *   node --test test/santeMoteur.test.mjs        (depuis server/)
 *
 * La route GET /api/engine-health ASSEMBLE des résumés déjà écrits, sans rien calculer ; la route de la calibration
 * (étape 20) ne calcule plus le mois en cours : l'étape de la nuit le prépare. Les mesures viennent du VRAI code,
 * dans une copie isolée de la base d'essai (cf. test/aides/script-sante-moteur.mjs) : 6 540 pronostics réglés sur
 * 436 matchs de septembre — le volume du 14/10 chez Pierre (6 469 sur 434, 6,2 s au premier appel, plus long
 * blocage 51 ms) —, heure figée au 30/09/2026.
 *
 *  1. La cause et la correction : avant la nuit, les routes lisent et disent « pas encore mesuré » (quelques ms,
 *     rien d'écrit) ; l'étape de la nuit prépare le mois en cours en rendant la main ; après, les routes lisent.
 *  2. Le plus long blocage : le gel d'août et la préparation de septembre, et la boucle d'événements vue
 *     d'un minuteur en parallèle, face au même calcul d'une traite.
 *  3. L'étape de la nuit : due tant que le mois en cours n'est pas préparé aujourd'hui, au clic ; une
 *     préparation qui échoue passe l'étape à « warn » sans toucher au gel ; tous les états du fichier préparé
 *     (absent, coupé, de forme inconnue, d'un autre mois, d'hier, du même jour de Paris, d'une autre version).
 *  4. L'assemblage : un bloc vide dit « pas encore mesuré », une lecture qui échoue n'emporte que son bloc.
 *  5. Les liens vers les vraies places, la route en lecture seule, rien de lourd dans la route.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const UI = path.resolve(SERVEUR, '..', 'ui');
const imp = (chemin) => import(pathToFileURL(chemin).href);
const S = await imp(path.join(SERVEUR, 'src', 'data', 'santeDuMoteur.js'));
const lire = (...morceaux) => fs.readFileSync(path.join(SERVEUR, ...morceaux), 'utf8');
const lireUi = (...morceaux) => fs.readFileSync(path.join(UI, 'src', ...morceaux), 'utf8');
/** Le code seul d'un fichier (les commentaires disent pourquoi : ils ne comptent pas). */
const codeSeul = (texte) => texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** Le texte d'une fonction de premier niveau, de son en-tête à son accolade fermante en colonne 0. */
function fonctionDe(source, nom) {
  const debut = source.search(new RegExp(`(?:export )?(?:async )?function\\*? ${nom}\\(`));
  assert.ok(debut >= 0, `fonction introuvable : ${nom}`);
  return source.slice(debut, source.indexOf('\n}\n', debut) + 3);
}

/** Une phase du script d'essai, lancée UNE fois dans une copie isolée ; son échec est mémorisé aussi (chaque test qui en dépend le revoit sans relancer 8 s de script). */
const phases = new Map();
function phase(nom) {
  if (!phases.has(nom)) {
    const copie = preparerCopie({});
    try {
      fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
      const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-sante-moteur.mjs'), { args: [nom], maintenant: '2026-09-30T12:00:00.000Z', timeout: 300_000 });
      try {
        assert.equal(r.code, 0, r.erreurs.slice(-3000));
        assert.equal(r.reseau, false);
        phases.set(nom, { json: r.json });
      } catch (erreur) {
        phases.set(nom, { erreur });
      }
    } finally {
      copie.nettoyer();
    }
  }
  const p = phases.get(nom);
  if (p.erreur) throw p.erreur;
  return p.json;
}
const volume = () => phase('volume');

const etats = () => phase('etats').etats;

// ============================================== 1. la cause et la correction

test('cause : le bilan du mois en cours prenait 1,7 s (6 s à froid) DANS la requête ; il est maintenant préparé par la nuit et les routes ne font que le lire — avant la nuit, « pas encore mesuré » en quelques ms, rien d’écrit', () => {
  const v = volume();
  assert.deepEqual([v.plantes.septembre.rencontres, v.plantes.septembre.lignes], [436, 19620], 'le volume du 14/10 chez Pierre : 6 540 pronostics réglés sur 436 matchs, trois révisions');
  // Le même calcul, d'une traite, est ce que la requête devait attendre.
  assert.ok(v.synchrone.ms >= 100, `le calcul d’une traite : ${v.synchrone.ms} ms`);
  assert.deepEqual([v.synchrone.reglees, v.synchrone.matchs, v.synchrone.geles], [6540, 436, 6540]);
  // Avant la nuit : la route de la calibration ne calcule pas, elle dit pourquoi.
  const c = v.avant.calibration;
  assert.equal(c.code, 200);
  assert.equal(c.bilan, null, 'aucun bilan calculé à la demande');
  assert.equal(c.preparation.etat, 'absente');
  assert.ok(c.ms < Math.max(100, v.synchrone.ms / 2), `la route avant la nuit : ${c.ms} ms, face à ${v.synchrone.ms} ms de calcul`);
  assert.deepEqual(c.disponibles, [['2026-09', 'en-cours'], ['2026-08', 'a-figer']], 'les mois qu’on peut regarder, sans rien calculer');
  assert.equal(v.avant.fichierPresent, false, 'une lecture n’écrit rien');
  // Santé du moteur : les blocs de la calibration et de la clôture restent là, « pas encore mesuré ».
  const s = v.avant.sante;
  assert.equal(s.code, 200);
  assert.deepEqual(s.calibration, ['pas-mesure', 'pas encore mesuré']);
  assert.equal(s.cloture, 'pas-mesure');
  assert.ok(s.ms < Math.max(250, v.synchrone.ms / 2), `la page avant la nuit : ${s.ms} ms`);
  // Après la nuit : lues, pas calculées.
  for (const [nom, r] of [['la page', v.apres.sante], ['la calibration', v.apres.calibration]]) {
    assert.deepEqual([...new Set(r.codes)], [200], nom);
    assert.ok(r.plusLenteMs < Math.max(100, v.synchrone.ms / 2), `${nom} lue : ${r.plusLenteMs} ms au plus, face à ${v.synchrone.ms} ms de calcul`);
  }
  assert.equal(v.apres.calibration.preparation.etat, 'prepare');
  assert.equal(v.apres.sante.calibration, 'ok');
  assert.equal(v.apres.sante.cloture, 'ok');
  assert.ok(v.apres.sante.octets < 40_000, `la page reste un résumé : ${v.apres.sante.octets} octets`);
  assert.ok(v.apres.sante.octets < v.apres.calibration.octets / 2, 'bien moins que le grand bilan de la calibration');
});

test('le bilan préparé est le MÊME calcul que celui d’une traite (la nuit ne change aucun chiffre), et la page et la calibration disent les mêmes nombres ; ce que lit la page est l’essentiel du bilan, pas le bilan', () => {
  const v = volume();
  assert.ok(v.resume.octets < 40_000, `le résumé lu par la page : ${v.resume.octets} octets`);
  assert.deepEqual(v.resume.clesDuBilan, ['mois', 'fige', 'figeLe', 'enCours', 'calculeLe', 'jusquAu', 'pronostics', 'premiere', 'paris']);
  assert.deepEqual([v.resume.vues, v.resume.parMarche], [false, false], 'ni les vues entières ni les tableaux par marché');
  assert.equal(v.memeCalcul, true, 'préparé = calculerBilan, au calculeLe et à la durée près');
  assert.deepEqual(v.apres.sante.global, v.apres.calibration.global);
  assert.equal(v.apres.memeBilanQueLaPage, true, 'les dix tranches annoncé / réalisé de la page sont celles de la calibration');
  assert.deepEqual(v.apres.sante.geles, { reglees: 6540, matchs: 436, geles: 6540 });
  assert.equal(v.apres.calibration.geles, 6540);
  assert.equal(v.apres.sante.mois, '2026-09');
  assert.equal(v.apres.calibration.preparation.calculeLe, '2026-09-30T12:00:00.000Z');
});

test('mois écoulés : août, figé par la nuit, est rendu tel quel ; un mois sans aucun pronostic gelé ou pas encore figé dit pourquoi et n’est jamais calculé', () => {
  const v = volume();
  assert.deepEqual([v.apres.aout.fige, v.apres.aout.etat], [true, 'fige']);
  assert.ok(v.apres.aout.ms < Math.max(100, v.synchrone.ms / 2));
  assert.equal(v.apres.juillet.bilan, null);
  assert.equal(v.apres.juillet.etat, 'sans-pronostic');
  assert.deepEqual(v.apres.calibration.figes, [['2026-08', true, 4455]]);
  assert.deepEqual(v.apres.calibration.disponibles, [['2026-09', 'en-cours'], ['2026-08', 'fige']]);
  // L’évolution de la note vient des mois figés : août.
  assert.deepEqual(v.apres.sante.evolution, [['2026-08', 4455]]);
});

// ============================================== 2. le plus long blocage

test('le plus long blocage : le gel d’août et la préparation de septembre rendent la main (moins de 250 ms d’affilée, la boucle d’événements jamais retardée de plus de 250 ms), là où le même calcul d’une traite tient tout', () => {
  const v = volume();
  const e = v.etape;
  assert.ok(e.gel.blocMaxMs < 250, `gel d’août : ${e.gel.blocMaxMs} ms au plus d’affilée`);
  assert.ok(e.preparation.blocMaxMs < 250, `préparation de septembre : ${e.preparation.blocMaxMs} ms au plus d’affilée`);
  assert.ok(e.retardMaxBoucleMs < 250, `un minuteur de 5 ms en parallèle : ${e.retardMaxBoucleMs} ms de retard au plus`);
  // Le travail est bien découpé : il dure plusieurs fois son plus long bloc, et moins d’un bloc qui tiendrait tout le calcul.
  assert.ok(e.preparation.dureeMs >= 3 * e.preparation.blocMaxMs, `${e.preparation.dureeMs} ms de travail pour ${e.preparation.blocMaxMs} ms au plus d’affilée`);
  assert.ok(v.synchrone.ms >= 2 * e.preparation.blocMaxMs, `d’une traite : ${v.synchrone.ms} ms ; en rendant la main : ${e.preparation.blocMaxMs} ms au plus d’affilée`);
  // Les routes, elles, ne tiennent le serveur que le temps d’une lecture.
  assert.ok(v.apres.sante.plusLenteMs < 250);
  assert.ok(v.apres.calibration.plusLenteMs < 250);
  assert.deepEqual([e.preparation.fait, e.preparation.mois, e.preparation.geles, e.preparation.reglees, e.preparation.matchs], [true, '2026-09', 6540, 6540, 436]);
});

// ============================================== 3. l'étape de la nuit

test('étape « calibrationMensuelle » : due tant que le mois en cours n’a pas été préparé aujourd’hui ou qu’un mois attend son gel, et au clic ; elle écrit un seul petit fichier, le gel d’août garde sa phrase', () => {
  const v = volume();
  assert.deepEqual(v.due, { avant: true, apres: false, auClic: true });
  assert.equal(v.fichierEcrit.present, true);
  assert.ok(v.fichierEcrit.octets > 10_000 && v.fichierEcrit.octets < 500_000, `${v.fichierEcrit.octets} octets`);
  assert.equal(v.etape.status, 'warn', 'la dérive d’août (pronostics tirés au hasard) est dite : l’étape passe à « à regarder »');
  assert.match(v.etape.summary.replace(/[\u202f\u00a0]/g, ' '), /^août 2026 figé : 4 455 pronostics réglés sur 4 500 pronostics gelés/);
  assert.deepEqual(v.etape.gel.figes, [['2026-08', true]]);
});

test('une seconde passe juste après ne refait rien : rien à figer, mois en cours déjà préparé aujourd’hui — aucune phrase de plus, aucun calcul', () => {
  const v = volume();
  assert.equal(v.seconde.status, 'ok');
  assert.equal(v.seconde.summary, 'Rien à figer : aucun mois écoulé n’attend son bilan.');
  assert.deepEqual(v.seconde.preparation, { fait: false, raison: 'déjà préparé aujourd’hui' });
  assert.ok(v.seconde.ms < v.etape.preparation.dureeMs, `${v.seconde.ms} ms pour ne rien faire, face à ${v.etape.preparation.dureeMs} ms de calcul`);
});

test('un clic « Actualiser » refait la préparation du mois en cours même si elle est du jour, et le dit ; rien n’est figé de plus', () => {
  const v = volume();
  assert.equal(v.clic.status, 'ok');
  assert.equal(v.clic.preparation.fait, true);
  assert.deepEqual([v.clic.preparation.mois, v.clic.preparation.reglees, v.clic.preparation.geles], ['2026-09', 6540, 6540]);
  assert.match(v.clic.summary.replace(/[\u202f\u00a0]/g, ' '), /^Rien à figer : aucun mois écoulé n’attend son bilan\. Mois en cours préparé : septembre 2026, 6 540 pronostics réglés sur 6 540 pronostics gelés \(première valeur\), en .* \(le serveur jamais tenu plus de \d+ ms d'affilée\) — Calibration du mois et Santé du moteur le lisent sans rien calculer\.$/);
});

test('le fichier du mois préparé dans tous ses états : absent, coupé en deux, de forme inconnue, sans vues, d’un autre mois, d’une autre version ou forme, d’hier, du même jour de Paris, d’aujourd’hui — ce que dit la route et ce que fait la passe', () => {
  const e = etats();
  // Absent : la route le dit « absente » ; août (fini, des pronostics) attend son gel, juin n’a aucun pronostic, juillet est figé.
  assert.deepEqual(e.absent.defaut, [null, 'absente']);
  assert.deepEqual(e.absent.aout, [null, 'a-figer']);
  assert.deepEqual(e.absent.juin, [null, 'sans-pronostic']);
  assert.deepEqual(e.absent.juillet, ['2026-07', 'fige']);
  assert.deepEqual(e.absent.afaire, { afaire: true, raison: 'jamais préparé' });
  assert.equal(e.absent.due, true);
  // Coupé en deux, de forme inconnue, un bilan sans vues : « illisible » (jamais lu de travers), à refaire.
  assert.deepEqual(e.coupe.defaut, [null, 'illisible']);
  assert.deepEqual(e.coupe.afaire, { afaire: true, raison: 'fichier illisible' });
  assert.deepEqual(e.formeInconnue.defaut, [null, 'illisible']);
  assert.deepEqual(e.formeInconnue.afaire, { afaire: true, raison: 'fichier illisible' });
  assert.deepEqual(e.sansVues.defaut, [null, 'illisible']);
  assert.equal(e.sansVues.lu, 'illisible');
  // Préparé pour le mois d’avant : « ancienne », jamais servi pour le mois en cours.
  assert.equal(e.autreMois.mois, '2026-08');
  assert.deepEqual(e.autreMois.defaut, [null, 'ancienne']);
  assert.deepEqual(e.autreMois.afaire, { afaire: true, raison: 'autre mois' });
  // Une autre version du calcul ou une autre forme de fichier : « ancienne », à refaire.
  assert.deepEqual(e.autreVersion.defaut, [null, 'ancienne']);
  assert.deepEqual(e.autreVersion.afaire, { afaire: true, raison: 'autre forme du calcul' });
  assert.deepEqual(e.autreFormat.defaut, [null, 'ancienne']);
  assert.deepEqual(e.autreFormat.afaire, { afaire: true, raison: 'autre forme du calcul' });
  // Préparé hier : la route le lit quand même (c’est le dernier bilan), mais la passe le refait ; du même jour de Paris (22 h 30 UTC la veille) : rien à refaire.
  assert.deepEqual(e.hier.defaut, ['2026-09', 'prepare']);
  assert.deepEqual(e.hier.afaire, { afaire: true, raison: 'calculé un autre jour' });
  assert.deepEqual(e.memeJourDeParis.afaire, { afaire: false, raison: null }, 'le jour est celui de Paris, pas celui d’UTC');
  // Préparé aujourd’hui : rien à refaire, mais un mois à figer rend l’étape due quand même.
  assert.deepEqual(e.aujourdhui.defaut, ['2026-09', 'prepare']);
  assert.deepEqual(e.aujourdhui.afaire, { afaire: false, raison: null });
  assert.equal(e.aujourdhui.due, true, 'août attend son gel : due même si le mois en cours est préparé');
  // Le gel fait : plus rien à faire, sauf au clic.
  assert.equal(e.apresGel.due, false);
  assert.equal(e.apresGel.auClic, true);
  assert.deepEqual(e.apresGel.aout, ['2026-08', 'fige']);
  assert.deepEqual(e.apresGel.defaut, ['2026-09', 'prepare']);
});

test('jour de gel avec une préparation qui échoue : le mois écoulé est figé ET l’étape le dit (une phrase de plus, « warn ») ; sans fichier préparé, la page retombe sur le dernier mois figé et le dit', () => {
  const e = etats();
  assert.equal(e.gelEtEchec.status, 'warn');
  assert.deepEqual(e.gelEtEchec.figes, [['2026-07', true]]);
  assert.match(e.gelEtEchec.resume.replace(/[\u202f\u00a0]/g, ' '), /^juillet 2026 figé : 411 pronostics réglés sur 600 pronostics gelés \(première valeur, 40 matchs\)/);
  assert.match(e.gelEtEchec.resume, / Le détail est dans Historique moteur › Calibration du mois\. Mois en cours non préparé — .* : repris à la passe suivante\.$/);
  assert.equal(e.gelEtEchec.preparation.fait, false);
  assert.deepEqual(e.repliSurLeDernierFige, { mois: '2026-08', etatDuMois: 'figé', etat: 'ok', cloture: '2026-08', action: 'figé' });
});

test('une préparation qui échoue (fichier impossible à écrire) : l’étape passe à « warn » et le dit, sans lever ; le gel d’août n’est pas touché ; elle reste due à la passe suivante', () => {
  const v = volume();
  assert.equal(v.echec.status, 'warn');
  assert.match(v.echec.summary, /^Rien à figer : aucun mois écoulé n’attend son bilan\. Mois en cours non préparé — .* : repris à la passe suivante\.$/);
  assert.equal(v.echec.preparation.fait, false);
  assert.match(v.echec.preparation.erreur, /EEXIST|ENOTDIR|EPERM/);
  assert.equal(v.echec.dueApres, true);
  assert.equal(v.augGele, 1, 'août reste figé, une seule ligne');
});

// ============================================== 4. l'assemblage

const maintenant = Date.parse('2026-10-14T08:00:00.000Z');
const CLES_DES_FEUX = ['donnees', 'sauvegardes', 'budget'];
const CLES_DES_BLOCS = ['note', 'calibration', 'cloture', 'aVerifier', 'versions', 'corrections'];
const LECTEURS_VIDES = Object.freeze({
  controle: () => ({ etat: 'jamais', raison: 'pas encore de contrôle : il se fait à la fin de la prochaine passe d’actualisation', le: null, compte: {}, enEchec: [], aVerifier: { clubs: 0, ligues: 0, global: 0 } }),
  sauvegardes: () => ({ alertes: [], derniereReussie: null, derniere: null, dossier: null }),
  budget: () => ({ aujourdhui: {}, cetteSemaine: {}, mode: {}, journal: {} }),
  banc: () => ({ note: null, dernier: null, rejeux: 0 }),
  calibration: () => ({ moisEnCours: '2026-10', preparation: { etat: 'absente' }, bilan: null, figes: [], prochainGel: { mois: '2026-10', le: '2026-11-01', heure: 6 }, juge: {}, version: 1 }),
  versions: () => ({ versions: { source: 'absent' }, derive: { dernierMois: null, moisFiges: 0 } }),
  corrections: () => ({ disponible: false, aAccepter: [] })
});

test('un bloc dont la donnée manque RESTE affiché, avec « pas encore mesuré » et pourquoi, sa source, son lien : les trois feux et les six blocs, aucun calcul', () => {
  const r = S.assemblerLaSante({ maintenant, lecteurs: LECTEURS_VIDES });
  assert.deepEqual(r.feux.map((f) => f.cle), CLES_DES_FEUX);
  assert.deepEqual(Object.keys(r.blocs), CLES_DES_BLOCS);
  for (const b of [...r.feux, ...Object.values(r.blocs)]) {
    assert.equal(b.etat, 'pas-mesure', b.cle);
    assert.equal(b.valeur, 'pas encore mesuré', b.cle);
    assert.match(b.phrase, /^Pas encore mesuré : \S/, b.cle);
    assert.equal(b.feu, null, `${b.cle} : pas de feu sur du vide`);
    assert.ok(b.titre && b.source?.libelle && b.action, `${b.cle} : titre, source et ce qui a été fait de la mesure`);
    assert.equal(b.mesureLe, null, `${b.cle} : pas d’heure inventée`);
  }
  // Les liens restent là, même vides — sauf la place réservée des corrections, qui pointe vers l’étape 26.
  for (const b of [...r.feux, ...Object.values(r.blocs)]) assert.ok(b.lien?.chemin && b.lien?.libelle, `${b.cle} : un lien vers sa vraie place`);
  // Le bloc de la calibration dit la raison et le premier gel ; celui des corrections dit l’étape 26.
  assert.match(r.blocs.calibration.phrase, /préparé chaque nuit par l’actualisation/);
  assert.match(r.blocs.calibration.phrase, /La page ne le calcule jamais/);
  assert.equal(r.blocs.calibration.prochainGel.le, '2026-11-01');
  assert.match(r.blocs.note.evolution.length === 0 ? 'vide' : 'pas vide', /^vide$/);
  assert.equal(r.blocs.corrections.etape, '26');
  assert.match(r.blocs.corrections.phrase, /étape 26/);
  assert.deepEqual(r.blocs.corrections.aAccepter, []);
  assert.equal(r.genereLe, '2026-10-14T08:00:00.000Z');
  assert.ok(Number.isFinite(r.dureeMs) && r.dureeMs < 250);
  assert.deepEqual(r.lectures.map((l) => l.nom), ['controle', 'sauvegardes', 'budget', 'banc', 'calibration', 'versions', 'corrections']);
  assert.ok(r.lectures.every((l) => l.ok && Number.isFinite(l.ms)));
});

test('une lecture qui échoue, ou qui rend n’importe quoi, n’emporte que son bloc (« illisible » avec la raison) : les autres blocs sont identiques, la page reste debout', () => {
  const normal = S.assemblerLaSante({ maintenant, lecteurs: LECTEURS_VIDES });
  const casse = S.assemblerLaSante({
    maintenant,
    lecteurs: {
      ...LECTEURS_VIDES,
      budget: () => {
        throw new Error('journal des appels tenu par OneDrive');
      },
      controle: () => null
    }
  });
  const budget = casse.feux.find((f) => f.cle === 'budget');
  assert.equal(budget.etat, 'indisponible');
  assert.match(budget.phrase, /^Illisible pour l’instant : journal des appels tenu par OneDrive\. Le reste de la page n’est pas touché\.$/);
  assert.equal(casse.feux.find((f) => f.cle === 'donnees').etat, 'indisponible', 'une lecture qui rend null est un bloc illisible, pas une page cassée');
  assert.equal(casse.blocs.aVerifier.etat, 'indisponible');
  assert.deepEqual(casse.lectures.filter((l) => !l.ok).map((l) => l.nom), ['budget']);
  // Les autres blocs (ceux qui ne lisent ni le budget ni le contrôle) sont à l’identique.
  for (const cle of ['note', 'calibration', 'cloture', 'versions', 'corrections']) assert.deepEqual(casse.blocs[cle], normal.blocs[cle], cle);
  assert.deepEqual(casse.feux.find((f) => f.cle === 'sauvegardes'), normal.feux.find((f) => f.cle === 'sauvegardes'));
  for (const b of [...casse.feux, ...Object.values(casse.blocs)]) assert.ok(b.titre && b.source?.libelle && b.lien?.chemin, `${b.cle} garde son cadre`);
});

test('les trois feux et les blocs sur des lectures réalistes : feu, chiffre, phrase, source et heure de la mesure — le vert seulement quand rien n’est à regarder', () => {
  const r = S.assemblerLaSante({
    maintenant,
    lecteurs: {
      ...LECTEURS_VIDES,
      controle: () => ({ etat: 'pret', feu: 'orange', le: '2026-10-14T02:31:00.000Z', fichier: 'data/runtime/controle-quotidien.json', compte: { vert: 25, orange: 10, rouge: 0, erreur: 0, nonFait: 0 }, enEchec: [{ cle: 'a', libelle: 'Zéros « non relevé »', statut: 'orange', constat: 'cartons jaunes à 0 dans 17 championnats', total: 17 }], aVerifier: { clubs: 6, ligues: 17, global: 1 } }),
      sauvegardes: () => ({ alertes: [{ niveau: 'danger', code: 'x', texte: 'Dernière sauvegarde réussie le 05/10, il y a 9 jours.' }], derniereReussie: { fin: '2026-10-05T18:45:00.000Z' }, derniere: { ok: true }, dossier: 'C:/sauvegardes', etatPrepareLe: '2026-10-14T01:00:00.000Z' }),
      budget: () => ({ generatedAt: '2026-10-14T08:00:00.000Z', aujourdhui: { part: 0.63, budget: 1_200_000, tokens: { total: 760_000 } }, cetteSemaine: { part: 0.4, budget: 6_000_000, tokens: { total: 2_400_000 } }, mode: { econome: false, raison: 'Mode normal : 63 % du budget du jour' }, journal: { dossier: 'data/runtime/claude' } })
    }
  });
  const [donnees, sauvegardes, budget] = r.feux;
  assert.deepEqual([donnees.feu, donnees.etat, donnees.valeur, donnees.legende], ['orange', 'attention', '10 contrôles à regarder', 'sur 35 contrôles']);
  assert.equal(donnees.mesureLe, '2026-10-14T02:31:00.000Z');
  assert.match(donnees.phrase, /^Contrôle du 14\/10\/2026 à 04 h 31 : 25 verts, 10 orange, 0 rouge\.$/);
  assert.deepEqual([sauvegardes.feu, sauvegardes.valeur], ['rouge', 'le 05/10/2026']);
  assert.match(sauvegardes.phrase, /^1 point à regarder : Dernière sauvegarde réussie le 05\/10, il y a 9 jours\.$/);
  assert.deepEqual([budget.feu, budget.etat, budget.valeur], ['vert', 'ok', '63 %']);
  assert.match(budget.phrase.replace(/[\u202f\u00a0]/g, ' '), /^Aujourd’hui 0,76 M tokens sur 1,2 M \(63 %\) ; cette semaine 2,4 M sur 6 M \(40 %\)\. Mode normal : 63 % du budget du jour/);
  // Une alerte sans point final garde sa dernière lettre (la phrase ne coupe rien) ; plusieurs alertes : la première, puis le compte des autres.
  const sansPoint = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, sauvegardes: () => ({ alertes: [{ niveau: 'warning', code: 'y', texte: 'Copie hors du disque non réglée' }, { niveau: 'warning', code: 'z', texte: 'Autre' }], derniereReussie: { fin: '2026-10-14T01:00:00.000Z' } }) } });
  assert.equal(sansPoint.feux[1].phrase, '2 points à regarder : Copie hors du disque non réglée (et 1 autre).');
  assert.equal(sansPoint.feux[1].feu, 'orange');
  // Un feu que le serveur ne connaît pas n'est jamais un vert inventé : pas de feu, « à regarder ».
  const inconnu = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, controle: () => ({ etat: 'pret', feu: 'violet', le: '2026-10-14T02:31:00.000Z', compte: { vert: 35, orange: 0, rouge: 0, erreur: 0, nonFait: 0 }, enEchec: [], aVerifier: { clubs: 0, ligues: 0, global: 0 } }) } });
  assert.deepEqual([inconnu.feux[0].feu, inconnu.feux[0].etat, inconnu.feux[0].valeur], [null, 'attention', 'tout est vert']);
  // « À vérifier » : la liste et les comptes viennent du contrôle quotidien.
  assert.deepEqual([r.blocs.aVerifier.etat, r.blocs.aVerifier.clubs, r.blocs.aVerifier.ligues, r.blocs.aVerifier.enEchec.length], ['attention', 6, 17, 1]);
  assert.match(r.blocs.aVerifier.phrase, /^Les pronostics de 6 clubs et de 17 championnats portent le badge « à vérifier »/);
  // Les mots du budget : dépassé = rouge, mode économe = orange.
  const depasse = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, budget: () => ({ aujourdhui: { part: 1.2, budget: 1_000_000, tokens: { total: 1_200_000 } }, cetteSemaine: { part: 0.5 }, mode: { econome: true }, journal: {} }) } });
  assert.equal(depasse.feux[2].feu, 'rouge');
  const econome = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, budget: () => ({ aujourdhui: { part: 0.85 }, cetteSemaine: { part: 0.5 }, mode: { econome: true }, journal: {} }) } });
  assert.equal(econome.feux[2].feu, 'orange');
});

/** Un bilan « essentiel » comme le rend resumeDeLaCalibration : la case de tous les marchés (lecture principale) et la valeur de clôture. */
const bilanEssentiel = ({ mois = '2026-10', fige = false, enCours = true, cloture = { eligibles: 40, sansCoteGratuite: 160, mesures: 12, moyenne: 1.2, positifs: 7, approx: 0, parMarche: [], raisons: [], juge: { verdict: 'trop-peu', matchs: 12, minimum: 200, fourchette: null } }, global } = {}) => ({
  mois,
  fige,
  figeLe: fige ? '2026-11-01T07:00:00.000Z' : null,
  enCours,
  calculeLe: '2026-10-14T02:31:00.000Z',
  jusquAu: '2026-10-14',
  pronostics: { geles: 100, aVenir: { pronostics: 20, matchs: 2 } },
  premiere: {
    reglees: 80,
    matchs: 60,
    global: global ?? { pronostics: 80, matchs: 60, annonce: 0.612, realise: 0.598, ecart: -0.014, juge: { verdict: 'trop-peu', matchs: 60, minimum: 200, ecart: -0.014, fourchette: null }, tranches: [] },
    cloture
  },
  paris: { cloture: { paris: 3, combines: 0, aVenir: 0, mesures: 2, moyenne: -0.8, positifs: 1, raisons: [], juge: { verdict: 'trop-peu', matchs: 2, minimum: 200, fourchette: null } } }
});
const lecteurCalibration = (bilan, figes = []) => () => ({ moisEnCours: '2026-10', preparation: { etat: 'prepare' }, bilan, figes, prochainGel: { mois: '2026-10', le: '2026-11-01', heure: 6 }, juge: { minBlocs: 200 }, version: 1 });

test('la calibration et la clôture sur un bilan préparé : le mois et son état, annoncé et réalisé en pour cent, l’écart en points, la baisse ou la hausse de la cote juste, l’heure du calcul — et l’évolution des mois figés, du plus ancien au plus récent (douze au plus)', () => {
  const r = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, calibration: lecteurCalibration(bilanEssentiel()) } });
  const c = r.blocs.calibration;
  assert.equal(c.etat, 'ok');
  assert.equal(c.valeur, '−1,4 point');
  assert.equal(c.legende, 'réalisé moins annoncé, tous marchés, octobre 2026 (en cours)');
  assert.match(c.phrase, /^Octobre 2026 \(en cours\) : le moteur annonçait 61,2 % en moyenne, il est arrivé 59,8 % — 80 pronostics réglés sur 60 matchs\. Les courbes, marché par marché et par championnat, sont dans Historique moteur\.$/);
  assert.deepEqual([c.mois, c.etatDuMois, c.mesureLe, c.action], ['2026-10', 'en cours', '2026-10-14T02:31:00.000Z', 'préparé']);
  assert.deepEqual(c.pronostics, { reglees: 80, matchs: 60, geles: 100 });
  // La clôture : la cote juste a BAISSÉ de 1,2 % (le marché a donné raison), puis MONTÉ.
  const k = r.blocs.cloture;
  assert.equal(k.valeur, '+1,2 %');
  assert.match(k.phrase, /^La cote juste a baissé de 1,2 % en moyenne entre le gel du pronostic et la clôture \(12 pronostics mesurés\) : le marché a plutôt donné raison au moteur\. Vos paris simples : −0,8 % sur 2 paris mesurés\./);
  const negatif = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, calibration: lecteurCalibration(bilanEssentiel({ cloture: { eligibles: 40, sansCoteGratuite: 0, mesures: 12, moyenne: -2.5, positifs: 3, approx: 0, parMarche: [], raisons: [], juge: { verdict: 'negative', matchs: 300, minimum: 200, fourchette: [-4, -1] } } })) } });
  assert.equal(negatif.blocs.cloture.valeur, '−2,5 %');
  assert.match(negatif.blocs.cloture.phrase, /^La cote juste a monté de 2,5 % en moyenne .* le marché est plutôt allé contre le moteur\./);
  // Un mois figé : « figé », l’heure du gel.
  const fige = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, calibration: lecteurCalibration(bilanEssentiel({ mois: '2026-09', fige: true, enCours: false })) } });
  assert.deepEqual([fige.blocs.calibration.etatDuMois, fige.blocs.calibration.mesureLe, fige.blocs.calibration.action], ['figé', '2026-11-01T07:00:00.000Z', 'figé']);
  // Aucun pronostic réglé encore : « pas encore mesuré » (jamais un écart inventé), les pronostics gelés sont dits.
  const rien = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, calibration: lecteurCalibration(bilanEssentiel({ global: { pronostics: 0, matchs: 0, annonce: null, realise: null, ecart: null, juge: null, tranches: [] }, cloture: { eligibles: 0, sansCoteGratuite: 0, mesures: 0, moyenne: null, positifs: 0, approx: 0, parMarche: [], raisons: [], juge: null } })) } });
  assert.equal(rien.blocs.calibration.valeur, 'pas encore mesuré');
  assert.match(rien.blocs.calibration.phrase, /aucun pronostic réglé pour l’instant \(100 pronostics gelés, les résultats arrivent\)\./);
  assert.equal(rien.blocs.cloture.valeur, 'pas encore mesurée');
  // L’évolution : les mois figés du plus ancien au plus récent, douze au plus.
  const figes = Array.from({ length: 14 }, (_, i) => ({ mois: `2026-${String(14 - i).padStart(2, '0')}`.replace('2026-13', '2027-01').replace('2026-14', '2027-02'), pronostics: 10 + i, matchs: 5, annonce: 0.5, realise: 0.5, ecart: 0, verdict: 'dans-le-hasard' }));
  const evo = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, calibration: lecteurCalibration(null, figes) } }).blocs.note.evolution;
  assert.equal(evo.length, 12);
  assert.deepEqual(evo.map((m) => m.mois), [...evo.map((m) => m.mois)].sort(), 'du plus ancien au plus récent');
  assert.equal(evo.at(-1).mois, figes[0].mois, 'le plus récent est le dernier');
  assert.equal(evo[0].mois, figes[11].mois);
});

test('les feux : un budget de la SEMAINE dépassé est rouge, un journal des appels qui a un souci est orange ; les contrôles en panne ou pas faits comptent ; la liste « à vérifier » s’arrête à six, le reste est compté', () => {
  const semaine = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, budget: () => ({ aujourdhui: { part: 0.3, budget: 1_200_000, tokens: { total: 360_000 } }, cetteSemaine: { part: 1.05, budget: 6_000_000, tokens: { total: 6_300_000 } }, mode: { econome: false }, journal: {} }) } });
  assert.equal(semaine.feux[2].feu, 'rouge');
  const souci = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, budget: () => ({ aujourdhui: { part: 0.3, budget: 1_200_000, tokens: { total: 360_000 } }, cetteSemaine: { part: 0.1 }, mode: { econome: false }, journal: { erreur: 'écriture en attente' } }) } });
  assert.equal(souci.feux[2].feu, 'orange');
  assert.match(souci.feux[2].phrase, /le journal des appels a un souci \(écriture en attente\)\./);
  const enEchec = Array.from({ length: 8 }, (_, i) => ({ cle: `c${i}`, libelle: `Contrôle ${i}`, statut: 'orange', constat: 'x'.repeat(300), total: i }));
  const controle = S.assemblerLaSante({
    maintenant,
    lecteurs: { ...LECTEURS_VIDES, controle: () => ({ etat: 'pret', feu: 'rouge', le: '2026-10-14T02:31:00.000Z', compte: { vert: 20, orange: 1, rouge: 0, erreur: 2, nonFait: 1 }, enEchec, aVerifier: { clubs: 1, ligues: 0, global: 0 } }) }
  });
  assert.deepEqual([controle.feux[0].valeur, controle.feux[0].legende, controle.feux[0].feu], ['3 contrôles à regarder', 'sur 24 contrôles', 'rouge']);
  assert.match(controle.feux[0].phrase, /^Contrôle du 14\/10\/2026 à 04 h 31 : 20 verts, 1 orange, 0 rouge, 2 en panne, 1 pas fait\.$/);
  const v = controle.blocs.aVerifier;
  assert.deepEqual([v.enEchec.length, v.enEchecTotal, v.valeur], [6, 8, '8 contrôles en échec']);
  assert.equal(v.enEchec[0].constat.length, 200, 'un constat trop long est coupé');
});

test('la version du moteur, la candidate et la dérive : la version en service, la candidate en essai, « pas encore jugée » sans mois figé, la dérive dite quand elle est là', () => {
  const versions = (derive) => () => ({
    versions: { source: 'enregistre', fichier: 'data/runtime/engine-versions.json', majLe: '2026-10-12T16:14:14.019Z', enService: { numero: 2, creeeLe: '2026-10-12T16:14:14.019Z', pourquoi: null }, enSynchro: true, candidate: null, adoption: { possible: true, texte: '…' } },
    derive
  });
  const sans = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, versions: versions({ dernierMois: null, moisFiges: 0, alerte: null, probleme: null }) } }).blocs.versions;
  assert.deepEqual([sans.etat, sans.valeur, sans.legende], ['ok', 'version n° 2', 'en service depuis le 12/10/2026']);
  assert.match(sans.phrase, /^Aucune candidate en essai\. Dérive : pas encore jugée — elle se juge sur le premier mois figé \(le 1er du mois suivant, à partir de 6 h\)\. Une adoption est possible : elle se décide dans Réglages\.$/);
  const calme = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, versions: versions({ dernierMois: { mois: '2026-09', derive: false, signaux: [] }, moisFiges: 1, alerte: null, probleme: null }) } }).blocs.versions;
  assert.equal(calme.etat, 'ok');
  assert.match(calme.phrase, /Aucune dérive au dernier mois figé \(septembre 2026\)\./);
  const derive = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, versions: versions({ dernierMois: { mois: '2026-09', derive: true, signaux: [{ type: 'cloture' }, { type: 'calibration', libelle: 'Total buts' }] }, moisFiges: 1, alerte: { key: 'deriveMoteur' }, probleme: null }) } }).blocs.versions;
  assert.equal(derive.etat, 'attention');
  assert.match(derive.phrase, /Dérive du moteur en septembre 2026 : cloture, Total buts\./);
  assert.deepEqual(derive.derive, { jugee: true, derive: true, mois: '2026-09', moisFiges: 1, alerte: true });
  const illisible = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, versions: versions({ dernierMois: null, moisFiges: null, alerte: null, probleme: 'base occupée' }) } }).blocs.versions;
  assert.match(illisible.phrase, /Dérive : pas lisible pour l’instant \(base occupée\)\./);
});

test('la note du moteur face au marché vient de la note de départ écrite dans le code : le 1N2 et le plus/moins 2,5 face au marché, les autres marchés face au championnat seul — rien n’est recalculé', async () => {
  const { NOTE_DE_DEPART } = await imp(path.join(SERVEUR, 'src', 'bench', 'noteDeDepart.js'));
  const r = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, banc: () => ({ note: NOTE_DE_DEPART, dernier: null, rejeux: 0 }) } });
  const n = r.blocs.note;
  assert.equal(n.etat, 'ok');
  assert.deepEqual(n.faceAuMarche.map((d) => [d.cle, d.verdict, d.matchs]), [['result', 'pas-prouve', 30158], ['totalGoals|2.5', 'moins-bon', 30158]]);
  const p2 = NOTE_DE_DEPART.depart.P2.marches;
  assert.equal(n.faceAuMarche[0].moteur, p2.result.moteur.perteLog);
  assert.equal(n.faceAuMarche[0].marche, p2.result.marche.perteLog);
  const attendu = { retenu: 0, pasProuve: 0, moinsBon: 0, total: 0 };
  for (const l of Object.values(p2)) {
    if (!l.repere?.verdict) continue;
    attendu.total++;
    if (l.repere.verdict === 'retenu') attendu.retenu++;
    if (l.repere.verdict === 'pas-prouve') attendu.pasProuve++;
    if (l.repere.verdict === 'moins-bon') attendu.moinsBon++;
  }
  assert.deepEqual({ retenu: n.faceAuRepere.retenu, pasProuve: n.faceAuRepere.pasProuve, moinsBon: n.faceAuRepere.moinsBon, total: n.faceAuRepere.total }, attendu);
  assert.equal(n.valeur, `${attendu.retenu} sur ${attendu.total}`);
  assert.match(n.phrase, /^Sur le 1N2, le moteur fait aussi bien que le marché \(perte 1,0040 contre 1,0041 : pas de différence prouvée\)\. Sur le plus\/moins 2,5 buts, il fait moins bien \(0,7342 contre 0,6770\)\./);
  assert.equal(n.mesureLe, '2026-10-13', 'sans rejeu sur cette appli : le jour de la note, jamais une heure inventée');
  assert.deepEqual(n.periode, { nom: 'P2', de: '2019-07-01', a: '2023-06-30', jamaisVue: true });
  assert.equal(n.dernierRejeu, null);
  // Un rejeu rangé dans la base donne l’heure de la mesure.
  const avecRejeu = S.assemblerLaSante({ maintenant, lecteurs: { ...LECTEURS_VIDES, banc: () => ({ note: NOTE_DE_DEPART, dernier: { id: 4, finiLe: '2026-10-13T14:10:11.250Z', ou: 'bac', bilan: { dureeMs: 1568908 } }, rejeux: 4 }) } });
  assert.equal(avecRejeu.blocs.note.mesureLe, '2026-10-13T14:10:11.250Z');
  assert.deepEqual(avecRejeu.blocs.note.dernierRejeu, { id: 4, finiLe: '2026-10-13T14:10:11.250Z', dureeMs: 1568908, ou: 'bac' });
});

// ============================================== 5. les liens, la lecture seule, rien de lourd

test('les liens vers les vraies places : chaque lien mène à une page qui existe, à l’onglet ou à la carte qui porte le bloc ; la copie de l’interface (PLACES) est celle du serveur', async () => {
  const routeur = lireUi('router', 'index.js');
  const chemins = new Set([...routeur.matchAll(/path: '([^']+)'/g)].map((m) => m[1]));
  for (const [cle, l] of Object.entries(S.LIENS)) {
    assert.ok(chemins.has(l.chemin), `${cle} : ${l.chemin} est une page du routeur`);
    assert.match(l.libelle, /›/, `${cle} : le libellé nomme la page puis le bloc`);
  }
  const histoire = lireUi('views', 'PredictionsHistoryView.vue');
  const reglages = lireUi('views', 'SettingsView.vue');
  // Le banc d’essai : l’onglet « banc » d’Historique moteur ; la calibration et la clôture : son bloc « Calibration du mois ».
  assert.deepEqual(S.LIENS.note.query, { onglet: 'banc' });
  assert.match(histoire, /\{ value: 'banc', label: 'Banc d’essai' \}/);
  assert.match(histoire, /<BenchView v-else-if="activeTab === 'banc'"/);
  for (const cle of ['calibration', 'cloture']) {
    assert.equal(S.LIENS[cle].chemin, '/historique-moteur');
    assert.match(S.LIENS[cle].libelle, /^Historique moteur › Calibration du mois/);
  }
  assert.match(histoire, /<CalibrationPanel \/>/);
  // Réglages : le contrôle quotidien (la carte s’ouvre par ?carte=controle-quotidien), les sauvegardes, le budget, les versions.
  assert.deepEqual(S.LIENS.donnees.query, { carte: 'controle-quotidien' });
  assert.deepEqual(S.LIENS.aVerifier.query, { carte: 'controle-quotidien' });
  assert.match(reglages, /route\?\.query\?\.carte === 'controle-quotidien'/);
  assert.match(reglages, /<DailyChecksPanel /);
  assert.match(reglages, /<BackupStatusPanel /);
  assert.match(reglages, /<ClaudeBudgetPanel /);
  assert.match(reglages, /<EngineVersionsPanel/);
  for (const cle of ['donnees', 'sauvegardes', 'budget', 'aVerifier', 'versions']) assert.equal(S.LIENS[cle].chemin, '/reglages', cle);
  // Les corrections : la feuille de route, où figure l’étape 26.
  assert.equal(S.LIENS.corrections.chemin, '/feuille-de-route');
  assert.match(lire('src', 'data', 'roadmap', 'plan.js'), /etape\('26', 'Boucle de correction'/);
  // Le menu et le routeur : la page elle-même.
  assert.match(routeur, /path: '\/sante-moteur',\s*name: 'engine-health',\s*component: \(\) => import\('@\/views\/EngineHealthView\.vue'\),\s*meta: \{ title: 'Santé du moteur', section: 'history', nav: 'sante-moteur' \}/);
  assert.match(lireUi('components', 'layout', 'AppSidebar.vue'), /\{ to: '\/sante-moteur', section: 'history', nav: 'sante-moteur', label: 'Santé du moteur'/);
  // Le même tableau côté interface (les cadres qui restent quand le serveur ne répond pas).
  const { PLACES } = await imp(path.join(UI, 'src', 'utils', 'santeMoteur.js'));
  assert.deepEqual(JSON.parse(JSON.stringify(PLACES)), JSON.parse(JSON.stringify(S.LIENS)));
});

test('le menu : « Santé du moteur » et « Historique moteur » partagent la couleur de leur section mais une seule entrée est active à la fois (meta.nav)', () => {
  const sidebar = lireUi('components', 'layout', 'AppSidebar.vue');
  const lignes = sidebar.split('\n').filter((l) => /^const (sectionActive|entreeActive|estActive) =/.test(l)).join('\n');
  assert.match(lignes, /const sectionActive/);
  assert.match(lignes, /const entreeActive/);
  assert.match(lignes, /const estActive/);
  const NAV = [
    { to: '/historique-moteur', section: 'history' },
    { to: '/sante-moteur', section: 'history', nav: 'sante-moteur' },
    { to: '/reglages', section: 'settings' }
  ];
  const actives = (meta) => {
    const route = { meta };
    const calcul = new Function('route', 'computed', `${lignes}; return estActive;`);
    const estActive = calcul(route, (fn) => ({ get value() { return fn(); } }));
    return NAV.filter(estActive).map((i) => i.to);
  };
  assert.deepEqual(actives({ section: 'history' }), ['/historique-moteur'], 'Historique moteur : seule son entrée');
  assert.deepEqual(actives({ section: 'history', nav: 'sante-moteur' }), ['/sante-moteur'], 'Santé du moteur : seule son entrée');
  assert.deepEqual(actives({ section: 'settings' }), ['/reglages']);
  assert.deepEqual(actives({}), [], 'une page sans section : aucune entrée active parmi ces trois');
});

test('la route : GET /api/engine-health, lecture seule, branchée une fois ; le contrôleur n’assemble que des lectures — aucun calcul lourd importé ni appelé', () => {
  const routes = lire('src', 'api', 'routes', 'engineHealth.routes.js');
  assert.match(routes, /router\.get\('\/', asyncHandler\(getEngineHealth\)\);/);
  assert.doesNotMatch(routes, /router\.(post|put|patch|delete)\(/, 'aucune écriture');
  const index = lire('src', 'api', 'routes', 'index.js');
  assert.match(index, /router\.use\('\/engine-health', engineHealthRoutes\);/);
  const controleur = codeSeul(lire('src', 'api', 'controllers', 'engineHealth.controller.js'));
  assert.deepEqual([...controleur.matchAll(/^import .* from '(.*)';$/gm)].map((m) => m[1]), ['../../data/santeDuMoteur.js']);
  assert.match(controleur, /res\.json\(assemblerLaSante\(\)\);/);
  // Les seules sources de la page : des lectures de résumés. Les calculs lourds des autres étapes n’y sont ni importés ni appelés.
  const page = codeSeul(lire('src', 'data', 'santeDuMoteur.js'));
  const importees = [...page.matchAll(/^import \{([^}]*)\} from '([^']*)';$/gm)].flatMap((m) => m[1].split(',').map((x) => x.trim()));
  assert.deepEqual(
    importees.sort(),
    ['NOTE_DE_DEPART', 'deriveDuMoteur', 'dernierRejeu', 'etatBudgetClaude', 'etatDesVersions', 'etatSauvegardes', 'lireLeControle', 'openDb', 'rejeuxDe', 'resumeDeLaCalibration'].sort()
  );
  for (const lourd of [/travailDuBilan/, /calculerBilan/, /preparerLeMoisEnCours/, /figerLesMoisEcoules/, /rejouer\(/, /construireTableJourJ/, /connaitreLeMarche/, /executerControleQuotidien/, /lancerControleQuotidien/, /writeJsonAtomic/, /INSERT|UPDATE|DELETE/]) {
    assert.doesNotMatch(page, lourd, String(lourd));
  }
});

test('la route de la calibration ne calcule plus rien : ni bilanDuMois ni garde de dix minutes, seulement des lectures (figé, préparé) — le calcul n’existe que dans l’étape de la nuit', () => {
  const source = lire('src', 'data', 'calibration.js');
  const code = codeSeul(source);
  for (const nom of ['bilanPourLaRoute', 'calibrationPourLaRoute', 'resumeDeLaCalibration', 'lireLeMoisPrepare']) {
    const f = codeSeul(fonctionDe(source, nom));
    for (const interdit of [/travailDuBilan/, /calculerBilan/, /executerEnRendantLaMain/, /executerSansPause/, /lignesDuMois/, /writeJsonAtomic/]) assert.doesNotMatch(f, interdit, `${nom} : ${interdit}`);
  }
  assert.doesNotMatch(code, /bilanDuMois|GARDE_MS|oublierLeMois|const gardes|const calculs/);
  // Le calcul du mois en cours : l’étape de la nuit le prépare, en rendant la main, et écrit d’un bloc.
  const preparer = codeSeul(fonctionDe(source, 'preparerLeMoisEnCours'));
  assert.match(preparer, /executerEnRendantLaMain\(travailDuBilan\(mois, \{ database, maintenant, \.\.\.carnet, juge \}\), pauses\.siLongtemps\)/);
  assert.match(preparer, /writeJsonAtomic\(fichier, \{ format: FORMAT_DU_MOIS_PREPARE/);
  const job = lire('src', 'jobs', 'matchStatsAutoRefresh.js');
  assert.match(job, /due: \(ctx\) => dueCalibrationMensuelle\(\{\}, ctx\),/);
  assert.match(job, /const prepare = await preparerLeMoisEnCoursDeLaNuit\(ctx, options\);/);
  const controleur = codeSeul(lire('src', 'api', 'controllers', 'calibration.controller.js'));
  assert.match(controleur, /res\.json\(await calibrationPourLaRoute\(\{ mois \}\)\);/);
});
