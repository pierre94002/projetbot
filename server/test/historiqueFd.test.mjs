/**
 * Étape 13 du plan — l'HISTORIQUE FOOTBALL-DATA depuis 2000.
 *   node --test test/historiqueFd.test.mjs        (depuis server/)
 *
 * Les règles pures (lecture des colonnes selon les saisons, vote) tournent ici,
 * sans base ni réseau. Tout ce qui ouvre une base tourne dans une copie isolée
 * de la base d'essai (test/aides/isolement.mjs : réseau coupé, heure figée au
 * 05/10/2026 12 h UTC, jamais la vraie base), avec un SITE FABRIQUÉ : des CSV
 * écrits à partir des rencontres de la base d'essai, servis par un faux
 * `fetch` qui compte chaque requête (test/aides/script-historique-fd.mjs).
 *
 *  1. La lecture des colonnes selon les saisons : 2000-01 (William Hill seul),
 *     BetBrain (2005-2019), Pinnacle et sa clôture (2012-13), Avg/Max et la
 *     clôture (depuis 2019-20), 2026-27 sans Pinnacle avec xG, fichiers par
 *     pays, colonnes BF/BFD de Betfair et Betfred, guillemets, encodages,
 *     anciens fichiers grecs (HT/AT), handicap partagé (« -0.5,-1 »).
 *  2. Le vote des noms : jour + score, jamais la ressemblance — deux noms
 *     échangés exprès —, majorité nette, conflit, vote seul, écart de score.
 *  3. Le curseur de reprise ; 4. le ré-import sans doublon ; 5. les écarts de
 *     score consultables ; 6. le téléchargement partagé avec les cotes passées ;
 *     7. l'étape de l'actualisation ; 8. l'historique de l'analyse IA rebranché
 *     sur la base, par identifiants ; 9. la route en lecture seule ; 10. la
 *     table de référence (stades, altitude, pelouses, derbies) ; 11. la lecture
 *     du code (aucune ressemblance de nom, aucune écriture dans match_odds).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as H from '../src/data/providers/footballDataHistory.js';
import { planDesColonnes, livresDuFichier, voterParDateEtScore, traduireLesVotes, rattacherParIdentifiants, rencontresParJour } from '../src/data/providers/footballDataOdds.js';
import { COLONNES_COTES_FD } from '../src/data/db/matchStatsDb.js';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-historique-fd.mjs');

/** Une phase du script d'essai, dans une copie neuve (scripts du serveur compris : l'actualisation en importe). */
function lancer(phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, SCRIPT, { args: [phase], timeout: 300_000 });
    assert.equal(r.code, 0, `phase ${phase} : ${r.erreurs.slice(-3000)}`);
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `phase ${phase} : sortie illisible ${r.sortie.slice(-500)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (f) => {
  let v;
  return () => (v ??= f());
};
const vote = uneFois(() => lancer('vote'));
const reprise = uneFois(() => lancer('reprise'));
const reimport = uneFois(() => lancer('reimport'));
const partage = uneFois(() => lancer('partage'));
const etape = uneFois(() => lancer('etape'));
const provider = uneFois(() => lancer('provider'));
const route = uneFois(() => lancer('route'));

const BOM = '﻿';
const lire = (entetes, lignes, opts = { code: 'E0', saison: '2526' }) => H.lireFichierHistorique(`${BOM}${entetes}\r\n${lignes.join('\r\n')}\r\n`, opts);

// ================================================ 1. les colonnes selon les saisons

test('2000-01 : date à deux chiffres, statistiques, arbitre, seul William Hill en cotes — et une date hors de la saison écartée', () => {
  const lu = lire(
    'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Attendance,Referee,HS,AS,HST,AST,HHW,AHW,HC,AC,HF,AF,HO,AO,HY,AY,HR,AR,HBP,ABP,GBH,GBD,GBA,IWH,IWD,IWA,LBH,LBD,LBA,SBH,SBD,SBA,WHH,WHD,WHA',
    [
      'E0,19/08/00,Charlton,Man City,4,0,H,2,0,H,20043,Rob Harris,17,8,14,4,2,1,6,6,13,12,8,6,1,2,0,0,10,20,2,3,3.2,2.2,2.9,2.7,2.2,3.25,2.75,2.2,3.25,2.88,2.1,3.2,3.1',
      'E0,19/08/99,Arsenal,Chelsea,1,1,D,0,0,D,38000,G Poll,10,10,5,5,0,0,4,4,10,10,1,1,1,1,0,0,10,10,2,3,3,2,3,3,2,3,3,2,3,3,2,3,3',
      ',,,,,,,,,,,,,,'
    ],
    { code: 'E0', saison: '0001' }
  );
  assert.equal(lu.lignes.length, 1);
  assert.deepEqual(lu.raisons, { 'date hors de la saison du fichier': 1 }, 'une année à deux chiffres mal lue ne passe pas');
  const l = lu.lignes[0];
  assert.deepEqual(
    { date: l.date, heure: l.heure, saison: l.saison, dom: l.dom, ext: l.ext, bd: l.bd, be: l.be, mtd: l.mtd, mte: l.mte, tirs: [l.tirs_d, l.tirs_e], cadres: [l.cadres_d, l.cadres_e], corners: [l.corners_d, l.corners_e], fautes: [l.fautes_d, l.fautes_e], jaunes: [l.jaunes_d, l.jaunes_e], rouges: [l.rouges_d, l.rouges_e], arbitre: l.arbitre },
    { date: '2000-08-19', heure: null, saison: '2000-01', dom: 'Charlton', ext: 'Man City', bd: 4, be: 0, mtd: 2, mte: 0, tirs: [17, 8], cadres: [14, 4], corners: [6, 6], fautes: [13, 12], jaunes: [1, 2], rouges: [0, 0], arbitre: 'Rob Harris' }
  );
  assert.deepEqual(l.cotes, { wh_1: 210, wh_n: 320, wh_2: 310 }, 'Gamebookers, Interwetten, Ladbrokes, Sportingbet : pas gardés');
});

test('2005-06 à 2018-19 : la moyenne et le maximum du marché sont ceux de BetBrain (BbAv, BbMx), handicap à SA ligne (BbAHh) ; jamais celui de Bet365 à une autre ligne', () => {
  const entetes =
    'Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A,WHH,WHD,WHA,Bb1X2,BbMxH,BbAvH,BbMxD,BbAvD,BbMxA,BbAvA,BbOU,BbMx>2.5,BbAv>2.5,BbMx<2.5,BbAv<2.5,BbAH,BbAHh,BbMxAHH,BbAvAHH,BbMxAHA,BbAvAHA,B365AH,B365AHH,B365AHA,PSH,PSD,PSA,PSCH,PSCD,PSCA';
  const lu = lire(entetes, ['E0,13/08/05,Aston Villa,Bolton,2,2,D,2,2,D,M Riley,3,13,2,6,14,16,7,8,0,2,0,0,2.3,3.25,3,2.2,3.2,3.2,56,2.4,2.2,3.3,3.16,3.4,3.05,36,2.2,2.01,1.87,1.7,22,-0.25,2.1,2.01,1.92,1.84,-0.5,2.5,1.5,2.25,3.3,3.1,2.2,3.4,3.2'], { code: 'E0', saison: '0506' });
  const c = lu.lignes[0].cotes;
  assert.deepEqual(
    { moy: [c.moy_1, c.moy_n, c.moy_2], max: [c.max_1, c.max_n, c.max_2], ou: [c.moy_p25, c.moy_m25, c.max_p25, c.max_m25], ah: [c.ah_ligne, c.moy_ahd, c.moy_ahe, c.max_ahd, c.max_ahe] },
    { moy: [220, 316, 305], max: [240, 330, 340], ou: [201, 170, 220, 187], ah: [-25, 201, 184, 210, 192] }
  );
  assert.equal(c.b365_ahd, undefined, 'Bet365 a SA ligne (B365AH -0.5) : jamais rangé à la ligne de BetBrain');
  assert.deepEqual([c.pin_1, c.pin_c1], [225, 220], 'Pinnacle : PSH et sa clôture PSCH (depuis 2012-13)');
  assert.deepEqual([c.b365_1, c.wh_1, c.wh_c1], [230, 220, undefined], 'pas de clôture William Hill avant 2019-20');
  // Un fichier qui aurait LES DEUX lignes (celle du marché et celle de BetBrain) : la ligne du marché, et les seules cotes données à cette ligne.
  const deux = lire('Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,AHh,AvgAHH,AvgAHA,BbAHh,BbAvAHH,BbAvAHA', ['E0,10/08/2019,A,B,1,0,-0.5,1.9,1.95,-0.75,2.2,1.7'], { code: 'E0', saison: '1920' }).lignes[0].cotes;
  assert.deepEqual([deux.ah_ligne, deux.moy_ahd, deux.moy_ahe], [-50, 190, 195], 'jamais la ligne de BetBrain avec les cotes du marché, ni l’inverse');
});

test('depuis 2019-20 : Avg/Max et toutes les clôtures (1N2, plus/moins 2,5, handicap à la ligne du marché), heure britannique -> jour et heure UTC', () => {
  const entetes =
    'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A,PSH,PSD,PSA,WHH,WHD,WHA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,B365>2.5,B365<2.5,P>2.5,P<2.5,Max>2.5,Max<2.5,Avg>2.5,Avg<2.5,AHh,B365AHH,B365AHA,PAHH,PAHA,MaxAHH,MaxAHA,AvgAHH,AvgAHA,B365CH,B365CD,B365CA,PSCH,PSCD,PSCA,WHCH,WHCD,WHCA,MaxCH,MaxCD,MaxCA,AvgCH,AvgCD,AvgCA,B365C>2.5,B365C<2.5,PC>2.5,PC<2.5,MaxC>2.5,MaxC<2.5,AvgC>2.5,AvgC<2.5,AHCh,B365CAHH,B365CAHA,PCAHH,PCAHA,MaxCAHH,MaxCAHA,AvgCAHH,AvgCAHA';
  const lu = lire(
    entetes,
    [
      'E0,09/08/2019,20:00,Liverpool,Norwich,4,1,H,4,0,H,M Oliver,15,12,7,5,9,9,11,2,0,2,0,0,1.14,10,19,1.15,9.59,18.05,1.12,8.5,21,1.16,10,23,1.14,8.75,19.83,1.4,3,1.4,3.11,1.45,3.11,1.41,2.92,-2.25,1.96,1.94,1.97,1.95,1.97,2,1.94,1.94,1.14,9.5,21,1.14,10.43,19.63,1.11,9.5,21,1.16,10.5,23,1.14,9.52,19.18,1.3,3.5,1.34,3.44,1.36,3.76,1.3,3.45,-2.25,1.91,1.99,1.92,2,1.95,2.07,1.9,1.99',
      'E0,26/10/2019,00:30,Arsenal,Crystal Palace,2,2,D,2,1,H,M Atkinson,22,6,8,3,10,9,7,1,1,3,0,0,1.5,4.33,6.5,1.52,4.53,6.71,1.5,4.2,6.5,1.55,4.6,7.15,1.5,4.38,6.42,1.66,2.2,1.69,2.27,1.72,2.28,1.66,2.2,-1,1.88,2.02,1.9,2.02,1.95,2.06,1.89,2.0,1.53,4.2,6.5,1.55,4.47,6.6,1.5,4.2,6.5,1.58,4.6,7.15,1.53,4.31,6.39,1.66,2.2,1.71,2.24,1.75,2.3,1.67,2.19,-1,1.91,1.99,1.93,1.99,1.96,2.04,1.9,1.98'
    ],
    { code: 'E0', saison: '1920' }
  );
  const [a, b] = lu.lignes;
  assert.deepEqual([a.date, a.heure, a.dateFichier], ['2019-08-09', '19:00', '2019-08-09'], 'heure d’été : 20:00 à Londres = 19:00 UTC');
  assert.deepEqual([b.date, b.heure, b.dateFichier], ['2019-10-25', '23:30', '2019-10-26'], 'un coup d’envoi 00:30 heure britannique (été) est la veille en UTC ; la date écrite reste la clé');
  const c = a.cotes;
  assert.deepEqual([c.moy_1, c.moy_c1, c.max_1, c.max_c1, c.pin_1, c.pin_c1, c.b365_c1, c.wh_1, c.wh_c1], [114, 114, 116, 116, 115, 114, 114, 112, 111]);
  assert.deepEqual([c.moy_p25, c.moy_cp25, c.pin_p25, c.pin_cp25, c.b365_p25, c.b365_cp25], [141, 130, 140, 134, 140, 130]);
  assert.deepEqual([c.ah_ligne, c.ah_cligne, c.moy_ahd, c.moy_cahd, c.pin_ahd, c.b365_cahe], [-225, -225, 194, 190, 197, 199]);
  // Chaque colonne rendue est une colonne de fd_history.
  for (const l of lu.lignes) for (const k of Object.keys(l.cotes)) assert.ok(COLONNES_COTES_FD.includes(k), k);
});

test('2026-27 : plus de Pinnacle, des xG ; Betfred (BFD) et la bourse Betfair (BFE) ne sont jamais pris pour un livre gardé', () => {
  const entetes =
    'Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Referee,HxG,AxG,HS,AS,HST,AST,HF,AF,HC,AC,HY,AY,HR,AR,B365H,B365D,B365A,BFDH,BFDD,BFDA,BVH,BVD,BVA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,BFEH,BFED,BFEA,B365CH,B365CD,B365CA,BFDCH,BFDCD,BFDCA,MaxCH,MaxCD,MaxCA,AvgCH,AvgCD,AvgCA';
  const lu = lire(entetes, ['E0,21/08/2026,20:00,Arsenal,Coventry,3,0,H,2,0,H,T Bramall,1.88,0.2,20,4,6,1,10,13,8,2,1,1,0,0,1.2,7,13,1.2,6.5,15,1.18,7,15,1.23,7.5,16.5,1.19,6.77,14.19,1.23,7.4,18,1.18,7.5,13,1.22,6.5,13,1.22,7.5,16,1.2,6.72,14'], { code: 'E0', saison: '2627' });
  const l = lu.lignes[0];
  assert.deepEqual([l.xg_d, l.xg_e], [188, 20]);
  assert.deepEqual(Object.keys(l.cotes).filter((k) => k.startsWith('pin')), [], 'Pinnacle n’est plus publié');
  assert.deepEqual([l.cotes.b365_1, l.cotes.max_1, l.cotes.moy_1, l.cotes.moy_c1], [120, 123, 119, 120]);
  assert.ok(!Object.keys(l.cotes).some((k) => k.startsWith('wh')), 'William Hill absent du fichier : rien d’inventé');
  const prises = H.planDesCotes(entetes.split(',')).flatMap((p) => p.colonnes);
  assert.ok(!prises.some((c) => /^BF/.test(c)), `colonnes Betfair/Betfred prises : ${prises.filter((c) => /^BF/.test(c))}`);
});

test('BF / BFD : Betfair Sportsbook (BFH, BFD, BFA) et Betfred (BFDH, BFDD, BFDA) — la colonne « BFD » est le nul de Betfair, jamais un préfixe (planDesColonnes, noms complets)', () => {
  const nul = (plan, nom) => plan.find((p) => p.livre.nom === nom && p.market === '1x2' && p.kind === 'preclose')?.colonnes ?? null;
  const betfairSeul = planDesColonnes(['Div', 'Date', 'HomeTeam', 'AwayTeam', 'BFH', 'BFD', 'BFA']);
  assert.deepEqual(nul(betfairSeul, 'Betfair Sportsbook'), ['BFH', 'BFD', 'BFA']);
  assert.equal(nul(betfairSeul, 'Betfred'), null);
  const betfredSeul = planDesColonnes(['Div', 'Date', 'HomeTeam', 'AwayTeam', 'BFDH', 'BFDD', 'BFDA']);
  assert.deepEqual(nul(betfredSeul, 'Betfred'), ['BFDH', 'BFDD', 'BFDA']);
  assert.equal(nul(betfredSeul, 'Betfair Sportsbook'), null, 'BFDH/BFDD/BFDA ne font pas un Betfair « BF » + « DH »');
  const lesDeux = planDesColonnes(['Div', 'Date', 'HomeTeam', 'AwayTeam', 'BFH', 'BFD', 'BFA', 'BFDH', 'BFDD', 'BFDA', 'BFDCH', 'BFDCD', 'BFDCA']);
  assert.deepEqual(nul(lesDeux, 'Betfair Sportsbook'), ['BFH', 'BFD', 'BFA']);
  assert.deepEqual(nul(lesDeux, 'Betfred'), ['BFDH', 'BFDD', 'BFDA']);
  assert.deepEqual(lesDeux.find((p) => p.livre.nom === 'Betfred' && p.kind === 'close')?.colonnes, ['BFDCH', 'BFDCD', 'BFDCA']);
  assert.equal(livresDuFichier(['BFH', 'BFD', 'BFA']).length, 1);
  // L'historique : un 1X2 incomplet ne se complète jamais avec une colonne d'un autre livre.
  assert.deepEqual(H.planDesCotes(['B365H', 'B365D', 'BFD', 'BFA']).map((p) => p.colonnes), []);
});

test('fichiers par pays : Home/Away/HG/AG, saison écrite (« 2012/2013 » -> 2012-13, « 2026 »), clôture 1X2 seulement, heure britannique', () => {
  const entetes = 'Country,League,Season,Date,Time,Home,Away,HG,AG,Res,PSCH,PSCD,PSCA,MaxCH,MaxCD,MaxCA,AvgCH,AvgCD,AvgCA,BFECH,BFECD,BFECA,B365CH,B365CD,B365CA';
  const lu = lire(entetes, ['Argentina,Liga Profesional ,2012/2013,03/08/2012,23:00,Arsenal Sarandi,Union de Santa Fe,1,0,H,1.9,3.39,5.03,1.9,3.5,5.68,1.76,3.3,4.74,,,,,,', 'Japan, J1 League,2026,10/03/2026,05:00,Gamba Osaka,Vissel Kobe,2,3,A,1.94,3.56,4.34,1.94,4,5.5,1.71,3.62,4.55,,,,2.1,3.4,3.3'], { code: 'ARG', saison: null });
  const [a, b] = lu.lignes;
  assert.deepEqual([a.saison, a.date, a.heure, a.dom, a.bd, a.mtd], ['2012-13', '2012-08-03', '22:00', 'Arsenal Sarandi', 1, null]);
  assert.deepEqual(a.cotes, { pin_c1: 190, pin_cn: 339, pin_c2: 503, max_c1: 190, max_cn: 350, max_c2: 568, moy_c1: 176, moy_cn: 330, moy_c2: 474 });
  assert.deepEqual([b.saison, b.date, b.heure, b.cotes.b365_c1], ['2026', '2026-03-10', '05:00', 210], 'mars avant le passage à l’heure d’été : Londres = UTC');
});

test('fichiers anciens : guillemets (« Wiley, A. G. »), colonnes HT/AT des fichiers grecs, handicap partagé « -0.5,-1 » = -0,75, encodage Windows 1252, « Preußen » abîmé à la source', () => {
  const lu = lire('Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,FTR,HTHG,HTAG,HTR,Attendance,Referee,HS,AS,HST,AST', ['E0,22/12/01,Charlton,Blackburn,0,2,A,0,0,D,25857,"Wiley, A. G.",10,7,2,4'], { code: 'E0', saison: '0102' });
  assert.deepEqual([lu.lignes[0].arbitre, lu.lignes[0].tirs_d, lu.lignes[0].tirs_e, lu.lignes[0].cadres_e], ['Wiley, A. G.', 10, 7, 4], 'aucune colonne décalée');
  const grec = lire('Div,Date,HT,AT,FTHG,FTAG,FTR,HTHG,HTAG,HTR,B365H,B365D,B365A,WHH,WHD,WHA', ['G1,18/09/04,Ergotelis,Iraklis,0,1,A,0,0,D,,,,3.3,3.2,2'], { code: 'G1', saison: '0405' });
  assert.deepEqual([grec.lignes[0].dom, grec.lignes[0].ext, grec.lignes[0].cotes.wh_1], ['Ergotelis', 'Iraklis', 330]);
  assert.equal(H.estCsvFootballData('Div,Date,HT,AT,FTHG'), true, 'un ancien fichier grec est un vrai fichier');
  assert.equal(H.estCsvFootballData('<html><body>Maintenance</body></html>'), false);
  const partage = lire('Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,BbAHh,BbAvAHH,BbAvAHA', ['SP2,13/06/10,Gimnastic,Elche,3,1,"-0.5,-1",1.81,1.75', 'SP2,13/06/10,Huesca,Cadiz,2,1,"0,-1",1.9,1.9'], { code: 'SP2', saison: '0910' });
  assert.deepEqual([partage.lignes[0].cotes.ah_ligne, partage.lignes[0].cotes.moy_ahd], [-75, 181]);
  assert.equal(partage.lignes[1].cotes.ah_ligne, undefined, 'deux valeurs à un but d’écart : jamais devinées');
  assert.equal(partage.lignes[1].cotes.moy_ahd, undefined, 'une cote de handicap sans ligne ne se garde pas');
  // Encodages.
  const latin1 = Buffer.from('Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,Referee\r\nD1,26/01/02,Freiburg,N\xfcrnberg,2,0,Kinh\xf6fer\r\n', 'latin1');
  const d1 = H.decoderCsv(latin1);
  assert.equal(d1.encodage, 'windows-1252');
  assert.match(d1.texte, /Nürnberg,2,0,Kinhöfer/);
  const utf8 = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Div,Date,HomeTeam\r\nD2,01/08/2025,Preu', 'utf8'), Buffer.from([0xc3, 0x78]), Buffer.from('en Münster\r\n', 'utf8')]);
  const d2 = H.decoderCsv(utf8);
  assert.equal(d2.encodage, 'utf-8');
  assert.equal(d2.texte.startsWith('﻿'), false, 'BOM retiré');
  const abime = lire('Div,Date,HomeTeam,AwayTeam,FTHG,FTAG', [`D2,01/08/2025,${d2.texte.split('\r\n')[1].split(',')[2]},Hertha,2,1`], { code: 'D2', saison: '2526' });
  assert.equal(abime.lignes[0].dom, 'Preußen Münster', 'le seul nom abîmé connu, remis d’aplomb : sinon deux clubs');
  // Cotes : vides, <= 1, illisibles -> rien ; trois décimales -> au centième.
  const c = lire('Div,Date,HomeTeam,AwayTeam,FTHG,FTAG,B365H,B365D,B365A,WHH,WHD,WHA', ['E0,01/09/2025,A,B,1,0,1.833,3.40,0.5,,abc,']).lignes[0].cotes;
  assert.deepEqual(c, { b365_1: 183, b365_n: 340 });
  // Doublon d'un même match dans un fichier : gardé une fois ; ligne sans score : écartée et comptée.
  const doublon = lire('Div,Date,HomeTeam,AwayTeam,FTHG,FTAG', ['E0,01/09/2025,A,B,1,0', 'E0,01/09/2025,A,B,1,0', 'E0,02/09/2025,C,D,,']);
  assert.deepEqual([doublon.lignes.length, doublon.doublons, doublon.raisons], [1, 1, { 'score manquant': 1 }]);
});

test('la liste des fichiers : 605 en octobre 2026 (16 par pays, puis 22 divisions de 2026-27 à 2000-01, la National League depuis 2005-06), la saison en cours et les fichiers par pays « en cours »', () => {
  const liste = H.listeDesFichiers({ aujourdhui: new Date('2026-10-05T12:00:00Z') });
  assert.equal(liste.length, 605);
  assert.deepEqual(liste.slice(0, 2).map((f) => f.fichier), ['new/ARG', 'new/AUT']);
  assert.equal(liste[16].fichier, 'mmz4281/2627/E0');
  assert.equal(liste.at(-1).fichier, 'mmz4281/0001/G1');
  assert.ok(!liste.some((f) => f.fichier === 'mmz4281/0405/EC') && liste.some((f) => f.fichier === 'mmz4281/0506/EC'));
  assert.deepEqual([...new Set(liste.filter((f) => f.enCours).map((f) => f.saison ?? 'pays'))].sort(), ['2627', 'pays']);
  assert.equal(liste.filter((f) => f.enCours).length, 38, 'une quarantaine de fichiers par semaine au plus');
  assert.equal(H.listeDesFichiers({ aujourdhui: new Date('2027-07-02T12:00:00Z') })[16].fichier, 'mmz4281/2728/E0', 'la saison change en juillet');
  assert.deepEqual([H.libelleSaison('0001'), H.libelleSaison('2627'), H.saisonDuFichierPays('2012/2013'), H.saisonDuFichierPays('2026'), H.saisonDuFichierPays('', '2019-05-01')], ['2000-01', '2026-27', '2012-13', '2026', '2019']);
  assert.deepEqual([H.championnatDuMagasin('E0'), H.championnatDuMagasin('EC'), H.championnatDuMagasin('JPN'), H.championnatDuMagasin('USA')], ['EPL', null, null, 'MLS']);
  assert.deepEqual([H.paysDuCode('E3'), H.paysDuCode('SC2'), H.paysDuCode('SWZ'), H.paysDuCode('XX')], ['ENG', 'SCO', 'SWZ', null]);
});

// ======================================================== 2. le vote des noms

test('le vote (règle de footballDataOdds, partagée) : une ligne vote seulement si le jour (± 1) et le score désignent UNE rencontre ; majorité nette de 60 % sur deux votes au moins ; rattachement au plus près à ± 3 jours, jamais deux fois, score vérifié', () => {
  const m = (cle, date, h, a, hg, ag) => ({ match_key: cle, date, home_id: h, away_id: a, home_goals: hg, away_goals: ag });
  const magasin = [
    m('k1', '2026-01-10', 'A', 'B', 2, 1),
    m('k2', '2026-01-17', 'A', 'C', 1, 0),
    m('k3', '2026-01-17', 'D', 'E', 1, 0), // même jour, même score que k2 : ambigu
    m('k4', '2026-01-24', 'C', 'A', 0, 0),
    m('k5', '2026-01-31', 'B', 'A', 3, 3),
    m('k6', '2026-02-07', 'A', 'D', 2, 2)
  ];
  const autour = rencontresParJour(magasin);
  const l = (date, home, away, hg, ag) => ({ date, home, away, hg, ag });
  const lignes = [l('2026-01-11', 'Alpha', 'Beta', 2, 1), l('2026-01-17', 'Alpha', 'Gamma', 1, 0), l('2026-01-24', 'Gamma', 'Alpha', 0, 0), l('2026-01-31', 'Beta', 'Alpha', 3, 3), l('2026-02-07', 'Alpha', 'Delta', 2, 2)];
  const votes = voterParDateEtScore(lignes, autour);
  assert.deepEqual(Object.fromEntries([...votes].map(([n, v]) => [n, Object.fromEntries(v)])), { Alpha: { A: 4 }, Beta: { B: 2 }, Gamma: { C: 1 }, Delta: { D: 1 } }, 'la ligne du 17/01 est ambiguë : elle ne vote pas ; ± 1 jour accepté');
  const idDe = traduireLesVotes(votes);
  assert.deepEqual(Object.fromEntries(idDe), { Alpha: 'A', Beta: 'B' }, 'Gamma et Delta : un seul vote, pas traduits');
  // 60 % pile passe, 50 % non.
  assert.deepEqual(Object.fromEntries(traduireLesVotes(new Map([['X', new Map([['a', 3], ['b', 2]])], ['Y', new Map([['a', 2], ['b', 2]])]]))), { X: 'a' });
  // Rattachement : la plus proche à ± 3 jours, jamais deux fois la même, score vérifié.
  const r = rattacherParIdentifiants(
    [l('2026-01-12', 'Alpha', 'Beta', 2, 1), l('2026-01-10', 'Alpha', 'Beta', 2, 1), l('2026-01-31', 'Beta', 'Alpha', 1, 3), l('2026-02-20', 'Alpha', 'Beta', 0, 0), l('2026-01-17', 'Alpha', 'Gamma', 1, 0)],
    idDe,
    autour
  );
  assert.deepEqual(r.map((x) => [x.etat, x.rencontre?.match_key ?? null]), [
    ['rattachee', 'k1'],
    ['introuvable', null],
    ['score-different', 'k5'],
    ['introuvable', null],
    ['non-traduit', null]
  ]);
});

test('dans une copie : les noms traduits par le vote, jamais par leur ressemblance — « Man City » est le club FotMob de Manchester United quand jour et score le disent, « Zeta Rovers » est Fulham', () => {
  const s = vote();
  const c = s.clubs;
  assert.equal(c['ENG|Man City'].team_id, 'fotmob-10260', 'Manchester United (FotMob 10260) : son nom football-data dans ce site fabriqué est « Man City »');
  assert.equal(c['ENG|Man United'].team_id, 'fotmob-8456', 'et réciproquement');
  assert.equal(c['ENG|Zeta Rovers'].team_id, 'fotmob-9879', 'un nom qui ne ressemble à rien : reconnu quand même, par le vote');
  assert.equal(c['ENG|Arsenal'].team_id, 'fotmob-9825');
  assert.ok(Object.values(c).filter((x) => x.etat === 'vote').every((x) => x.votes >= 2 && x.votes / x.total >= 0.6), 'majorité nette sur deux votes au moins');
  assert.equal(s.incoherents, 0, 'chaque ligne rattachée retrouve la rencontre aux mêmes clubs et au même score');
  // Les votes du pays réunis : un club du Championship comme de l'EPL, une seule identité anglaise.
  assert.ok(Object.keys(c).every((k) => k.startsWith('ENG|') || k.startsWith('USA|')));
  assert.equal(s.idempotent, true, 'le rattachement refait à l’identique ne change rien');
});

test('dans une copie : les clubs anciens gardent une identité stable (nom football-data du pays) ; le lien FotMob vient de la période commune ; conflit, vote seul et championnat non suivi', () => {
  const s = vote();
  const c = s.clubs;
  assert.equal(c['ENG|Wimbledon'].team_id, null, 'un club disparu avant 2023 : son seul nom football-data');
  assert.equal(c['ENG|Wimbledon'].etat, null);
  assert.deepEqual(s.ancienManCity, { n: s.ancienManCity.n, teamId: 'fotmob-10260' }, 'les matchs de 2000-01 du nom « Man City » portent l’identifiant que le vote a donné au NOM');
  assert.ok(s.ancienManCity.n >= 1);
  assert.deepEqual(s.liens.e0Ancien, { 0: s.compte.e2000 }, 'avant le magasin : aucune rencontre FotMob (lien 0)');
  // Conflit : « Spurs » et « Tottenham » jouent EN MÊME TEMPS sous le même identifiant -> ni l'un ni l'autre.
  assert.equal(c['ENG|Spurs'].etat, 'conflit');
  assert.equal(c['ENG|Tottenham'].etat, 'conflit');
  assert.equal(c['ENG|Spurs'].team_id, null);
  // Un vote seul : pas de traduction.
  assert.equal(c['ENG|Brighton & HA'].etat, 'un-seul-vote');
  assert.equal(c['ENG|Brighton & HA'].team_id, null);
  // Un club RENOMMÉ par le site en cours de saison (« Ham-Kam » -> « HamKam ») : les deux noms se succèdent, le même club.
  const avant = c[`USA|${s.renomme.avant}`];
  const apres = c[`USA|${s.renomme.apres}`];
  assert.deepEqual([avant.etat, apres.etat], ['vote', 'vote'], JSON.stringify({ avant, apres }));
  assert.equal(avant.team_id, s.renomme.id);
  assert.equal(apres.team_id, s.renomme.id);
  // National League : jamais rattachée (le magasin ne la suit pas).
  assert.deepEqual(s.liens.ec, { 0: s.compte.ec });
  assert.equal(c['ENG|Yeovil'].team_id, null);
  // Fichier par pays (MLS) : écrit le lendemain à 00:30 heure britannique, rattaché au jour UTC.
  assert.ok(s.liens.usa[1] >= s.compte.usa - 1, JSON.stringify(s.liens.usa));
  assert.equal(s.usaUnJour.heure, '23:30');
  assert.notEqual(s.usaUnJour.date, s.usaUnJour.dateFichier);
});

test('dans une copie : chaque match de la période commune rattaché avec le même score, sauf les pièges plantés ; les écarts de score CONSULTABLES (la rencontre et les deux scores) ; une ligne entre guillemets lue sans décalage', () => {
  const s = vote();
  const t = s.resume.totaux;
  // Les pièges plantés (Tottenham en conflit, « Brighton & HA » un vote seul) restent sans traduction ; les autres
  // lignes sans traduction ont un club que trop peu de lignes désignent sans ambiguïté (la base d'essai n'a qu'une
  // partie de chaque saison) — jamais deux clubs traduits. Tout le reste est rattaché, au même score, sauf l'écart.
  assert.ok(s.pieges.nonTraduits >= 2);
  for (const l of s.lignesNonTraduites) assert.ok(l.etatDom !== 'vote' || l.etatExt !== 'vote', JSON.stringify(l));
  assert.ok(s.lignesNonTraduites.some((l) => l.dom === 'Spurs' || l.ext === 'Spurs'));
  assert.ok(s.lignesNonTraduites.some((l) => l.ext === 'Brighton & HA'));
  assert.equal(t.introuvables, 0);
  assert.equal(t.rattachees + t.nonTraduits + t.ecarts, t.periode, `${t.rattachees} + ${t.nonTraduits} + ${t.ecarts} / ${t.periode}`);
  assert.ok(t.rattachees / (t.periode - t.nonTraduits) > 0.99, 'chaque ligne traduite retrouve sa rencontre au même score, sauf l’écart');
  assert.equal(t.ecarts, 1, 'le seul écart planté');
  const e = s.ecarts[0];
  assert.equal(e.matchKey, s.ecartPlante.matchKey);
  assert.equal(e.scoreMagasin, s.ecartPlante.score);
  assert.equal(e.scoreFootballData, `${Number(s.ecartPlante.score.split('-')[0]) + 1}-${s.ecartPlante.score.split('-')[1]}`);
  assert.ok(e.rencontreMagasin && e.dateMagasin && e.league === 'EPL');
  assert.deepEqual(s.resume.ecarts.liste[0], e, 'le résumé de l’écran les garde, avec les deux scores');
  assert.deepEqual(s.arbitreGuillemets.map((a) => [a.arbitre, a.b365_1]), [['Wiley, A. G.', 210]]);
  assert.equal(s.requetes, 6, 'une requête par fichier');
});

// ===================================================== 3. le curseur de reprise

test('le curseur : un budget de requêtes par passe, reprise au fichier suivant sans rien redemander ; un échec retenté à la passe suivante ; trois échecs de suite arrêtent la passe', () => {
  const s = reprise();
  assert.equal(s.p1.requetes, 2);
  assert.deepEqual(Object.keys(s.p1.parAdresse), ['https://www.football-data.co.uk/new/USA.csv', 'https://www.football-data.co.uk/mmz4281/2627/E0.csv'], 'dans l’ordre du curseur');
  assert.equal(s.p1.arrete, 'budget de 2 requêtes atteint');
  assert.equal(s.p1.curseur, 'mmz4281/2627/E1', 'le curseur dit le prochain fichier');
  assert.equal(s.p1.reste, 4);
  // Passe 2 : E1 en panne (500, trois essais), EC absent (404) ; rien de ce qui est déjà lu n'est redemandé.
  assert.equal(s.p2.parAdresse['https://www.football-data.co.uk/new/USA.csv'], undefined);
  assert.equal(s.p2.parAdresse['https://www.football-data.co.uk/mmz4281/2627/E1.csv'], 3, 'trois essais pour une panne passagère');
  assert.equal(s.fichiersApres2['mmz4281/2627/E1'].statut, 'echec');
  assert.match(s.fichiersApres2['mmz4281/2627/E1'].erreur, /HTTP 500/);
  assert.equal(s.fichiersApres2['mmz4281/2627/EC'].statut, 'absent');
  assert.equal(s.p2.complet, false);
  // Passe 3 : seul le fichier en échec est redemandé ; l'absent de la saison en cours attend une semaine.
  assert.deepEqual(Object.keys(s.p3.parAdresse), ['https://www.football-data.co.uk/mmz4281/2627/E1.csv']);
  assert.equal(s.p3.complet, true, 'importés + absents = tous');
  // Une semaine après, l'absent de la saison en cours est redemandé (une saison passée absente, jamais).
  assert.deepEqual(Object.keys(s.p4.parAdresse), ['https://www.football-data.co.uk/mmz4281/2627/EC.csv']);
  assert.ok(s.p4.etat.termineLe && s.p4.etat.complet);
  assert.equal(s.p5.requetes, 0, 'rien à demander : aucune requête');
  // Relecture hebdomadaire : seul le fichier EN COURS dont la copie a plus d'une semaine ; relu, il est à l'heure.
  assert.deepEqual(Object.keys(s.p6.parAdresse), ['https://www.football-data.co.uk/mmz4281/2627/E0.csv']);
  assert.equal(s.p6.importes, 0, 'même contenu : rien de réimporté');
  assert.equal(s.p6b.requetes, 0, 'la copie relue est remise à l’heure : pas redemandée');
  // Trois échecs de suite : la passe s'arrête là (trois fichiers essayés, trois fois chacun).
  assert.equal(Object.keys(s.p7.parAdresse).length, 3);
  assert.equal(s.p7.echecs, 3);
  assert.match(s.p7.arrete, /trois échecs de suite/);
});

// ===================================================== 4. le ré-import sans doublon

test('ré-import : le même fichier relu ne change rien, relu de force ne double rien ; corrigé par le site, ses lignes sont REMPLACÉES (score changé, ligne retirée, ligne ajoutée) ; les identités des clubs ne bougent pas', () => {
  const s = reimport();
  assert.equal(s.premier.doublons, 0);
  assert.equal(s.second.importes, 0, 'même empreinte : rien de réimporté');
  assert.equal(s.second.inchanges, 1);
  assert.equal(s.second.lignes, s.premier.lignes);
  assert.equal(s.force.importes, 2);
  assert.equal(s.force.lignes, s.premier.lignes, 'relu de force : mêmes lignes, aucune en double');
  assert.equal(s.force.doublons, 0);
  assert.equal(s.corrige.importes, 1);
  assert.equal(s.corrige.requetes, 0, 'repris du cache, sans requête');
  assert.equal(s.corrige.lignes, s.premier.lignes, 'une retirée, une ajoutée, la ligne doublée gardée une fois');
  assert.equal(s.corrige.doublons, 0);
  assert.equal(s.corrige.scoreLu, s.corrige.attendu, 'le score corrigé remplace l’ancien');
  assert.equal(s.identitesStables, true, 'chaque club garde son identifiant fd_teams');
  assert.ok(s.nouveauClub && s.nouveauClub.team_id === null);
  assert.equal(s.corrige.parCode.USA, s.premier.parCode.USA, 'le fichier par pays, intact');
});

// ===================================== 5. et 6. écarts de score, téléchargement partagé

test('les cotes passées (refreshCurrentOdds -> importOddsHistory) rendent la LISTE de leurs écarts de score et déposent chaque fichier téléchargé dans le cache ; l’historique les reprend sans requête', () => {
  const s = partage();
  assert.equal(s.cotesPassees.requetes, 2, 'deux fichiers demandés par les cotes passées');
  assert.equal(s.cotesPassees.scoreMismatch, 1);
  assert.equal(s.cotesPassees.scoreMismatches.length, 1);
  const e = s.cotesPassees.scoreMismatches[0];
  assert.ok(e.matchKey && e.scoreSource && e.scoreMagasin && e.scoreSource !== e.scoreMagasin, JSON.stringify(e));
  assert.equal(e.league, 'EPL');
  assert.deepEqual(Object.values(s.cache).map((c) => c?.identique), [true, true], 'octet pour octet');
  assert.equal(s.cache['mmz4281/2627/E0'].version, 'Mon, 21 Sep 2026 17:50:49 GMT');
  assert.deepEqual(Object.keys(s.historique.parAdresse), ['https://www.football-data.co.uk/mmz4281/2627/E1.csv'], 'seul le fichier que les cotes passées ne lisent pas part au site');
  assert.equal(s.historique.reprisDuCache, 2);
  assert.equal(s.historique.importes, 3);
});

// ======================================================= 7. l'étape de la passe

test('l’étape « historiqueFd » : due tant que l’import n’est pas fini, puis une fois par jour (ou au clic) ; son bilan dit les fichiers, le reste et le rattachement', () => {
  const s = etape();
  assert.equal(s.dueAvant, true);
  assert.match(s.enCours.summary, /^Import complet en cours : 2 fichiers téléchargés à cette passe \(2 requêtes\)/);
  assert.match(s.enCours.summary, /reste 4 fichiers, environ 2 passes/);
  assert.equal(s.enCours.status, 'ok');
  assert.equal(s.dueEnCours, true, 'import pas fini : due à chaque passe');
  assert.equal(s.fini.details.complet, true);
  assert.match(s.fini.summary, /des matchs depuis 2023 rattachés à FotMob avec le même score/);
  assert.equal(s.dueFiniAujourdhui, false, 'fini et fait aujourd’hui : pas due');
  assert.equal(s.dueFiniHier, true, 'une fois par jour');
  assert.equal(s.dueManuel, true, 'au clic');
  assert.equal(s.enPanne.status, 'warn', 'une relecture manquée n’est pas un import en échec');
  assert.match(s.enPanne.summary, /fichier en échec/);
  assert.equal(s.enPanneFichier.statut, 'importe', 'les lignes de la semaine d’avant restent');
  assert.match(s.enPanneFichier.erreur, /HTTP 503/);
  assert.deepEqual(s.enPanneResume.map((e) => [e.fichier, e.relecture]), [['mmz4281/2627/E0', true]], 'l’écran la dit, en relecture manquée');
  const job = fs.readFileSync(path.join(SERVEUR, 'src', 'jobs', 'matchStatsAutoRefresh.js'), 'utf8');
  assert.ok(job.indexOf("key: 'cotesPassees'") < job.indexOf("key: 'historiqueFd'") && job.indexOf("key: 'historiqueFd'") < job.indexOf("key: 'cotesGratuites'"), 'après les cotes passées, dont il reprend les fichiers');
});

// ============================================ 8. l'historique de l'analyse IA

test('l’historique de l’analyse IA (historicalMatchesProvider) lit fd_history par identifiants : mêmes formes qu’avant, aucun club trouvé par ressemblance', () => {
  const s = provider();
  const attendu = s.attenduArsenal;
  const moy = (xs) => Number((xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2));
  assert.deepEqual(Object.keys(s.stats).sort(), ['averages', 'division', 'divisionLabel', 'leagueCode', 'sampleSize']);
  assert.equal(s.stats.sampleSize, attendu.length);
  assert.equal(s.stats.averages.goalsFor, moy(attendu.map((m) => (m.dom ? m.bd : m.be))));
  assert.equal(s.stats.averages.shots, moy(attendu.map((m) => m.tirs)));
  assert.deepEqual([s.stats.leagueCode, s.stats.division, s.stats.divisionLabel], ['E0', 'same', 'Premier League']);
  assert.equal(s.forme.results.length, Math.min(5, attendu.length));
  assert.deepEqual(s.forme.results, attendu.slice(0, 5).map((m) => (m.bd === m.be ? 'N' : (m.dom ? m.bd > m.be : m.be > m.bd) ? 'V' : 'D')));
  assert.equal(s.classement.source, 'football-data.co.uk (historique)');
  assert.equal(s.classement.season, '2627');
  assert.ok(s.classement.rank >= 1 && s.classement.played >= 1);
  assert.equal(s.statsUnited.sampleSize, Math.min(10, s.attenduUnited), 'Manchester United (FotMob) = le nom football-data « Man City » de ce site, par le vote');
  for (const [nom, r] of s.ressemblants) assert.equal(r, null, `« ${nom} » : rien, jamais un club qui ressemble`);
  assert.ok(s.wimbledon && s.wimbledon.results.length >= 1, 'un club disparu, par son nom football-data exact');
  assert.equal(s.horsCouverture, null);
  assert.deepEqual(s.codes, [['EPL', 'E0'], ['Championship', 'E1'], ['La Liga - Spain', 'SP1'], ['Belgium First Div', 'B1'], ['MLS', 'USA'], ['Premier League - Russia', 'RUS'], ['Copa Libertadores', null]]);
});

// =========================================================== 9. la route

test('la route GET /api/match-stats/fd-history : jamais importé, en cours, avec un fichier en échec, complet — en lecture seule (base et data/runtime intacts)', () => {
  const s = route();
  assert.equal(s.jamais.code, 200);
  assert.equal(s.jamais.corps.etat, 'jamais');
  assert.equal(s.jamais.corps.resume, null);
  assert.equal(s.jamais.corps.parPasse, 150);
  assert.equal(s.jamais.corps.fichiersAttendus, 605);
  assert.equal(s.baseInchangeeJamais, true);
  assert.equal(s.enCours.corps.etat, 'en-cours');
  assert.ok(s.enCours.corps.resume.totaux.matchs > 0);
  assert.equal(s.avecEchec.corps.resume.fichiers.echecs.length, 1);
  assert.equal(s.avecEchec.corps.resume.fichiers.echecs[0].fichier, 'mmz4281/2627/EC');
  assert.equal(s.complet.corps.etat, 'complet');
  assert.equal(s.complet.corps.resume.fichiers.echecs.length, 0);
  assert.ok(s.complet.corps.resume.taille.octets > 0, 'la taille ajoutée est mesurée');
  assert.ok(s.complet.corps.import.tailleBaseAvant > 0 && s.complet.corps.import.tailleBaseApres > 0);
  assert.equal(s.baseInchangee, true, 'lire n’écrit rien dans la base');
  assert.equal(s.runtimeInchange, true);
  assert.notEqual(s.match.corps?.etat, 'complet', '« fd-history-bidon » n’est pas la route');
});

// ======================================== 10. la table de référence

test('la table de référence : un stade par club (coordonnées, pelouse synthétique ou non), l’altitude seulement depuis la liste faite à la main, et les derbies par identifiants', async () => {
  const R = await import('../src/data/reference/donneesDeReference.js');
  const { ALTITUDES, SOURCE_ALTITUDE } = await import('../src/data/reference/altitudes.js');
  const stades = R.lireStades();
  assert.ok(stades?.sources?.stades && stades.sources.altitude === SOURCE_ALTITUDE);
  const clubs = Object.entries(stades.clubs);
  assert.ok(clubs.length > 800, `${clubs.length} clubs`);
  for (const [id, s] of clubs) {
    assert.match(id, /^fotmob-\d+$/);
    if (s.lat !== null) assert.ok(Math.abs(s.lat) <= 90 && Math.abs(s.long) <= 180, id);
    assert.ok(s.synthetique === null || typeof s.synthetique === 'boolean');
    assert.equal(s.synthetique, s.pelouse ? /artificial|synthetic|turf/i.test(s.pelouse) : null, `${id} : pelouse ${s.pelouse}`);
    if (s.altitude !== null) assert.ok(ALTITUDES.some((a) => a.altitude === s.altitude), `${id} : altitude hors de la liste`);
  }
  assert.ok(clubs.filter(([, s]) => s.lat !== null).length / clubs.length > 0.95, 'les coordonnées de presque tous les clubs');
  assert.ok(ALTITUDES.every((a) => a.altitude >= 1450 && a.villes.length && a.pays));
  // Bolívar (La Paz) haut, Arsenal (Londres) sans altitude.
  assert.equal(R.altitudeDuClub('fotmob-5983'), 3640);
  assert.equal(R.altitudeDuClub('fotmob-9825'), null);
  // Distances : Manchester United - Manchester City, quelques km ; Arsenal - Bolívar, plus de 9 000 km.
  assert.ok(R.distanceEntreClubs('fotmob-10260', 'fotmob-8456') < 15);
  assert.ok(R.distanceEntreClubs('fotmob-9825', 'fotmob-5983') > 9000);
  assert.equal(R.distanceKm({ lat: 0, long: 0 }, { lat: 0, long: 1 }).toFixed(1), '111.2');
  // Derbies : deux clubs différents par identifiants, trouvés dans un sens comme dans l'autre.
  const derbies = R.lireDerbies();
  assert.ok(derbies.source && derbies.derbies.length >= 40);
  for (const d of derbies.derbies) {
    assert.equal(d.clubs.length, 2);
    assert.ok(d.clubs.every((c) => /^fotmob-\d+$/.test(c.id)) && d.clubs[0].id !== d.clubs[1].id, d.nom);
  }
  assert.equal(R.derbyEntre('fotmob-8456', 'fotmob-10260')?.nom, 'Derby de Manchester');
  assert.equal(R.derbyEntre('fotmob-10260', 'fotmob-9825'), null);
  assert.equal(R.pelouseSynthetique('fotmob-9825'), false);
});

test('les pages de match FotMob gardent désormais le pays et les coordonnées du stade (meta.country, meta.lat, meta.long) ; jamais des coordonnées 0, 0', async () => {
  const { __testing } = await import('../src/data/providers/fotMobProvider.js');
  const page = (stade) => ({ general: {}, header: { status: {} }, content: { matchFacts: { infoBox: { Stadium: stade } } } });
  const m = __testing.mapMeta(page({ name: 'Estadio Olímpico Patria', city: 'Sucre', country: 'Bolivia', lat: -19.033640857, long: -65.257866383, capacity: 32000, surface: 'grass' }));
  assert.deepEqual([m.stadium, m.city, m.country, m.lat, m.long, m.capacity, m.surface], ['Estadio Olímpico Patria', 'Sucre', 'Bolivia', -19.033640857, -65.257866383, 32000, 'grass']);
  const zero = __testing.mapMeta(page({ name: 'X', lat: 0, long: 0 }));
  assert.equal(zero.lat, undefined);
  const texte = __testing.mapMeta(page({ name: 'Y', lat: '51.5', long: '-0.1' }));
  assert.deepEqual([texte.lat, texte.long], [51.5, -0.1]);
  assert.equal(__testing.mapMeta(page({ name: 'Z', lat: 95, long: 10 })).lat, undefined, 'hors bornes');
});

// ============================================================ 11. le code

test('lecture du code : aucune ressemblance de nom dans l’historique ni dans l’historique de l’analyse IA, rien vers match_odds, un en-tête de navigateur et 1,5 s entre deux requêtes', () => {
  const histo = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'providers', 'footballDataHistory.js'), 'utf8');
  const provider = fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'providers', 'historicalMatchesProvider.js'), 'utf8');
  // Les imports et les appels (les commentaires racontent l'ancienne lecture par ressemblance, sans l'appeler).
  const imports = (t) => [...t.matchAll(/^import [^;]+;/gm)].map((m) => m[0]).join('\n');
  for (const [nom, code] of [['footballDataHistory.js', histo], ['historicalMatchesProvider.js', provider]]) {
    assert.doesNotMatch(imports(code), /teamNameMatch|clubDuMagasin|sourceMatching|nameIdentity/, `${nom} : importe une règle de ressemblance de nom`);
    assert.doesNotMatch(code, /\b(findBestTeamNameMatch|teamNamesLikelyMatch|clubDuMagasin|sharesNameToken|resolveTeamId|levenshtein)\s*\(/i, `${nom} : appelle une ressemblance de nom`);
    assert.doesNotMatch(code, /INSERT INTO match_odds|UPDATE match_odds/, `${nom} : écrit dans match_odds`);
  }
  assert.doesNotMatch(imports(provider), /node:fs|node:path/, 'le dossier de CSV n’est plus lu');
  assert.doesNotMatch(provider, /DATA_DIR|readdirSync|readFileSync/);
  assert.equal(H.ECART_MS, 1500);
  assert.match(histo, /'User-Agent': UA/);
  assert.equal(H.REQUETES_PAR_PASSE, 150);
  // Le seul nom « corrigé » à la main est un octet abîmé à la source.
  assert.ok(histo.includes("const NOMS_ABIMES = { [`Preu${CARACTERE_ABIME}xen Münster`]: 'Preußen Münster' };"), 'une seule correction de nom, celle de l’octet abîmé');
  assert.ok(histo.includes('const CARACTERE_ABIME = String.fromCharCode(0xfffd);'));
});
