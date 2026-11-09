/**
 * LA MISE — LA FRONTIÈRE (étape 39 « La mise juste », lot 1a, 04/11/2026) : rien de l'essai de l'étape 27 ne bouge.
 *   node --test test/miseFrontiere.test.mjs        (depuis server/)
 *
 * T-X1  les empreintes ne bougent pas (16f2459db183a99576365047da98b7777687ef05 / f01dd8496f56a415) ; aucun fichier de
 *       l'étape 39 sous core/ ni sports/ ni dans l'empreinte (la seule retouche sous core/ : core/ai/compactContext.js, libre,
 *       décision 7 c de l'orchestrateur) ; data/mise/ = les trois fichiers du lot 1a ;
 * T-X2  depuis TOUTES les racines du gel (l'empreinte, le chemin de nuit de l'essai 27, les 78 de la fermeture, les 12
 *       producteurs cachés, autoMatchAiTrigger.js et matchAiAnalysisService.js) : data/mise/ n'est jamais atteint, par aucun
 *       import (statique, dynamique, réexport) ;
 * T-X3  la règle pure (data/mise/regleDeMise.js) n'importe rien : ni horloge, ni hasard, ni fichier, ni base ; la règle de
 *       l'écran (ui/src/utils/miseAffichee.js) non plus ; leurs mots et leurs listes sont ceux du serveur ;
 * T-X6  aucune écriture des fichiers de réglage (engine-config.json, garde-fous.json, tilt-state.json, bets.json,
 *       fraicheur-cotes.json) depuis data/mise/ ni depuis la route du capital ; capital.json seul, par atomicJson ;
 * T-X7  le jugement PROVISOIRE de l'essai de l'étape 27 rejoué sur une copie (le patron de contexteFrontiere.test.mjs) :
 *       identique à l'octet à la fixture d'avant l'étape 32 ;
 * T-X12 les sha1 de la partie 0 : TOUS les fichiers gelés (196, dont autoMatchAiTrigger.js et matchAiAnalysisService.js,
 *       gelé par la décision 7 b), identiques à l'octet ;
 * T-X13 tout appel LIBRE à listAdaptedMatches / findAdaptedMatch dont la mise est lue passe la base du capital
 *       (baseDeCalcul / contexteDeLaMise), jamais un chiffre de la requête ; exemptions nommées avec leur raison ; le
 *       Repérage et les Opportunités joignent la mise refaite sur le capital (jamais la mise de leur base interne) ;
 * T-X14 la règle « déclencheur » (décision 7 a) : dans chaque déclencheur retouché, les appels de la chaîne vers
 *       l'annuaire sont identiques à l'octet à ceux du dépôt relevés en partie 0 (seule la base de listAdaptedMatches /
 *       findAdaptedMatch change) ;
 * T-X15 ni compactContext.js ni ses appelants (le résumé gardé de matchAiAnalysisService.js, les fiches de l'IA) ne
 *       MODIFIENT le résultat du moteur qu'ils reçoivent (gelé en profondeur dans une copie isolée : une écriture lèverait) ;
 *       la fiche dit la PART, jamais un euro.
 * (T-X5 — la déclaration de l'étape 39 au registre du banc — vient avec le banc, au lot 1b.)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR, FIXTURES } from './aides/isolement.mjs';
import { octetsSansLesAjoutsDe36 } from './aides/ajouts36.mjs';
// Étape 35 (lot 1a, 09/11/2026) : ses ajouts purs retirés AVANT ceux de la 36 (aides/ajouts35.mjs ; debutsFrontiere.test.mjs, T-X1).
import { octetsSansLesAjoutsDe35 } from './aides/ajouts35.mjs';
import { fichiersDuMoteur, empreinteDuCode, empreinteDeLaCandidate, CANDIDATE_EN_ESSAI, MODULES_DU_MOTEUR } from '../src/core/engine/engineVersions.js';
import * as R from '../src/data/mise/regleDeMise.js';
import { conseilDuPari } from '../src/data/screener.js';
import { LIVRES_FRANCAIS } from '../src/data/combinaison/reglagesCombinaison.js';
import { MISE_EN_PART_DANS_LE_MESSAGE } from '../src/core/ai/compactContext.js';

const SRC = path.join(SERVEUR, 'src');
const RACINE = path.join(SERVEUR, '..');
const MISE = path.join(SRC, 'data', 'mise');
const UI = path.join(RACINE, 'ui');
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sansCommentaires = (f) => fs.readFileSync(f, 'utf8').replace(new RegExp('/[*][^]*?[*]/', 'g'), '').replace(new RegExp('(^|[^:\'"`])//.*$', 'gm'), '$1');
const FICHIERS_39 = fs.readdirSync(MISE).map((f) => `data/mise/${f}`);
const rel = (f) => path.relative(SRC, f).split(path.sep).join('/');
const tousLesFichiers = (dossier) => (fs.existsSync(dossier) ? fs.readdirSync(dossier, { recursive: true }).map(String).filter((f) => fs.statSync(path.join(dossier, f)).isFile()) : []);

/** LES FICHIERS GELÉS et leur sha1 (octets bruts) relevés en partie 0 (SCR39, partie0, gel-depart2.json : le bac du 04/11 à 12 h 54, = le dépôt). */
const GELES = Object.freeze([
  ['api/controllers/matchStats.controller.js', '6081a7cd00409e34656fb8d071a0e4ce2018fbec'],
  ['api/controllers/statValue.controller.js', '7fa9e8204a4c5a1ef03d23cdf461833d98abaf78'],
  ['bench/entrees.js', '38fdc199677e61691bc5c56c4fa63f88cd489a93'],
  ['bench/essaiCandidate.js', 'e493518bb9c57be53deeeaf77cac18e21ea6865a'],
  ['bench/guard.js', '60551323d356d5502684ca32276793fcb946ef84'],
  ['bench/horizonEssai.js', 'db2ee326f8f88f09a5582c7e297cfd4bd7c9d51b'],
  ['bench/jugeAPart.js', '2c1434cefe5b21055c313750ce0a1c2c8f6abc12'],
  ['bench/lancements.js', 'c2db82b68168b877603e3f18d3d0203121906ac4'],
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
  ['data/combinaison/combinaisonEnfant.js', '257e0c75c17b70270953e6c1540d160ceb3f7315'],
  ['data/combinaison/comptesDeLaCombinaison.js', '9b15d2252a3e6e0729f5d56decbb4dca23e4248c'],
  ['data/combinaison/formulesDeLaCombinaison.js', 'f3b51be33ddb62bfc352e5962c22f2f6a29361dd'],
  ['data/combinaison/ingredientsDUneLigne.js', '8a21b2b138253f5c2444a9d79c95c75e06b77dc1'],
  ['data/combinaison/lecteurP5.js', '9a9faa5863a1f699e1643c0b4b77089e3a57256e'],
  ['data/combinaison/noteDeLaCombinaison.js', '9e710bba2976c6b3a0363d44dc08217280c4273d'],
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
  ['data/db/columns.js', '325d985101ae32bab53546e68eff1a437afc341b'],
  ['data/db/dayTable.js', 'afc8d42ccc9028531da8d9efc2700ece449d6a97'],
  ['data/db/dayTableControle.js', 'e1cc9dc99ed6e8160656bf3cc331285890f390f1'],
  ['data/db/derniereComposition.js', 'c7692408cff449853c7423166d60ffe84cba3f49'],
  ['data/db/entreesButs.js', '85ef724fc5749bc95baaa67931df5edcec77e046'],
  ['data/db/forcesButs.js', '4ecda40200d8da352bc8c51adefb1152de4af916'],
  ['data/db/forcesButsEnfant.js', '535aadac696d1b3946c979691a6434f99a115b80'],
  ['data/db/identityRegistry.js', '6a5bcdd1d85e10909de81a9174b6d3fa8afbccdf'],
  ['data/db/leagueBenchmarks.js', '1c5c192ce3ba261f884c37541dd46b14736746c7'],
  ['data/db/matchStatsDb.js', '8ef5919fdadf6262d5292825657d8339b96197af'],
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
  ['data/simulation/jambes.js', 'a135f7e17a80b58d1a520c278258b04c76c58c89'],
  ['data/suiviParis.js', 'd9a63c4b019b365d44639bd87a2d8d37b0a5567a'],
  ['jobs/enregistreurs.js', '846f62798f7479f716d003e4e33ea93a43a98727'],
  ['jobs/kickoffAiAnalysis.js', '1260f4b8cd46510c840e1d6fb3459c2765c356a8'],
  ['jobs/matchStatsAutoRefresh.js', 'd854bfd2c1cf5117fdb573c50724fd6f5b0b4c69'],
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
  ['utils/travailCooperatif.js', '9a07336ed530f1e47d4d7642969be02a5f96907d'],
  ['ui/src/components/analysis/MarketPicksBoard.vue', 'bb8cd5ced6dd7c8264467f80e47fe248f1e1a4dd'],
  ['ui/src/components/common/ConfidenceGauge.vue', '1bb8634a1200b245f9c92288e260cf6a725e9309'],
  ['ui/src/components/matches/LineupPitch.vue', '0bc9124c6228b303a98342128a2f7acddc6b8661']
]);

/** Les fichiers atteints par les imports relatifs (statiques, import() à chemin littéral, réexports) d'un ensemble de départ. */
function atteints(depart) {
  const vus = new Set();
  const pile = [...depart];
  const re = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|export\s[^'"]*?from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f) || !fs.existsSync(f)) continue;
    vus.add(f);
    for (const m of sansCommentaires(f).matchAll(re)) {
      let cible = path.resolve(path.dirname(f), m[1]);
      if (!/\.(m?js|json)$/.test(cible) && fs.existsSync(`${cible}.js`)) cible += '.js';
      pile.push(cible);
    }
  }
  return vus;
}

test('T-X1 les empreintes ne bougent pas ; rien de l’étape 39 sous core/ ni sports/ ni dans l’empreinte ; data/mise/ = les trois fichiers du lot 1a', () => {
  assert.equal(empreinteDuCode({ rafraichir: true }).empreinte, '16f2459db183a99576365047da98b7777687ef05');
  assert.equal(empreinteDeLaCandidate(CANDIDATE_EN_ESSAI), 'f01dd8496f56a415');
  assert.deepEqual(FICHIERS_39.sort(), ['data/mise/capitalDePierre.js', 'data/mise/miseRead.js', 'data/mise/regleDeMise.js']);
  const gelesSousCore = new Set(GELES.map(([f]) => f).filter((f) => f.startsWith('core/') || f.startsWith('sports/')));
  for (const racine of ['core', 'sports']) {
    for (const f of tousLesFichiers(path.join(SRC, racine))) {
      const r = `${racine}/${f.split(path.sep).join('/')}`;
      assert.doesNotMatch(r, /mise|capital|stakeSizing/i, `${r} : un fichier de l’étape 39 sous ${racine}/`);
      if (/^core\/(engine|market|model|risk|signals|xg)\//.test(r) || r.startsWith('sports/')) assert.ok(gelesSousCore.has(r), `${r} : un fichier neuf dans l’empreinte`);
    }
  }
  const empreinte = fichiersDuMoteur();
  for (const f of FICHIERS_39) assert.ok(!empreinte.includes(f), `${f} dans l’empreinte`);
  assert.ok(!MODULES_DU_MOTEUR.fichiers.some((f) => /mise/i.test(f)));
  // La seule retouche sous core/ : compactContext.js (core/ai, hors empreinte, hors fermeture : la PART dans le prompt).
  assert.ok(!empreinte.includes('core/ai/compactContext.js'));
});

test('T-X2 depuis TOUTES les racines du gel (empreinte, chemin de nuit, les 78, les 12, autoMatchAiTrigger.js, matchAiAnalysisService.js), data/mise/ n’est jamais atteint', () => {
  const fermeture = GELES.map(([f]) => f).filter((f) => !f.startsWith('ui/') && /\.m?js$/.test(f));
  const racines = [
    ...new Set([
      ...fichiersDuMoteur(),
      ...fermeture,
      'data/enregistreurs/gelPronostics.js', 'data/enregistreurs/depot.js', 'data/enregistreurs/moteurABlanc.js', 'bench/essaiCandidate.js', 'bench/runner.js',
      'core/engine/engineVersions.js', 'core/engine/engineConfig.js', 'data/db/dayTable.js', 'data/db/forcesButs.js', 'data/db/forcesButsEnfant.js',
      'api/controllers/statValue.controller.js', 'data/contexte/contexteNuit.js', 'data/db/dayTableControle.js', 'data/marketKnowledge.js',
      'data/providers/espnOdds.js', 'data/providers/footballDataHistory.js', 'data/providers/fotMobRefresh.js', 'data/providers/freeOdds.js',
      'data/providers/kalshiOdds.js', 'data/providers/lineupContext.js', 'data/providers/smarketsOdds.js', 'jobs/matchStatsAutoRefresh.js',
      'core/ai/autoMatchAiTrigger.js', 'core/ai/matchAiAnalysisService.js'
    ])
  ].map((f) => path.join(SRC, f));
  for (const f of racines) assert.ok(fs.existsSync(f), `racine absente : ${rel(f)}`);
  const graphe = [...atteints(racines)].map(rel);
  assert.ok(graphe.length > 250, `${graphe.length} fichiers atteints`);
  for (const f of FICHIERS_39) assert.ok(!graphe.includes(f), `${f} atteint depuis une racine du gel`);
  // Les fichiers libres ATTEINTS par ces racines n'importent rien de data/mise/ (compactContext.js, screener.js, bulletinFiches.js…).
  for (const f of ['core/ai/compactContext.js', 'data/screener.js', 'core/ai/bulletinFiches.js', 'data/opportunities.js']) {
    assert.ok(graphe.includes(f), `${f} est bien atteint par les racines du gel`);
    assert.doesNotMatch(sansCommentaires(path.join(SRC, f)), /['"][./]*(data\/)?mise\//, `${f} importe data/mise/`);
  }
});

test('T-X3 la règle pure n’importe rien (ni horloge, ni hasard, ni fichier, ni base) ; la règle de l’écran non plus ; leurs mots, leur mention et leurs livres sont ceux du serveur', () => {
  const code = sansCommentaires(path.join(MISE, 'regleDeMise.js'));
  assert.doesNotMatch(code, /^\s*import\s/m, 'regleDeMise.js n’importe rien');
  assert.doesNotMatch(code, /Date\.now\(|new Date\(|Math\.random|performance\.now|openDb|DatabaseSync|fetch\(|node:fs|readFileSync|writeFileSync|process\.|require\(/, 'regleDeMise.js : ni horloge, ni hasard, ni fichier, ni base');
  const ecran = sansCommentaires(path.join(UI, 'src', 'utils', 'miseAffichee.js'));
  assert.doesNotMatch(ecran, /^\s*import\s/m, 'miseAffichee.js n’importe rien');
  assert.doesNotMatch(ecran, /Date\.now\(|new Date\(|Math\.random|fetch\(|document\.|window\.|localStorage/, 'miseAffichee.js : pur');
  assert.ok(Object.isFrozen(R.REGLE_DE_MISE_V1) && Object.isFrozen(R.MOTS_DE_LA_MISE) && Object.isFrozen(R.LIVRES_FRANCAIS));
  assert.deepEqual(R.REGLE_DE_MISE_V1, { id: 'mise-v1', version: '39.1', liaisonMemeMatch: 'place-qui-reste', francais: 'mention' });
  assert.deepEqual([...R.LIVRES_FRANCAIS], [...LIVRES_FRANCAIS], 'les livres français de l’étape 38, une seule liste');
});

test('T-X3bis écran = serveur : les mots fixes, la mention française et la date du changement du message de l’IA', async () => {
  const U = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'miseAffichee.js')).href);
  assert.deepEqual({ ...U.MOTS_DE_LA_MISE }, { ...R.MOTS_DE_LA_MISE });
  assert.equal(U.MENTION_FRANCAIS, R.MENTION_FRANCAIS);
  assert.deepEqual({ ...U.MISE_EN_PART_DANS_LE_MESSAGE }, { ...MISE_EN_PART_DANS_LE_MESSAGE });
});

test('T-X6 aucune écriture des fichiers de réglage depuis data/mise/ ni depuis la route du capital : capital.json seul, par atomicJson', () => {
  for (const f of FICHIERS_39) {
    const code = sansCommentaires(path.join(SRC, f));
    assert.doesNotMatch(code, /engine-config|garde-fous\.json|tilt-state|bets\.json|fraicheur-cotes|updateEngineConfig|resetEngineConfig|enregistrerReglageGardeFous|setCircuitBreaker|resetTiltState|createBet|updateBetLegStatus|applyBetLegSettlements|deleteBet|enregistrerCompte|writeFileSync|renameSync|unlinkSync|rmSync/, `${f} n’écrit aucun fichier de réglage`);
    const ecritures = [...code.matchAll(/writeJsonAtomic\(([^,]+),/g)].map((m) => m[1].trim());
    assert.ok(ecritures.every((c) => c === 'FICHIER'), `${f} : writeJsonAtomic sur ${ecritures.join(', ')}`);
  }
  assert.match(fs.readFileSync(path.join(MISE, 'capitalDePierre.js'), 'utf8'), /data\/runtime\/capital\.json'\)/);
  const controleur = fs.readFileSync(path.join(SRC, 'api', 'controllers', 'config.controller.js'), 'utf8');
  const capital = controleur.slice(controleur.indexOf('étape 39 : le capital de Pierre'));
  assert.ok(capital.length > 500);
  assert.doesNotMatch(capital, /enregistrerReglageGardeFous|updateEngineConfig|setCircuitBreaker|writeJsonAtomic|writeFileSync/, 'la route du capital n’écrit que par enregistrerCapital / retirerCapital');
});

test('T-X7 le jugement PROVISOIRE de l’essai de l’étape 27 (moteurABlanc, essai fabriqué, copie isolée) est IDENTIQUE À L’OCTET à celui du code d’avant l’étape 32 — avec le code de l’étape 39', () => {
  const figee = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'essai27-avant-etape32.json'), 'utf8'));
  const copie = preparerCopie({});
  let s;
  try {
    const o = { ...figee.options, versions: path.join(copie.dossier, 'versions-essai.json'), mesure: path.join(copie.dossier, 'mesure-essai.json') };
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-contexte-essai27.mjs'), { args: ['essai27', JSON.stringify(o)], timeout: 600_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, `${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false);
    s = r.json;
  } finally {
    copie.nettoyer();
  }
  assert.equal(s.forcesAJour, true);
  assert.deepEqual(s.fabrication, figee.fabrication, 'le même essai fabriqué');
  assert.equal(s.erreur, null);
  assert.equal(s.bilanEssai.calcule, true);
  assert.equal(s.bilanEssai.principal, false, 'avant l’horizon : le jugement provisoire');
  assert.deepEqual(s.bilanEssai, figee.bilanEssai);
  assert.equal(sha1(s.provisoireTexte), figee.sha1.provisoire);
  assert.equal(s.provisoireTexte, figee.provisoireTexte, 'le jugement provisoire, à l’octet');
  assert.equal(s.premiersChiffresTexte, figee.premiersChiffresTexte, 'les premiers chiffres rangés, à l’octet');
  assert.equal(s.jugementRangeTexte, figee.jugementRangeTexte);
  assert.equal(s.fenetresVues27Texte, figee.fenetresVues27Texte, 'fenetresVues(\'27\'), à l’octet');
  assert.equal(s.variantes27, figee.variantes27);
  assert.equal(s.variantes27, 320);
  // L'étape 39 n'a déclaré aucun lancement au lot 1a (le banc est au lot 1b) : les lancements vus sont ceux de 32, 33, 34 et 38.
  assert.ok(!s.lancementsVus.some((x) => x.startsWith('39:')), 'aucun lancement de l’étape 39 au lot 1a');
  // Étape 36 (lot 1, 09/11/2026) : le lancement 36, noté au premier démarrage lui aussi — rien d'autre ne bouge.
  // Étape 35 (lot 1a, 09/11/2026) : de même pour le lancement 35.
  assert.deepEqual(s.lancementsVus.filter((x) => !['32:contexte-v1', '33:cartons-corners-v1', '34:joueurs-v1', '38:combinaison-v1', '36:coupes-v1', '35:debuts-de-saison-v1'].includes(x)), figee.lancementsVus);
});

test('T-X12 les sha1 de la partie 0 : tous les fichiers gelés identiques à l’octet (autoMatchAiTrigger.js et matchAiAnalysisService.js compris)', () => {
  assert.equal(GELES.length, 196, `${GELES.length} fichiers gelés`);
  for (const f of ['core/ai/autoMatchAiTrigger.js', 'core/ai/matchAiAnalysisService.js', 'data/matchSources.js', 'core/engine/valueFinder.js', 'core/engine/verdictPari.js', 'core/risk/gardeFous.js', 'core/engine/tiltState.js', 'data/repositories/betsRepository.js', 'utils/atomicJson.js', 'data/enregistreurs/gelPronostics.js', 'bench/lancements.js', 'data/db/matchStatsDb.js']) {
    assert.ok(GELES.some(([g]) => g === f), `${f} est dans la liste du gel`);
  }
  for (const [f, attendu] of GELES) {
    const chemin = f.startsWith('ui/') ? path.join(RACINE, f) : path.join(SRC, f);
    // Étape 38 (lot 1b, 04/11/2026) : l'actualisation comparée sans ses blocs « ajout pur » de la 38 (combinaisonFuite.test.mjs, T-X10).
    // Étape 36 (lot 1, 09/11/2026) : ses ajouts purs aux fichiers gelés (lancements.js, matchStatsDb.js, l'actualisation, settlementService.js)
    // retirés de même (aides/ajouts36.mjs ; coupesFrontiere.test.mjs, T-X1).
    // Étape 35 (lot 1a, 09/11/2026) : ses ajouts purs (lancements.js, matchStatsDb.js) retirés d'abord.
    const octets = octetsSansLesAjoutsDe36(f, f === 'jobs/matchStatsAutoRefresh.js' ? Buffer.from(fs.readFileSync(chemin, 'utf8').replace(/^[^\n]*\[étape 38, lot 1b : ajout pur, début\][\s\S]*?\[étape 38, lot 1b : ajout pur, fin\][^\n]*\n/gm, ''), 'utf8') : octetsSansLesAjoutsDe35(f, fs.readFileSync(chemin)));
    assert.equal(sha1(octets), attendu, `${f} : retouché (gelé pendant l’essai 27)`);
  }
  // autoMatchAiTrigger.js garde sa base interne de 10 000 (aucune mise n'en sort vers Pierre : le prompt passe par compactContext.js).
  const declencheur = fs.readFileSync(path.join(SRC, 'core', 'ai', 'autoMatchAiTrigger.js'), 'utf8');
  assert.equal(declencheur.split("listAdaptedMatches('odds-api', 10000)").length - 1, 2);
});

/** Les appels libres à listAdaptedMatches / findAdaptedMatch, par fichier (gelés exclus : leur base ne change pas). */
const EXEMPTIONS_T_X13 = Object.freeze({
  'data/conseilReleve.js': 'aucune mise lue : le conseil de relevé ne regarde que les cotes et leur heure',
  'api/controllers/simulation.controller.js': 'aucune mise lue : la simulation d’un ticket ne lit que les probabilités',
  'core/ai/bulletinFiches.js': 'atteint par la nuit (matchStatsAutoRefresh → bulletinService → bulletinFiches) : il ne peut pas lire le capital (T-X2) ; sa liste ne sert qu’à nommer les matchs du jour, aucune mise n’en est lue',
  'data/screener.js': 'la mise de ses matchs n’est jamais lue : le Repérage ne rend que l’avantage et la cote du conseil, ses euros sont refaits sur le capital par le contrôleur'
});

test('T-X13 tout appel LIBRE à listAdaptedMatches / findAdaptedMatch dont la mise est lue passe la base du capital, jamais un chiffre de la requête ; exemptions nommées ; Repérage et Opportunités : la mise refaite sur le capital', () => {
  const gelés = new Set(GELES.map(([f]) => f));
  const appels = [];
  for (const f of tousLesFichiers(SRC)) {
    const r = f.split(path.sep).join('/');
    if (!/\.m?js$/.test(r) || r === 'data/matchSources.js' || gelés.has(r)) continue;
    const code = sansCommentaires(path.join(SRC, f));
    for (const m of code.matchAll(/\b(listAdaptedMatches|findAdaptedMatch)\(([^)]*)\)/g)) appels.push({ fichier: r, appel: m[0], args: m[2].split(',').map((x) => x.trim()) });
  }
  assert.ok(appels.length >= 6, JSON.stringify(appels));
  for (const a of appels) {
    if (EXEMPTIONS_T_X13[a.fichier]) continue;
    const attendu = a.appel.startsWith('list') ? 2 : 3;
    assert.equal(a.args.length, attendu, `${a.fichier} : ${a.appel} — la base du capital doit être passée`);
    assert.equal(a.args.at(-1), 'bankroll', `${a.fichier} : ${a.appel}`);
    const code = sansCommentaires(path.join(SRC, a.fichier));
    assert.match(code, /const bankroll = (baseDeCalcul\(|contexteMise\.base;)/, `${a.fichier} : la base vient du capital (baseDeCalcul / contexteDeLaMise)`);
  }
  for (const f of Object.keys(EXEMPTIONS_T_X13)) assert.ok(appels.some((a) => a.fichier === f), `exemption sans objet : ${f}`);
  // Jamais un chiffre de la requête : `bankroll` n'est plus lu nulle part dans les contrôleurs.
  for (const f of tousLesFichiers(path.join(SRC, 'api'))) assert.doesNotMatch(sansCommentaires(path.join(SRC, 'api', f)), /query\.bankroll|query\[['"]bankroll/, `api/${f} lit encore bankroll dans la requête`);
  // Le Repérage ne rend que l'avantage et la cote du conseil, jamais sa mise ; ses contrôleurs joignent la mise refaite sur le capital.
  const c = conseilDuPari({ action: 'RECOMMENDED', stake: 39, misePlafonnee: { mise: 39 }, ev: 0.05, odds: 2.1, outcome: 'home', bookmaker: 'williamhill', bookmakerTitle: 'William Hill' });
  assert.deepEqual(Object.keys(c).sort(), ['bookmaker', 'bookmakerTitle', 'cote', 'coteAffichee', 'ev', 'issue']);
  assert.equal(conseilDuPari({ action: 'PASS' }), null);
  const ctrl = (f) => sansCommentaires(path.join(SRC, 'api', 'controllers', f));
  assert.match(ctrl('screener.controller.js'), /reperageAvecLaMise\(lu, contexteDeLaMise\(\)\)/);
  assert.match(ctrl('opportunities.controller.js'), /opportunitesAvecLaMise\(op, contexteDeLaMise\(\)\)/);
  assert.match(ctrl('opportunities.controller.js'), /vertesSansEuros\(getOpportunitesVertes\(\)\)/);
  const lecture = sansCommentaires(path.join(MISE, 'miseRead.js'));
  assert.doesNotMatch(lecture, /conseil\.stake|verdict\.mise/, 'les euros du Repérage ne viennent jamais de sa base interne');
});

/** Les appels de la chaîne vers l'annuaire, relevés dans le DÉPÔT en partie 0 (04/11, 13 h 20) : identiques à l'octet dans le bac. */
const CHAINES = Object.freeze({
  'api/controllers/matches.controller.js': ['listAdaptedMatches(source, bankroll)', 'findAdaptedMatch(source, req.params.matchId, bankroll)', 'createResultLookup()'],
  'api/controllers/analysis.controller.js': [
    'findAdaptedMatch(source, req.params.matchId, bankroll)',
    'enrichMatchWithRealAverages(match, { includeCorners, cornersSampleSize })',
    'analyzeMatch(avecFraicheur, getEngineConfig(sportId), getTiltState(), getSport(sportId))',
    'fraicheurDuMatch(finalMatch)',
    'aVerifierDuMatchAnalyse(avecFraicheur)',
    'simulationDuMatchAnalyse(avecFraicheur, analyse, getEngineConfig(sportId))',
    'contexteDuMatchAnalyse(avecFraicheur)',
    'cartonsDuMatchAnalyse(avecFraicheur, analyse)',
    'joueursDuMatchAnalyse(avecFraicheur)'
  ],
  'api/controllers/seasonCalendar.controller.js': ['teamUpcomingFixtures(name, { league, from })', "listAdaptedMatches('odds-api', «BASE»)"],
  'data/screener.js': [
    "listAdaptedMatches('odds-api')",
    'enrichMatchWithRealAverages(match, { sansRepliPayant: true })',
    'analyzeMatch(enrichi, config, getTiltState(), sport)',
    'clubDuMagasin(nom, league, database)',
    'decisionDePari(match, config, tiltState)',
    'calculer()',
    'frequencesDeLaLigue(match.league, database)',
    'quotesForFixture({ homeId, awayId, date: String(match.commenceTime).slice(0, 10) }, { database })',
    'heuresDesCotesPayantes(match, { database })',
    'aUneDerniereComposition(id, jour, { database })'
  ],
  'api/controllers/screener.controller.js': ["getScreener({ force: req.query.force === '1' })"],
  'api/controllers/opportunities.controller.js': ["getOpportunities({ force: req.query.force === '1' })", 'getOpportunitesVertes()']
});

test('T-X14 la règle « déclencheur » : dans chaque déclencheur retouché, les appels de la chaîne vers l’annuaire sont ceux du dépôt, à l’octet (seule la base de listAdaptedMatches / findAdaptedMatch change)', () => {
  for (const [f, appels] of Object.entries(CHAINES)) {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8').replace(/listAdaptedMatches\('odds-api', bankroll\)/g, "listAdaptedMatches('odds-api', «BASE»)");
    for (const a of appels) assert.ok(code.includes(a), `${f} : l’appel « ${a} » a changé`);
  }
  // Aucun autre déclencheur que ceux-là n'est retouché : bulletinFiches.js et opportunities.js gardent leur sha1 de la partie 0.
  for (const [f, attendu] of [
    ['core/ai/bulletinFiches.js', '924bb3f7481d219034d354a8cbd8980a933cdc52'],
    ['data/opportunities.js', '35c7932e4390f9b13e46e494de628d8f4a13ebfe']
  ]) assert.equal(sha1(fs.readFileSync(path.join(SRC, f))), attendu, `${f} : non retouché au lot 1a`);
});

test('T-X15 ni compactContext.js ni ses appelants ne modifient le résultat du moteur (gelé en profondeur, copie isolée) ; la fiche de l’IA dit la PART, jamais un euro', () => {
  const copie = preparerCopie({});
  let s;
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-mise.mjs'), { args: ['mutation', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false);
    s = r.json;
  } finally {
    copie.nettoyer();
  }
  assert.equal(s.action, 'RECOMMENDED', 'la value de Man City – Liverpool');
  assert.deepEqual(s.erreurs, [], 'aucune écriture dans le résultat gelé');
  assert.equal(s.gele, true);
  assert.equal(s.identique, true, 'le résultat du moteur, à l’octet');
  assert.ok(s.stake > 0, 'la mise interne existe dans le résultat du moteur');
  for (const fiche of [s.ficheAvant, s.ficheApres]) {
    assert.match(fiche, /RECOMMENDED : \d+,\d\d % du capital sur Man City gagne à 2,3 chez William Hill/);
    assert.doesNotMatch(fiche, /€/);
    assert.ok(!fiche.includes(String(s.stake).replace('.', ',')), 'la mise interne n’est jamais écrite');
  }
});
