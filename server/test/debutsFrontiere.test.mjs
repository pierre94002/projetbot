/**
 * LA FRONTIÈRE ET LE GEL (étape 35, lot 1a, 09/11/2026) :
 *   node --test test/debutsFrontiere.test.mjs        (depuis server/)
 *
 *   T-X1  les empreintes ne bougent pas (moteur 16f2459…, candidate f01dd849…) ; rien de l'étape 35 sous core/ ni sports/ (toute
 *         extension) ni dans l'empreinte ; les 216 fichiers gelés de la partie 0 identiques à l'octet — lancements.js et
 *         matchStatsDb.js, retouchés par AJOUT PUR, identiques SANS leur ajout (aides/ajouts35.mjs) ;
 *   T-X2  depuis TOUTES les racines de la règle du gel (le moteur, le chemin de nuit de l'essai 27, les producteurs, les 12
 *         producteurs cachés, les deux fichiers de l'IA), rien n'atteint data/debutsDeSaison/ ni data/db/squadChanges.js ;
 *         lancements.js et matchStatsDb.js n'en importent rien ;
 *   T-X3  les modules purs : ni horloge, ni hasard, ni base, ni réseau, ni fichier ; leurs imports permis seulement ;
 *   T-X4  l'enfant du banc ouvre la base EN LECTURE SEULE, une fois ; rien de l'étape 35 n'écrit (le lot 1a n'a pas de nuit) ;
 *   T-X5  la déclaration AVANT le regard : « debuts-de-saison » à la FIN des portées, l'ordre d'avant gardé ; vues
 *         `pour: ['debuts-de-saison']` seulement, celles de l'étape 35 jusqu'au 23/09/2026 au magasin et jusqu'au 30/06/2023 à
 *         football-data, celles de l'étape 30 recopiées à l'identique ; 11 variantes, la retenue en tête ; lancement à la fin,
 *         daté au premier démarrage ; fenetresVues('27') et compterVariantes('27') inchangés ;
 *   T-X6  rien n'écrit engine-config.json ; la décision de Pierre, la force de l'effectif et la continuité ne sont lues par
 *         aucun fichier du moteur, du chemin de l'essai 27, du gel des pronostics ni de l'IA ;
 *   T-X7  le jugement provisoire de l'essai 27 (T-X7 de la 32, contexteFrontiere.test.mjs) : sa fixture et ses aides inchangées ;
 *   T-X8  openDb crée les 3 tables et l'index ; une seconde ouverture ne change rien ; chaque entrée commence par son ordre ;
 *   T-X9  les fichiers gelés que la 35 importe EN LECTURE (goalModel, forcesButs, seasonWindows, dayTable, playerRatings, prix,
 *         guard, data/contexte/, refereeRead) : sha1 de la partie 0 ; aucun fichier neuf sous bench/ ;
 *   T-X10 lancements.js et matchStatsDb.js SANS les ajouts de la 35 = la partie 0 à l'octet ; l'ajout de lancements.js n'y
 *         change qu'une ligne (PORTEES) et n'en retire aucune.
 */
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { preparerCopie, executer, SERVEUR, RACINE_ESSAIS } from './aides/isolement.mjs';
import { sansBlocs36 } from './aides/ajouts36.mjs';
import { sansLesAjoutsDe35, FICHIERS_AJOUTS_35 } from './aides/ajouts35.mjs';
import { fichiersDuMoteur, empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import * as LANC from '../src/bench/lancements.js';
import { enregistrerLancements, fenetresVues, compterVariantes, lancementDe } from '../src/bench/trialsRegistry.js';
import { PERIODES_DU_BANC } from '../src/data/debutsDeSaison/reglagesDebuts.js';

const SRC = path.join(SERVEUR, 'src');
const RACINE = path.join(SERVEUR, '..');
const DEBUTS = path.join(SRC, 'data', 'debutsDeSaison');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const FICHIERS_35 = [...fs.readdirSync(DEBUTS).map((f) => `data/debutsDeSaison/${f}`), 'data/db/squadChanges.js'];

/** LES FICHIERS GELÉS et leur sha1 (octets bruts) relevés en partie 0 (SCR35, partie0, gel-depart.json : le bac du 09/11 à 18 h 05, = le dépôt). */
const INTERDITS = Object.freeze([
  ['api/controllers/analysis.controller.js', '23bb47bc03f57bb3a7628abe05e7591549e6c5db'],
  ['api/controllers/matchStats.controller.js', '6081a7cd00409e34656fb8d071a0e4ce2018fbec'],
  ['api/controllers/statValue.controller.js', '7fa9e8204a4c5a1ef03d23cdf461833d98abaf78'],
  ['bench/entrees.js', '38fdc199677e61691bc5c56c4fa63f88cd489a93'],
  ['bench/essaiCandidate.js', 'e493518bb9c57be53deeeaf77cac18e21ea6865a'],
  ['bench/guard.js', '60551323d356d5502684ca32276793fcb946ef84'],
  ['bench/horizonEssai.js', 'db2ee326f8f88f09a5582c7e297cfd4bd7c9d51b'],
  ['bench/jugeAPart.js', '2c1434cefe5b21055c313750ce0a1c2c8f6abc12'],
  ['bench/lancements.js', '03e81ec202c04185ef22a2f665d2a090704b12ce'],
  ['bench/metrics.js', 'c40ebc02607830dec623d071c0d70778f26cf806'],
  ['bench/noteDeDepart.js', '7d1eb637e27bfab8f5ffdd7565293b51e64b389a'],
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
  ['core/ai/matchAiAnalysisService.js', '0f252e469aa8d3b896324e26f8be21a8d0a81aa2'],
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
  ['data/combinaison/bancDeLaCombinaison.js', 'cb96ae8cdaf98acf647636d3779946365dca5af2'],
  ['data/combinaison/bancFd.js', 'f0d6201a10681e8281715bdd37d54e497eb4a82f'],
  ['data/combinaison/casesDeLaTranche.js', 'db6d21ca9c66a5535e9dc60ac99875eb8a8ea023'],
  ['data/combinaison/combinaisonEnfant.js', '257e0c75c17b70270953e6c1540d160ceb3f7315'],
  ['data/combinaison/combinaisonNuit.js', '1df97a667c6293db2460c6c5e7ad21eb3009ad2c'],
  ['data/combinaison/combinaisonNuitEnfant.js', '96b971e36b853f4565d83b0fe571222eb46d256d'],
  ['data/combinaison/combinaisonRead.js', '4a14ce8671af02f7ef9e4877861fefb76fdd16ba'],
  ['data/combinaison/comptesDeLaCombinaison.js', '9b15d2252a3e6e0729f5d56decbb4dca23e4248c'],
  ['data/combinaison/controleDeLaCombinaison.js', '4e3528bb564295114f8e5455b9f900152022d578'],
  ['data/combinaison/formulesDeLaCombinaison.js', 'f3b51be33ddb62bfc352e5962c22f2f6a29361dd'],
  ['data/combinaison/ingredientsDUneLigne.js', '8a21b2b138253f5c2444a9d79c95c75e06b77dc1'],
  ['data/combinaison/lecteurP5.js', '9a9faa5863a1f699e1643c0b4b77089e3a57256e'],
  ['data/combinaison/noteDeLaCombinaison.js', '9e710bba2976c6b3a0363d44dc08217280c4273d'],
  ['data/combinaison/nuitDeLaCombinaison.js', '24b599ae6ae74cb2aadf00cd71acfcb30213af34'],
  ['data/combinaison/reglagesCombinaison.js', 'c415fc616f243b5cc8a1faecc2d60ac7ef5be870'],
  ['data/combinaison/reglesDeConfiance.js', '180c3df704ebf989d68c5495d365c4bdcb6c22c6'],
  ['data/combinaison/reglesDeSeuil.js', '8e6764ffdc068da883a94756144f361ff7d338dc'],
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
  ['data/coupes/calibrationDesCoupes.js', '9b1017d778a36be9cb0293c5206449a30ef9ddd6'],
  ['data/coupes/comptesDesCoupes.js', 'ca13d7683604c049400b8707a3c45365b9272d6a'],
  ['data/coupes/confrontations.js', 'e5a3415f6e8867d1da17f1a04ab89647418ffac5'],
  ['data/coupes/coupesEnfant.js', '0509207ed7984731006a053fb76262a3f072c147'],
  // correctif de l'orchestrateur du 09/11/2026 : écoute close ; mis en service avec le lot 1a de la 35
  ['data/coupes/coupesNuit.js', '883fb8a2eb675f04a4ce89aea0d0880027cb5cda'],
  ['data/coupes/coupesRead.js', '19a4e4fca968eb1edd845369b655c55838f17b8a'],
  ['data/coupes/lectureDesCoupes.js', '7b37f5ac0eb284a27674c00cde71d78b44534ce1'],
  ['data/coupes/noteDesCoupes.js', '641ab4ddd2b8911741d25a293f42e8916917324d'],
  ['data/coupes/qualification.js', '56bce046d206bccab921b46f6bff3f3f7092e4a1'],
  ['data/coupes/reglagesCoupes.js', '7ae19031fadeb792b872632c94d8bbdbc5924397'],
  ['data/coupes/terrainNeutre.js', 'a64d3ce0537161367c55141383707a257d37f480'],
  ['data/coupes/toursDeCoupe.js', '9731ccab29e362dd36c32f5d31643ef197682123'],
  ['data/db/columns.js', '325d985101ae32bab53546e68eff1a437afc341b'],
  ['data/db/dayTable.js', 'afc8d42ccc9028531da8d9efc2700ece449d6a97'],
  ['data/db/dayTableControle.js', 'e1cc9dc99ed6e8160656bf3cc331285890f390f1'],
  ['data/db/derniereComposition.js', 'c7692408cff449853c7423166d60ffe84cba3f49'],
  ['data/db/entreesButs.js', '85ef724fc5749bc95baaa67931df5edcec77e046'],
  ['data/db/forcesButs.js', '4ecda40200d8da352bc8c51adefb1152de4af916'],
  ['data/db/forcesButsEnfant.js', '535aadac696d1b3946c979691a6434f99a115b80'],
  ['data/db/identityRegistry.js', '6a5bcdd1d85e10909de81a9174b6d3fa8afbccdf'],
  ['data/db/leagueBenchmarks.js', '1c5c192ce3ba261f884c37541dd46b14736746c7'],
  ['data/db/matchStatsDb.js', '96b8cc4c27fd0465b4e0eab075150720d7408196'],
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
  ['data/joueurs/avantMatchJoueurs.js', '82a1ff3f0961f04c7a274de3387dba5ba6a20679'],
  ['data/joueurs/bancDesJoueurs.js', '90605365d36fb883ce28767f43b680d083893c82'],
  ['data/joueurs/chiffresDesJoueurs.js', '25cf1cd7f14e13e83d63fed912456f9b0afa9dea'],
  ['data/joueurs/comptesDesJoueurs.js', '843e04c92a33f7da71913acb11be903f83020e9e'],
  ['data/joueurs/controleDesJoueurs.js', '92113f447b0fddaa2cfeee0a4f8334308a5dec6b'],
  ['data/joueurs/formulesDesJoueurs.js', '12001eeccd7d95361b265ae7951ea6de73ec25f2'],
  ['data/joueurs/joueursAuJourJ.js', '209fa8564aa38302004f3f1eb87f372bff2f1833'],
  ['data/joueurs/joueursEnfant.js', '20a8015a5e683aac162f07567907ca6312e0245d'],
  ['data/joueurs/joueursNuit.js', '15bd8aa6c5a463a5df39662cd74a16bfdf02c201'],
  ['data/joueurs/joueursRead.js', '54a72686923f21c866282a9482eb4e07d3b6b571'],
  ['data/joueurs/lectureDesCompos.js', 'b5b3190fa5f6942f49d114d5a81b5d034efc84d3'],
  ['data/joueurs/lectureDesJoueurs.js', '22d606ff5d823fde6fb7242c268f9ec5c48da2d8'],
  ['data/joueurs/noteDesJoueurs.js', 'e318e8800a596ca8f0add26c51bc1e6f769639d0'],
  ['data/joueurs/reglagesJoueurs.js', '1788fb372fa08c389308d1b54162fdaca675ba7a'],
  ['data/joueurs/reglementJoueurs.js', '8caee6e0da022b2ae0a90f2130797c8df07beee3'],
  ['data/marketKnowledge.js', 'fa4ae59cb72c2c02169f583b0a84a2fedd9430a7'],
  ['data/marketMovement.js', 'c74b1d38e42c7a778c64e3756fe96130f6b42da4'],
  ['data/matchSources.js', 'dc005be4ea560c8e7b168954c3aaa6b548a4e8fa'],
  ['data/mise/capitalDePierre.js', '9f4fc9d615f15102ffd9e5e78d0eb72f79b7fe93'],
  ['data/mise/miseRead.js', 'd74dc1e245abc037b196bae9a341fcdb06ac90aa'],
  ['data/mise/regleDeMise.js', '1a3424614bd9fc33fd80ffe95a0f49b9984eaf6c'],
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
  ['data/providers/settlementService.js', '5ecd697b06cb755e72b9440b9e059eaf5ad52d0e'],
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
  ['data/roadmap/historique.js', 'aed83d2cba941078aea56a105a33a755384a23d1'],
  ['data/roadmap/plan.js', '124d9c5086df25d06cb71b441d5f907570b21076'],
  ['data/saisiesCotes.js', '1449bbbdc1fd5f08d94af42dc17a82fc728512b4'],
  ['data/simulation/jambes.js', 'a135f7e17a80b58d1a520c278258b04c76c58c89'],
  ['data/suiviParis.js', 'd9a63c4b019b365d44639bd87a2d8d37b0a5567a'],
  ['jobs/enregistreurs.js', '846f62798f7479f716d003e4e33ea93a43a98727'],
  ['jobs/kickoffAiAnalysis.js', '1260f4b8cd46510c840e1d6fb3459c2765c356a8'],
  ['jobs/matchStatsAutoRefresh.js', '1b23ee7fa7d4bf03eef7513a6e9bf072ffeb942f'],
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
  ['ui/src/components/common/ConfidenceGauge.vue', '1bb8634a1200b245f9c92288e260cf6a725e9309'],
  ['ui/src/components/matches/LineupPitch.vue', '0bc9124c6228b303a98342128a2f7acddc6b8661']
]);

/** Les deux fichiers gelés retouchés par AJOUT PUR, et leur sha1 de la partie 0 (sans l'ajout, le fichier redevient celui-là). */
const PERMIS = Object.freeze({
  'bench/lancements.js': '03e81ec202c04185ef22a2f665d2a090704b12ce',
  'data/db/matchStatsDb.js': '96b8cc4c27fd0465b4e0eab075150720d7408196'
});

/** Les fichiers atteints par les imports relatifs (statiques et dynamiques) d'un ensemble de départ. */
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  const re = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    const texte = sansBlocs36(fs.readFileSync(f, 'utf8'));
    for (const m of texte.matchAll(re)) {
      let cible = path.resolve(path.dirname(f), m[1]);
      if (!/\.(m?js|json)$/.test(cible) && fs.existsSync(`${cible}.js`)) cible += '.js';
      pile.push(cible);
    }
  }
  return vus;
}
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const tousLesFichiers = (dossier) => (fs.existsSync(dossier) ? fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dossier, f)).isFile()) : []);

test('T-X1 — les empreintes ne bougent pas ; rien de l’étape 35 sous core/ ni sports/ ni dans l’empreinte ; les fichiers gelés identiques à l’octet (les deux ajouts purs SANS leur ajout)', () => {
  assert.equal(empreinteDuCode({ rafraichir: true }).empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  assert.ok(FICHIERS_35.length >= 10, FICHIERS_35.join(', '));
  for (const racine of ['core', 'sports']) {
    for (const f of tousLesFichiers(path.join(SRC, racine))) {
      assert.ok(!/(^|[\\/])(debuts|squad|treve|effectif)/i.test(f), `${racine}/${f} : un fichier de l’étape 35 sous ${racine}/`);
      assert.ok(!/[ée]tape 35/i.test(fs.readFileSync(path.join(SRC, racine, f), 'utf8').slice(0, 4000)), `${racine}/${f} parle de l’étape 35`);
    }
  }
  const empreinte = fichiersDuMoteur();
  for (const f of FICHIERS_35) assert.ok(!empreinte.includes(f), `${f} dans l’empreinte`);
  assert.ok(!MODULES_DU_MOTEUR.fichiers.some((f) => /debuts|squad/i.test(f)));
  assert.ok(INTERDITS.length >= 216, `${INTERDITS.length} fichiers gelés`);
  for (const [f, attendu] of INTERDITS) {
    const octets = PERMIS[f] ? Buffer.from(sansLesAjoutsDe35(f, fs.readFileSync(path.join(SRC, f), 'utf8')), 'utf8') : fs.readFileSync(path.join(SRC, f));
    assert.equal(sha1(octets), attendu, `${f} : retouché (gelé pendant l’essai 27${PERMIS[f] ? ', au-delà de son ajout pur' : ''})`);
  }
  for (const [f, attendu] of Object.entries(PERMIS)) assert.ok(INTERDITS.some(([g, s]) => g === f && s === attendu), `${f} : son sha1 de partie 0`);
  for (const [f, attendu] of INTERDITS_UI) assert.equal(sha1(fs.readFileSync(path.join(RACINE, f))), attendu, `${f} : retouché`);
});

test('T-X2 — depuis TOUTES les racines de la règle du gel, rien n’atteint data/debutsDeSaison/ ni squadChanges.js ; lancements.js et matchStatsDb.js n’en importent rien', () => {
  const racines = [
    ...fichiersDuMoteur(),
    'data/enregistreurs/gelPronostics.js', 'data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js', 'bench/runner.js',
    'core/engine/engineVersions.js', 'core/engine/engineConfig.js', 'data/db/dayTable.js', 'data/db/forcesButs.js', 'data/db/forcesButsEnfant.js',
    'api/controllers/statValue.controller.js', 'data/contexte/contexteNuit.js', 'data/db/dayTableControle.js', 'data/marketKnowledge.js',
    'data/providers/espnOdds.js', 'data/providers/footballDataHistory.js', 'data/providers/fotMobRefresh.js', 'data/providers/freeOdds.js',
    'data/providers/kalshiOdds.js', 'data/providers/lineupContext.js', 'data/providers/smarketsOdds.js', 'jobs/matchStatsAutoRefresh.js',
    'core/ai/autoMatchAiTrigger.js', 'core/ai/matchAiAnalysisService.js'
  ].map((f) => path.join(SRC, f));
  for (const f of racines) assert.ok(fs.existsSync(f), `racine absente : ${rel(f)}`);
  const graphe = [...atteints(racines)].map(rel);
  assert.ok(graphe.length > 150, `${graphe.length} fichiers atteints`);
  for (const f of FICHIERS_35) assert.ok(!graphe.includes(f), `${f} atteint depuis une racine du gel`);
  for (const f of ['data/db/matchStatsDb.js', 'bench/lancements.js']) assert.ok(!/['"][./]*(data\/)?(debutsDeSaison|db\/squadChanges)/.test(fs.readFileSync(path.join(SRC, f), 'utf8')), f);
  // et personne d'autre que l'étape elle-même (son script, ses tests) ne l'importe au lot 1a
  for (const f of tousLesFichiers(SRC)) {
    const r = f.split(path.sep).join('/');
    if (FICHIERS_35.includes(r) || !/\.m?js$/.test(r)) continue;
    assert.ok(!/['"][./]*(data\/)?debutsDeSaison\/|['"][./]*squadChanges\.js/.test(fs.readFileSync(path.join(SRC, f), 'utf8')), `${r} importe l’étape 35`);
  }
});

test('T-X3 — les modules purs : ni horloge, ni hasard, ni base, ni réseau, ni fichier ; leurs imports permis seulement', () => {
  const purs = ['reglagesDebuts.js', 'formulesDebuts.js', 'debutsAuJourJ.js', 'passeDesDebuts.js', 'comptesDesDebuts.js', 'bancDesDebuts.js', 'noteDesDebuts.js'];
  for (const f of purs) {
    const code = sansCommentaires(path.join(DEBUTS, f));
    assert.ok(!/Date\.now\(|new Date\(\)|Math\.random|openDb|DatabaseSync|fetch\(|node:fs|from 'fs'|readFileSync|writeFileSync|child_process|\.prepare\(/.test(code), f);
  }
  assert.ok(!/Date\.now\(|new Date\(|Math\.random|openDb|fetch\(|node:fs|\.prepare\(|import /.test(sansCommentaires(path.join(SRC, 'data', 'db', 'squadChanges.js'))), 'squadChanges.js : pur, aucun import');
  const imports = (f) => [...fs.readFileSync(path.join(DEBUTS, f), 'utf8').matchAll(/^import [^;]* from ['"]([^'"]+)['"];?$/gm)].map((m) => m[1]);
  assert.deepEqual(imports('reglagesDebuts.js'), []);
  assert.deepEqual(imports('formulesDebuts.js'), ['../../core/engine/goalModel.js', '../providers/seasonWindows.js', './reglagesDebuts.js']);
  assert.deepEqual(imports('debutsAuJourJ.js'), ['../db/forcesButs.js', '../../core/engine/goalModel.js', './reglagesDebuts.js', './formulesDebuts.js']);
  assert.deepEqual(imports('passeDesDebuts.js'), ['./debutsAuJourJ.js', './reglagesDebuts.js', './formulesDebuts.js', '../db/squadChanges.js']);
  assert.deepEqual(imports('comptesDesDebuts.js'), ['./reglagesDebuts.js', './formulesDebuts.js'], 'T-B9 : les comptes n’importent jamais le banc');
  assert.deepEqual(imports('noteDesDebuts.js'), []);
});

test('T-X4 — l’enfant ouvre la base EN LECTURE SEULE, une fois, sans horloge ; rien de l’étape 35 n’écrit', () => {
  for (const f of FICHIERS_35) {
    const code = sansCommentaires(path.join(SRC, f));
    assert.ok(!/\.run\(|INSERT\s+(OR\s+\w+\s+)?INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|writeJsonAtomic|writeFileSync|\b(database|db)\.exec\(|CREATE\s+(TABLE|INDEX)|'BEGIN|'COMMIT/.test(code), `${f} : aucune écriture`);
  }
  const enfant = sansCommentaires(path.join(DEBUTS, 'debutsBancEnfant.js'));
  assert.equal((enfant.match(/openDb\(/g) ?? []).length, 1);
  assert.match(enfant, /openDb\(\{ file: m\.chemin, readonly: true \}\)/);
  assert.ok(!/Date\.now\(|new Date\(|Math\.random|fetch\(/.test(enfant));
  const lecture = sansCommentaires(path.join(DEBUTS, 'lectureDesDebuts.js'));
  assert.ok(!/openDb|Date\.now\(|new Date\(/.test(lecture), 'la lecture prend la base de l’appelant');
});

fs.mkdirSync(RACINE_ESSAIS, { recursive: true });
const DOSSIER = fs.mkdtempSync(path.join(RACINE_ESSAIS, 'cm-debuts-registre-'));
after(() => fs.rmSync(DOSSIER, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

test('T-X5 — la déclaration AVANT le regard : « debuts-de-saison » à la fin ; vues de la portée seulement, jamais P5 ; celles de la 30 recopiées ; 11 variantes ; lancement à la fin ; fenetresVues(27) et compterVariantes(27) inchangés', () => {
  assert.deepEqual([...LANC.PORTEES], ['tout', 'moteur', 'statistiques', 'marche', 'indice', 'joueurs', 'style', 'simulation', 'contexte', 'cartons-corners', 'paris-joueurs', 'combinaison', 'coupes', 'debuts-de-saison']);
  assert.ok(LANC.verifierLancements());
  const v35 = LANC.VUES_DE_L_ETAPE_35;
  for (const v of v35) assert.deepEqual([...v.pour], ['debuts-de-saison'], `${v.de} → ${v.a}`);
  const propres = v35.filter((v) => !/^Recopiée de l’étape 30/.test(v.quoi));
  assert.deepEqual(propres.map((v) => [v.de, v.a]), [['2023-07-01', '2026-09-23'], ['2023-01-01', '2023-06-30'], ['2000-07-01', '2019-06-30'], ['2019-07-01', '2023-06-30']]);
  for (const v of propres) assert.ok(v.a <= PERIODES_DU_BANC.magasin.dernierJourLu, `${v.a} : jamais P5`);
  assert.match(propres[1].quoi, /la conception et la critique y ont lu/, 'critique, mineurs : la mise en route dit qui y a lu');
  const recopiees = v35.filter((v) => /^Recopiée de l’étape 30/.test(v.quoi));
  assert.deepEqual(recopiees.map((v) => [v.de, v.a]), LANC.VUES_DE_L_ETAPE_30.map((v) => [v.de, v.a]), 'critique, constat 6 : les fenêtres de la 30 recopiées');
  assert.deepEqual(LANC.VARIANTES_DE_L_ETAPE_35.map((v) => v.id), ['debuts-de-saison-v1', 'magasin-rappel-sans-cote', 'magasin-placebo-fausse-rentree', 'magasin-promus-sans-cote', 'magasin-nouveaux-sans-cote', 'magasin-placebo-faux-promu', 'magasin-force-effectif-sans-cote', 'magasin-placebo-faux-effectif', 'fd-promus-sans-cote', 'fd-nouveaux-sans-cote', 'fd-placebo-faux-promu']);
  assert.ok(!LANC.VARIANTES_DE_L_ETAPE_35.some((v) => /1n2|continuite|mercato|fd-rappel|fd-placebo-fausse/.test(v.id)), 'le lot allégé : ni 1N2 jugé, ni continuité, ni faux mercato, ni rappel à football-data');
  const l35 = LANC.LANCEMENTS.find((l) => l.etape === '35');
  assert.deepEqual([l35.version, l35.le], ['debuts-de-saison-v1', null]);
  assert.equal(l35.variantes, LANC.VARIANTES_DE_L_ETAPE_35);
  assert.equal(l35.vues, LANC.VUES_DE_L_ETAPE_35);
  assert.equal(LANC.LANCEMENTS.at(-1), l35, 'le lancement 35 ajouté à la fin');
  for (const portee of LANC.PORTEES.filter((p) => !['tout', 'debuts-de-saison'].includes(p))) assert.ok(!LANC.fenetresDeclarees({ portee }).some((f) => f.etape === '35'), portee);
  assert.ok(LANC.fenetresDeclarees({ portee: 'debuts-de-saison' }).some((f) => f.etape === '35'));
  const fichier = path.join(DOSSIER, 'registre-t-x5.json');
  const sans35 = { fichier, lancements: LANC.LANCEMENTS.filter((l) => l.etape !== '35') };
  const avant = { f27: JSON.stringify(fenetresVues('27', { fichier })), k27: compterVariantes('27', { fichier }), f27sans: JSON.stringify(fenetresVues('27', sans35)) };
  assert.equal(avant.f27, avant.f27sans, 'le lancement 35 du code ne change pas les fenêtres de 27');
  assert.equal(lancementDe('35', { fichier }), null, 'pas encore lancée');
  const r = enregistrerLancements({ fichier, maintenant: Date.parse('2026-11-10T09:00:00Z') });
  assert.ok(r.nouveaux.some((x) => x.etape === '35' && x.version === 'debuts-de-saison-v1' && x.le === '2026-11-10'), JSON.stringify(r.nouveaux));
  assert.equal(JSON.stringify(fenetresVues('27', { fichier })), avant.f27);
  assert.equal(compterVariantes('27', { fichier }), avant.k27);
  assert.equal(compterVariantes('35', { fichier }), 11);
  assert.ok(LANC.ETAPES_A_JUGER.includes('35'));
});

test('T-X6 — rien n’écrit engine-config.json ; la décision de Pierre, la force de l’effectif et la continuité ne sont lues par aucun fichier du moteur, de l’essai 27, du gel ni de l’IA', () => {
  for (const f of FICHIERS_35) assert.ok(!/engine-config|engineConfig|ai-config|\.env\b/.test(sansCommentaires(path.join(SRC, f))), `${f} touche aux réglages`);
  const lecteurs = [...fichiersDuMoteur(), 'data/enregistreurs/gelPronostics.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js', 'core/engine/engineVersions.js', 'core/engine/engineConfig.js', 'core/ai/autoMatchAiTrigger.js', 'core/ai/matchAiAnalysisService.js'];
  for (const f of lecteurs) {
    const t = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.ok(!/DECISION_DE_PIERRE[^]*debuts|forceDeLEffectif|continuiteDe|debutsDeSaison|squadChanges/.test(t), `${f} lit l’étape 35`);
  }
});

test('T-X7 — le jugement provisoire de l’essai 27 (T-X7 de la 32) : sa fixture et ses aides inchangées, son test présent', () => {
  const s = (f) => sha1(fs.readFileSync(path.join(SERVEUR, f)));
  assert.equal(s('test/fixtures/essai27-avant-etape32.json'), 'a3c2b65abd995ef0a9cdd68f65484c6172d5390d');
  assert.equal(s('test/aides/script-contexte-essai27.mjs'), '9f5ee5078f5d65b06e20ce2dfc05fb7ca2ba0806');
  assert.equal(s('test/aides/essaiFabrique.mjs'), '768e3bb0b182d66e8fce5c919366a32e02ba8486');
  assert.match(fs.readFileSync(path.join(SERVEUR, 'test', 'contexteFrontiere.test.mjs'), 'utf8'), /test\('T-X7/);
});

test('T-X8 — openDb crée les 3 tables et l’index ; une seconde ouverture ne change rien ; chaque entrée commence par son ordre', () => {
  const copie = preparerCopie({ base: false });
  let s;
  try {
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-debuts.mjs'), { args: ['ddl', '{}'] });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    s = r.json;
  } finally {
    copie.nettoyer();
  }
  assert.deepEqual(s.tables.filter((t) => !t.startsWith('idx_') && !t.startsWith('sqlite_')), ['debuts_clubs', 'debuts_etat', 'debuts_fiches']);
  assert.deepEqual(s.indexAttendus, ['idx_debuts_fiches_date']);
  assert.deepEqual(s.tables.filter((t) => t.startsWith('idx_')), s.indexAttendus);
  assert.deepEqual(s.schema2, s.schema, 'une seconde ouverture ne change rien');
  const texte = fs.readFileSync(path.join(SRC, 'data', 'db', 'matchStatsDb.js'), 'utf8');
  const bloc = texte.slice(texte.indexOf('const DEBUTS_DDL = ['), texte.indexOf('const FD_HISTORY_INDEXES = ['));
  const entrees = bloc.split('\n').filter((l) => /^ {2}[`']/.test(l));
  assert.equal(entrees.length, 4);
  for (const e of entrees) assert.match(e.trim().slice(1), /^CREATE (TABLE|INDEX) IF NOT EXISTS (idx_)?debuts_/, e.slice(0, 80));
});

test('T-X9 — les fichiers gelés que la 35 importe en lecture : sha1 de la partie 0 ; aucun fichier neuf sous bench/', () => {
  const LUS = ['core/engine/goalModel.js', 'data/db/forcesButs.js', 'data/providers/seasonWindows.js', 'data/db/dayTable.js', 'data/db/playerRatings.js', 'bench/prix.js', 'bench/periodes.js', 'bench/guard.js', 'data/db/refereeRead.js', 'utils/travailCooperatif.js', 'core/market/marginRemoval.js'];
  for (const f of LUS) {
    const ligne = INTERDITS.find(([g]) => g === f);
    assert.ok(ligne, `${f} relevé en partie 0`);
    assert.equal(sha1(fs.readFileSync(path.join(SRC, f))), ligne[1], f);
  }
  for (const f of fs.readdirSync(path.join(SRC, 'data', 'contexte'))) {
    const ligne = INTERDITS.find(([g]) => g === `data/contexte/${f}`);
    assert.ok(ligne, `data/contexte/${f} relevé en partie 0`);
  }
  // la liste de src/bench de la partie 0 (aucun fichier neuf : le banc de la 35 vit dans data/debutsDeSaison/)
  assert.deepEqual(fs.readdirSync(path.join(SRC, 'bench')).sort(), ['apparier.js', 'bancCandidate.js', 'depotBanc.js', 'entrees.js', 'essaiCandidate.js', 'guard.js', 'horizonEssai.js', 'jugeAPart.js', 'jugeAPartFil.js', 'lancements.js', 'libellesDesCases.js', 'lignesEnginePicks.js', 'metrics.js', 'noteDeDepart.js', 'periodes.js', 'prix.js', 'resume.js', 'runner.js', 'simulateBets.js', 'statValue.js', 'trialsRegistry.js']);
});

test('T-X10 — lancements.js et matchStatsDb.js SANS les ajouts de la 35 = la partie 0 à l’octet ; l’ajout ne change qu’une ligne et n’en retire aucune', () => {
  for (const f of FICHIERS_AJOUTS_35) {
    const texte = fs.readFileSync(path.join(SRC, f), 'utf8');
    assert.equal(sha1(Buffer.from(sansLesAjoutsDe35(f, texte), 'utf8')), PERMIS[f], f);
    assert.notEqual(sha1(Buffer.from(texte, 'utf8')), PERMIS[f], `${f} porte bien son ajout`);
    const avant = sansLesAjoutsDe35(f, texte).split('\n');
    const maintenant = new Set(texte.split('\n'));
    const disparues = avant.filter((l) => !maintenant.has(l));
    assert.deepEqual(disparues, f === 'bench/lancements.js' ? ["export const PORTEES = Object.freeze(['tout', 'moteur', 'statistiques', 'marche', 'indice', 'joueurs', 'style', 'simulation', 'contexte', 'cartons-corners', 'paris-joueurs', 'combinaison', 'coupes']);"] : [], `${f} : seules des lignes AJOUTÉES (et la ligne de PORTEES)`);
  }
});
