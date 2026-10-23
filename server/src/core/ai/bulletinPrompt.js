/**
 * bulletinPrompt.js — ce qu'on envoie à l'IA pour le BULLETIN DU JOUR et le BILAN DE LA SEMAINE, et ce qu'on attend d'elle
 * (étape 42 du plan, 22/10/2026).
 * -----------------------------------------------------------------------
 * Même forme que l'analyse de match en fiche compacte (étape 41, matchAiAnalysisPrompt.js) :
 *   - des CONSIGNES FIXES (CONSIGNES_BULLETIN, CONSIGNES_BILAN : pas un mot propre au jour ni à la semaine, identiques d'un
 *     appel à l'autre, donc relues depuis la mémoire cache de Claude) ;
 *   - la FICHE chiffrée en petits tableaux de texte (rendreLaFicheDuJour, rendreLaFicheDeLaSemaine : les chiffres déjà
 *     calculés par le code, bulletinFiches.js) ;
 *   - une sortie STRUCTURÉE (SCHEMA_BULLETIN, SCHEMA_BILAN), que Claude Code contraint (`--json-schema`).
 *
 * LA RÈGLE D'OR, dite dans les consignes ET vérifiée par le code (gardeDesChiffres.js) : l'IA ne fait que résumer et
 * commenter ; tout nombre de son texte doit être un nombre de la fiche, sinon le texte est refusé.
 *
 * Ne passe JAMAIS par l'ancien audit par lot (aiAnalysisService.js, anthropicClient.js : l'API Anthropic à la clé, payante) :
 * la demande part par claudeCodeClient.js (le quota de l'abonnement), dans bulletinService.js.
 * -----------------------------------------------------------------------
 */

import { jourCourt, jourEtHeureDits, ERREURS_PAR_MATCH } from './bulletinFiches.js';

// ------------------------------------------------------------------ les formats
const fr = (n, d = 0) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 0) => `${fr(n, d)} %`;
const signe = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
const pctSigne = (n, d = 1) => `${signe(n)}${fr(Math.abs(n), d)} %`;
const eurosSignes = (n) => `${signe(n)}${fr(Math.abs(n), 2)} €`;
const euros = (n) => `${fr(n, 2)} €`;
const ou = (x, f = (v) => v) => (x === null || x === undefined ? '–' : f(x));
const pluriel = (n, un, plusieurs) => `${fr(n)} ${n > 1 ? plusieurs : un}`;

const ETATS_DE_COMPOSITION = Object.freeze({ officielle: 'officielle', probable: 'probable', 'derniere-alignee': 'dernière alignée (rien publié par FotMob)', 'non-publiee': 'non publiée' });
const COULEURS_DE_CASE = Object.freeze({ vert: 'verte', rouge: 'rouge', gris: 'grise' });
const FEUX = Object.freeze({ vert: 'vert', orange: 'orange', rouge: 'rouge' });
const STATUTS_DE_CONTROLE = Object.freeze({ rouge: 'rouge', orange: 'orange', erreur: 'en panne' });

/** Une ligne de tableau : colonnes séparées par « | ». */
const ligne = (...colonnes) => `| ${colonnes.join(' | ')} |`;

// ============================================================================ LA FICHE DU JOUR EN TEXTE

function carteDite(carte) {
  if (!carte) return 'sans carte';
  return `${COULEURS_DE_CASE[carte.couleur] ?? 'sans couleur'}${carte.mot ? ` (${carte.mot})` : ''}`;
}

const coteReleveeDite = (c) => (!c ? '–' : c.fraiche ? `fraîche${c.ageMinutes === null ? '' : `, relevée il y a ${fr(c.ageMinutes)} min`}` : `À RAFRAÎCHIR${c.ageMinutes === null ? '' : ` (relevée il y a ${fr(c.ageMinutes)} min)`}`);

/** Le texte de la fiche du jour, tel que l'IA le lit. */
export function rendreLaFicheDuJour(f) {
  const o = f.opportunites;
  const sortie = [];
  sortie.push(`FICHE DU JOUR — ${f.jourEnLettres} (${jourCourt(f.jour)}) · mode ${f.mode === 'econome' ? 'économe (fiche réduite)' : 'normal'}`);
  sortie.push('Ce sont les seuls chiffres que tu peux citer.');

  sortie.push('', 'OPPORTUNITÉS DU JOUR');
  if (o.etat === 'pret') {
    sortie.push(
      `Repérage calculé le ${ou(o.calculeLe && jourEtHeureDits(o.calculeLe))} : ${pluriel(o.lignesLues, 'ligne lue', 'lignes lues')} pour aujourd'hui (une ligne par issue cotée par vos bookmakers, la plupart sans value), dont ${pluriel(o.valuesVertes, 'value verte', 'values vertes')} et ` +
        `${pluriel(o.chutes, 'chute de cote sans value verte', 'chutes de cote sans value verte')}` +
        (o.valuesVertesSur7Jours === null ? '.' : ` ; ${pluriel(o.valuesVertesSur7Jours, 'value verte', 'values vertes')} sur les 7 prochains jours.`)
    );
    if (o.carteOuParier) sortie.push(`Carte « où parier » du mois ${o.carteOuParier.mois}${o.carteOuParier.aJour ? '' : ' : réglages du moteur changés depuis, ses couleurs sont suspendues'}.`);
    if (o.retenues.length) {
      sortie.push(`VALUES VERTES (la plus forte d'abord${o.valuesVertes > o.retenues.length ? `, ${pluriel(o.retenues.length, 'ligne', 'lignes')} sur ${fr(o.valuesVertes)}` : ''})`);
      sortie.push(ligne('match', 'championnat', 'heure', 'pari', 'cote', 'bookmaker', 'proba moteur', 'cote juste', 'value', 'cote relevée', 'case', 'compo'));
      for (const l of o.retenues) {
        sortie.push(
          ligne(l.match, ou(l.championnat), l.heure ?? 'heure inconnue', ou(l.pari), ou(l.cote, (c) => fr(c, 2)), ou(l.bookmaker), ou(l.probabilitePct, (p) => pct(p)), ou(l.coteJuste, (c) => fr(c, 2)), ou(l.valuePct, (v) => pctSigne(v)), coteReleveeDite(l.coteRelevee), carteDite(l.carte), ETATS_DE_COMPOSITION[l.compo])
        );
      }
    } else {
      sortie.push("Aucune value verte aujourd'hui.");
    }
    if (o.chutesRetenues.length) {
      sortie.push(`CHUTES DE COTE (sans value verte, la plus forte d'abord)`);
      sortie.push(ligne('match', 'championnat', 'heure', 'pari', 'chute de la cote juste depuis l’ouverture', 'cote', 'bookmaker', 'compo'));
      for (const l of o.chutesRetenues) {
        sortie.push(ligne(l.match, ou(l.championnat), l.heure ?? 'heure inconnue', ou(l.pari), ou(l.chutePct, (c) => pct(c, 1)), ou(l.cote, (c) => fr(c, 2)), ou(l.bookmaker), ETATS_DE_COMPOSITION[l.compo]));
      }
    }
  } else if (o.etat === 'en-calcul') {
    sortie.push("Les opportunités ne sont pas encore calculées (le Repérage tourne) : ne dis rien des paris du jour.");
  } else {
    sortie.push(`Les opportunités sont indisponibles (${o.erreur ?? 'raison inconnue'}) : ne dis rien des paris du jour.`);
  }

  const v = f.favoris;
  sortie.push('', 'VOS FAVORIS');
  if (v.illisible) {
    sortie.push('Vos favoris sont illisibles pour l’instant : ne dis rien d’eux.');
  } else if (!v.lu) {
    sortie.push('La liste des matchs du jour est illisible pour l’instant : ne dis rien des matchs de vos favoris.');
  } else {
    sortie.push(`${pluriel(v.equipes, 'équipe', 'équipes')} et ${pluriel(v.championnats, 'championnat', 'championnats')} en favoris ; ${pluriel(v.matchsDuJour, 'match de vos favoris', 'matchs de vos favoris')} aujourd'hui.`);
    if (v.matchs.length) {
      sortie.push(ligne('match', 'championnat', 'heure', 'pourquoi', 'compo', 'values vertes'));
      for (const m of v.matchs) sortie.push(ligne(m.match, ou(m.championnat), m.heure ?? 'heure inconnue', m.pourquoi, ETATS_DE_COMPOSITION[m.compo], fr(m.valuesVertes)));
      if (v.matchsDuJour > v.matchs.length) sortie.push(`(${pluriel(v.matchsDuJour - v.matchs.length, 'autre match non listé', 'autres matchs non listés')})`);
    }
  }

  const c = f.compositions;
  sortie.push('', 'COMPOSITIONS');
  if (!c.lu) sortie.push('Les compositions sont illisibles pour l’instant : ne dis rien d’elles.');
  else sortie.push(
    `${pluriel(c.matchsConcernes, 'match concerné', 'matchs concernés')} (ceux de la fiche) : ${pluriel(c.officielles, 'officielle', 'officielles')}, ${pluriel(c.probables, 'probable', 'probables')}, ` +
      `${pluriel(c.dernieresAlignees, 'dernière alignée', 'dernières alignées')}, ${pluriel(c.nonPubliees, 'non publiée', 'non publiées')}.`
  );
  if (c.lu && c.matchs.length) {
    sortie.push(ligne('match', 'composition', 'minutes avant le coup d’envoi', 'absents annoncés (domicile)', 'absents annoncés (extérieur)'));
    for (const m of c.matchs) sortie.push(ligne(m.match, ETATS_DE_COMPOSITION[m.etat], ou(m.minutesAvantLeCoupDEnvoi, (x) => fr(x)), m.absentsDomicile.join(', ') || 'aucun', m.absentsExterieur.join(', ') || 'aucun'));
  }

  const k = f.controle;
  sortie.push('', 'CONTRÔLE QUOTIDIEN DES DONNÉES');
  if (k.etat === 'pret') {
    const n = k.compte ?? {};
    const total = (n.vert ?? 0) + (n.orange ?? 0) + (n.rouge ?? 0) + (n.nonFait ?? 0) + (n.erreur ?? 0);
    sortie.push(`Feu ${FEUX[k.feu] ?? k.feu} au ${ou(k.le && jourEtHeureDits(k.le))} : ${pluriel(total, 'contrôle', 'contrôles')} — ${fr(n.vert ?? 0)} vert, ${fr(n.orange ?? 0)} orange, ${fr(n.rouge ?? 0)} rouge.`);
    for (const x of k.enEchec) sortie.push(`- ${STATUTS_DE_CONTROLE[x.statut] ?? x.statut} : ${x.libelle} (${pluriel(x.constats, 'constat', 'constats')})`);
    if (k.enEchecTotal > k.enEchec.length) sortie.push(`(${pluriel(k.enEchecTotal - k.enEchec.length, 'autre contrôle en échec non listé', 'autres contrôles en échec non listés')})`);
  } else if (k.etat === 'jamais') {
    sortie.push('Le contrôle quotidien n’a pas encore tourné : ne dis rien de la santé des données.');
  } else {
    sortie.push('Le contrôle quotidien est illisible pour l’instant : ne dis rien de la santé des données.');
  }

  if (f.problemes?.length) {
    sortie.push('', 'LECTURES QUI ONT ÉCHOUÉ (ce que tu ne sais donc pas)');
    for (const p of f.problemes) sortie.push(`- ${p}`);
  }
  sortie.push('', 'Écris le bulletin du jour à partir de cette fiche.');
  return sortie.join('\n');
}

// ============================================================================ LA FICHE DE LA SEMAINE EN TEXTE

const tauxDit = (n, d) => (d > 0 ? `${fr(n)} sur ${fr(d)} (${pct(Math.round((100 * n) / d))})` : 'aucun');

/** Le texte de la fiche de la semaine, tel que l'IA le lit. */
export function rendreLaFicheDeLaSemaine(f) {
  const sortie = [];
  sortie.push(`FICHE DE LA SEMAINE — ${f.semaine.enLettres} (du ${jourCourt(f.semaine.du)} au ${jourCourt(f.semaine.au)}) · mode ${f.mode === 'econome' ? 'économe (fiche réduite)' : 'normal'}`);
  sortie.push('Ce sont les seuls chiffres que tu peux citer.');

  const p = f.pronostics;
  sortie.push('', 'PRONOSTICS DU MOTEUR RÉGLÉS CETTE SEMAINE (journal des pronostics)');
  if (!p.lu) {
    sortie.push('Le journal des pronostics est illisible pour l’instant : ne dis rien des pronostics du moteur.');
  } else if (!p.regles) {
    sortie.push('Aucun pronostic réglé cette semaine.');
  } else {
    sortie.push(`${pluriel(p.regles, 'pronostic réglé', 'pronostics réglés')} : ${pluriel(p.justes, 'juste', 'justes')}, ${fr(p.faux)} faux, réussite ${pct(p.tauxPct)}.`);
    sortie.push(ligne('marché', 'réglés', 'justes', 'réussite'));
    for (const g of p.parMarche) sortie.push(ligne(g.libelle, fr(g.regles), fr(g.justes), ou(g.tauxPct, (x) => pct(x))));
    sortie.push(ligne('championnat', 'réglés', 'justes', 'réussite'));
    for (const g of p.parChampionnat) sortie.push(ligne(g.libelle, fr(g.regles), fr(g.justes), ou(g.tauxPct, (x) => pct(x))));
  }

  const b = f.paris;
  sortie.push('', 'VOS PARIS RÉGLÉS CETTE SEMAINE (carnet de paris, règles de Performance paris)');
  if (!b.lu) {
    sortie.push('Le carnet de paris est illisible pour l’instant : ne dis rien de vos paris, de leur valeur de clôture ni de vos championnats.');
  } else if (!b.regles && !b.annules) {
    sortie.push(`Aucun pari réglé cette semaine. ${pluriel(b.enAttente, 'pari reste', 'paris restent')} en attente.`);
  } else {
    sortie.push(
      `${pluriel(b.regles, 'pari réglé', 'paris réglés')} : ${pluriel(b.gagnes, 'gagné', 'gagnés')}, ${pluriel(b.perdus, 'perdu', 'perdus')}${b.annules ? `, ${pluriel(b.annules, 'annulé', 'annulés')}` : ''} ; ` +
        `mise totale ${euros(b.mise)}, gain réel ${eurosSignes(b.gainReel)}, ROI ${ou(b.roiPct, (x) => pctSigne(x))}, réussite ${ou(b.tauxReussitePct, (x) => pct(x))}, cote moyenne ${ou(b.coteMoyenne, (x) => fr(x, 2))} ; ${pluriel(b.enAttente, 'pari', 'paris')} en attente.`
    );
    if (b.attendu) {
      sortie.push(
        `Gain attendu au moment du pari (les ${pluriel(b.attendu.paris, 'pari simple qui a', 'paris simples qui ont')} la probabilité du moteur) : attendu ${eurosSignes(b.attendu.gainAttendu)}, réel ${eurosSignes(b.attendu.gainReel)}, écart ${eurosSignes(b.attendu.ecart)}.`
      );
    } else {
      sortie.push('Gain attendu : aucun pari de la semaine ne porte la probabilité du moteur du moment du pari.');
    }
    if (b.meilleurs.length) {
      sortie.push('MEILLEURS PARIS');
      sortie.push(ligne('pari', 'cote', 'mise', 'gain', 'bookmaker'));
      for (const x of b.meilleurs) sortie.push(ligne(x.pari, fr(x.cote, 2), euros(x.mise), eurosSignes(x.gain), ou(x.bookmaker)));
    }
    if (b.pires.length) {
      sortie.push('PIRES PARIS');
      sortie.push(ligne('pari', 'cote', 'mise', 'gain', 'bookmaker'));
      for (const x of b.pires) sortie.push(ligne(x.pari, fr(x.cote, 2), euros(x.mise), eurosSignes(x.gain), ou(x.bookmaker)));
    }
  }

  const c = f.valeurDeCloture;
  sortie.push('', 'VALEUR DE CLÔTURE DE CES PARIS (la cote a-t-elle donné raison au pari ensuite ?)');
  if (!b.lu) sortie.push('Indisponible (carnet de paris illisible).');
  else if (!c.disponible) sortie.push(`Valeur de clôture indisponible (${c.raison ?? 'raison inconnue'}) : ne dis rien d'elle.`);
  else if (!c.parisMesures) sortie.push('Aucun pari simple de la semaine n’a de valeur de clôture mesurée (seuls le résultat, le plus/moins de buts et les deux équipes marquent ont des cotes de clôture gratuites).');
  else sortie.push(`${pluriel(c.parisMesures, 'pari simple mesuré', 'paris simples mesurés')} : valeur de clôture moyenne ${ou(c.moyennePct, (x) => pctSigne(x))} ; positifs : ${tauxDit(c.positifs, c.parisMesures)}.`);

  const ia = f.ia;
  sortie.push('', "L'IA : SES AVIS DE LA SEMAINE (confirmer un pronostic juste ou contredire un pronostic faux = avoir eu raison ; un avis nuancé n'est jamais compté)");
  if (!ia.semaine.lu) {
    sortie.push('Les analyses de l’IA sont illisibles pour l’instant : ne dis rien de ses avis de la semaine.');
  } else if (!ia.semaine.avis) {
    sortie.push('Aucun avis de l’IA jugé cette semaine.');
  } else {
    sortie.push(`${pluriel(ia.semaine.avis, 'avis jugé', 'avis jugés')} ; tenus : ${tauxDit(ia.semaine.tenus, ia.semaine.avis)}.`);
    sortie.push(ligne('marché', 'avis', 'tenus', 'taux'));
    for (const g of ia.semaine.parMarche) sortie.push(ligne(g.libelle, fr(g.avis), fr(g.tenus), ou(g.tauxPct, (x) => pct(x))));
    if (ia.semaine.erreurs.length) {
      const triees = ia.semaine.erreurs.length < ia.semaine.erreursTotal;
      sortie.push(`OÙ ELLE S'EST TROMPÉE (${triees ? `${fr(ia.semaine.erreurs.length)} sur ${fr(ia.semaine.erreursTotal)}, celles où elle se disait la plus sûre d'abord, au plus ${fr(ERREURS_PAR_MATCH)} par match` : fr(ia.semaine.erreursTotal)})`);
      sortie.push(ligne('match', 'marché', 'pronostic', 'avis de l’IA', 'confiance', 'issue'));
      for (const e of ia.semaine.erreurs) sortie.push(ligne(e.match, ou(e.marche), ou(e.pari), ou(e.avisDeLIA), ou(e.confiance), ou(e.issue)));
    }
  }
  const car = ia.carnet;
  if (car.etat === 'lu') {
    sortie.push(`Carnet de l'IA depuis le ${ou(car.depuis && jourCourt(car.depuis))} (calculé le ${ou(car.calculeLe && jourEtHeureDits(car.calculeLe))}) : ${pluriel(car.matchsAnalysesEtJoues ?? 0, 'match analysé et joué', 'matchs analysés et joués')} ; avis tenus : ${tauxDit(car.tenus, car.avis)}.`);
    if (car.parMarche.length) {
      sortie.push(`Marchés d'au moins ${fr(car.seuilAvis)} avis, du moins fiable au plus fiable${car.marchesDuMilieu ? ` (${pluriel(car.marchesDuMilieu, 'marché du milieu non montré', 'marchés du milieu non montrés')})` : ''} :`);
      sortie.push(ligne('marché', 'avis', 'tenus', 'taux'));
      for (const g of car.parMarche) sortie.push(ligne(g.libelle, fr(g.avis), fr(g.tenus), ou(g.tauxPct, (x) => pct(x))));
    }
    if (car.marchesTropPeuFournis) {
      const [un, plusieurs] = car.parMarche.length ? ['autre marché a', 'autres marchés ont'] : ['marché a', 'marchés ont'];
      sortie.push(`${pluriel(car.marchesTropPeuFournis, un, plusieurs)} moins de ${fr(car.seuilAvis)} avis : trop peu pour juger, ne les commente pas.`);
    }
  } else {
    sortie.push(`Carnet de l'IA : ${car.etat === 'absent' ? 'pas encore calculé' : 'illisible pour l’instant'} : ne dis rien de sa fiabilité d'ensemble.`);
  }

  const ch = f.championnats;
  sortie.push('', 'LES CHAMPIONNATS');
  if (!b.lu) {
    sortie.push('Vos paris sont illisibles : aucun championnat à classer.');
  } else if (!ch.rentables.length && !ch.perdants.length) {
    sortie.push('Aucun pari réglé cette semaine, donc aucun championnat à classer.');
  } else {
    sortie.push('VOS PARIS DE LA SEMAINE, CHAMPIONNAT PAR CHAMPIONNAT');
    sortie.push(ligne('championnat', 'réglés', 'gagnés', 'perdus', 'gain', 'ROI'));
    for (const x of [...ch.rentables, ...ch.perdants]) sortie.push(ligne(x.championnat, fr(x.regles), fr(x.gagnes), fr(x.perdus), eurosSignes(x.gain), ou(x.roiPct, (r) => pctSigne(r))));
  }
  const carte = ch.carteOuParier;
  if (carte) {
    sortie.push(
      `Carte « où parier » du mois ${carte.mois}${carte.aJour ? '' : ' (réglages du moteur changés depuis : couleurs suspendues)'} : ${pluriel(carte.cases, 'case', 'cases')}, ${pluriel(carte.vertes, 'verte', 'vertes')}, ${pluriel(carte.rouges, 'rouge', 'rouges')}, ${pluriel(carte.grises, 'grise', 'grises')}.`
    );
    if (carte.listeDesVertes.length) {
      sortie.push(ligne('championnat', 'marché', 'matchs mesurés'));
      for (const x of carte.listeDesVertes) sortie.push(ligne(x.championnat, x.marche, ou(x.matchs, (m) => fr(m))));
    } else {
      sortie.push('Aucune case verte : aucun avantage du moteur n’est prouvé pour l’instant, dans aucun championnat.');
    }
  } else {
    sortie.push('Carte « où parier » : pas encore mesurée.');
  }

  if (f.problemes?.length) {
    sortie.push('', 'LECTURES QUI ONT ÉCHOUÉ (ce que tu ne sais donc pas)');
    for (const x of f.problemes) sortie.push(`- ${x}`);
  }
  sortie.push('', 'Écris le bilan de la semaine à partir de cette fiche.');
  return sortie.join('\n');
}

// ============================================================================ LES CONSIGNES FIXES

const REGLE_DES_CHIFFRES =
  "RÈGLE ABSOLUE — LES CHIFFRES : tu n'écris JAMAIS un chiffre qui n'est pas dans la fiche. Reprends chaque nombre tel qu'il y est écrit (cotes, pourcentages, euros, heures, dates, comptes), sans l'arrondir, le recalculer, l'additionner, le déplacer ni le déduire ; si un total ou un pourcentage t'est utile, il est dans la fiche, sinon n'en parle pas. " +
  "Écris les nombres en CHIFFRES, jamais en lettres (sauf « un » et « deux »). Le code contrôle chaque nombre de ton texte : un seul nombre absent de la fiche et le texte entier est refusé, rien ne s'affiche à Pierre.";

/** Consignes FIXES du bulletin du matin. */
export const CONSIGNES_BULLETIN = [
  "Tu écris le BULLETIN DU MATIN de CôteMaster, l'appli de paris sur le football de Pierre. Pierre n'est pas développeur : écris en français simple, court et direct, sans jargon (une « value » est une cote qui paie plus que ce que le moteur juge juste).",
  "Le message est une FICHE CHIFFRÉE préparée par le code : quatre rubriques (opportunités du jour, vos favoris, compositions, contrôle quotidien), en lignes et petits tableaux (colonnes « | »), décimales à la virgule, « – » = non connu. Tu résumes et tu commentes cette fiche ; tu n'apportes AUCUNE information qui n'y soit pas.",
  REGLE_DES_CHIFFRES,
  "Rôle consultatif : tu ne proposes jamais de pari, de cote, de probabilité ni de mise à toi, tu ne dis pas « parie sur » ; tu dis ce que la fiche montre. Une value est une estimation du moteur, pas une promesse. Quand rien ne vaut le coup aujourd'hui, dis-le franchement : « pas de pari aujourd'hui » est un bon bulletin.",
  "Dis ce qui MANQUE plutôt que de le deviner : « non publiée », « pas encore calculées », un contrôle orange ou rouge qui touche les données. Une composition « probable » ou « dernière alignée » n'est pas officielle ; FotMob ne publie les onze qu'environ une heure avant le coup d'envoi. Une cote « à rafraîchir » n'est pas une value tant qu'elle n'est pas relevée de nouveau.",
  "Plan : un `titre` d'une ligne (le jour et l'essentiel), un `resume` de deux à trois phrases, puis une section par rubrique de la fiche qui a quelque chose à dire (`cle` : opportunites, favoris, compositions ou alertes), chacune de deux à quatre phrases qui disent CE QUI vaut le coup et POURQUOI (la probabilité du moteur face à la cote, la case de la carte « où parier », la fraîcheur de la cote, la composition). Facultatif : `aRetenir`, une phrase de prudence. En mode économe, la fiche est réduite : sois plus bref.",
  'Réponds exclusivement par la sortie structurée demandée (le schéma de sortie fourni), sans aucun texte en dehors.'
].join(' ');

/** Consignes FIXES du bilan de la semaine. */
export const CONSIGNES_BILAN = [
  "Tu écris le BILAN DE LA SEMAINE de CôteMaster, l'appli de paris sur le football de Pierre. Pierre n'est pas développeur : écris en français simple, court et direct, sans jargon.",
  "Le message est une FICHE CHIFFRÉE préparée par le code, pour la semaine écoulée (du lundi au dimanche) : les pronostics du moteur réglés, vos paris réglés, la valeur de clôture de ces paris, les avis de l'IA (les tiens) et sa fiabilité, les championnats. Lignes et petits tableaux (colonnes « | »), décimales à la virgule, « – » = non connu. Tu résumes et tu commentes cette fiche ; tu n'apportes AUCUNE information qui n'y soit pas.",
  REGLE_DES_CHIFFRES,
  "Honnêteté sur le hasard : sur peu de pronostics ou de paris, un bon ou un mauvais résultat ne prouve rien — la fiche donne le nombre de cas, dis-le quand il est petit. La valeur de clôture (la cote a-t-elle donné raison au pari ensuite ?) est un meilleur signe que le seul résultat. Ne présente jamais une bonne semaine comme une méthode, ni une mauvaise comme une preuve d'échec.",
  "Rôle consultatif : aucun conseil de mise, aucune cote ni probabilité à toi, pas de « il faut parier ». Tu dis ce qui a marché, ce qui a perdu, et où l'IA — toi — s'est trompée : quel marché, quel avis, quelle confiance annoncée, et ce que cela dit de la confiance à lui accorder. Dis ce qui MANQUE (« indisponible », « pas encore calculé ») plutôt que de le deviner.",
  "Plan : un `titre` d'une ligne, un `resume` de deux à trois phrases, puis une section par thème qui a quelque chose à dire (`cle` : marche = ce qui a marché, perdu = ce qui a perdu, ia = où l'IA s'est trompée, cloture = la valeur de clôture, championnats, retenir = ce qu'il faut retenir), chacune de deux à quatre phrases. En mode économe, la fiche est réduite : sois plus bref.",
  'Réponds exclusivement par la sortie structurée demandée (le schéma de sortie fourni), sans aucun texte en dehors.'
].join(' ');

// ============================================================================ LES SCHÉMAS DE SORTIE

const section = (cles) => ({
  type: 'object',
  properties: {
    cle: { type: 'string', enum: cles, description: 'La rubrique commentée.' },
    titre: { type: 'string', description: 'Le titre de la section, quelques mots.' },
    texte: { type: 'string', description: 'Deux à quatre phrases en français simple. Aucun chiffre qui ne soit dans la fiche.' }
  },
  required: ['cle', 'titre', 'texte'],
  additionalProperties: false
});

/** Les rubriques de chaque texte, dans leur ordre d'affichage. */
export const SECTIONS_DU_BULLETIN = Object.freeze({
  opportunites: 'Les paris du jour',
  favoris: 'Vos favoris',
  compositions: 'Les compositions',
  alertes: 'Les alertes sur les données'
});
export const SECTIONS_DU_BILAN = Object.freeze({
  marche: 'Ce qui a marché',
  perdu: 'Ce qui a perdu',
  ia: "Où l'IA s'est trompée",
  cloture: 'La valeur de clôture',
  championnats: 'Les championnats',
  retenir: 'À retenir'
});

const schema = (cles, sansRetenir) => ({
  type: 'object',
  properties: {
    titre: { type: 'string', description: "Une ligne : le jour (ou la semaine) et l'essentiel. Aucun chiffre qui ne soit dans la fiche." },
    resume: { type: 'string', description: "L'essentiel en deux ou trois phrases. Aucun chiffre qui ne soit dans la fiche." },
    sections: { type: 'array', items: section(cles) },
    ...(sansRetenir ? {} : { aRetenir: { type: 'string', description: 'Facultatif : une phrase de prudence ou de méthode, jamais un pari.' } })
  },
  required: ['titre', 'resume', 'sections'],
  additionalProperties: false
});

export const SCHEMA_BULLETIN = schema(Object.keys(SECTIONS_DU_BULLETIN), false);
export const SCHEMA_BILAN = schema(Object.keys(SECTIONS_DU_BILAN), true);

// ============================================================================ LES DEMANDES

const RAPPEL_APRES_UN_REFUS =
  "RAPPEL : ta réponse précédente a été refusée parce qu'elle citait des nombres qui ne sont pas dans la fiche. Cette fois, n'écris que des nombres copiés de la fiche, tels quels, en chiffres, et rien de calculé.";

/**
 * La demande du bulletin : consignes fixes, fiche en texte, schéma. `apresUnRefus` : un essai précédent a été refusé par la
 * garde des chiffres — un rappel est ajouté APRÈS la fiche (hors fiche : les nombres autorisés restent ceux de `ficheTexte`).
 * @returns {{ system: string, userMessage: string, ficheTexte: string, jsonSchema: object }}
 */
export function demandeDuBulletin(fiche, { apresUnRefus = false } = {}) {
  const ficheTexte = rendreLaFicheDuJour(fiche);
  return { system: CONSIGNES_BULLETIN, userMessage: apresUnRefus ? `${ficheTexte}\n\n${RAPPEL_APRES_UN_REFUS}` : ficheTexte, ficheTexte, jsonSchema: SCHEMA_BULLETIN };
}

/** La demande du bilan de la semaine : mêmes règles que le bulletin. */
export function demandeDuBilan(fiche, { apresUnRefus = false } = {}) {
  const ficheTexte = rendreLaFicheDeLaSemaine(fiche);
  return { system: CONSIGNES_BILAN, userMessage: apresUnRefus ? `${ficheTexte}\n\n${RAPPEL_APRES_UN_REFUS}` : ficheTexte, ficheTexte, jsonSchema: SCHEMA_BILAN };
}

// ============================================================================ LA RÉPONSE DE L'IA

/** La réponse n'a pas la forme demandée (un schéma non respecté, une rubrique inconnue, un texte vide). */
export class TexteInvalide extends Error {}

/** Les longueurs permises (caractères) : un texte plus long est coupé à la fin d'une phrase — la garde lit le texte coupé. */
export const LONGUEURS = Object.freeze({ titre: 160, resume: 700, sectionTitre: 80, sectionTexte: 1000, aRetenir: 320, sections: 6 });

/** Les balises qui fuient parfois d'un ancien format d'appel d'outil, retirées (comme matchAiAnalysisService.js). */
const sansBalises = (t) => String(t ?? '').replace(/<\/?[a-zA-Z_][\w:-]*(?:\s+[^<>]*)?>/g, '').replace(/[ \t]+\n/g, '\n').trim();

/** Coupe `texte` à `max` caractères, à la fin d'une phrase si possible. */
export function couperProprement(texte, max) {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '));
  return fin >= max * 0.5 ? coupe.slice(0, fin + 1) : `${coupe.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Le texte de l'IA, contrôlé et nettoyé. `genre` : 'bulletin' ou 'bilan'. Rend { titre, resume, sections: [{ cle, titre, texte }],
 * aRetenir? } ; lève TexteInvalide si la forme n'est pas celle du schéma.
 */
export function lireLeTexte(sortie, genre) {
  const cles = Object.keys(genre === 'bilan' ? SECTIONS_DU_BILAN : SECTIONS_DU_BULLETIN);
  if (!sortie || typeof sortie !== 'object' || Array.isArray(sortie)) throw new TexteInvalide('la réponse n’est pas un objet');
  const chaine = (valeur, nom, max) => {
    if (typeof valeur !== 'string' || !sansBalises(valeur)) throw new TexteInvalide(`« ${nom} » manque ou est vide`);
    return couperProprement(sansBalises(valeur), max);
  };
  const titre = chaine(sortie.titre, 'titre', LONGUEURS.titre);
  const resume = chaine(sortie.resume, 'resume', LONGUEURS.resume);
  if (!Array.isArray(sortie.sections) || !sortie.sections.length) throw new TexteInvalide('« sections » manque ou est vide');
  const vues = new Set();
  const sections = sortie.sections.slice(0, LONGUEURS.sections).map((s, i) => {
    if (!s || typeof s !== 'object') throw new TexteInvalide(`la section ${i + 1} n’est pas un objet`);
    if (!cles.includes(s.cle)) throw new TexteInvalide(`la section ${i + 1} a une rubrique inconnue (« ${String(s.cle).slice(0, 40)} »)`);
    if (vues.has(s.cle)) throw new TexteInvalide(`la rubrique « ${s.cle} » est écrite deux fois`);
    vues.add(s.cle);
    return { cle: s.cle, titre: chaine(s.titre, `sections[${i}].titre`, LONGUEURS.sectionTitre), texte: chaine(s.texte, `sections[${i}].texte`, LONGUEURS.sectionTexte) };
  });
  const texte = { titre, resume, sections };
  if (genre !== 'bilan' && typeof sortie.aRetenir === 'string' && sansBalises(sortie.aRetenir)) texte.aRetenir = couperProprement(sansBalises(sortie.aRetenir), LONGUEURS.aRetenir);
  return texte;
}

/** Tous les champs de texte d'un texte lu, un par un, pour la garde des chiffres : { 'titre': …, 'sections.0.texte': … }. */
export function champsDuTexte(texte) {
  const champs = { titre: texte.titre, resume: texte.resume };
  texte.sections.forEach((s, i) => {
    champs[`sections.${i}.titre`] = s.titre;
    champs[`sections.${i}.texte`] = s.texte;
  });
  if (texte.aRetenir) champs.aRetenir = texte.aRetenir;
  return champs;
}
