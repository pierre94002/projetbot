/**
 * LES CHIFFRES DES JOUEURS (étape 34, lot 1a, 03/11/2026) — la frontière de l'empreinte du moteur et le gel de l'essai 27.
 *   node --test test/joueursFrontiere.test.mjs        (depuis server/)
 *
 * T-X1 l'empreinte du moteur (16f2459…) et celle de la candidate (f01dd8496f56a415) ne bougent pas ; aucun fichier de
 *      l'étape 34 sous core/ ni sports/ (quelle que soit l'extension) ni dans l'empreinte ; data/db/playerPropsInputs.js
 *      n'existe pas ; TOUS les fichiers gelés (fermeture des imports recalculée en partie 0, 78 ; chemin de nuit de
 *      l'essai 27 ; producteurs, dont les 12 cachés ; data/contexte/ ; data/cartons/ de la 33, scellé) et les interdits du
 *      §7.1 identiques à l'octet à la partie 0 — seuls lancements.js et matchStatsDb.js peuvent changer (ajout pur) ;
 * T-X2 depuis TOUTES les racines de la règle du gel (les fichiers du moteur, le chemin de nuit de l'essai 27, les
 *      producteurs dayTable / forcesButs / forcesButsEnfant, les 12 producteurs cachés), rien n'atteint data/joueurs/
 *      (critique, constat 6) ; matchStatsDb.js et lancements.js n'importent rien de data/joueurs/ ;
 * T-X3 les modules purs : ni horloge, ni hasard, ni base, ni réseau, ni fichier ; reglagesJoueurs.js n'importe rien ;
 *      formulesDesJoueurs.js n'importe que ses trois modules permis ; joueursAuJourJ.js que reglagesJoueurs.js et
 *      formulesDesJoueurs.js ; aucun module pur n'importe forcesButs.js ni matchStatsDb.js ; les bornes de λ = celles de
 *      la base statistique ;
 * T-X4 les lecteurs, la passe, les comptes, le banc n'écrivent rien ; l'enfant ouvre la base EN LECTURE SEULE, une fois,
 *      sans horloge ;
 * T-X5 la déclaration de l'étape 34 AVANT le regard : portée « paris-joueurs » À LA FIN de PORTEES ; vues
 *      `pour: ['paris-joueurs']` seulement, jamais après le 23/09/2026 ; les 11 variantes (la retenue en tête, les cinq
 *      faux joueurs dont placebo-passeur) ; le lancement daté au premier démarrage ; fenetresVues('27') et
 *      compterVariantes('27') inchangés ;
 * T-X6 aucun marché de joueur au lot 1 : MARCHES_CONNUS sans buteur, ni tirs cadrés d'un joueur, ni averti, ni passeur ;
 *      settlementRules.js, settlementService.js, saisiesCotes.js, markets.js, MarketPicksBoard.vue, LineupPitch.vue
 *      identiques à l'octet (dans la liste de T-X1) ;
 * T-X7 le jugement provisoire de l'essai 27, rejoué sur une copie, identique à l'octet : c'est T-X7 de
 *      contexteFrontiere.test.mjs (ajusté additivement : le lancement 34 noté au premier démarrage comme 32 et 33) ;
 * T-X8 openDb sur une copie de forme réelle crée les 4 tables des joueurs, aucun index ; indexAttendus() complet ; une
 *      seconde ouverture ne change rien ; chaque entrée du DDL commence par son ordre ;
 * T-X9 (lot 1a) aucun fichier hors de data/joueurs/ n'importe data/joueurs/ (ni statiquement, ni par import()) : le
 *      serveur, l'actualisation, les analyses IA, l'aperçu et les enregistreurs se chargent quoi qu'il arrive à
 *      data/joueurs/ ; le graphe des imports statiques depuis server.js n'atteint aucun fichier de data/joueurs/ ;
 *      lineupContext.js et matchStatsAutoRefresh.js NE SONT PAS touchés (critique, constat 1 : le lot 1a s'en passe).
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { fichiersDuMoteur, empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import * as LANC from '../src/bench/lancements.js';
import { enregistrerLancements, fenetresVues, compterVariantes, lancementDe } from '../src/bench/trialsRegistry.js';
import { MARCHES_CONNUS } from '../src/sports/football/markets.js';
import { BORNES_LAMBDA, PERIODES_DU_BANC, DECISION_DE_PIERRE } from '../src/data/joueurs/reglagesJoueurs.js';
import { BASE_STATISTIQUE } from '../src/data/contexte/bancDuContexte.js';

const SRC = path.join(SERVEUR, 'src');
const RACINE = path.join(SERVEUR, '..');
const JOUEURS = path.join(SRC, 'data', 'joueurs');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const FICHIERS_34 = fs.readdirSync(JOUEURS).map((f) => `data/joueurs/${f}`);

/**
 * LES FICHIERS GELÉS et leur sha1 (octets bruts) relevés en partie 0 (SCR34\partie0\gel-depart.json, = dépôt) : la
 * fermeture des imports de l'empreinte (recalculée, 78 fichiers), les modules de l'empreinte, le chemin de nuit de
 * l'essai 27, les producteurs (dayTable, forcesButs, forcesButsEnfant et les 12 producteurs cachés), data/contexte/,
 * data/cartons/ de la 33 (scellé : critique de la 34, constat 7) et les interdits du §7.1 — sauf lancements.js et
 * matchStatsDb.js (ajout pur permis, T-X7) et engine-config.json (données du bac).
 */
const INTERDITS = Object.freeze([
  ['api/controllers/matchStats.controller.js', '6081a7cd00409e34656fb8d071a0e4ce2018fbec'],
  ['api/controllers/statValue.controller.js', '7fa9e8204a4c5a1ef03d23cdf461833d98abaf78'],
  ['bench/entrees.js', '38fdc199677e61691bc5c56c4fa63f88cd489a93'],
  ['bench/essaiCandidate.js', 'e493518bb9c57be53deeeaf77cac18e21ea6865a'],
  ['bench/guard.js', '60551323d356d5502684ca32276793fcb946ef84'],
  ['bench/horizonEssai.js', 'db2ee326f8f88f09a5582c7e297cfd4bd7c9d51b'],
  ['bench/jugeAPart.js', '2c1434cefe5b21055c313750ce0a1c2c8f6abc12'],
  ['bench/metrics.js', 'c40ebc02607830dec623d071c0d70778f26cf806'],
  ['bench/periodes.js', 'd8b5264a88fd7ef241fb16bd209f3928c53ac628'],
  ['bench/prix.js', '0f33a6b56d5238057be45f5720f2050dac22bf6a'],
  ['bench/resume.js', 'fa1761404b7d1001c8cb61c2d56bf64bf1332991'],
  ['bench/runner.js', '5e8711c9298b63d2682d61936fe185a308136fef'],
  ['bench/simulateBets.js', '523189cda6c82d77368f5b04e5877321d2d5f0d1'],
  ['bench/statValue.js', 'd08c78df17760083f8d9d649d448598db52e5ec4'],
  ['bench/trialsRegistry.js', '3eca30850f4844f924ed1ec47b497606a68dec30'],
  ['config/bacASable.js', '51f4bf847f1bbb4a81d291a96566e3e9cb13af21'],
  ['config/env.js', '6003ca2e8318a7a088737d5ec32dca4ddfe39aa7'],
  ['core/ai/aiConfigStore.js', 'b4158fbd31c688851db5b327c6bf91cb9c567b4b'],
  ['core/ai/anthropicClient.js', '044d69988b2a27fa2fa5ef90573ac9736f0eecb6'],
  ['core/ai/autoMatchAiTrigger.js', '159b22f70a67f6bf7e77b4fadbb4426e9f7313f1'],
  ['core/ai/webLookupPrompt.js', 'c43ea47071de9a60556cb3098937f0cd9ccdb2b9'],
  ['core/ai/webLookupService.js', '657bf53be4d8aea556b3878aa1be190644578005'],
  ['core/engine/coteMinimale.js', '0ea5dee5c0b3e1faf6b7bbac63d1e7b9980cc60b'],
  ['core/engine/engineConfig.js', '87b6ac0fd2ebafa432c2adeb3beac591177a3dfa'],
  ['core/engine/engineVersions.js', '5765ef8ea759a5413397e6b44aafb6c496fc674b'],
  ['core/engine/fraicheurCotes.js', 'd7f4bf125d8b7902d86767b2d8344f457f5c9094'],
  ['core/engine/goalModel.js', '236a33d7f952b12d4596b02ecb7c6090afca137d'],
  ['core/engine/motsDuModeleDeButs.js', '1c81f14ce0e25e3af595318028234c565798eea0'],
  ['core/engine/noteDuModeleDeButs.js', '654e310c28e88de98c2f2ccf247b64ba5c3babaf'],
  ['core/engine/oddsEngine.js', 'c376393d980ca569b4562191369c1cd8a7ff56b2'],
  ['core/engine/resultPrediction.js', 'df32c8d76e8c720c9c42e156bc6943b0b4a1b7df'],
  ['core/engine/scorePrediction.js', '44bb6ed76ed724981de01b8d48b5a91ccb59dbed'],
  ['core/engine/tiltState.js', 'de63bb4a3c63d88facbf89b70e8d79874ba27cc2'],
  ['core/engine/valueFinder.js', '25e4757198fc09a1119de41cdef52eb553368e6a'],
  ['core/engine/verdictPari.js', '368d73a39b081948dd6d49bfa9add6789c0490f3'],
  ['core/engine/vosBookmakers.js', '9abf1962a1c47d854cbc161624249a4df657279f'],
  ['core/errors.js', '649f52978b4261ddf63fb5ac5c7efcdd04e1df4a'],
  ['core/market/marginRemoval.js', 'b3deabcfcf1fe1d7f875d93a1b327b6efc0e883f'],
  ['core/model/dixonColes.js', '83c4cf5111c071ca7f95422f826125ecd464484f'],
  ['core/model/poisson.js', '78be7262cce935f745491e220804da4e8e093aa8'],
  ['core/risk/exogenousFactors.js', 'fd7749a7d45ba0fd779d26a8c873b04b860ed630'],
  ['core/risk/gardeFous.js', '2edd957379facdb0915308f8404114d0786a70f5'],
  ['core/risk/seriesDePertes.js', '84ad459c0c2794a2af3e89820f6ae8bbf98059ad'],
  ['core/risk/staking.js', '6522d9ea3662ea39fb1eb45afe11bf3f2ce20080'],
  ['core/risk/structuralFactors.js', '4a21c27362e21c93f5f3110aa99479a638385b36'],
  ['core/settlement/settlementRules.js', '67eac67e465e395b87e71aaa6d7228f0e57b6011'],
  ['core/signals/cornersSignal.js', '28e6d8c721386a522f1d4ca3fd2b5259a48ca5c8'],
  ['core/xg/xgSmoothing.js', '3a125f8d663be5c07c2d7afeb07e98523e3dbea4'],
  ['core/xg/xgStructural.js', '724a35bcf329112a3ec6d3e9f6d2a13d026d7919'],
  ['data/adapters/oddsApiAdapter.js', '27a3c37d2a450a396db8fc3feeb2dd4a2f2c56a2'],
  ['data/adapters/sampleMatchAdapter.js', '81af4e0bdea7b720f0c849705289602e2f223b47'],
  ['data/adapters/seasonCalendarAdapter.js', 'fb3e9ef6f44a0f57c13857a472a37c898c8aedef'],
  ['data/calibration.js', '0aeb1e51aace6724b549b96defbd7df0d43eebba'],
  ['data/cartons/bancDesCartons.js', 'b51ff279d913994ec60033b0306d6e45b2984b5b'],
  ['data/cartons/cartonsAuJourJ.js', 'ba074b67a7db971f9a02ad147ce35d8c73117097'],
  ['data/cartons/cartonsEnfant.js', 'ed4d78046e6559fe8d747a750627f64fc25f121f'],
  ['data/cartons/cartonsNuit.js', 'a19b01e22826a08d2f7c7c3238e0af0ac745c801'],
  ['data/cartons/cartonsRead.js', '8f7ef91d15f632ed7f88df5af56dc499909165bb'],
  ['data/cartons/comptesDesCartons.js', '1e73941f83f909457ba0d398882854135f565e9f'],
  ['data/cartons/controleDesCartons.js', '03f7e6e2e87cc8718f010120f0892b4d4ee99691'],
  ['data/cartons/formulesDesCartons.js', '72d4d13eb9e4c637015e9a730ace605b94887a05'],
  ['data/cartons/lectureDesCartons.js', '36fabc74c3c6d3547b578d24d03ce228b69cd109'],
  ['data/cartons/noteDesCartons.js', '2dd43653e0433a48fb66af63c8182943ee094478'],
  ['data/cartons/reglagesCartons.js', '52a672fef7ca26b7aff1f12287929d09219a2903'],
  ['data/closingValue.js', '5f3f716c2e12fc09d12b4bdc0ed22d3af6aca063'],
  ['data/contexte/bancDuContexte.js', 'beaee6f2ae7064b46fb599e9a588e398e3fce229'],
  ['data/contexte/contexteAuJourJ.js', 'f186e369ff35802dfce11ed33a475b16d610f351'],
  ['data/contexte/contexteBancEnfant.js', '2e81fe97eb163c65f41d2bb75a4aa2851c4c7425'],
  ['data/contexte/contexteEnfant.js', 'c06b6fdfbf5245f14b36a50178143dc5f0206a8c'],
  ['data/contexte/contexteNuit.js', '4737fcae70624a0de88bbe938b321f4bb84e21be'],
  ['data/contexte/contexteRead.js', '50033e8be8df5cec4e9c4ec04a22f71ea53753d6'],
  ['data/contexte/controleDuContexte.js', 'a0a4cc650d5d07f5e5626e67820b0a51d67da4e7'],
  ['data/contexte/formulesDuContexte.js', '537f52a0baef43b4fcb90048ea6d87f5cab105e9'],
  ['data/contexte/lectureDuMagasin.js', '544470fd88e2227265e51f6c6f2109ddcf71b7fa'],
  ['data/contexte/listeDuCalendrier.js', '6f2c22b2625dcbbb2e13adc060e4899e3e123627'],
  ['data/contexte/noteDuContexte.js', '558904a1745b6b8f2d0d156082fe28a8ada4eb50'],
  ['data/contexte/preuveDuContexte.js', '69aa3bb32585d33825210f1efea5444185ea500a'],
  ['data/contexte/reglagesContexte.js', '066ad471fcdcf2be1f36c1aa18b3acbcdfc93262'],
  ['data/db/columns.js', '325d985101ae32bab53546e68eff1a437afc341b'],
  ['data/db/dayTable.js', 'afc8d42ccc9028531da8d9efc2700ece449d6a97'],
  ['data/db/dayTableControle.js', 'e1cc9dc99ed6e8160656bf3cc331285890f390f1'],
  ['data/db/derniereComposition.js', 'c7692408cff449853c7423166d60ffe84cba3f49'],
  ['data/db/entreesButs.js', '85ef724fc5749bc95baaa67931df5edcec77e046'],
  ['data/db/forcesButs.js', '4ecda40200d8da352bc8c51adefb1152de4af916'],
  ['data/db/forcesButsEnfant.js', '535aadac696d1b3946c979691a6434f99a115b80'],
  ['data/db/identityRegistry.js', '6a5bcdd1d85e10909de81a9174b6d3fa8afbccdf'],
  ['data/db/leagueBenchmarks.js', '1c5c192ce3ba261f884c37541dd46b14736746c7'],
  ['data/db/matchStatsRead.js', '7dc674629218dc5434ec97e421de3467ba440a0b'],
  ['data/db/oddsProfileRead.js', '454e6b98f288b62eca9f945ca8940dc1301df1d4'],
  ['data/db/oddsQuotesRepository.js', 'd9c661abf573b9b22569f78b93c9d3e5d643d826'],
  ['data/db/playerRatings.js', '86bf49658a97a61a2eda62ed72ebb600e7fc9b75'],
  ['data/db/playerRatingsBanc.js', '4113bbe73ebd231549769de47669aadaa2f1acc7'],
  ['data/db/playerRatingsEnfant.js', 'd623b94e8a2013a137db9f13be9e6ade36fac833'],
  ['data/db/refereeRead.js', '0eb2c468dd9ea492a1e9b3a0de9ce14460f2d22f'],
  ['data/db/scoreFormRead.js', '46e2c8b26c722becce3192e7fa157ce4738ec21c'],
  ['data/db/statInputsRead.js', '45470ac1777308c673eea1d2a127b956aeac1240'],
  ['data/db/teamStrength.js', '558e33d3441a33cd4b6106cc64edc7e7cd68b297'],
  ['data/db/verrouEcriture.js', '136fb6439e630a059a1bdcc832dbfa70bc9618b1'],
  ['data/enregistreurs/communs.js', 'f501e81e500841564ddd46fdcd0271afb9c2f1a0'],
  ['data/enregistreurs/depot.js', 'd88d29902815b0ad57e861e7816582891e41b25b'],
  ['data/enregistreurs/file.js', 'f6e7c6d9bc63e1f1bd5e75a93e96de1d5e4449ba'],
  ['data/enregistreurs/gelPronostics.js', '611e99c209a5e211a9425c5d2fb1aac09304e029'],
  ['data/enregistreurs/moteurABlanc.js', 'dcae55b108636346925aec4db5559d8938edb0e5'],
  ['data/freeMarketOdds.js', '039a2790369cacf5958ff66dab413d96fb873b93'],
  ['data/marketKnowledge.js', 'fa4ae59cb72c2c02169f583b0a84a2fedd9430a7'],
  ['data/marketMovement.js', 'c74b1d38e42c7a778c64e3756fe96130f6b42da4'],
  ['data/matchSources.js', 'dc005be4ea560c8e7b168954c3aaa6b548a4e8fa'],
  ['data/providers/apiFootballClient.js', 'e75dec572e04d70ca1de8ce01387ac64d0ec77bc'],
  ['data/providers/espnOdds.js', '6f43ee8726967e7deae053301c3fde97715bc6f1'],
  ['data/providers/footballDataCache.js', '747209bf76c3cb667d0d8bb17c9135a2547fdf80'],
  ['data/providers/footballDataHistory.js', 'f2f11797ef360cc713c1854a0d1b2bcc9cf7f469'],
  ['data/providers/footballDataOdds.js', 'c918adfbd3efea3c95531f7ac14291374b336e9f'],
  ['data/providers/fotMobProvider.js', '5888cfc4c6df99ce91c956a7dc3376ecdf724b0e'],
  ['data/providers/fotMobRefresh.js', 'ebf7e06758d35229022ebe4432b2a9b0c7d71d78'],
  ['data/providers/freeOdds.js', 'b457c7c8348422d8c7db1d5dd577cc9ca03cdc46'],
  ['data/providers/kalshiOdds.js', '019cf28fde01fa40848b501c44a23c8780e107e6'],
  ['data/providers/leagueCups.js', 'f729d74147c8f0b59a74045056ac71040b71c923'],
  ['data/providers/leagueRegistry.js', '7ce2e928eb3c34262b73bab61bd0878b539043f6'],
  ['data/providers/lineupContext.js', '2560f4f19dfc5e2f9e970d9e2368b691dc1bceac'],
  ['data/providers/lineupPrefetch.js', '3aed24e434d84d76a8acae949c3cb8abb8e6598a'],
  ['data/providers/matchEnrichment.js', '22c9be3d901c23c3313e008f48377a1fcf2b369d'],
  ['data/providers/refreshLock.js', 'c57a4c7b7ff14f598ada36a19c8e90b67ddcc4de'],
  ['data/providers/seasonWindows.js', 'b4bcebaeea43ea10a0b10ac13b87e7c447d232b8'],
  ['data/providers/settlementService.js', 'ee5ed0786f48fb36558184356f26c0a8e95c5436'],
  ['data/providers/smarketsOdds.js', '282b069e4757f3f1d37297d1b6931e4e0fd90df1'],
  ['data/providers/sourceMatching.js', '5aaba6a9d8f5c2d0e4c3159255d96d5c7123b67f'],
  ['data/providers/standingsService.js', '5ff06688e36c3035f713138906e6dfababe96930'],
  ['data/providers/teamStatsService.js', '00f65e5718f44ad72d07e75138d6e9662fdc2a79'],
  ['data/relevesDesSources.js', 'f18141322bb026f5a1a1ad32c9b9894be1c34092'],
  ['data/repositories/autoAiAnalysisRepository.js', 'b39a3b130edede3921d60d6b7d5a03d1b563b8e3'],
  ['data/repositories/betsRepository.js', 'd2618ca1b9435cd1ba97001217125cb55e2f1bc4'],
  ['data/repositories/claudeUsageLedger.js', 'a35c69bde1f31c24940e038737e0f2f0edd606f4'],
  ['data/repositories/comptesBookmakersRepository.js', 'e3854a3e5357ad335958b194bdf9f649faab9f3a'],
  ['data/repositories/fixturesRepository.js', 'c8e0b39339cfecdc5dc2a1697e72293c3681a469'],
  ['data/repositories/gardeFousRepository.js', '000c1a9618f596b90733a37432e182bc3ed7dc43'],
  ['data/repositories/matchResultsRepository.js', 'eb4ae2c200138b590efc30a0562ad0efcba12f30'],
  ['data/repositories/matchStatsWebRepository.js', 'a8e640540c3aba129655d7da15bb97c4f863d332'],
  ['data/repositories/predictionsRepository.js', '4e64fff1353b9489aec54c4fcd1eb10685ebba3d'],
  ['data/repositories/seasonCalendarRepository.js', '0405d625d7cda3348adc79a703acaa11e36ca0e6'],
  ['data/repositories/statsCacheRepository.js', '94bbd1da66d5ff9a4f356abc739689f43305bc73'],
  ['data/repositories/teamProfileRepository.js', '60cd1a4adbbdf6ad2136b453c8958fd0eb5ac3af'],
  ['data/roadmap/plan.js', '124d9c5086df25d06cb71b441d5f907570b21076'],
  ['data/saisiesCotes.js', '1449bbbdc1fd5f08d94af42dc17a82fc728512b4'],
  ['data/suiviParis.js', 'd9a63c4b019b365d44639bd87a2d8d37b0a5567a'],
  ['jobs/enregistreurs.js', '84349ec9bde0b474d46185e03e6edb5ef4adcf11'],
  ['jobs/kickoffAiAnalysis.js', '1260f4b8cd46510c840e1d6fb3459c2765c356a8'],
  ['jobs/matchStatsAutoRefresh.js', 'deb3f3a195bc251ba5b851d8ef101f8afb9fdeea'],
  ['sports/football/bookmakerConsensus.js', '70ee1711b3040108d54ded41131606b81ff256eb'],
  ['sports/football/index.js', '7862358c3a6c356461075ae6a3300ccd7ebc812c'],
  ['sports/football/markets.js', 'c1296b56003be5cb170525d69047ea6745679424'],
  ['sports/football/model.js', '253a664344483f8ae2a3ec89e90471d6ccca541a'],
  ['sports/football/scoreMatrix.js', 'd04ef225bae98fa851737433f828ab57f48c73e2'],
  ['sports/football/statMarkets.js', '86fe12b131b4315e9f9020659c93f2ed7461222d'],
  ['sports/football/xgBaseline.js', '1774c087b4d3076900ae9a3547f7af4b42407729'],
  ['sports/index.js', '963bc8caf965c7bc8be7faad62c14de2e0427081'],
  ['sports/sportPort.js', '433369bfb949df9cc2d37acdec358f9a073f69d6'],
  ['utils/atomicJson.js', 'fbc39689e775107a6e987ef17ff01687fa8317e4'],
  ['utils/calculLourd.js', 'b8bf077054354c18d813fb6d05b29f704facccb0'],
  ['utils/nameIdentity.js', '4d0a4b28500ab2fde0d02bbfca1ba2ab01e17d48'],
  ['utils/statVocabulary.js', 'fa33e8aec2826a2fa05f7c815a1f4006bcb1cc56'],
  ['utils/teamNameMatch.js', '8f7c2242321185c041b0c535d79d048cc61bc9db'],
  ['utils/travailCooperatif.js', '9a07336ed530f1e47d4d7642969be02a5f96907d']
]);
const INTERDITS_UI = Object.freeze([
  ['ui/src/components/analysis/MarketPicksBoard.vue', 'bb8cd5ced6dd7c8264467f80e47fe248f1e1a4dd'],
  ['ui/src/components/matches/LineupPitch.vue', '0bc9124c6228b303a98342128a2f7acddc6b8661']
]);

/** Les fichiers atteints par les imports relatifs (statiques et dynamiques, ou statiques seulement) d'un ensemble de départ. */
function atteints(depart, { statiquesSeulement = false } = {}) {
  const vus = new Set();
  const pile = [...depart];
  const re = statiquesSeulement ? /(?:^|\n)\s*(?:import|export)\s[^'"`;]*?from\s+['"](\.{1,2}\/[^'"]+)['"]|(?:^|\n)\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/g : /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    const texte = statiquesSeulement ? sansCommentaires(f) : fs.readFileSync(f, 'utf8');
    for (const m of texte.matchAll(re)) {
      let cible = path.resolve(path.dirname(f), m[1] ?? m[2]);
      if (!/\.(m?js|json)$/.test(cible) && fs.existsSync(`${cible}.js`)) cible += '.js';
      pile.push(cible);
    }
  }
  return vus;
}
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const tousLesFichiers = (dossier) => (fs.existsSync(dossier) ? fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dossier, f)).isFile()) : []);

test('T-X1 les empreintes ne bougent pas ; aucun fichier de l’étape 34 sous core/ ni sports/ ni dans l’empreinte ; playerPropsInputs.js absent ; tous les fichiers gelés identiques à l’octet à la partie 0', () => {
  assert.equal(empreinteDuCode({ rafraichir: true }).empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  assert.ok(FICHIERS_34.length >= 8, FICHIERS_34.join(', '));
  for (const racine of ['core', 'sports']) {
    for (const f of tousLesFichiers(path.join(SRC, racine))) {
      assert.doesNotMatch(f, /joueurs[\\/]|playerProps|playerMarkets|buteur/i, `${racine}/${f} : un fichier de l’étape 34 sous ${racine}/`);
      assert.doesNotMatch(fs.readFileSync(path.join(SRC, racine, f), 'utf8').slice(0, 4000), /[ée]tape 34/i, `${racine}/${f} parle de l’étape 34`);
    }
  }
  const empreinte = fichiersDuMoteur();
  for (const f of FICHIERS_34) assert.ok(!empreinte.includes(f), `${f} dans l’empreinte`);
  assert.ok(!MODULES_DU_MOTEUR.fichiers.some((f) => /joueurs\/|playerProps/i.test(f)));
  assert.equal(fs.existsSync(path.join(SRC, 'data', 'db', 'playerPropsInputs.js')), false, 'data/db/playerPropsInputs.js n’est pas créé au lot 1');
  assert.ok(INTERDITS.length >= 160, `${INTERDITS.length} fichiers gelés`);
  for (const [f, attendu] of INTERDITS) assert.equal(sha1(fs.readFileSync(path.join(SRC, f))), attendu, `${f} : retouché (gelé pendant l’essai 27, ou interdit au lot 1 de l’étape 34)`);
  for (const [f, attendu] of INTERDITS_UI) assert.equal(sha1(fs.readFileSync(path.join(RACINE, f))), attendu, `${f} : retouché`);
  for (const dossier of ['contexte', 'cartons']) {
    const presents = fs.readdirSync(path.join(SRC, 'data', dossier)).map((f) => `data/${dossier}/${f}`).sort();
    assert.deepEqual(presents, INTERDITS.map(([f]) => f).filter((f) => f.startsWith(`data/${dossier}/`)).sort(), `aucun fichier ajouté ni retiré sous data/${dossier}/`);
  }
});

test('T-X2 depuis TOUTES les racines de la règle du gel, rien n’atteint data/joueurs/ ; matchStatsDb.js et lancements.js n’importent rien de data/joueurs/', () => {
  const racines = [
    ...fichiersDuMoteur(),
    'data/enregistreurs/gelPronostics.js', 'data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js',
    'core/engine/engineVersions.js', 'core/engine/engineConfig.js', 'data/db/dayTable.js', 'data/db/forcesButs.js', 'data/db/forcesButsEnfant.js',
    'api/controllers/statValue.controller.js', 'data/contexte/contexteNuit.js', 'data/db/dayTableControle.js', 'data/marketKnowledge.js',
    'data/providers/espnOdds.js', 'data/providers/footballDataHistory.js', 'data/providers/fotMobRefresh.js', 'data/providers/freeOdds.js',
    'data/providers/kalshiOdds.js', 'data/providers/lineupContext.js', 'data/providers/smarketsOdds.js', 'jobs/matchStatsAutoRefresh.js'
  ].map((f) => path.join(SRC, f));
  for (const f of racines) assert.ok(fs.existsSync(f), `racine absente : ${rel(f)}`);
  const graphe = [...atteints(racines)].map(rel);
  assert.ok(graphe.length > 150, `${graphe.length} fichiers atteints`);
  for (const f of FICHIERS_34) assert.ok(!graphe.includes(f), `${f} atteint depuis une racine du gel`);
  for (const f of ['data/db/matchStatsDb.js', 'bench/lancements.js']) assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /['"][./]*(data\/)?joueurs\//, f);
});

test('T-X3 les modules purs : ni horloge, ni hasard, ni base, ni réseau, ni fichier ; leurs imports permis seulement ; les bornes de λ = celles de la base statistique', () => {
  const purs = ['reglagesJoueurs.js', 'formulesDesJoueurs.js', 'joueursAuJourJ.js', 'reglementJoueurs.js', 'comptesDesJoueurs.js', 'bancDesJoueurs.js'];
  for (const f of purs) {
    const code = sansCommentaires(path.join(JOUEURS, f));
    assert.doesNotMatch(code, /Date\.now\(|new Date\(\)|Math\.random|performance\.now|openDb|DatabaseSync|fetch\(|node:fs|from 'fs'|readFileSync|writeFileSync|child_process/, f);
    assert.doesNotMatch(code, /forcesButs|matchStatsDb/, `${f} : un module pur n’importe ni forcesButs.js ni matchStatsDb.js`);
  }
  const imports = (f) => [...fs.readFileSync(path.join(JOUEURS, f), 'utf8').matchAll(/^import .* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.deepEqual(imports('reglagesJoueurs.js'), []);
  assert.deepEqual(imports('formulesDesJoueurs.js'), ['./reglagesJoueurs.js', '../cartons/formulesDesCartons.js', '../../bench/metrics.js']);
  assert.deepEqual(imports('joueursAuJourJ.js'), ['./reglagesJoueurs.js', './formulesDesJoueurs.js']);
  assert.deepEqual(imports('reglementJoueurs.js'), ['./formulesDesJoueurs.js']);
  assert.deepEqual(imports('comptesDesJoueurs.js'), ['./formulesDesJoueurs.js', './reglagesJoueurs.js']);
  assert.ok(!imports('comptesDesJoueurs.js').some((i) => /bancDesJoueurs/.test(i)), 'les comptes n’importent jamais le banc (T-B8)');
  assert.deepEqual([...BORNES_LAMBDA], [...BASE_STATISTIQUE.bornes]);
});

test('T-X4 les lecteurs, la passe, les comptes et le banc n’écrivent rien ; l’enfant ouvre la base EN LECTURE SEULE, une fois, sans horloge', () => {
  for (const f of FICHIERS_34) {
    if (f.endsWith('noteDesJoueurs.js')) continue;
    const code = sansCommentaires(path.join(SRC, f));
    assert.doesNotMatch(code, /\.run\(|INSERT\s|UPDATE\s|DELETE\s|writeJsonAtomic|writeFileSync|\.exec\(/, `${f} : aucune écriture`);
  }
  const enfant = sansCommentaires(path.join(JOUEURS, 'joueursEnfant.js'));
  assert.equal((enfant.match(/openDb\(/g) ?? []).length, 1);
  assert.match(enfant, /openDb\(\{ file: m\.chemin, readonly: true \}\)/);
  assert.doesNotMatch(enfant, /Date\.now\(|new Date\(\)|Math\.random|fetch\(/, 'l’enfant : aucune horloge du jour');
});

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-joueurs-registre-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

test('T-X5 la déclaration de l’étape 34 AVANT le regard : portée à la fin de PORTEES ; vues `pour: [\'paris-joueurs\']` seulement ; les 11 variantes ; le lancement daté au premier démarrage ; fenetresVues(\'27\') et compterVariantes(\'27\') inchangés', () => {
  assert.equal(LANC.PORTEES.at(-1), 'paris-joueurs');
  assert.equal(LANC.PORTEES.at(-2), 'cartons-corners');
  assert.ok(LANC.verifierLancements());
  for (const v of LANC.VUES_DE_L_ETAPE_34) {
    assert.deepEqual([...v.pour], ['paris-joueurs'], `${v.de} → ${v.a}`);
    assert.ok(v.a <= '2026-09-23', `jamais P5 (${v.a})`);
  }
  assert.match(LANC.VUES_DE_L_ETAPE_34[1].quoi, /la conception et la critique y ont lu/);
  const ids = LANC.VARIANTES_DE_L_ETAPE_34.map((v) => v.id);
  assert.deepEqual(ids, ['joueurs-v1', 'buteur-parts', 'buteur-tireur', 'cadres-parts', 'averti-parts', 'passeur-parts', 'placebo-parts', 'placebo-tireur', 'placebo-cadres', 'placebo-averti', 'placebo-passeur']);
  const l34 = LANC.LANCEMENTS.find((l) => l.etape === '34');
  assert.deepEqual([l34.version, l34.le], ['joueurs-v1', null]);
  assert.equal(l34.variantes, LANC.VARIANTES_DE_L_ETAPE_34);
  assert.equal(l34.vues, LANC.VUES_DE_L_ETAPE_34);
  assert.equal(LANC.LANCEMENTS.at(-1), l34, 'le lancement 34 ajouté à la fin');
  for (const portee of LANC.PORTEES.filter((p) => !['tout', 'paris-joueurs'].includes(p))) assert.ok(!LANC.fenetresDeclarees({ portee }).some((f) => f.etape === '34'), portee);
  assert.ok(LANC.fenetresDeclarees({ portee: 'paris-joueurs' }).some((f) => f.etape === '34'));
  const fichier = path.join(DOSSIER, 'registre-t-x5.json');
  const sans34 = { fichier, lancements: LANC.LANCEMENTS.filter((l) => l.etape !== '34') };
  const avant = { f27: JSON.stringify(fenetresVues('27', { fichier })), k27: compterVariantes('27', { fichier }), f27sans: JSON.stringify(fenetresVues('27', sans34)) };
  assert.equal(avant.f27, avant.f27sans, 'le lancement 34 du code ne change pas les fenêtres de 27');
  assert.equal(lancementDe('34', { fichier }), null, 'pas encore lancée');
  const r = enregistrerLancements({ fichier, maintenant: Date.parse('2026-11-03T09:00:00Z') });
  assert.ok(r.nouveaux.some((x) => x.etape === '34' && x.version === 'joueurs-v1' && x.le === '2026-11-03'), JSON.stringify(r.nouveaux));
  assert.equal(JSON.stringify(fenetresVues('27', { fichier })), avant.f27);
  assert.equal(compterVariantes('27', { fichier }), avant.k27);
  assert.equal(compterVariantes('34', { fichier }), 11);
  assert.ok(LANC.ETAPES_A_JUGER.includes('34'));
  assert.equal(PERIODES_DU_BANC.plis.length, 2);
  assert.equal(PERIODES_DU_BANC.dernierJourLu, '2026-09-23');
  // Les décisions de Pierre (02/11/2026, n° 6 et n° 1), remplies avant le scellement (critique, constat 18).
  assert.ok(Object.isFrozen(DECISION_DE_PIERRE));
  assert.deepEqual([DECISION_DE_PIERRE.regles.date, DECISION_DE_PIERRE.marches.date, DECISION_DE_PIERRE.place.date], ['2026-11-02', '2026-11-02', '2026-11-02']);
  assert.deepEqual([...DECISION_DE_PIERRE.marches.valeur], ['buteur', 'tirs-cadres', 'averti', 'passeur']);
});

test('T-X6 aucun marché de joueur au lot 1 : MARCHES_CONNUS sans buteur, tirs cadrés d’un joueur, averti ni passeur ; le règlement et l’écran du moteur intacts (T-X1)', () => {
  for (const m of MARCHES_CONNUS) assert.doesNotMatch(m, /scorer|buteur|playerShots|playerCarded|playerAssist|joueur/i, m);
  for (const f of ['core/settlement/settlementRules.js', 'data/providers/settlementService.js', 'data/saisiesCotes.js', 'sports/football/markets.js']) assert.ok(INTERDITS.some(([g]) => g === f), `${f} est gardé à l’octet par T-X1`);
  for (const f of ['ui/src/components/analysis/MarketPicksBoard.vue', 'ui/src/components/matches/LineupPitch.vue']) assert.ok(INTERDITS_UI.some(([g]) => g === f), `${f} est gardé à l’octet par T-X1`);
});

test('T-X8 openDb sur une copie de forme réelle crée les 4 tables des joueurs, aucun index ; indexAttendus() complet ; une seconde ouverture ne change rien ; chaque entrée du DDL commence par son ordre', () => {
  const copie = preparerCopie({});
  let s;
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-joueurs.mjs'), { args: ['ddl', '{}'] });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    s = r.json;
  } finally {
    copie.nettoyer();
  }
  assert.ok(s.rencontres > 1000, 'une base de forme réelle');
  assert.deepEqual(s.premiere.filter((x) => x.type === 'table').map((x) => x.name), ['joueurs_avant_match', 'joueurs_etat', 'joueurs_fiches', 'joueurs_matchs']);
  assert.deepEqual(s.premiere.filter((x) => x.type === 'index' && !/^sqlite_autoindex/.test(x.name)).map((x) => x.name), [], 'aucun index');
  assert.deepEqual(s.indexDesJoueurs, []);
  assert.deepEqual(s.tousLesIndexAttendus, [], 'tous les index attendus sont en base');
  assert.equal(s.secondeOuvertureIdentique, true);
  assert.equal(s.entrees.length, 4);
  for (const e of s.entrees) assert.match(e, /^CREATE TABLE IF NOT EXISTS joueurs_/, e);
  for (const t of ['joueurs_avant_match', 'joueurs_matchs', 'joueurs_etat']) assert.match(s.premiere.find((x) => x.name === t).sql, /WITHOUT ROWID/, t);
});

test('T-X9 (lot 1a) aucun fichier hors de data/joueurs/ n’importe data/joueurs/ ; le graphe statique depuis server.js n’y mène pas ; lineupContext.js et matchStatsAutoRefresh.js non touchés', () => {
  for (const f of tousLesFichiers(SRC)) {
    const r = f.split(path.sep).join('/');
    if (r.startsWith('data/joueurs/') || !/\.(m?js)$/.test(r)) continue;
    assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /['"`][./]*(data\/)?joueurs\/(reglagesJoueurs|formulesDesJoueurs|joueursAuJourJ|lectureDesJoueurs|reglementJoueurs|comptesDesJoueurs|bancDesJoueurs|joueursEnfant|noteDesJoueurs)/, `${r} importe data/joueurs/`);
  }
  const serveur = path.join(SRC, 'server.js');
  assert.ok(fs.existsSync(serveur));
  const statiques = [...atteints([serveur], { statiquesSeulement: true })].map(rel);
  assert.ok(statiques.length > 100, `${statiques.length} fichiers chargés au démarrage`);
  for (const f of FICHIERS_34) assert.ok(!statiques.includes(f), `${f} chargé statiquement depuis server.js`);
  for (const f of ['data/providers/lineupContext.js', 'jobs/matchStatsAutoRefresh.js', 'jobs/enregistreurs.js']) {
    const x = INTERDITS.find(([g]) => g === f);
    assert.ok(x, `${f} gardé à l’octet`);
    assert.equal(sha1(fs.readFileSync(path.join(SRC, f))), x[1], `${f} : non touché au lot 1a`);
  }
});
