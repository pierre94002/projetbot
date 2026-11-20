/**
 * causesConnues.js — LA LISTE DES CAUSES CONNUES DE LA RECETTE (étape 47 du plan, lot 1, passe P3, 17/11/2026).
 * -----------------------------------------------------------------------
 * Ce qui, pendant J1-J14, n'est PAS une panne nouvelle. Brouillon de J0 (conception, annexe B), corrigé par la critique
 * (CR-18, CR-22 à CR-26) et par les décisions 9 et 22 a) de l'orchestrateur. Complété au rodage, validé par
 * l'orchestrateur (CR-30 point 2), SCELLÉ au lot 1b : l'empreinte porte sur ce fichier, classerLesEvenements.js et
 * journalWindows.js, texte normalisé (CR-19). Ce fichier ne contient que des données : aucune lecture, aucune écriture.
 *
 * LA FORME D'UNE CAUSE :
 *   { id, titre, explication, statut: 'active' | 'corrigee', depuis, mode: 'office' | 'a-la-main', rattachable,
 *     reconnait: { … }  ce qui est reconnu D'OFFICE (mode 'office' seulement) ;
 *     aLaMain:   { … }  ce que la revue peut y RATTACHER à la main après examen (CR-22 point 3, CR-23, CR-25 point 4),
 *                       en plus de `reconnait` ; `recette.mjs --classer` refuse tout le reste (CR-28 point 2) ;
 *     bornes:    { nom: { niveauJ0: null | nombre } }  la borne = niveauJ0 × 1,5 + 5 (CR-22 point 2) ; niveauJ0 est
 *                       relevé par `recette.mjs --verifier-les-causes` et écrit au lot 1b ; tant qu'il vaut null, la
 *                       cause ne reconnaît le nombre que pendant le rodage (après J0 : « à expliquer »). }
 *   Les clés de `reconnait` / `aLaMain` :
 *     demarrages: [type]           les démarrages classés par le journal (S11) ;
 *     trous: [cause]               les trous du battement classés par le journal (S10) ;
 *     etapes: [{ cle, statuts, motif, sauf?, nombre?, figee? }]   une étape de passe en alerte ('warn') ou en échec ('error') ;
 *             nombre = { motif (un groupe), borne (nom) | max (fixe), facultatif? } ; sauf = un motif qui REFUSE (RC-2) ;
 *     alertes: [{ cle, nombre?, borne?, seulementLeDirect? }]  une alerte durable posée ou changée (S3) ; seulementLeDirect :
 *             reconnue seulement si le seul relevé ajouté est celui du direct, pendant un épisode FotMob (RC-5) ;
 *   pourPierre : la phrase simple montrée à Pierre (RC-19), tirée de POUR_PIERRE.
 *     controles: [{ cle, classes, sousTypes?, championnats? }]  un contrôle du jour qui change de couleur, ou un constat
 *             nouveau (S4) ; d'office : la classe ORANGE seulement (CR-22 point 1) ; un rouge seulement si son
 *             sous-type (préfixe de l'identifiant « controle:sous-type:… ») est nommé dans `sousTypes` ;
 *     fotmob: [{ etats, natures, raison?, detecteParLAppli? }]  une transition de FotMob (S5, CR-24) ;
 *     direct: [{ pendantFotmob: true }]                     le direct suspendu (S8) ;
 *     ia: [{ types, messages, echecsMax }]                   S9, reconnu sur le message de l'appel (CR-26 point 3) ;
 *     signaux: [type]                                       S6, S7 (sans passe, sans sauvegarde, sauvegarde en échec…) ;
 *     controleDuJour: true                                  l'étape controleQuotidien (T-C14) ;
 *     alertesDuDepart: true                                 une alerte au CONTENU de J0 (CR-18 point 2).
 *
 * L'ORDRE COMPTE : la première cause qui reconnaît l'événement le classe (les causes scellées avant les corrigées).
 * Ce qui n'est vérifié qu'au rodage est dit « à vérifier au rodage » dans l'explication.
 * -----------------------------------------------------------------------
 */

/** Un nombre écrit à la française (« 4 213 », espaces fines ou insécables comprises) : un groupe de capture. */
const N = String.raw`(\d(?:[\d\s]*\d)?)`;

/** P4b-1 (RC-2) : le résumé d'une étape IA arrêtée après plusieurs pannes de suite (matchStatsAutoRefresh.js:301). */
const ARRET_APRES_PANNES = /arrêt après plusieurs pannes/;

const cause = (c) => Object.freeze({ mode: 'office', rattachable: true, reconnait: {}, aLaMain: {}, bornes: {}, ...c, pourPierre: POUR_PIERRE[c.id] ?? null });

/**
 * P4b-1 (RC-19) : UNE phrase simple par cause, celle que la carte « Essai général » montre à Pierre dans la liste
 * dépliée (question Q8). L'explication technique reste pour la revue. Un essai refuse tout jargon ici.
 */
const POUR_PIERRE = Object.freeze({
  'premier-demarrage-du-journal': 'Le journal de l’essai démarre pour la première fois : normal pendant le rodage, à regarder ensuite.',
  'veille-du-pc': 'Le PC s’est mis en veille : le journal le vérifie dans le journal de Windows avant de le compter comme connu.',
  'redemarrage-du-pc': 'Windows a redémarré proprement, et l’appli est repartie avec lui.',
  'mise-en-service': 'L’appli a été relancée avec un nouveau code, annoncé juste avant.',
  'audit-buteurs-gardiens': 'Le contrôle de nuit trouve des buteurs ou des gardiens manquants chez FotMob, tant que leur nombre reste près de celui du début de l’essai.',
  'calendriers-incomplets': 'Des fins de saison ne sont pas simulées parce que le calendrier du championnat est incomplet.',
  'classement-officiel': 'Le classement officiel est relevé un peu avant ou un peu après les résultats.',
  'chiffres-non-publies': 'FotMob ne publie pas certains chiffres (cartons, corners, tirs) pour certains championnats.',
  'hors-reperes': 'Un match sort des repères habituels de son championnat.',
  'score-corrige': 'Deux relevés donnent un score différent : on regarde lequel est le bon, un par un.',
  'carnet-de-sante': 'Le carnet de santé trouve une erreur de donnée neuve : on la regarde à la main.',
  'controle-du-jour': 'Le contrôle du jour est orange ou rouge seulement à cause des points déjà connus de cette liste.',
  'ia-echec-isole': 'Une analyse de l’IA échoue de temps en temps, puis elle est refaite.',
  'ia-plafond-econome': 'Le nombre d’analyses du jour est atteint, ou l’IA passe en mode économe.',
  'quota-abonnement': 'Le quota de votre abonnement Claude est atteint : les analyses reprennent quand il se remet à zéro.',
  'calcul-a-part-exit-scelles': 'Un calcul de nuit se termine bien mais sans envoyer son dernier message : défaut connu, laissé tel quel pendant l’essai du moteur.',
  'calcul-a-part-exit-coupes': 'Le calcul des coupes perdait son dernier message : corrigé le 09/11 ; s’il revient, c’est une panne nouvelle.',
  'calcul-a-part-exit-corriges': 'D’autres calculs perdaient leur dernier message : corrigés le 15/11 ; s’ils reviennent, c’est une panne nouvelle.',
  'fotmob-panne-detectee': 'FotMob ne répond plus, et l’appli l’a vu et signalé elle-même.',
  'fotmob-a-surveiller': 'FotMob a raté quelques réponses de suite.',
  'direct-suspendu-fotmob': 'Le suivi des matchs en direct se met en pause pendant une panne de FotMob.',
  'sauvegarde-decalee': 'La sauvegarde a été faite au réveil du PC plutôt que la nuit.',
  'passe-figee-par-la-veille': 'Une actualisation commencée avant la veille du PC reprend au réveil.',
  'arret-par-pierre': 'Vous avez fermé ou relancé l’appli vous-même.',
  'presents-au-depart': 'Des alertes déjà là au début de l’essai, sans changement.'
});

export const CAUSES_CONNUES = Object.freeze([
  // --- Le serveur et le PC (classés par le journal lui-même : S10, S11) ---
  cause({
    id: 'premier-demarrage-du-journal',
    titre: 'Premier démarrage du journal de la recette',
    explication: 'Le journal démarre pour la première fois (aucun battement ni fichier). Connue seulement tant que J0 n’est pas écrit (rodage) ; après J0, un journal qui repart de rien est « à expliquer » (consigne § 2.3 P2-b).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { demarrages: ['premier-demarrage-du-journal'] }
  }),
  cause({
    id: 'veille-du-pc',
    titre: 'Le PC se met en veille',
    explication: 'Un trou du battement, même processus, couvert à 12 min près par une mise en veille et un réveil au journal Windows. Un journal Windows illisible ne vaut jamais « veille » (CR-15) : le trou est relu au tour suivant, sinon il reste « à expliquer ». La durée et le coût de la veille sont dits par recette.mjs --resume-du-jour (CR-21).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { trous: ['veille-du-pc'] }
  }),
  cause({
    id: 'redemarrage-du-pc',
    titre: 'Windows redémarre',
    explication: 'Un nouveau processus, avec entre les deux un démarrage du PC et aucun arrêt brutal au journal Windows (Kernel-Power 41 ou 6008 → « à expliquer »).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { demarrages: ['redemarrage-du-pc'] }
  }),
  cause({
    id: 'mise-en-service',
    titre: 'CôteMaster relancé avec un nouveau code',
    explication: 'Un nouveau processus, annoncé par recette.mjs --annoncer-la-mise-en-service moins de 60 min avant, ET un code changé (git diff entre les deux commits) (CR-2). L’un sans l’autre : « à expliquer ».',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { demarrages: ['mise-en-service'] }
  }),

  // --- Les données (contrôle du jour, étape « controle », alertes) ---
  cause({
    id: 'audit-buteurs-gardiens',
    titre: 'Buteurs absents ou incomplets chez FotMob, gardien sans relais, écart entre fichiers',
    explication: 'L’audit de nuit compte des anomalies de buteurs, de gardiens et de fichiers. Reconnu d’office : l’étape « controle » en alerte et l’alerte « audit », tant que le nombre d’anomalies reste sous la borne de J0, et les constats ORANGE des contrôles buteurs-score et gardiens-score. Un constat ROUGE (« impossible » : un score que les buteurs ne peuvent pas donner) est « à expliquer », regardé un par un, puis rattaché ici à la main si c’est bien un relevé FotMob incomplet (CR-22, CR-25 point 3).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: {
      etapes: [{ cle: 'controle', statuts: ['warn'], motif: /anomalies \(buteurs/, nombre: { motif: new RegExp(`${N}\\s*anomalies \\(`), borne: 'anomalies' } }],
      alertes: [{ cle: 'audit', nombre: 'anomalies', borne: 'anomalies' }],
      controles: [{ cle: 'buteurs-score', classes: ['orange'] }, { cle: 'gardiens-score', classes: ['orange'] }]
    },
    aLaMain: { controles: [{ cle: 'buteurs-score', classes: ['rouge'] }, { cle: 'gardiens-score', classes: ['rouge'] }], etapes: [{ cle: 'controle', statuts: ['warn'] }], alertes: [{ cle: 'audit' }] },
    bornes: { anomalies: { niveauJ0: null } }
  }),
  cause({
    id: 'calendriers-incomplets',
    titre: 'Fins de saison non simulées (calendrier incomplet, équipes inconnues)',
    explication: 'La simulation des fins de saison laisse des championnats « non calculés » quand leur calendrier est incomplet ou que la table et le magasin ne s’accordent pas. Reconnu d’office : l’étape simulationSaisons en alerte et l’alerte simulationSaisons, sous la borne de J0 ; un championnat de PLUS dans l’alerte (un problème ajouté) est « à expliquer » (CR-18 point 1, CR-22).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: {
      etapes: [{ cle: 'simulationSaisons', statuts: ['warn'], motif: /non calculés/, nombre: { motif: new RegExp(`${N}\\s*non calculés`), borne: 'nonCalcules' } }],
      alertes: [{ cle: 'simulationSaisons', nombre: 'inconnus', borne: 'inconnus' }]
    },
    aLaMain: { etapes: [{ cle: 'simulationSaisons', statuts: ['warn'] }], alertes: [{ cle: 'simulationSaisons' }] },
    bornes: { nonCalcules: { niveauJ0: null }, inconnus: { niveauJ0: null } }
  }),
  cause({
    id: 'classement-officiel',
    titre: 'Le classement officiel relevé en avance ou en retard sur les résultats',
    explication: 'Reconnu d’office : les constats ORANGE du contrôle classement-officiel (« manquant » : un écart de classement le temps que les résultats arrivent ; « doublon »). Un constat ROUGE « impossible » (classement-bilan : un score faux ?) est « à expliquer », regardé un par un : la raison du rattachement dit lequel des deux scores est le bon (CR-25 points 1 et 4).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { controles: [{ cle: 'classement-officiel', classes: ['orange'] }] },
    aLaMain: { controles: [{ cle: 'classement-officiel', classes: ['rouge'] }] }
  }),
  cause({
    id: 'chiffres-non-publies',
    titre: 'FotMob publie 0 ou rien pour certains chiffres dans certains championnats',
    explication: 'Constats ORANGE des contrôles jaunes, corners, tirs et zéros non relevés. La liste des championnats de J0 est écrite au lot 1b (championnatsJ0) ; un championnat neuf est alors « à expliquer ».',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: {
      controles: ['jaunes-non-releves', 'corners-non-releves', 'tirs-non-releves', 'zeros-non-releves'].map((cle) => ({ cle, classes: ['orange'], championnats: 'championnatsJ0' }))
    },
    bornes: { championnatsJ0: { liste: null } }
  }),
  cause({
    id: 'hors-reperes',
    titre: 'Un match hors des repères mesurés de son championnat',
    explication: 'Constats ORANGE (au plus orange par nature) des contrôles hors-reperes-buts, hors-reperes-statistiques, hors-reperes-cartons et match-aberrant.',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { controles: ['hors-reperes-buts', 'hors-reperes-statistiques', 'hors-reperes-cartons', 'match-aberrant'].map((cle) => ({ cle, classes: ['orange'] })) }
  }),
  cause({
    id: 'score-corrige',
    titre: 'Un score différent entre deux relevés, regardé un par un',
    explication: 'Le contrôle score-calendrier trouve un score du calendrier différent du résultat relevé. JAMAIS reconnu d’office : chaque constat neuf est « à expliquer » (environ un par semaine), puis rattaché ici à la main après examen ; la raison dit lequel des deux scores est le bon (CR-25 points 2 et 4).',
    statut: 'active',
    depuis: '2026-11-17',
    mode: 'a-la-main',
    aLaMain: { controles: [{ cle: 'score-calendrier', classes: ['orange', 'rouge'] }] }
  }),
  cause({
    id: 'carnet-de-sante',
    titre: 'Erreur de donnée neuve relevée par le carnet de santé, regardée à la main',
    explication: 'L’étape carnetSante ne passe en alerte que pour des erreurs NOUVELLES (matchStatsAutoRefresh.js:320-344). JAMAIS reconnue d’office : la revue lit les erreurs nouvelles (détails de l’étape), puis la rattache ici en disant laquelle et pourquoi, ou la déclare nouvelle. Une erreur du carnet qui est aussi un constat rouge du contrôle du jour compte pour UN épisode (CR-23).',
    statut: 'active',
    depuis: '2026-11-17',
    mode: 'a-la-main',
    aLaMain: { etapes: [{ cle: 'carnetSante', statuts: ['warn'] }] }
  }),
  cause({
    id: 'controle-du-jour',
    titre: 'Le contrôle du jour orange ou rouge à cause des contrôles ci-dessus',
    explication: 'L’étape controleQuotidien en alerte est connue SEULEMENT si chacun de ses contrôles non verts n’a que des constats reconnus (une cause d’office, ou présents au départ) (T-C14). Sinon « à expliquer », rattachable ici à la main une fois ses constats regardés.',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { controleDuJour: true },
    aLaMain: { etapes: [{ cle: 'controleQuotidien', statuts: ['warn'] }] }
  }),

  // --- L'IA ---
  cause({
    id: 'ia-echec-isole',
    titre: 'Une analyse IA échoue de temps en temps, puis est retentée',
    explication: 'Les étapes iaAutoAvantMatch et iaAutoApresMatch en alerte avec au plus 3 échecs dans la passe. L’arrêt après plusieurs pannes de suite n’est jamais reconnu d’office : ni en échec, ni en alerte quand une analyse a réussi avant l’arrêt (matchStatsAutoRefresh.js:297 et :301 ; P4b-1, RC-2). S9 (plus de 5 % d’échecs dans la journée) ne vaut qu’à partir de 20 appels (CR-26 point 4).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: {
      etapes: [
        { cle: 'iaAutoAvantMatch', statuts: ['warn'], motif: /sans analyse/, sauf: ARRET_APRES_PANNES, nombre: { motif: /(\d+)\s*échecs?\b/, max: 3 } },
        { cle: 'iaAutoApresMatch', statuts: ['warn'], motif: /sans revue/, sauf: ARRET_APRES_PANNES, nombre: { motif: /(\d+)\s*échecs?\b/, max: 3 } }
      ]
    }
  }),
  cause({
    id: 'ia-plafond-econome',
    titre: 'Plafond des analyses du jour atteint, ou mode économe au-delà de 80 % du budget',
    explication: 'Les étapes IA en alerte qui disent « plafond du jour » ou « Mode économe », avec au plus 3 échecs, et sans « arrêt après plusieurs pannes » (P4b-1, RC-2).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: {
      etapes: ['iaAutoAvantMatch', 'iaAutoApresMatch'].map((cle) => ({ cle, statuts: ['warn'], motif: /plafond du jour|Mode économe/, sauf: ARRET_APRES_PANNES, nombre: { motif: /(\d+)\s*échecs?\b/, max: 3, facultatif: true } }))
    }
  }),
  cause({
    id: 'quota-abonnement',
    titre: 'Quota de l’abonnement atteint (partagé entre les analyses de l’appli et les séances de construction)',
    explication: 'Reconnu sur le MESSAGE des appels en échec du journal des appels Claude (« You’ve hit your session limit · resets … », relevé le 03/11), jamais sur le résumé de l’étape (« quota, jeton ou réseau » couvre aussi un jeton invalide). Bornes (décision 24 e) : au plus 20 échecs dans la journée ET au plus un jour par semaine de la recette (J1-J7, J8-J14) ; au-delà, « à expliquer » avec la raison « alerte au-delà de la borne », et Pierre décide (CR-26 point 3). L’étape IA arrêtée après plusieurs pannes (en échec, ou en alerte quand une analyse a réussi avant l’arrêt : P4b-1, RC-2) peut y être rattachée à la main, le message de l’appel lu.',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { ia: [{ types: ['ia-echecs-de-suite', 'ia-part-echecs'], messages: /hit your (session|weekly|usage) limit/i, echecsMax: 20, unJourParSemaine: true }] },
    aLaMain: { etapes: [{ cle: 'iaAutoAvantMatch', statuts: ['error', 'warn'] }, { cle: 'iaAutoApresMatch', statuts: ['error', 'warn'] }] }
  }),

  // --- Les calculs à part (« exit » avant « close ») : trois causes (CR-26 point 1 ; décisions 9 et 22 a) ---
  cause({
    id: 'calcul-a-part-exit-scelles',
    titre: 'Un calcul à part des modules scellés s’arrête sans son dernier message (« exit » avant « close »)',
    explication: 'Trois écouteurs « exit » restent, non corrigés pendant le gel (décisions 9 et 22 a) : dayTable.js:2623 (« contrôle à part arrêté sans réponse », étape tableJourJ), simulationNuit.js:199 (« calcul à part arrêté sans réponse », étapes simulationSaisons et simulationMatchs) et jugeAPart.js:53 (un Worker, « Le fil du juge s’est arrêté »). Le fil du juge n’est ouvert par AUCUNE étape de passe (décision 24 d, lu le 17/11 : seuls resume.js:333, par runner.js:950 quand rendreLaMain est passé, et scripts/stat-value.mjs:128 l’ouvrent ; runner le reçoit de bancEnfant.js — banc du mois lancé APRÈS la passe, matchStatsAutoRefresh.js:2627, et banc au clic — et de bancCandidate.js — bancs au clic, config.controller.js:149, bancCorrectionEnfant.js:47) : sa trace ne vient jamais dans une étape, et un « Le fil du juge s’est arrêté » dans une étape est « à expliquer ». Active jusqu’à la fin de la fenêtre du banc de la 46, ou une décision écrite de l’orchestrateur. Une trace « exit » ailleurs n’est PAS d’ici : c’est une rechute des corrigés.',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: {
      etapes: [
        // P4b-1 (RC-1) : « (code 0) » seulement. La course « exit avant close » sort toujours par le code 0
        // (process.exit(0) après l'envoi) ; un vrai plantage (code 1, mémoire épuisée, 3221225477) n'est jamais d'ici.
        { cle: 'tableJourJ', statuts: ['error', 'warn'], motif: /contrôle à part arrêté sans réponse \(code 0\)/ },
        { cle: 'simulationSaisons', statuts: ['error', 'warn'], motif: /calcul à part arrêté sans réponse \(code 0\)/ },
        { cle: 'simulationMatchs', statuts: ['error', 'warn'], motif: /calcul à part arrêté sans réponse \(code 0\)/ }
      ]
    }
  }),
  cause({
    id: 'calcul-a-part-exit-coupes',
    titre: 'Le calcul à part des coupes s’arrêtait sans son dernier message',
    explication: 'Corrigé le 09/11 (attente sur « close »). S’il revient : rechute, comptée nouvelle.',
    statut: 'corrigee',
    depuis: '2026-11-09',
    reconnait: { etapes: [{ cle: 'coupesEtMatchsAPart', statuts: ['error', 'warn'], motif: /arrêté sans réponse \(code \d+\)/ }] }
  }),
  cause({
    id: 'calcul-a-part-exit-corriges',
    titre: 'Les autres calculs à part s’arrêtaient sans leur dernier message',
    explication: 'Les endroits hors sceau, corrigés le 15/11 (commit 1fe1690, attente sur « close »). S’ils reviennent : rechute, comptée nouvelle. Les clés d’étape sont lues d’après le nom du module (à vérifier au rodage) ; une étape absente de la liste tombe en « à expliquer », jamais en « connue ».',
    statut: 'corrigee',
    depuis: '2026-11-15',
    reconnait: {
      etapes: ['carteOuParier', 'cartonsEtCorners', 'combinaisonABlanc', 'contexteDuMatch', 'boucleCorrection', 'debutsDeSaison', 'joueursABlanc', 'connaitreMarche', 'indiceForce', 'forcesButs', 'fichesJoueurs', 'stylesDeJeu', 'moteurABlanc', 'calibrationMensuelle'].map((cle) => ({
        cle,
        statuts: ['error', 'warn'],
        motif: /(?:calcul|banc|rejeu|calcul de la carte) (?:à part )?arrêté sans réponse \(code \d+\)/
      }))
    }
  }),

  // --- FotMob et le direct (CR-24) ---
  cause({
    id: 'fotmob-panne-detectee',
    titre: 'FotMob ne répond plus, et c’est détecté et signalé par l’appli',
    explication: 'FotMob « en panne » détecté par l’appli elle-même (5 réponses en échec de suite, sante-fotmob.json), de nature « réseau » ou « serveur ». Accès refusé, limite 429, réponse illisible ou forme inattendue : « à expliquer ». Une panne vue seulement par le journal (toutes les étapes FotMob en échec, l’appli ne disant rien) est une DÉTECTION MANQUÉE : « à expliquer ». Un épisode de plus de 6 h observées (veilles exclues) donne une « alerte au-delà de la borne », à expliquer (CR-24 point 2, décision 24 e).',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { fotmob: [{ etats: ['en-panne'], natures: ['reseau', 'serveur'], detecteParLAppli: true }] },
    aLaMain: { fotmob: [{ etats: ['en-panne'] }] }
  }),
  cause({
    id: 'fotmob-a-surveiller',
    titre: 'Quelques échecs FotMob de suite (réseau ou serveur)',
    explication: 'FotMob « à surveiller » pour la seule raison « échecs de suite », de nature « réseau » ou « serveur » (CR-24 point 1). Accès refusé, 429, réponse illisible, forme inattendue, « aucune réussite depuis… » : « à expliquer ».',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { fotmob: [{ etats: ['a-surveiller'], natures: ['reseau', 'serveur'], raison: /échec de suite/ }] },
    aLaMain: { fotmob: [{ etats: ['a-surveiller'] }] }
  }),
  cause({
    id: 'direct-suspendu-fotmob',
    titre: 'Le direct suspendu 30 min après 5 erreurs FotMob',
    explication: 'La ligne « direct » suspendue pendant un épisode FotMob (FotMob « à surveiller » ou « en panne » au même tour). Sinon « à expliquer ». P4b-1 (RC-5, décision 26 d) : l’alerte « enregistreurs » posée ou changée au même moment est reconnue aussi, si le SEUL relevé ajouté est celui du direct (lu par sa clé « direct », ou par son texte « erreurs FotMob d’affilée » quand il n’a pas de clé) ; à vérifier au rodage sur la première vraie alerte, relevée en brut.',
    statut: 'active',
    depuis: '2026-11-17',
    reconnait: { direct: [{ pendantFotmob: true }], alertes: [{ cle: 'enregistreurs', seulementLeDirect: true }] },
    aLaMain: { direct: [{}], alertes: [{ cle: 'enregistreurs' }] }
  }),

  // --- Causes « à la main » des signaux du temps (CR-21) ---
  cause({
    id: 'sauvegarde-decalee',
    titre: 'La sauvegarde faite au réveil plutôt que la nuit',
    explication: 'S7 compte le temps ÉVEILLÉ (CR-21 point 2) : une sauvegarde décalée par la veille ne sonne plus. Si « aucune sauvegarde depuis 36 h éveillées » sonne quand même, la revue regarde le journal Windows des nuits d’avant et peut la rattacher ici à la main.',
    statut: 'active',
    depuis: '2026-11-17',
    mode: 'a-la-main',
    aLaMain: { signaux: ['sans-sauvegarde'] }
  }),
  cause({
    id: 'passe-figee-par-la-veille',
    titre: 'Une passe « en cours » pendant la veille reprend au réveil',
    explication: 'Une passe de plus de 2 h qui recouvre un trou du battement (09/11 : 38 509 s, aucune étape en échec). Sans étape en échec, elle ne fait aucun événement ; une étape d’une telle passe en alerte ou en échec peut être rattachée ici à la main, si son résumé parle d’un délai.',
    statut: 'active',
    depuis: '2026-11-17',
    mode: 'a-la-main',
    aLaMain: { etapes: [{ cle: '*', statuts: ['warn', 'error'], figee: true }] }
  }),

  // --- P4b-1 (RC-6) : « CôteMaster a été arrêté : par vous ? » — la réponse « oui » de Pierre (CR-14 point 4) ---
  cause({
    id: 'arret-par-pierre',
    titre: 'Vous avez fermé ou relancé CôteMaster',
    explication: 'Un arrêt du serveur, ou un redémarrage rapide, que rien n’explique (ni annonce de mise en service, ni redémarrage du PC) : le journal demande « par vous ? ». JAMAIS reconnu d’office ; la revue pose la question à Pierre et le rattache ici seulement s’il répond oui, la raison écrite citant sa réponse. Un arrêt sur erreur n’est jamais d’ici.',
    statut: 'active',
    depuis: '2026-11-17',
    mode: 'a-la-main',
    aLaMain: { demarrages: ['arret-du-serveur', 'redemarrage-rapide'] }
  }),

  // --- Ce qui était là au départ (CR-18 point 2) ---
  cause({
    id: 'presents-au-depart',
    titre: 'Alertes déjà là à J0, au même contenu',
    explication: 'Une alerte durable dont le CONTENU (sa signature : relevés, problèmes, types, inconnus) est celui de l’instantané pris au premier tour de J1. Les constats présents à J0 ne font pas d’événement (seuls ceux trouvés après J0 en font). Jamais rattachable à la main.',
    statut: 'active',
    depuis: '2026-11-17',
    rattachable: false,
    reconnait: { alertesDuDepart: true }
  })
]);
