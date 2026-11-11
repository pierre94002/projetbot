/**
 * LA FRONTIÈRE ET LE GEL DE LA FICHE DU PRONOSTIC (étape 40 du plan, lot 1, 10/11/2026) :
 *   node --test test/ficheDuPronosticFrontiere.test.mjs        (depuis server/)
 *
 * La fiche est un lot d'ÉCRAN : rien du moteur, du gel des pronostics, de ce que lit l'IA ni des réglages ne bouge.
 *   T-G1  les empreintes ne bougent pas (moteur 16f2459…, candidate de l'étape 27 f01dd849…) ; aucun fichier ni aucune mention
 *         de `ficheDuPronostic` sous server/src ; aucune « étape 40 » sous core/ ni sports/ (toute extension) ;
 *   T-G2  le gel : les 235 fichiers de code de la fin de l'étape 35 (lot 1b, gel-fin.json, sha1 du bac = celui du dépôt depuis
 *         la recopie du 10/11 vers 17 h 56) identiques à l'octet — sans le fichier des réglages du moteur, qu'un enregistrement
 *         des Réglages réécrit (décision O5 ; ses poids sont gardés par T-G4) ; historique.js, retouché par AJOUT PUR (l'entrée
 *         40, aides/ajouts40.mjs), identique SANS son ajout, qui n'en retire aucune ligne ;
 *   T-G3  ce que l'IA reçoit : compactContext.js à l'octet ; le service de l'analyse IA et l'invite de la recherche web sont
 *         dans le gel ; rien sous server/src ni server/scripts n'importe ficheDuPronostic ;
 *   T-G4  les poids du moteur (par défaut et en service) valent { marché 1, structurel 0, exogène 0 } : sinon, la fiche, qui
 *         dit que le 1 / N / 2 vient des cotes seules, mentirait ;
 *   T-G5  la feuille de route : une seule entrée 40, la dernière, son lot 1 dit (partielle) ; aucune étape « en cours » ;
 *         aucun lancement 40 au registre (le lot 1 n'a pas de banc).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SERVEUR } from './aides/isolement.mjs';
import { sansLEntree40, DEBUT_40 } from './aides/ajouts40.mjs';
import { empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI } from '../src/core/engine/engineVersions.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';
import { HISTORIQUE, ETAPES_EN_COURS } from '../src/data/roadmap/historique.js';
import { LANCEMENTS } from '../src/bench/lancements.js';

const SRC = path.join(SERVEUR, 'src');
const RACINE = path.join(SERVEUR, '..');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const tousLesFichiers = (dossier) => (fs.existsSync(dossier) ? fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dossier, f)).isFile()) : []);
const HISTORIQUE_JS = 'server/src/data/roadmap/historique.js';

/**
 * LES FICHIERS GELÉS et leur sha1 (octets bruts), chemins depuis la racine : les 236 de la fin de l'étape 35 (SCR35, lot1b, fin,
 * gel-fin.json, le 10/11/2026 à 15 h 55 Z ; sha1 « bac », égal au dépôt depuis la recopie du lot 1b) moins
 * server/data/runtime/engine-config.json (O5).
 */
const GEL = Object.freeze([
  ['server/scripts/bench.mjs', '9c9761ad93fb4df248e776f26220292998583298'],
  ['server/scripts/coupes.mjs', '5943e946051a6a7ee96bde1664cd360a498277e2'],
  ['server/scripts/debuts-de-saison.mjs', 'f7e8069217031ea9737b90265e41ae2f2a354638'],
  ['server/src/api/controllers/analysis.controller.js', 'cbb3844d6cf8df8f68c53021f0427f2cfb2d46bd'],
  ['server/src/api/controllers/matchStats.controller.js', '6081a7cd00409e34656fb8d071a0e4ce2018fbec'],
  ['server/src/api/controllers/statValue.controller.js', '7fa9e8204a4c5a1ef03d23cdf461833d98abaf78'],
  ['server/src/bench/depotBanc.js', '67aa85ce39cbeb4977d08a52651501f252e71fb6'],
  ['server/src/bench/entrees.js', '38fdc199677e61691bc5c56c4fa63f88cd489a93'],
  ['server/src/bench/essaiCandidate.js', 'e493518bb9c57be53deeeaf77cac18e21ea6865a'],
  ['server/src/bench/guard.js', '60551323d356d5502684ca32276793fcb946ef84'],
  ['server/src/bench/horizonEssai.js', 'db2ee326f8f88f09a5582c7e297cfd4bd7c9d51b'],
  ['server/src/bench/jugeAPart.js', '2c1434cefe5b21055c313750ce0a1c2c8f6abc12'],
  ['server/src/bench/lancements.js', '056f91c188afa05c279ee2aaa9d00d84326d1d85'],
  ['server/src/bench/metrics.js', 'c40ebc02607830dec623d071c0d70778f26cf806'],
  ['server/src/bench/noteDeDepart.js', '7d1eb637e27bfab8f5ffdd7565293b51e64b389a'],
  ['server/src/bench/periodes.js', 'd8b5264a88fd7ef241fb16bd209f3928c53ac628'],
  ['server/src/bench/prix.js', '0f33a6b56d5238057be45f5720f2050dac22bf6a'],
  ['server/src/bench/resume.js', 'fa1761404b7d1001c8cb61c2d56bf64bf1332991'],
  ['server/src/bench/runner.js', '5e8711c9298b63d2682d61936fe185a308136fef'],
  ['server/src/bench/simulateBets.js', '523189cda6c82d77368f5b04e5877321d2d5f0d1'],
  ['server/src/bench/statValue.js', 'd08c78df17760083f8d9d649d448598db52e5ec4'],
  ['server/src/bench/trialsRegistry.js', '3eca30850f4844f924ed1ec47b497606a68dec30'],
  ['server/src/config/bacASable.js', '51f4bf847f1bbb4a81d291a96566e3e9cb13af21'],
  ['server/src/config/env.js', '6003ca2e8318a7a088737d5ec32dca4ddfe39aa7'],
  ['server/src/core/ai/aiConfigStore.js', 'b4158fbd31c688851db5b327c6bf91cb9c567b4b'],
  ['server/src/core/ai/anthropicClient.js', '044d69988b2a27fa2fa5ef90573ac9736f0eecb6'],
  ['server/src/core/ai/autoMatchAiTrigger.js', '159b22f70a67f6bf7e77b4fadbb4426e9f7313f1'],
  ['server/src/core/ai/matchAiAnalysisService.js', '0f252e469aa8d3b896324e26f8be21a8d0a81aa2'],
  ['server/src/core/ai/webLookupPrompt.js', 'c43ea47071de9a60556cb3098937f0cd9ccdb2b9'],
  ['server/src/core/ai/webLookupService.js', '657bf53be4d8aea556b3878aa1be190644578005'],
  ['server/src/core/engine/coteMinimale.js', '0ea5dee5c0b3e1faf6b7bbac63d1e7b9980cc60b'],
  ['server/src/core/engine/engineConfig.js', '87b6ac0fd2ebafa432c2adeb3beac591177a3dfa'],
  ['server/src/core/engine/engineVersions.js', '5765ef8ea759a5413397e6b44aafb6c496fc674b'],
  ['server/src/core/engine/fraicheurCotes.js', 'd7f4bf125d8b7902d86767b2d8344f457f5c9094'],
  ['server/src/core/engine/goalModel.js', '236a33d7f952b12d4596b02ecb7c6090afca137d'],
  ['server/src/core/engine/motsDuModeleDeButs.js', '1c81f14ce0e25e3af595318028234c565798eea0'],
  ['server/src/core/engine/noteDuModeleDeButs.js', '654e310c28e88de98c2f2ccf247b64ba5c3babaf'],
  ['server/src/core/engine/oddsEngine.js', 'c376393d980ca569b4562191369c1cd8a7ff56b2'],
  ['server/src/core/engine/resultPrediction.js', 'df32c8d76e8c720c9c42e156bc6943b0b4a1b7df'],
  ['server/src/core/engine/scorePrediction.js', '44bb6ed76ed724981de01b8d48b5a91ccb59dbed'],
  ['server/src/core/engine/tiltState.js', 'de63bb4a3c63d88facbf89b70e8d79874ba27cc2'],
  ['server/src/core/engine/valueFinder.js', '25e4757198fc09a1119de41cdef52eb553368e6a'],
  ['server/src/core/engine/verdictPari.js', '368d73a39b081948dd6d49bfa9add6789c0490f3'],
  ['server/src/core/engine/vosBookmakers.js', '9abf1962a1c47d854cbc161624249a4df657279f'],
  ['server/src/core/errors.js', '649f52978b4261ddf63fb5ac5c7efcdd04e1df4a'],
  ['server/src/core/market/marginRemoval.js', 'b3deabcfcf1fe1d7f875d93a1b327b6efc0e883f'],
  ['server/src/core/model/dixonColes.js', '83c4cf5111c071ca7f95422f826125ecd464484f'],
  ['server/src/core/model/poisson.js', '78be7262cce935f745491e220804da4e8e093aa8'],
  ['server/src/core/risk/exogenousFactors.js', 'fd7749a7d45ba0fd779d26a8c873b04b860ed630'],
  ['server/src/core/risk/gardeFous.js', '2edd957379facdb0915308f8404114d0786a70f5'],
  ['server/src/core/risk/seriesDePertes.js', '84ad459c0c2794a2af3e89820f6ae8bbf98059ad'],
  ['server/src/core/risk/staking.js', '6522d9ea3662ea39fb1eb45afe11bf3f2ce20080'],
  ['server/src/core/risk/structuralFactors.js', '4a21c27362e21c93f5f3110aa99479a638385b36'],
  ['server/src/core/settlement/settlementRules.js', '67eac67e465e395b87e71aaa6d7228f0e57b6011'],
  ['server/src/core/signals/cornersSignal.js', '28e6d8c721386a522f1d4ca3fd2b5259a48ca5c8'],
  ['server/src/core/xg/xgSmoothing.js', '3a125f8d663be5c07c2d7afeb07e98523e3dbea4'],
  ['server/src/core/xg/xgStructural.js', '724a35bcf329112a3ec6d3e9f6d2a13d026d7919'],
  ['server/src/data/adapters/oddsApiAdapter.js', '27a3c37d2a450a396db8fc3feeb2dd4a2f2c56a2'],
  ['server/src/data/adapters/sampleMatchAdapter.js', '81af4e0bdea7b720f0c849705289602e2f223b47'],
  ['server/src/data/adapters/seasonCalendarAdapter.js', 'fb3e9ef6f44a0f57c13857a472a37c898c8aedef'],
  ['server/src/data/calibration.js', '0aeb1e51aace6724b549b96defbd7df0d43eebba'],
  ['server/src/data/cartons/bancDesCartons.js', 'b51ff279d913994ec60033b0306d6e45b2984b5b'],
  ['server/src/data/cartons/cartonsAuJourJ.js', 'ba074b67a7db971f9a02ad147ce35d8c73117097'],
  ['server/src/data/cartons/cartonsEnfant.js', 'ed4d78046e6559fe8d747a750627f64fc25f121f'],
  ['server/src/data/cartons/cartonsNuit.js', 'a19b01e22826a08d2f7c7c3238e0af0ac745c801'],
  ['server/src/data/cartons/cartonsRead.js', '8f7ef91d15f632ed7f88df5af56dc499909165bb'],
  ['server/src/data/cartons/comptesDesCartons.js', '1e73941f83f909457ba0d398882854135f565e9f'],
  ['server/src/data/cartons/controleDesCartons.js', '03f7e6e2e87cc8718f010120f0892b4d4ee99691'],
  ['server/src/data/cartons/formulesDesCartons.js', '72d4d13eb9e4c637015e9a730ace605b94887a05'],
  ['server/src/data/cartons/lectureDesCartons.js', '36fabc74c3c6d3547b578d24d03ce228b69cd109'],
  ['server/src/data/cartons/noteDesCartons.js', '2dd43653e0433a48fb66af63c8182943ee094478'],
  ['server/src/data/cartons/reglagesCartons.js', '52a672fef7ca26b7aff1f12287929d09219a2903'],
  ['server/src/data/closingValue.js', '5f3f716c2e12fc09d12b4bdc0ed22d3af6aca063'],
  ['server/src/data/combinaison/bancDeLaCombinaison.js', 'cb96ae8cdaf98acf647636d3779946365dca5af2'],
  ['server/src/data/combinaison/bancFd.js', 'f0d6201a10681e8281715bdd37d54e497eb4a82f'],
  ['server/src/data/combinaison/casesDeLaTranche.js', 'db6d21ca9c66a5535e9dc60ac99875eb8a8ea023'],
  ['server/src/data/combinaison/combinaisonEnfant.js', '257e0c75c17b70270953e6c1540d160ceb3f7315'],
  ['server/src/data/combinaison/combinaisonNuit.js', '1df97a667c6293db2460c6c5e7ad21eb3009ad2c'],
  ['server/src/data/combinaison/combinaisonNuitEnfant.js', '96b971e36b853f4565d83b0fe571222eb46d256d'],
  ['server/src/data/combinaison/combinaisonRead.js', '4a14ce8671af02f7ef9e4877861fefb76fdd16ba'],
  ['server/src/data/combinaison/comptesDeLaCombinaison.js', '9b15d2252a3e6e0729f5d56decbb4dca23e4248c'],
  ['server/src/data/combinaison/controleDeLaCombinaison.js', '4e3528bb564295114f8e5455b9f900152022d578'],
  ['server/src/data/combinaison/formulesDeLaCombinaison.js', 'f3b51be33ddb62bfc352e5962c22f2f6a29361dd'],
  ['server/src/data/combinaison/ingredientsDUneLigne.js', '8a21b2b138253f5c2444a9d79c95c75e06b77dc1'],
  ['server/src/data/combinaison/lecteurP5.js', '9a9faa5863a1f699e1643c0b4b77089e3a57256e'],
  ['server/src/data/combinaison/noteDeLaCombinaison.js', '9e710bba2976c6b3a0363d44dc08217280c4273d'],
  ['server/src/data/combinaison/nuitDeLaCombinaison.js', '24b599ae6ae74cb2aadf00cd71acfcb30213af34'],
  ['server/src/data/combinaison/reglagesCombinaison.js', 'c415fc616f243b5cc8a1faecc2d60ac7ef5be870'],
  ['server/src/data/combinaison/reglesDeConfiance.js', '180c3df704ebf989d68c5495d365c4bdcb6c22c6'],
  ['server/src/data/combinaison/reglesDeSeuil.js', '8e6764ffdc068da883a94756144f361ff7d338dc'],
  ['server/src/data/contexte/bancDuContexte.js', 'beaee6f2ae7064b46fb599e9a588e398e3fce229'],
  ['server/src/data/contexte/contexteAuJourJ.js', 'f186e369ff35802dfce11ed33a475b16d610f351'],
  ['server/src/data/contexte/contexteBancEnfant.js', '2e81fe97eb163c65f41d2bb75a4aa2851c4c7425'],
  ['server/src/data/contexte/contexteEnfant.js', 'c06b6fdfbf5245f14b36a50178143dc5f0206a8c'],
  ['server/src/data/contexte/contexteNuit.js', '4737fcae70624a0de88bbe938b321f4bb84e21be'],
  ['server/src/data/contexte/contexteRead.js', '50033e8be8df5cec4e9c4ec04a22f71ea53753d6'],
  ['server/src/data/contexte/controleDuContexte.js', 'a0a4cc650d5d07f5e5626e67820b0a51d67da4e7'],
  ['server/src/data/contexte/formulesDuContexte.js', '537f52a0baef43b4fcb90048ea6d87f5cab105e9'],
  ['server/src/data/contexte/lectureDuMagasin.js', '544470fd88e2227265e51f6c6f2109ddcf71b7fa'],
  ['server/src/data/contexte/listeDuCalendrier.js', '6f2c22b2625dcbbb2e13adc060e4899e3e123627'],
  ['server/src/data/contexte/noteDuContexte.js', '558904a1745b6b8f2d0d156082fe28a8ada4eb50'],
  ['server/src/data/contexte/preuveDuContexte.js', '69aa3bb32585d33825210f1efea5444185ea500a'],
  ['server/src/data/contexte/reglagesContexte.js', '066ad471fcdcf2be1f36c1aa18b3acbcdfc93262'],
  ['server/src/data/coupes/calibrationDesCoupes.js', '9b1017d778a36be9cb0293c5206449a30ef9ddd6'],
  ['server/src/data/coupes/comptesDesCoupes.js', 'ca13d7683604c049400b8707a3c45365b9272d6a'],
  ['server/src/data/coupes/confrontations.js', 'e5a3415f6e8867d1da17f1a04ab89647418ffac5'],
  ['server/src/data/coupes/coupesEnfant.js', '0509207ed7984731006a053fb76262a3f072c147'],
  ['server/src/data/coupes/coupesNuit.js', '883fb8a2eb675f04a4ce89aea0d0880027cb5cda'],
  ['server/src/data/coupes/coupesRead.js', '19a4e4fca968eb1edd845369b655c55838f17b8a'],
  ['server/src/data/coupes/lectureDesCoupes.js', '7b37f5ac0eb284a27674c00cde71d78b44534ce1'],
  ['server/src/data/coupes/noteDesCoupes.js', '641ab4ddd2b8911741d25a293f42e8916917324d'],
  ['server/src/data/coupes/qualification.js', '56bce046d206bccab921b46f6bff3f3f7092e4a1'],
  ['server/src/data/coupes/reglagesCoupes.js', '7ae19031fadeb792b872632c94d8bbdbc5924397'],
  ['server/src/data/coupes/terrainNeutre.js', 'a64d3ce0537161367c55141383707a257d37f480'],
  ['server/src/data/coupes/toursDeCoupe.js', '9731ccab29e362dd36c32f5d31643ef197682123'],
  ['server/src/data/db/columns.js', '325d985101ae32bab53546e68eff1a437afc341b'],
  ['server/src/data/db/dayTable.js', 'afc8d42ccc9028531da8d9efc2700ece449d6a97'],
  ['server/src/data/db/dayTableControle.js', 'e1cc9dc99ed6e8160656bf3cc331285890f390f1'],
  ['server/src/data/db/derniereComposition.js', 'c7692408cff449853c7423166d60ffe84cba3f49'],
  ['server/src/data/db/entreesButs.js', '85ef724fc5749bc95baaa67931df5edcec77e046'],
  ['server/src/data/db/forcesButs.js', '4ecda40200d8da352bc8c51adefb1152de4af916'],
  ['server/src/data/db/forcesButsEnfant.js', '535aadac696d1b3946c979691a6434f99a115b80'],
  ['server/src/data/db/identityRegistry.js', '6a5bcdd1d85e10909de81a9174b6d3fa8afbccdf'],
  ['server/src/data/db/leagueBenchmarks.js', '1c5c192ce3ba261f884c37541dd46b14736746c7'],
  ['server/src/data/db/matchStatsDb.js', 'fbc5b5f71cd1ffc0d54772a7a9386c9ed8d4a0a2'],
  ['server/src/data/db/matchStatsRead.js', '7dc674629218dc5434ec97e421de3467ba440a0b'],
  ['server/src/data/db/oddsProfileRead.js', '454e6b98f288b62eca9f945ca8940dc1301df1d4'],
  ['server/src/data/db/oddsQuotesRepository.js', 'd9c661abf573b9b22569f78b93c9d3e5d643d826'],
  ['server/src/data/db/playerRatings.js', '86bf49658a97a61a2eda62ed72ebb600e7fc9b75'],
  ['server/src/data/db/playerRatingsBanc.js', '4113bbe73ebd231549769de47669aadaa2f1acc7'],
  ['server/src/data/db/playerRatingsEnfant.js', 'd623b94e8a2013a137db9f13be9e6ade36fac833'],
  ['server/src/data/db/refereeRead.js', '0eb2c468dd9ea492a1e9b3a0de9ce14460f2d22f'],
  ['server/src/data/db/scoreFormRead.js', '46e2c8b26c722becce3192e7fa157ce4738ec21c'],
  ['server/src/data/db/squadChanges.js', 'b93e19eccb49320b0315eec21c8e27588dfd8274'],
  ['server/src/data/db/statInputsRead.js', '45470ac1777308c673eea1d2a127b956aeac1240'],
  ['server/src/data/db/teamStrength.js', '558e33d3441a33cd4b6106cc64edc7e7cd68b297'],
  ['server/src/data/db/verrouEcriture.js', '136fb6439e630a059a1bdcc832dbfa70bc9618b1'],
  ['server/src/data/debutsDeSaison/bancDesDebuts.js', '7a5539f7eb5a473f7658444d2a47b13dc973536c'],
  ['server/src/data/debutsDeSaison/comptesDesDebuts.js', '229392a0415571e45782aa81cc76903896164b79'],
  ['server/src/data/debutsDeSaison/debutsAuJourJ.js', 'b063df8cf65c2fa70988c49c308a68467c3f968d'],
  ['server/src/data/debutsDeSaison/debutsBancEnfant.js', '63d90ad167e4d2d1cbfca19d90ec8403bc2ba6d4'],
  ['server/src/data/debutsDeSaison/formulesDebuts.js', '15c12e1e2bfb1909576b03ef99d3914af3fb4eab'],
  ['server/src/data/debutsDeSaison/lectureDesDebuts.js', 'ced6a19853c829a04adfba87a2c18c6ddf05c686'],
  ['server/src/data/debutsDeSaison/noteDesDebuts.js', '762efddec7ff3ad4c5c685c4592aabd9472beebd'],
  ['server/src/data/debutsDeSaison/passeDesDebuts.js', 'a5a9967d028afcf6a819f5dd2fbc44546c8a18fa'],
  ['server/src/data/debutsDeSaison/reglagesDebuts.js', '1961cf732ecc955d223e4eb46021656bd537e57f'],
  ['server/src/data/enregistreurs/communs.js', 'f501e81e500841564ddd46fdcd0271afb9c2f1a0'],
  ['server/src/data/enregistreurs/depot.js', 'd88d29902815b0ad57e861e7816582891e41b25b'],
  ['server/src/data/enregistreurs/file.js', 'f6e7c6d9bc63e1f1bd5e75a93e96de1d5e4449ba'],
  ['server/src/data/enregistreurs/gelPronostics.js', '611e99c209a5e211a9425c5d2fb1aac09304e029'],
  ['server/src/data/enregistreurs/moteurABlanc.js', 'dcae55b108636346925aec4db5559d8938edb0e5'],
  ['server/src/data/freeMarketOdds.js', '039a2790369cacf5958ff66dab413d96fb873b93'],
  ['server/src/data/joueurs/avantMatchJoueurs.js', '82a1ff3f0961f04c7a274de3387dba5ba6a20679'],
  ['server/src/data/joueurs/bancDesJoueurs.js', '90605365d36fb883ce28767f43b680d083893c82'],
  ['server/src/data/joueurs/chiffresDesJoueurs.js', '25cf1cd7f14e13e83d63fed912456f9b0afa9dea'],
  ['server/src/data/joueurs/comptesDesJoueurs.js', '843e04c92a33f7da71913acb11be903f83020e9e'],
  ['server/src/data/joueurs/controleDesJoueurs.js', '92113f447b0fddaa2cfeee0a4f8334308a5dec6b'],
  ['server/src/data/joueurs/formulesDesJoueurs.js', '12001eeccd7d95361b265ae7951ea6de73ec25f2'],
  ['server/src/data/joueurs/joueursAuJourJ.js', '209fa8564aa38302004f3f1eb87f372bff2f1833'],
  ['server/src/data/joueurs/joueursEnfant.js', '20a8015a5e683aac162f07567907ca6312e0245d'],
  ['server/src/data/joueurs/joueursNuit.js', '15bd8aa6c5a463a5df39662cd74a16bfdf02c201'],
  ['server/src/data/joueurs/joueursRead.js', '54a72686923f21c866282a9482eb4e07d3b6b571'],
  ['server/src/data/joueurs/lectureDesCompos.js', 'b5b3190fa5f6942f49d114d5a81b5d034efc84d3'],
  ['server/src/data/joueurs/lectureDesJoueurs.js', '22d606ff5d823fde6fb7242c268f9ec5c48da2d8'],
  ['server/src/data/joueurs/noteDesJoueurs.js', 'e318e8800a596ca8f0add26c51bc1e6f769639d0'],
  ['server/src/data/joueurs/reglagesJoueurs.js', '1788fb372fa08c389308d1b54162fdaca675ba7a'],
  ['server/src/data/joueurs/reglementJoueurs.js', '8caee6e0da022b2ae0a90f2130797c8df07beee3'],
  ['server/src/data/marketKnowledge.js', 'fa4ae59cb72c2c02169f583b0a84a2fedd9430a7'],
  ['server/src/data/marketMovement.js', 'c74b1d38e42c7a778c64e3756fe96130f6b42da4'],
  ['server/src/data/matchSources.js', 'dc005be4ea560c8e7b168954c3aaa6b548a4e8fa'],
  ['server/src/data/mise/bancDeLaMise.js', 'd5183ad308453c22e944443450e1cdd228e6089b'],
  ['server/src/data/mise/capitalDePierre.js', '9f4fc9d615f15102ffd9e5e78d0eb72f79b7fe93'],
  ['server/src/data/mise/miseRead.js', 'd74dc1e245abc037b196bae9a341fcdb06ac90aa'],
  ['server/src/data/mise/noteDeLaMise.js', '6ee1c6e8da120148ace9b1f53c6316dd9c247675'],
  ['server/src/data/mise/regleDeMise.js', '1a3424614bd9fc33fd80ffe95a0f49b9984eaf6c'],
  ['server/src/data/providers/apiFootballClient.js', 'e75dec572e04d70ca1de8ce01387ac64d0ec77bc'],
  ['server/src/data/providers/espnOdds.js', '6f43ee8726967e7deae053301c3fde97715bc6f1'],
  ['server/src/data/providers/footballDataCache.js', '747209bf76c3cb667d0d8bb17c9135a2547fdf80'],
  ['server/src/data/providers/footballDataHistory.js', 'f2f11797ef360cc713c1854a0d1b2bcc9cf7f469'],
  ['server/src/data/providers/footballDataOdds.js', 'c918adfbd3efea3c95531f7ac14291374b336e9f'],
  ['server/src/data/providers/fotMobProvider.js', '5888cfc4c6df99ce91c956a7dc3376ecdf724b0e'],
  ['server/src/data/providers/fotMobRefresh.js', 'ebf7e06758d35229022ebe4432b2a9b0c7d71d78'],
  ['server/src/data/providers/freeOdds.js', 'b457c7c8348422d8c7db1d5dd577cc9ca03cdc46'],
  ['server/src/data/providers/kalshiOdds.js', '019cf28fde01fa40848b501c44a23c8780e107e6'],
  ['server/src/data/providers/leagueCups.js', 'f729d74147c8f0b59a74045056ac71040b71c923'],
  ['server/src/data/providers/leagueRegistry.js', '7ce2e928eb3c34262b73bab61bd0878b539043f6'],
  ['server/src/data/providers/lineupContext.js', '2560f4f19dfc5e2f9e970d9e2368b691dc1bceac'],
  ['server/src/data/providers/lineupPrefetch.js', '3aed24e434d84d76a8acae949c3cb8abb8e6598a'],
  ['server/src/data/providers/matchEnrichment.js', '22c9be3d901c23c3313e008f48377a1fcf2b369d'],
  ['server/src/data/providers/refreshLock.js', 'c57a4c7b7ff14f598ada36a19c8e90b67ddcc4de'],
  ['server/src/data/providers/seasonWindows.js', 'b4bcebaeea43ea10a0b10ac13b87e7c447d232b8'],
  ['server/src/data/providers/settlementService.js', '5ecd697b06cb755e72b9440b9e059eaf5ad52d0e'],
  ['server/src/data/providers/smarketsOdds.js', '282b069e4757f3f1d37297d1b6931e4e0fd90df1'],
  ['server/src/data/providers/sourceMatching.js', '5aaba6a9d8f5c2d0e4c3159255d96d5c7123b67f'],
  ['server/src/data/providers/standingsService.js', '5ff06688e36c3035f713138906e6dfababe96930'],
  ['server/src/data/providers/teamStatsService.js', '00f65e5718f44ad72d07e75138d6e9662fdc2a79'],
  ['server/src/data/relevesDesSources.js', 'f18141322bb026f5a1a1ad32c9b9894be1c34092'],
  ['server/src/data/repositories/autoAiAnalysisRepository.js', 'b39a3b130edede3921d60d6b7d5a03d1b563b8e3'],
  ['server/src/data/repositories/betsRepository.js', 'd2618ca1b9435cd1ba97001217125cb55e2f1bc4'],
  ['server/src/data/repositories/claudeUsageLedger.js', 'a35c69bde1f31c24940e038737e0f2f0edd606f4'],
  ['server/src/data/repositories/comptesBookmakersRepository.js', 'e3854a3e5357ad335958b194bdf9f649faab9f3a'],
  ['server/src/data/repositories/fixturesRepository.js', 'c8e0b39339cfecdc5dc2a1697e72293c3681a469'],
  ['server/src/data/repositories/gardeFousRepository.js', '000c1a9618f596b90733a37432e182bc3ed7dc43'],
  ['server/src/data/repositories/matchResultsRepository.js', 'eb4ae2c200138b590efc30a0562ad0efcba12f30'],
  ['server/src/data/repositories/matchStatsWebRepository.js', 'a8e640540c3aba129655d7da15bb97c4f863d332'],
  ['server/src/data/repositories/predictionsRepository.js', '4e64fff1353b9489aec54c4fcd1eb10685ebba3d'],
  ['server/src/data/repositories/seasonCalendarRepository.js', '0405d625d7cda3348adc79a703acaa11e36ca0e6'],
  ['server/src/data/repositories/statsCacheRepository.js', '94bbd1da66d5ff9a4f356abc739689f43305bc73'],
  ['server/src/data/repositories/teamProfileRepository.js', '60cd1a4adbbdf6ad2136b453c8958fd0eb5ac3af'],
  ['server/src/data/roadmap/historique.js', '96f9a0878c0f92aa48d1ff75272784f24a082a51'],
  ['server/src/data/roadmap/plan.js', '124d9c5086df25d06cb71b441d5f907570b21076'],
  ['server/src/data/saisiesCotes.js', '1449bbbdc1fd5f08d94af42dc17a82fc728512b4'],
  ['server/src/data/simulation/jambes.js', 'a135f7e17a80b58d1a520c278258b04c76c58c89'],
  ['server/src/data/suiviParis.js', 'd9a63c4b019b365d44639bd87a2d8d37b0a5567a'],
  ['server/src/jobs/enregistreurs.js', '846f62798f7479f716d003e4e33ea93a43a98727'],
  ['server/src/jobs/kickoffAiAnalysis.js', '1260f4b8cd46510c840e1d6fb3459c2765c356a8'],
  ['server/src/jobs/matchStatsAutoRefresh.js', 'f066a2dd09d9d8224f471cea2dcb409b5ae08094'],
  ['server/src/sports/football/bookmakerConsensus.js', '70ee1711b3040108d54ded41131606b81ff256eb'],
  ['server/src/sports/football/index.js', '7862358c3a6c356461075ae6a3300ccd7ebc812c'],
  ['server/src/sports/football/markets.js', 'c1296b56003be5cb170525d69047ea6745679424'],
  ['server/src/sports/football/model.js', '253a664344483f8ae2a3ec89e90471d6ccca541a'],
  ['server/src/sports/football/scoreMatrix.js', 'd04ef225bae98fa851737433f828ab57f48c73e2'],
  ['server/src/sports/football/statMarkets.js', '86fe12b131b4315e9f9020659c93f2ed7461222d'],
  ['server/src/sports/football/xgBaseline.js', '1774c087b4d3076900ae9a3547f7af4b42407729'],
  ['server/src/sports/index.js', '963bc8caf965c7bc8be7faad62c14de2e0427081'],
  ['server/src/sports/sportPort.js', '433369bfb949df9cc2d37acdec358f9a073f69d6'],
  ['server/src/utils/atomicJson.js', 'fbc39689e775107a6e987ef17ff01687fa8317e4'],
  ['server/src/utils/calculLourd.js', 'b8bf077054354c18d813fb6d05b29f704facccb0'],
  ['server/src/utils/nameIdentity.js', '4d0a4b28500ab2fde0d02bbfca1ba2ab01e17d48'],
  ['server/src/utils/statVocabulary.js', 'fa33e8aec2826a2fa05f7c815a1f4006bcb1cc56'],
  ['server/src/utils/teamNameMatch.js', '8f7c2242321185c041b0c535d79d048cc61bc9db'],
  ['server/src/utils/travailCooperatif.js', '9a07336ed530f1e47d4d7642969be02a5f96907d'],
  ['ui/src/components/analysis/MarketPicksBoard.vue', 'bb8cd5ced6dd7c8264467f80e47fe248f1e1a4dd'],
  ['ui/src/components/common/ConfidenceGauge.vue', '1bb8634a1200b245f9c92288e260cf6a725e9309'],
  ['ui/src/components/matches/LineupPitch.vue', '0bc9124c6228b303a98342128a2f7acddc6b8661']
]);

test('T-G1 — les empreintes ne bougent pas ; ni fichier ni mention de ficheDuPronostic sous server/src ; aucune « étape 40 » sous core/ ni sports/', () => {
  assert.equal(empreinteDuCode({ rafraichir: true }).empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  for (const f of tousLesFichiers(SRC)) {
    assert.ok(!/fiche-?du-?pronostic/i.test(f), `server/src/${f} : un fichier de l’étape 40 sous server/src`);
    assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /ficheDuPronostic/, `server/src/${f}`);
  }
  for (const racine of ['core', 'sports']) {
    const fichiers = tousLesFichiers(path.join(SRC, racine));
    assert.ok(fichiers.length >= 5, `${racine} : ${fichiers.length} fichiers lus`);
    for (const f of fichiers) assert.doesNotMatch(fs.readFileSync(path.join(SRC, racine, f), 'utf8'), /[ÉEée]tape 40\b|fiche du pronostic/i, `${racine}/${f} parle de l’étape 40`);
  }
});

test('T-G2 — le gel : les 235 fichiers de code identiques à l’octet ; historique.js identique SANS l’entrée 40, qui n’y retire aucune ligne', () => {
  assert.equal(GEL.length, 235);
  assert.equal(new Set(GEL.map(([f]) => f)).size, 235, 'aucun doublon');
  assert.ok(!GEL.some(([f]) => f === 'server/data/runtime/engine-config.json'), 'le fichier des réglages hors du gel (O5), gardé par T-G4');
  assert.ok(GEL.every(([f, s]) => /^(server\/(src|scripts)|ui\/src)\//.test(f) && /^[0-9a-f]{40}$/.test(s)), 'des fichiers de code seulement');
  const sha = Object.fromEntries(GEL);
  // Les fichiers que la fiche touche de près : la route de l'analyse (la réponse que la fiche lit), l'onglet Marchés gelé
  // pendant l'essai de la 27, la jauge (lot 2), la composition sur le terrain.
  assert.equal(sha['server/src/api/controllers/analysis.controller.js'], 'cbb3844d6cf8df8f68c53021f0427f2cfb2d46bd');
  assert.equal(sha['ui/src/components/analysis/MarketPicksBoard.vue'], 'bb8cd5ced6dd7c8264467f80e47fe248f1e1a4dd');
  assert.equal(sha['ui/src/components/common/ConfidenceGauge.vue'], '1bb8634a1200b245f9c92288e260cf6a725e9309');
  assert.equal(sha['ui/src/components/matches/LineupPitch.vue'], '0bc9124c6228b303a98342128a2f7acddc6b8661');
  assert.equal(sha[HISTORIQUE_JS], '96f9a0878c0f92aa48d1ff75272784f24a082a51');
  for (const [f, attendu] of GEL) {
    const octets = fs.readFileSync(path.join(RACINE, f));
    if (f !== HISTORIQUE_JS) {
      assert.equal(sha1(octets), attendu, f);
      continue;
    }
    // L'ajout pur : la ligne `  })` de la 35 devient `  }),`, puis l'entrée 40 (aucune ligne entre les deux), jusqu'à `]);`.
    const texte = octets.toString('utf8');
    assert.equal(texte.split(DEBUT_40).length - 1, 1, 'l’entrée 40 commence juste après la fin de la 35');
    const avant = sansLEntree40(texte);
    assert.equal(sha1(Buffer.from(avant, 'utf8')), attendu, `${f} sans l’entrée 40`);
    assert.notEqual(sha1(octets), attendu, `${f} porte bien l’entrée 40`);
    const maintenant = new Set(texte.split('\n'));
    assert.deepEqual(avant.split('\n').filter((l) => !maintenant.has(l)), [], `${f} : seules des lignes ajoutées`);
  }
});

test('T-G3 — ce que l’IA reçoit ne bouge pas : compactContext.js à l’octet, le service et l’invite dans le gel, rien du serveur n’importe ficheDuPronostic', () => {
  assert.equal(sha1(fs.readFileSync(path.join(SRC, 'core', 'ai', 'compactContext.js'))), 'd948305e88c86445e8b19fc6fb38c779a046708c');
  const sha = Object.fromEntries(GEL);
  assert.equal(sha['server/src/core/ai/matchAiAnalysisService.js'], '0f252e469aa8d3b896324e26f8be21a8d0a81aa2');
  assert.equal(sha['server/src/core/ai/webLookupPrompt.js'], 'c43ea47071de9a60556cb3098937f0cd9ccdb2b9');
  let vus = 0;
  for (const dossier of ['src', 'scripts']) {
    for (const f of tousLesFichiers(path.join(SERVEUR, dossier)).filter((x) => /\.(m?js|cjs)$/.test(x))) {
      vus += 1;
      assert.doesNotMatch(fs.readFileSync(path.join(SERVEUR, dossier, f), 'utf8'), /ficheDuPronostic|PercentageWhyCard/, `server/${dossier}/${f}`);
    }
  }
  assert.ok(vus > 200, `${vus} fichiers lus`);
});

test('T-G4 — les poids du moteur, par défaut et en service : marché 1, structurel 0, exogène 0 (la fiche dit que le 1 / N / 2 vient des cotes seules)', () => {
  const POIDS = { market: 1, structural: 0, exogenous: 0 };
  assert.deepEqual({ ...DEFAULT_ENGINE_CONFIG_BY_SPORT.football.weights }, POIDS);
  const enService = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'data', 'runtime', 'engine-config.json'), 'utf8'));
  assert.deepEqual(enService.football?.weights, POIDS);
});

test('T-G5 — la feuille de route : une seule entrée 40, la dernière, son lot 1 dit ; aucune étape en cours ; aucun lancement 40', () => {
  const quarante = HISTORIQUE.filter((h) => h.etape === '40');
  assert.equal(quarante.length, 1, 'une seule entrée 40');
  const e = quarante[0];
  assert.equal(HISTORIQUE.at(-1), e, 'la dernière');
  assert.ok(typeof e.partielle === 'string' && e.partielle.length >= 10, 'le lot livré, dit : l’étape reste en cours');
  assert.match(e.partielle, /lot 1/);
  assert.ok(e.fin >= '2026-11-10', e.fin);
  assert.ok(typeof e.change === 'string' && e.change.length >= 60);
  assert.ok(typeof e.mesure === 'string' && e.mesure.length >= 20 && !/à mesurer/i.test(e.mesure));
  assert.ok(e.tests.total >= 1939, String(e.tests.total));
  assert.equal(e.tests.echecs, 0);
  assert.equal(e.tests.reussis + e.tests.todo + e.tests.echecs, e.tests.total);
  assert.deepEqual([...ETAPES_EN_COURS], []);
  assert.ok(!LANCEMENTS.some((l) => l.etape === '40'), 'le lot 1 n’a pas de banc : aucun lancement');
  const texte = fs.readFileSync(path.join(RACINE, HISTORIQUE_JS), 'utf8');
  assert.equal((texte.match(/^ {4}etape: '40',$/gm) ?? []).length, 1);
});
