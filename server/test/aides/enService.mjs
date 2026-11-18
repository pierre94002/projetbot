/**
 * PARTIE 0 DES LOTS 2 (sommaire des lots 2, § 2 point 3 et § 7 ; décidé le 13/11/2026) — un seul endroit pour ce que les essais
 * comparaient en dur. Fichier IDENTIQUE dans le dépôt, le bac et les pistes (hors de SCR46\deploiement\liste-1.txt).
 *
 * (A) EMPREINTE_EN_SERVICE : l'empreinte du code du moteur EN SERVICE, celle de la candidate du code (elle CONTIENT la première :
 *     engineVersions.js, empreinteDeLaCandidate, « code: empreinteDuCode(...) ») et les comptes de MODULES_DU_MOTEUR. Le lot qui
 *     en change une réécrit EMPREINTE_EN_SERVICE dans le même lot (valeurs, depuis, lot, raison) et range l'ancienne en tête de
 *     EMPREINTES_PASSEES. Aucun essai ne remet une valeur écrite en dur.
 * (B) DECLARATIONS : la preuve historique. Chaque fichier ÉPINGLÉ (manifeste de la 46, test/fixtures/direct-gel-46.json, ou
 *     EPINGLES_HORS_MANIFESTE) qu'un lot 2 modifie, retire ou recrée : une ligne par fichier et par lot, AJOUTÉE en fin de liste,
 *     jamais retouchée. sha1 des octets bruts, sauf server/src/bench/lancements.js : sans l'ajout de la 46 (aides/ajouts46.mjs,
 *     octetsSansLesAjoutsDe46), c'est-à-dire le sha1 du dépôt tant que la 46 n'y est pas en service. Un fichier déclaré n'est plus
 *     comparé à sa valeur épinglée (vraie au jour de son étape) : declarationsLots2.test.mjs (D1-D3) tient la chaîne et le sha1 du
 *     jour ; directFrontiere.test.mjs (T-X3) vérifie que la chaîne part du manifeste du 11/11.
 * (R0) Sans candidate en essai (CANDIDATE_EN_ESSAI = null), empreinteDeLaCandidate(null) lève : empreinteDeLaCandidateOuNull rend
 *     null sans l'appeler, et le lot R0 met EMPREINTE_EN_SERVICE.candidate à null (declarationsLots2.test.mjs, D4 et D5).
 * (V) Vérification du 14/11/2026 (verification-partie0-36.md, P0-1 à P0-6) :
 *     - relaisEtape27.test.mjs saute ses trois rejeux de l’essai 27 (les deux « T-EV1 réduit » et « partie B — pendant l’essai de
 *       la 27 ») dès que EMPREINTE_EN_SERVICE quitte EMPREINTE_AVANT_LOTS_2 (moteur ou candidate DÉCLARÉS ici, jamais relus par le code) ;
 *     - retireParUnLot2 : miseFrontiere.test.mjs (T-X2) ôte de ses racines un fichier dont la DERNIÈRE ligne dit « retire » ;
 *     - EPINGLES_HORS_MANIFESTE porte le sha1 de DÉPART de chaque fichier : D2 compare la première ligne déclarée à ce sha1
 *       partout, dépôt compris (le manifeste de la 46 peut y manquer) ;
 *     - D4 bis : une empreinte en service qui a quitté le départ range l’ancienne dans EMPREINTES_PASSEES (la dernière entrée est
 *       le départ). Un lot qui ne devait créer aucune version (26, 35 1c, 36) et voit D4 rougir : ARRÊT, rien à mettre à jour ;
 *     - server/src/data/roadmap/historique.js ne se déclare pas avant la mise en service de la 46 ((b bis) point 6 des consignes) :
 *       D3 compare ses octets bruts, et le bac porte l’entrée 46 que le dépôt n’a pas encore.
 *     Procédure, sans essai (le bac n’a pas de .git) : à chaque lot, au dépôt, « git diff -U0 » de ce fichier ne montre AUCUNE ligne
 *     retirée dans DECLARATIONS (seulement des ajouts en fin de liste) ; seul le bloc EMPREINTE_EN_SERVICE change, l’ancienne valeur
 *     rangée en tête de EMPREINTES_PASSEES.
 */
export const EMPREINTE_AVANT_LOTS_2 = Object.freeze({
  moteur: '16f2459db183a99576365047da98b7777687ef05',
  fichiersDuMoteur: 37,
  candidate: 'f01dd8496f56a415',
  modules: Object.freeze({ dossiers: 7, fichiers: 6 })
});

// Lots d'argent (écrits le 16/11/2026 : étape 39 lot 2, puis étape 38 lot 2a) : UNE seule version neuve du moteur pour les deux lots.
// La valeur intermédiaire (après la 39 seule) n'a jamais été en service : elle n'est notée nulle part ici.
export const EMPREINTE_EN_SERVICE = Object.freeze({
  moteur: '0b091899d40c8331a771d8c963b033a6f067aecf',
  fichiersDuMoteur: 40,
  candidate: 'ae993f5bbe690aa2',
  modules: Object.freeze({ dossiers: 7, fichiers: 6 }),
  depuis: '2026-11-17',
  lot: '39-2 et 38-2a',
  raison: 'une seule règle de mise dans le moteur (stakeSizing.js neuf, staking.js retiré, valueFinder.js, verdictPari.js, gardeFous.js ; réglage « écart maximal de buts attendus » retiré) ; aucun conseil sur un match « à vérifier » (verdictPari.js, confidence.js neuf) ; la fusion du 1N2 par le combiner à l’identité (combiner.js et poidsDeLaCombinaison.js neufs, oddsEngine.js) — aucune probabilité ne change (T-PA1, T-L2-1)'
});

/** Les empreintes remplacées, la plus récente en tête (même forme que EMPREINTE_EN_SERVICE) ; la dernière est le départ, EMPREINTE_AVANT_LOTS_2 (D4 bis). */
export const EMPREINTES_PASSEES = Object.freeze([
  Object.freeze({
    ...EMPREINTE_AVANT_LOTS_2,
    depuis: '2026-11-11',
    lot: 'partie 0 des lots 2',
    raison: 'départ : l’empreinte du manifeste de la 46 (11/11/2026, 21 h 05), inchangée depuis'
  })
]);

/**
 * Les fichiers épinglés HORS du manifeste de la 46 (un essai compare leur sha1), chacun avec son sha1 de DÉPART : le même au dépôt,
 * au bac et dans les pistes (relevé le 14/11/2026, vérification P0-3). La première ligne déclarée d’un de ces fichiers part de ce
 * sha1 (D2, dans toutes les copies, dépôt compris).
 */
export const EPINGLES_HORS_MANIFESTE = Object.freeze({
  'server/src/core/ai/compactContext.js': 'd948305e88c86445e8b19fc6fb38c779a046708c', // ficheDuPronosticFrontiere.test.mjs, T-G3
  'server/src/core/ai/bulletinFiches.js': '924bb3f7481d219034d354a8cbd8980a933cdc52', // miseFrontiere.test.mjs, T-X14
  'server/src/data/opportunities.js': '35c7932e4390f9b13e46e494de628d8f4a13ebfe' // miseFrontiere.test.mjs, T-X14
});

/**
 * Une ligne : Object.freeze({ chemin: 'server/src/…', avant: '<sha1>' | 'absent', apres: '<sha1>' | 'retire', lot: '39 lot 2',
 *   date: 'AAAA-MM-JJ', raison: '…' }). Exemple (39) : Object.freeze({ chemin: 'server/src/core/risk/staking.js',
 *   avant: '6522d9ea3662ea39fb1eb45afe11bf3f2ce20080', apres: 'retire', lot: '39 lot 2', date: '2026-11-17',
 *   raison: 'remplacé par core/engine/stakeSizing.js (une seule règle de mise)' }),
 */
export const DECLARATIONS = Object.freeze([
  Object.freeze({ chemin: 'server/src/data/cartons/cartonsNuit.js', avant: 'a19b01e22826a08d2f7c7c3238e0af0ac745c801', apres: '202d032a1631a061a64566a5bd6e5d529f68dd5e', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/data/combinaison/combinaisonNuit.js', avant: '1df97a667c6293db2460c6c5e7ad21eb3009ad2c', apres: 'b2bfc72baf72a75a291a23f47ba41cf44363a528', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/data/contexte/contexteNuit.js', avant: '4737fcae70624a0de88bbe938b321f4bb84e21be', apres: 'ce0e11681ff3281c965f2528c1bf33d4d12000f5', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/data/db/forcesButs.js', avant: '4ecda40200d8da352bc8c51adefb1152de4af916', apres: 'fb56362e65319362be9a82cf9cb95b72d0abf643', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/data/db/playerRatings.js', avant: '86bf49658a97a61a2eda62ed72ebb600e7fc9b75', apres: '0e3837755fc79c6135e2aca1b904c8b063545ca9', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/data/db/teamStrength.js', avant: '558e33d3441a33cd4b6106cc64edc7e7cd68b297', apres: 'ab1854e4ebb15d57d3ad29d449bf8cac25bb5cf2', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/data/joueurs/joueursNuit.js', avant: '15bd8aa6c5a463a5df39662cd74a16bfdf02c201', apres: '2343d92c376426c1ea5ea16219b0ec15a3d72ed5', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/data/marketKnowledge.js', avant: 'fa4ae59cb72c2c02169f583b0a84a2fedd9430a7', apres: 'd95ded55707a18612c76d259d97809d03bab9929', lot: 'calculs-a-part-close', date: '2026-11-15', raison: 'la fin du calcul à part attend « close » et non « exit » (un mot) : le dernier message de l’enfant n’est plus perdu sous Windows (piège du 09/11/2026)' }),
  Object.freeze({ chemin: 'server/src/api/controllers/analysis.controller.js', avant: 'cbb3844d6cf8df8f68c53021f0427f2cfb2d46bd', apres: '7816f7ebe52b203cda99f28e8773d7b0cb1062c4', lot: '39-2', date: '2026-11-17', raison: 'le match donné au moteur porte ce que le contrôleur a lu pour la mise (contexteDeMise)' }),
  Object.freeze({ chemin: 'server/src/core/ai/compactContext.js', avant: 'd948305e88c86445e8b19fc6fb38c779a046708c', apres: '87b52376250788fc7c206e9512aec1e30349cca9', lot: '39-2', date: '2026-11-17', raison: 'la part du capital écrite à l’IA vient de la règle du moteur importée (plus de copie) ; la décision sans euros de l’ancienne fiche ; la base du calcul du résumé gardé' }),
  Object.freeze({ chemin: 'server/src/core/ai/matchAiAnalysisService.js', avant: '0f252e469aa8d3b896324e26f8be21a8d0a81aa2', apres: 'e57218f37c8437307953cf7b7e8b5791fa29001e', lot: '39-2', date: '2026-11-17', raison: 'le résumé gardé note la base du calcul de la mise ; l’ancienne fiche passe par le filtre « sans euros » ; l’IA ne lit ni l’une ni le détail de la règle' }),
  Object.freeze({ chemin: 'server/src/core/engine/engineConfig.js', avant: '87b6ac0fd2ebafa432c2adeb3beac591177a3dfa', apres: '2966f7ae061ccc43282d400b9705d2ee4796ba0c', lot: '39-2', date: '2026-11-17', raison: 'le réglage « écart maximal de buts attendus » retiré des valeurs par défaut (son seul lecteur était staking.js)' }),
  Object.freeze({ chemin: 'server/src/core/engine/engineVersions.js', avant: '5765ef8ea759a5413397e6b44aafb6c496fc674b', apres: 'd59ac150bcbb44f4a81c265acc1b0a69b7b97058', lot: '39-2', date: '2026-11-17', raison: 'le libellé du réglage « écart maximal de buts attendus » retiré' }),
  Object.freeze({ chemin: 'server/src/core/engine/valueFinder.js', avant: '25e4757198fc09a1119de41cdef52eb553368e6a', apres: '416b1fd5e3596e40236b10b17c69dee5570aa584', lot: '39-2', date: '2026-11-17', raison: 'la mise du conseil passe par la règle de mise unique (stakeSizing.js) : sans contexte, la mise d’avant à l’octet ; avec le contexte de l’appelant, la règle entière' }),
  Object.freeze({ chemin: 'server/src/core/engine/verdictPari.js', avant: '368d73a39b081948dd6d49bfa9add6789c0490f3', apres: 'e5ae8487587ac291bf63a85097f1ac32a534df50', lot: '39-2', date: '2026-11-17', raison: 'le contexte de la mise lu par l’appelant (match.contexteDeMise) est passé à findValueBet ; rien n’y est lu' }),
  Object.freeze({ chemin: 'server/src/core/risk/gardeFous.js', avant: '2edd957379facdb0915308f8404114d0786a70f5', apres: 'ec648da597f04395ba4d3a95951480188f8241df', lot: '39-2', date: '2026-11-17', raison: 'le plafond en euros que la règle a appliqué est nommé (mise acceptée connue, solde déclaré, plancher compris) : « le plus petit gagne »' }),
  Object.freeze({ chemin: 'server/src/core/risk/staking.js', avant: '6522d9ea3662ea39fb1eb45afe11bf3f2ce20080', apres: 'retire', lot: '39-2', date: '2026-11-17', raison: 'retiré : code mort, formule fausse ; remplacé par core/engine/stakeSizing.js (une seule règle de mise)' }),
  Object.freeze({ chemin: 'server/src/data/mise/miseRead.js', avant: 'd74dc1e245abc037b196bae9a341fcdb06ac90aa', apres: '6c8d01a3f2807b0952147e8fcc95f50a151ece74', lot: '39-2', date: '2026-11-17', raison: 'le contexte de la mise passé au moteur (contexteDuMoteur) ; la mise rendue est celle de la règle en service, plus rien « à blanc »' }),
  Object.freeze({ chemin: 'server/src/core/engine/vosBookmakers.js', avant: '9abf1962a1c47d854cbc161624249a4df657279f', apres: 'a552e24a4e6334f1713198564bf5a6537f9528f4', lot: '39-2', date: '2026-11-17', raison: 'les titres des quatre bookmakers français retenus par Pierre (D3) : Betclic, Unibet (FR), Winamax (FR), PMU ; aucun autre changement' }),
  Object.freeze({ chemin: 'server/src/data/saisiesCotes.js', avant: '1449bbbdc1fd5f08d94af42dc17a82fc728512b4', apres: '8b9435a470fe8fcdc2cfae0ede4762ee001c95a3', lot: '39-2', date: '2026-11-17', raison: 'corrections du 17/11/2026 (lots d’argent)' }),
  Object.freeze({ chemin: 'server/src/api/controllers/analysis.controller.js', avant: '7816f7ebe52b203cda99f28e8773d7b0cb1062c4', apres: '31ce0520decf84a9fb6e3f75b840a664b3bb3d2c', lot: '38-2a', date: '2026-11-17', raison: 'le match donné au moteur porte ce que le contrôle quotidien dit de lui pour le pari conseillé (aVerifier)' }),
  Object.freeze({ chemin: 'server/src/core/ai/autoMatchAiTrigger.js', avant: '159b22f70a67f6bf7e77b4fadbb4426e9f7313f1', apres: '5574499f3fcd2f55656ddcc4c37d7ba1ea2592dd', lot: '38-2a', date: '2026-11-17', raison: 'l’analyse IA automatique joint « à vérifier » au match donné au moteur et au gel de l’analyse' }),
  Object.freeze({ chemin: 'server/src/core/engine/engineVersions.js', avant: 'd59ac150bcbb44f4a81c265acc1b0a69b7b97058', apres: 'a2e543834a02b20ceb417823895ebfd6021327cc', lot: '38-2a', date: '2026-11-17', raison: 'validerCandidate refuse une combinaison qui change le 1N2 sans déclarer les cinq familles ancrées sur lui' }),
  Object.freeze({ chemin: 'server/src/core/engine/oddsEngine.js', avant: 'c376393d980ca569b4562191369c1cd8a7ff56b2', apres: '8e59a0c5a0afd0776eb5b67886d656d8ef77c7bf', lot: '38-2a', date: '2026-11-17', raison: 'la fusion du 1N2 passe par le combiner (core/engine/combiner.js), à l’identité : tous les β sont nuls, même expression dans le même ordre' }),
  Object.freeze({ chemin: 'server/src/core/engine/verdictPari.js', avant: 'e5ae8487587ac291bf63a85097f1ac32a534df50', apres: '3b4d376c117580c7d5900e7509f5457b3a35deef', lot: '38-2a', date: '2026-11-17', raison: 'aucun conseil de pari sur un match « à vérifier » (sansConseilAVerifier) : la donnée vient de l’appelant (match.aVerifier), rien n’est lu' }),
  Object.freeze({ chemin: 'server/src/data/db/matchStatsDb.js', avant: 'fbc5b5f71cd1ffc0d54772a7a9386c9ed8d4a0a2', apres: '9c2e14853a2d39db9c8f02df9afcbe57a9de1ba7', lot: '38-2a', date: '2026-11-17', raison: 'engine_picks : quatre colonnes ajoutées (confiance, classe_seuil, seuil_applique, palier), ajout pur' }),
  Object.freeze({ chemin: 'server/src/data/enregistreurs/depot.js', avant: 'd88d29902815b0ad57e861e7816582891e41b25b', apres: '3dffc2998d2cde5688a2551def5ee699e34b0214', lot: '38-2a', date: '2026-11-17', raison: 'engine_picks : les quatre colonnes de traces écrites avec la ligne du pronostic (jamais sur une ligne d’avant)' }),
  Object.freeze({ chemin: 'server/src/data/enregistreurs/gelPronostics.js', avant: '611e99c209a5e211a9425c5d2fb1aac09304e029', apres: '3dae1f72c64a2d734217e2a83dea4fd6bc530401', lot: '38-2a', date: '2026-11-17', raison: 'le gel joint « à vérifier » au match donné au moteur et gèle les traces de chaque pronostic (palier, classe de seuil, seuil appliqué, confiance)' }),
  Object.freeze({ chemin: 'server/scripts/coupes.mjs', avant: '5943e946051a6a7ee96bde1664cd360a498277e2', apres: '06660c19286efaf7c9937cbac1a924cdca35153f', lot: 'A3', date: '2026-11-18', raison: 'le calcul à part conclut « sans réponse » sur « close » et non plus sur « exit » (un mot)' }),
  Object.freeze({ chemin: 'server/src/core/ai/autoMatchAiTrigger.js', avant: '5574499f3fcd2f55656ddcc4c37d7ba1ea2592dd', apres: '4e0a058ece58ccf52f6cb2a94aec030d9c74a00a', lot: 'A1', date: '2026-11-18', raison: 'l’analyse IA automatique lit le contexte de la mise comme la page du match (contexteDeLaMise, contexteDuMoteur) ; le gel de l’analyse inchangé' }),
  Object.freeze({ chemin: 'server/src/core/ai/compactContext.js', avant: '87b52376250788fc7c206e9512aec1e30349cca9', apres: '46f7503f93bfce9ffb98291bd41044c416fb34f0', lot: 'A1', date: '2026-11-18', raison: 'un match « à vérifier » écrit en clair à l’IA, sans les chiffres du conseil refusé ; la part écrite est celle de la page du match (la règle entière quand la décision la porte)' }),
  Object.freeze({ chemin: 'server/src/core/ai/matchAiAnalysisService.js', avant: 'e57218f37c8437307953cf7b7e8b5791fa29001e', apres: '6ce6bb6979646653c06ad9fa2c0abdf6ef2cf2ad', lot: 'A1', date: '2026-11-18', raison: 'la revue d’après-match lit la part de l’avant-match ; sous l’ancienne forme, la décision sans euros et un refus « à vérifier » sans le conseil refusé ni son avantage ; l’analyse demandée par un clic lit la décision de la page (part ou « non calculée »)' }),
  Object.freeze({ chemin: 'server/src/data/contexte/preuveDuContexte.js', avant: '69aa3bb32585d33825210f1efea5444185ea500a', apres: 'dd37c846e90d2735434e8fe71fe57b68b9af44d8', lot: 'A2', date: '2026-11-18', raison: 'l’horizon, le principal et la garde du mois comptent les lignes que le juge garde (hors des fenêtres déjà vues) ; le démenti d’un principal « moins bon » jamais perdu (transaction ratée, garde arrêtée)' }),
  Object.freeze({ chemin: 'server/src/data/mise/miseRead.js', avant: '6c8d01a3f2807b0952147e8fcc95f50a151ece74', apres: '27ff181ae6fab99cc6310b035be3cd6f95bd0a74', lot: 'A1', date: '2026-11-18', raison: 'une lecture utile à la mise qui échoue est nommée (lecturesRatees) : la page et l’analyse IA disent « mise non calculée », ni part ni euro, ni la règle de mise dans la réponse de la page' })
]);

/** Le chemin depuis le dossier du code (« server/… » ou « ui/… ») ; accepte « core/x.js » (depuis server/src) et « src/x.js » (depuis server/). */
export function cheminDuCode(f) {
  const c = String(f).split('\\').join('/');
  if (c.startsWith('server/') || c.startsWith('ui/')) return c;
  if (c.startsWith('src/') || c.startsWith('scripts/')) return `server/${c}`;
  return `server/src/${c}`;
}

/** Les lignes d'un fichier, dans l'ordre de la liste. */
export const declarationsDe = (f) => DECLARATIONS.filter((d) => d.chemin === cheminDuCode(f));

/** (B) Vrai si un lot 2 a déclaré ce fichier : sa valeur épinglée est historique, l'essai ne la compare plus au code du jour. */
export const declareParUnLot2 = (f) => declarationsDe(f).length > 0;

/** (B) Vrai si la DERNIÈRE ligne de ce fichier le déclare retiré (apres === 'retire') : D3 tient qu’il est absent ; T-X2 de miseFrontiere ne le prend plus pour racine. */
export const retireParUnLot2 = (f) => declarationsDe(f).at(-1)?.apres === 'retire';

/**
 * (R0) L'empreinte de la candidate du code, ou null s'il n'y a pas de candidate en essai — SANS appeler empreinteDeLaCandidate
 * sur null (elle lit candidate.id et lève : engineVersions.js, empreinteDeLaCandidate). La fonction est passée par l'essai :
 * cette aide n'importe rien.
 */
export function empreinteDeLaCandidateOuNull(empreinteDeLaCandidate, candidate) {
  if (candidate === null || candidate === undefined) return null;
  return empreinteDeLaCandidate(candidate);
}

const SHA1 = /^[0-9a-f]{40}$/;
/** Les fautes de forme et de chaîne de la liste (pure : ni fichier, ni horloge). */
export function fautesDesDeclarations(liste = DECLARATIONS) {
  const fautes = [];
  const derniere = new Map();
  const vues = new Set();
  liste.forEach((d, i) => {
    const ou = `ligne ${i + 1} (${d?.chemin ?? '?'})`;
    if (!d || typeof d.chemin !== 'string' || cheminDuCode(d.chemin) !== d.chemin) fautes.push(`${ou} : chemin depuis le dossier du code (server/… ou ui/…)`);
    if (!(SHA1.test(d?.avant ?? '') || d?.avant === 'absent')) fautes.push(`${ou} : avant = un sha1 ou 'absent'`);
    if (!(SHA1.test(d?.apres ?? '') || d?.apres === 'retire')) fautes.push(`${ou} : apres = un sha1 ou 'retire'`);
    if (d?.avant === d?.apres) fautes.push(`${ou} : avant = apres`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.date ?? '')) fautes.push(`${ou} : date AAAA-MM-JJ`);
    if (!String(d?.lot ?? '').trim() || !String(d?.raison ?? '').trim()) fautes.push(`${ou} : lot et raison obligatoires`);
    if (vues.has(`${d?.chemin}|${d?.lot}`)) fautes.push(`${ou} : deux lignes du même lot pour ce fichier`);
    vues.add(`${d?.chemin}|${d?.lot}`);
    const p = derniere.get(d?.chemin);
    if (p) {
      if (d.avant !== (p.apres === 'retire' ? 'absent' : p.apres)) fautes.push(`${ou} : son « avant » n’est pas l’« après » de ${p.lot}`);
      if (String(d.date) < String(p.date)) fautes.push(`${ou} : datée avant ${p.lot}`);
    } else if (d?.avant === 'absent') fautes.push(`${ou} : un fichier épinglé ne commence pas « absent »`);
    derniere.set(d?.chemin, d);
  });
  return fautes;
}
