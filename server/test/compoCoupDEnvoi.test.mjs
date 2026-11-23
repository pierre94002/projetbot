/**
 * Lot « compo-ko » (21/11/2026) — l'analyse IA d'avant coup d'envoi d'un match COTÉ (relevé The Odds API).
 *
 * Constats du 21/11/2026 :
 *  - 6 des 19 analyses « au coup d'envoi » de matchs cotés (18-21/11), dont Orenburg – Baltika, avaient lu la DERNIÈRE
 *    composition alignée au lieu de celle publiée : l'équipe qui se déplace ne s'écrit pas pareil chez The Odds API et chez
 *    FotMob, et la page du match était cherchée par les noms (resolveFotMobMatchId exige le même nom pour l'extérieur) ;
 *  - Seattle – Real Salt Lake (20/11) a été analysé « au coup d'envoi » au réveil du PC, neuf heures après le coup d'envoi :
 *    la liste de la passe avait été faite avant le sommeil.
 * Le correctif (autoMatchAiTrigger.js, matchAiAnalysisService.js) : l'identifiant FotMob d'un match coté cherché dans la liste
 * FotMob déjà lue par les IDENTIFIANTS des clubs (clubDuMagasin) — les deux ; ou un seul quand l'autre nom est inconnu de
 * l'annuaire, ce club vu une seule fois dans les 6 h, à sa place, dans la compétition du match coté et à 30 min près (relecture
 * du 21/11 : l'annuaire peut rendre un homonyme d'une autre compétition) — coup d'envoi à 6 h près, un seul candidat, jamais
 * le rapprocheur souple, passé à la lecture de la composition ET à l'analyse ; l'heure revue à chaque pas de la passe (avant
 * la composition, avant le moteur, au moment du gel des pronostics, avant l'analyse, et en dernier dans runPreMatchAnalysis
 * juste avant l'appel à Claude, après les lectures FotMob de la fiche).
 *
 * aides/script-compo-coup-d-envoi.mjs tourne UNE fois dans une copie isolée (Claude et FotMob simulés, cotes fabriquées,
 * aucun réseau ; les gels mis en file seulement, jamais écrits). Le 21/11/2026, le même script lancé sur le code d'avant le
 * lot rendait : C1 « magasin » et aucun des 22 joueurs publiés dans le message, C3 aucun absent, C2 deux appels à Claude et
 * deux gels (la page du second lue deux fois), C4 analysé et gelé, C5 « magasin », C6 analysé — les essais ci-dessous y sont
 * rouges.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-compo-coup-d-envoi.mjs');

let sortie = null;
function resultat() {
  if (sortie) return sortie;
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT, {
      timeout: 240_000,
      // Un exécutable Claude qui n'existe pas (dans la copie), l'actualisation coupée : même lancé depuis le dépôt.
      env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' }
    });
    assert.equal(r.code, 0, ['script-compo-coup-d-envoi.mjs a échoué', r.erreurs.slice(-3000), r.sortie.slice(-1500)].join(' | '));
    assert.equal(r.reseau, false, ['un appel réseau a été tenté', r.erreurs.slice(-1500)].join(' | '));
    assert.ok(r.json?.ok, `sortie illisible : ${r.sortie.slice(-500)}`);
    sortie = r.json;
  } finally {
    copie.nettoyer();
  }
  return sortie;
}

const BALTIKA = '4800001';
const onze = (prefixe) => Array.from({ length: 11 }, (_, k) => `${prefixe} ${k + 1}`);

// ------------------------------------------------------------------ A. idFotmobDUnMatchCote

test('T-K1 : un match coté retrouve son match FotMob par les identifiants des deux clubs (Orenburg – Baltika), chaque club lu dans la compétition du match, sur la base donnée', () => {
  const { A } = resultat();
  assert.notEqual(A, 'absente', 'idFotmobDUnMatchCote absente de autoMatchAiTrigger.js');
  assert.equal(A.baltika, BALTIKA);
  assert.deepEqual(A.lectures, [
    { nom: 'FC Orenburg', league: 'Premier League - Russia', base: true },
    { nom: 'Baltika Kaliningrad', league: 'Premier League - Russia', base: true }
  ]);
  assert.equal(A.parmiDautres, BALTIKA, 'les autres matchs du jour (autres clubs, un seul des deux clubs) ne gênent pas');
  assert.equal(A.identifiantNumerique, BALTIKA, 'un identifiant numérique est rendu en texte');
  assert.equal(A.candidatsVides, BALTIKA, 'des entrées vides dans la liste sont ignorées');
  assert.equal(A.deuxConnusLeMemeMatchDeuxFois, BALTIKA, 'un même match lu deux fois (listes de deux jours) ne compte qu’une fois');
  assert.equal(A.deuxConnusAutreCompetition, BALTIKA, 'deux clubs connus : leurs deux identifiants suffisent, la compétition n’est pas exigée');
  assert.equal(A.deuxConnusSansCompetition, BALTIKA);
});

test('T-K2 : jamais par les noms — aucun des deux clubs connu de l’annuaire, ou des noms identiques sans identifiants de clubs : null (la recherche d’avant reprend)', () => {
  const { A } = resultat();
  assert.equal(A.aucunConnu, null);
  assert.equal(A.nomsIdentiquesSansIds, null);
});

test('T-K12 : un seul club connu de l’annuaire (« Stade Lavallois » / « Laval », « Amed SK » / « Amed Sportif ») — ce club à SA place, vu une seule fois dans les 6 h, dans la compétition du match coté et à 30 min près ; vu deux fois, de l’autre côté, au-delà de 6 h, dans une autre compétition (féminine comprise) ou une compétition hors de la table, à plus de 30 min, ou deux clubs connus qui ne concordent pas : null', () => {
  const { A } = resultat();
  assert.equal(A.exterieurInconnu, BALTIKA);
  assert.equal(A.domicileInconnu, BALTIKA);
  assert.equal(A.unConnuParmiDautres, BALTIKA);
  assert.equal(A.unConnuVuHorsDeLaFenetre, BALTIKA, 'une rencontre du club à 20 h d’écart ne compte pas');
  assert.equal(A.unConnuEtUnVide, BALTIKA, 'un identifiant vide vaut « inconnu »');
  assert.equal(A.unConnuVuDeuxFois, null);
  assert.equal(A.unConnuDeLAutreCote, null);
  assert.equal(A.unConnuAuDelaDeSixHeures, null);
  assert.equal(A.deuxConnusQuiNeConcordentPas, null, 'deux clubs connus : jamais de repli sur un seul');
  // Relecture du 21/11 : avec un seul club, tout repose sur l’annuaire, qui peut rendre un homonyme d’une autre compétition.
  assert.equal(A.unConnuAutreCompetition, null, 'le même identifiant de club dans une autre compétition (l’homonyme)');
  assert.equal(A.unConnuCompetitionFeminine, null, 'une compétition féminine, de jeunes ou de réserves');
  assert.equal(A.unConnuSansCompetition, null, 'un match FotMob sans compétition lisible');
  assert.equal(A.unConnuCompetitionHorsTable, null, 'un championnat coté absent de la table FotMob');
  assert.equal(A.unConnuATrenteMinutes, BALTIKA, '30 min près, borne comprise');
  assert.equal(A.unConnuATrenteEtUneMinutes, null);
  assert.equal(A.unConnuATroisHeuresEtDemie, null, 'dans les 6 h mais pas à 30 min près');
  assert.equal(A.unConnuLeMemeMatchDeuxFois, BALTIKA, 'un même match lu deux fois ne fait pas « vu deux fois »');
  // 21/11 : FotMob publie « TUR|Süper Lig » depuis le 08/11 au soir, la table (gelée) dit « TUR|Super Lig » (intitulesFotmob.js).
  assert.equal(A.unConnuIntituleRenomme, BALTIKA, 'l’intitulé renommé chez FotMob est celui de la compétition du match coté');
  assert.equal(A.unConnuIntituleDeLaTable, BALTIKA, 'l’ancien intitulé reste reconnu');
  assert.equal(A.unConnuDivisionInferieureTurque, null, 'la deuxième division turque n’est pas la Süper Lig');
});

test('T-K3 : le coup d’envoi à 6 h près, bornes comprises ; au-delà, null', () => {
  const { A } = resultat();
  assert.equal(A.sixHeuresApres, BALTIKA);
  assert.equal(A.sixHeuresAvant, BALTIKA);
  assert.equal(A.sixHeuresEtUneMinute, null);
});

test('T-K4 : un seul candidat — deux matchs des mêmes clubs, domicile et extérieur inversés, ou le même club des deux côtés : null', () => {
  const { A } = resultat();
  assert.equal(A.deuxCandidats, null);
  assert.equal(A.domicileExterieurInverses, null);
  assert.equal(A.memeClubDesDeuxCotes, null);
});

test('T-K5 : rien d’illisible ne lève — annuaire qui lève, heure illisible, liste absente ou d’une autre forme, candidat sans identifiant ou sans heure, match absent : null', () => {
  const { A } = resultat();
  for (const cas of ['clubQuiLeve', 'coupIllisible', 'listeAbsente', 'listeQuiNestPasUneListe', 'candidatSansIdentifiant', 'candidatSansHeure', 'matchAbsent']) {
    assert.equal(A[cas], null, cas);
  }
});

// ------------------------------------------------------------------ B. encoreAvantLeCoupDEnvoi

test('T-K6 : l’heure revue avant l’appel à Claude — oui à plus de 3 min du coup d’envoi, non à 3 min, après, ou sur une heure illisible', () => {
  const { B } = resultat();
  assert.deepEqual(B, {
    dixMinutes: true,
    troisMinutesEtUneMs: true,
    troisMinutes: false,
    uneMinute: false,
    coupDEnvoiMaintenant: false,
    joueDepuisNeufHeures: false,
    coupIllisible: false,
    maintenantIllisible: false,
    coupAbsent: false
  });
});

// ------------------------------------------------------------------ C. la vraie passe d'avant coup d'envoi

test('T-K7 : « Brighton and Hove Albion » (The Odds API) = « Brighton & Hove Albion » (FotMob) — Claude lit et l’analyse garde la composition PUBLIÉE de ce match, pas la dernière alignée', () => {
  const { C1 } = resultat();
  assert.ok(C1.prealables.brentford && C1.prealables.brighton, `clubs absents de l’échantillon : ${JSON.stringify(C1.prealables)}`);
  assert.equal(C1.prealables.brightonCotes, C1.prealables.brighton, 'les deux écritures de Brighton sont le même club du magasin');
  assert.deepEqual(C1.bilan, { ok: 1, failed: 0, candidates: 1, enAttente: 0, avecCompo: 1, tropTard: 0, samples: [] });
  assert.equal(C1.analyse.timing, 'coup-d-envoi');
  assert.equal(C1.analyse.source, 'FotMob');
  assert.equal(C1.analyse.fotmobMatchId, '4900501');
  assert.deepEqual(C1.analyse.dom, onze('PublieDom'));
  assert.deepEqual(C1.analyse.ext, onze('PublieExt'));
  assert.deepEqual(C1.appels, [{ type: 'coup-d-envoi', home: 'Brentford', away: 'Brighton and Hove Albion', domLus: 11, extLus: 11 }]);
  assert.equal(C1.gels, 1, 'le gel des pronostics, à l’heure');
});

test('T-K8 : FotMob n’a publié que les absents (« Bournemouth » / « AFC Bournemouth ») — l’analyse sans onze publié lit la dernière composition alignée AVEC les absents annoncés pour ce match', () => {
  const { C3 } = resultat();
  assert.ok(C3.prealables.fulham && C3.prealables.bournemouth, `clubs absents de l’échantillon : ${JSON.stringify(C3.prealables)}`);
  assert.equal(C3.prealables.bournemouthCotes, C3.prealables.bournemouth, 'les deux écritures de Bournemouth sont le même club du magasin');
  assert.deepEqual(C3.bilan, { ok: 1, failed: 0, candidates: 1, enAttente: 0, avecCompo: 0, tropTard: 0, samples: [] });
  assert.equal(C3.analyse.source, 'magasin');
  assert.equal(C3.analyse.dom.length, 11, 'la dernière composition alignée de Fulham');
  assert.equal(C3.analyse.ext.length, 11, 'la dernière composition alignée de Bournemouth');
  assert.deepEqual(C3.analyse.absentsDom, ['AbsentDom Un']);
  assert.deepEqual(C3.analyse.absentsExt, ['AbsentExt Un']);
  assert.deepEqual(C3.appels, [{ type: 'coup-d-envoi', home: 'Fulham', away: 'Bournemouth', absentsLus: ['AbsentDom Un', 'AbsentExt Un'] }]);
  assert.equal(C3.gels, 1);
});

test('T-K9 : la pendule avance de 30 min pendant le premier appel d’une passe — le second match, commencé entre-temps, n’est pas analysé (tropTard) : ni sa page FotMob, ni gel, ni appel à Claude pour lui', () => {
  const { C2 } = resultat();
  assert.ok(C2.prealables.liverpool && C2.prealables.everton, `clubs absents de l’échantillon : ${JSON.stringify(C2.prealables)}`);
  assert.deepEqual(C2.bilan, { ok: 1, failed: 0, candidates: 2, enAttente: 0, avecCompo: 0, tropTard: 1, samples: [] });
  assert.deepEqual(C2.appels, ['coup-d-envoi:Arsenal']);
  assert.equal(C2.premier, 'coup-d-envoi');
  assert.equal(C2.second, 'non analysé');
  assert.equal(C2.pagesLuesDuSecond, 0, 'sa composition n’est même pas relue chez FotMob');
  assert.equal(C2.gels, 1, 'le gel du premier seulement');
});

test('T-K11 : la pendule avance de 30 min PENDANT la lecture de la composition d’un match — aucun gel des pronostics, aucun appel à Claude, rien d’enregistré (l’ordre des revues : T-K10)', () => {
  const { C4 } = resultat();
  assert.ok(C4.prealables.villa && C4.prealables.newcastle, `clubs absents de l’échantillon : ${JSON.stringify(C4.prealables)}`);
  assert.deepEqual(C4.bilan, { ok: 0, failed: 0, candidates: 1, enAttente: 0, avecCompo: 0, tropTard: 1, samples: [] });
  assert.equal(C4.pagesLues, 1, 'la page a été lue une fois (c’est pendant cette lecture que la pendule avance)');
  assert.equal(C4.appels, 0);
  assert.equal(C4.analyse, 'non analysé');
  assert.equal(C4.gels, 0, 'aucun gel après le coup d’envoi');
});

test('T-K13 : « Hotspur Londres » (inconnu de l’annuaire) – Manchester United — la composition PUBLIÉE de ce match, lue par le seul club connu, à sa place', () => {
  const { C5 } = resultat();
  assert.ok(C5.prealables.tottenham && C5.prealables.manutd, `clubs absents de l’échantillon : ${JSON.stringify(C5.prealables)}`);
  assert.equal(C5.prealables.hotspurLondres, null, 'le nom fabriqué est bien inconnu de l’annuaire');
  assert.deepEqual(C5.bilan, { ok: 1, failed: 0, candidates: 1, enAttente: 0, avecCompo: 1, tropTard: 0, samples: [] });
  assert.equal(C5.analyse.source, 'FotMob');
  assert.equal(C5.analyse.fotmobMatchId, '4900505');
  assert.deepEqual(C5.analyse.dom, onze('SpursDom'));
  assert.deepEqual(C5.analyse.ext, onze('UnitedExt'));
  assert.deepEqual(C5.appels, [{ type: 'coup-d-envoi', home: 'Hotspur Londres', domLus: 11, extLus: 11 }]);
  assert.equal(C5.gels, 1);
});

test('T-K14 : la pendule avance de 30 min pendant les lectures FotMob de l’analyse ELLE-MÊME, après le moteur — la dernière revue, juste avant l’appel à Claude, l’arrête : rien d’appelé ni d’enregistré (le gel, fait à l’heure, reste)', () => {
  const { C6 } = resultat();
  assert.ok(C6.prealables.mancity && C6.prealables.brentford, `clubs absents de l’échantillon : ${JSON.stringify(C6.prealables)}`);
  assert.deepEqual(C6.bilan, { ok: 0, failed: 0, candidates: 1, enAttente: 0, avecCompo: 0, tropTard: 1, samples: [] });
  assert.equal(C6.appels, 0, 'aucun appel à Claude');
  assert.equal(C6.analyse, 'non analysé', 'rien d’enregistré');
  assert.equal(C6.gels, 1, 'le moteur a tourné à l’heure : son gel reste');
  assert.deepEqual(C6.lecturesAvantLeMoteur, ['/api/data/matchDetails?matchId=4900506'], 'la page lue une fois avant le moteur (la composition)');
  assert.equal(C6.lectureOuLaPenduleAvance, '/api/data/matchDetails?matchId=4900506', 'la pendule avance pendant une lecture de l’analyse');
});

test('T-K10 : l’heure revue à chaque pas de la passe — avant la composition, avant le moteur, au moment du gel, avant l’analyse, et en dernier dans runPreMatchAnalysis juste avant l’appel à Claude — sur l’heure du moment, après le plafond du jour', () => {
  const src = fs.readFileSync(path.join(SERVEUR, 'src', 'core', 'ai', 'autoMatchAiTrigger.js'), 'utf8');
  const debut = src.indexOf('export async function runKickoffPreMatchAnalyses(');
  const fin = src.indexOf('export async function reserveCoupDEnvoi(');
  assert.ok(debut > 0 && fin > debut, 'runKickoffPreMatchAnalyses introuvable');
  const corps = src.slice(debut, fin);
  const REVUE = 'if (tropTard()) continue;';
  const revues = [];
  for (let i = corps.indexOf(REVUE); i >= 0; i = corps.indexOf(REVUE, i + 1)) revues.push(i);
  assert.equal(revues.length, 3, 'trois revues de l’heure');
  const plafond = corps.indexOf('bilan.laisses++');
  const compo = corps.indexOf('await buildLineupContext(');
  const moteur = corps.indexOf('await calculerEngineResult(');
  const claude = corps.indexOf('await runPreMatchAnalysis(');
  assert.ok(plafond > 0 && plafond < revues[0], 'le plafond du jour d’abord (les « laissés » comptés comme avant)');
  assert.ok(revues[0] < compo && compo < revues[1] && revues[1] < moteur && moteur < revues[2] && revues[2] < claude, `ordre : ${JSON.stringify({ revues, compo, moteur, claude })}`);
  assert.equal(corps.slice(revues[2], claude).includes('await '), false, 'rien n’est attendu entre la revue de la boucle et l’analyse');
  assert.equal(corps.split('encoreAvantLeCoupDEnvoi(kickoff, Date.now())').length - 1, 1, 'la revue lit l’heure du moment (Date.now()), une seule écriture');
  // Le gel des pronostics : lui aussi seulement avant le coup d’envoi (la même revue, sans compter le match deux fois).
  assert.ok(corps.includes('geler: (a) => { if (encore()) gelerEnService(a); }'), 'le gel revu à l’heure');
  // La dernière revue, passée à runPreMatchAnalysis, comptée en tropTard ; l’usage noté seulement après une analyse faite.
  const avantLAppel = corps.indexOf('avantLAppel: () => {', claude);
  const sortie = corps.indexOf('if (tard) continue;', claude);
  const usage = corps.indexOf('enregistrerUsage(jourParis(), { preMatch: 1 });', claude);
  assert.ok(avantLAppel > claude && sortie > avantLAppel && usage > sortie, `la dernière revue : ${JSON.stringify({ claude, avantLAppel, sortie, usage })}`);
  assert.ok(corps.slice(avantLAppel, sortie).includes('tard = tropTard();'), 'la dernière revue comptée en tropTard');
  // Dans runPreMatchAnalysis : la revue APRÈS les lectures de la fiche (actualités, composition de repli), et rien n’est
  // attendu entre elle et l’appel à Claude.
  const service = fs.readFileSync(path.join(SERVEUR, 'src', 'core', 'ai', 'matchAiAnalysisService.js'), 'utf8');
  const d = service.indexOf('export async function runPreMatchAnalysis(');
  assert.ok(d > 0, 'runPreMatchAnalysis introuvable');
  const corpsService = service.slice(d, service.indexOf('\nexport ', d + 10));
  const prepare = corpsService.indexOf('await preparerAnalyseAvantMatch(');
  const revue = corpsService.indexOf("if (typeof avantLAppel === 'function' && !avantLAppel()) return null;");
  const appel = corpsService.indexOf('await callClaudeCode(');
  assert.ok(prepare > 0 && revue > prepare && appel > revue, `ordre dans runPreMatchAnalysis : ${JSON.stringify({ prepare, revue, appel })}`);
  assert.equal(corpsService.slice(revue, appel).includes('await '), false, 'rien n’est attendu entre la dernière revue et l’appel à Claude');
});
