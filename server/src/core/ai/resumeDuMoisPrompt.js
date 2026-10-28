/**
 * resumeDuMoisPrompt.js — ce qu'on envoie à l'IA pour LE RÉSUMÉ DU MOIS de la boucle de correction, et ce qu'on attend
 * d'elle (étape 26 du plan, partie D, 28/10/2026).
 * -----------------------------------------------------------------------
 * Pur, même forme que le bulletin et le bilan de la semaine (étape 42, bulletinPrompt.js) :
 *   - des CONSIGNES FIXES (CONSIGNES_RESUME : pas un mot propre au mois, identiques d'un appel à l'autre) ;
 *   - la FICHE chiffrée en lignes de texte (rendreLaFicheDuMois, à partir de l'objet de data/correction/ficheDuMois.js :
 *     les chiffres déjà calculés et écrits à la française par le code) ;
 *   - une sortie STRUCTURÉE (SCHEMA_RESUME : un titre et quelques phrases), que Claude Code contraint (`--json-schema`).
 * LA RÈGLE D'OR, dite dans les consignes ET vérifiée par le code (gardeDesChiffres.js, champs NOMMÉS — `titre`,
 * `phrase1`, `phrase2`… : constat 13 de la critique) : l'IA explique, elle n'écrit JAMAIS un chiffre qui ne soit pas dans
 * la fiche ; elle ne propose aucun chiffre du moteur, aucun pari.
 * La demande part par claudeCodeClient.js (le quota de l'abonnement), dans resumeDuMois.js — jamais par l'API à la clé.
 * -----------------------------------------------------------------------
 */

// ============================================================ la fiche en texte

const liste = (xs) => xs.filter(Boolean).join(' ; ');

/** Le texte de la fiche du mois, tel que l'IA le lit. `f` : construireLaFicheDuMois. */
export function rendreLaFicheDuMois(f) {
  const s = [];
  s.push(`FICHE DU MOIS — boucle de correction du moteur, ${f.moisDit} · mode ${f.mode === 'econome' ? 'économe (fiche réduite)' : 'normal'}`);
  s.push('Ce sont les seuls chiffres que tu peux citer.');

  s.push('', 'LE TRI DU MOIS (malchance ou vrai défaut)');
  s.push(`Tri ${f.deMois} fait le ${f.calculeLeDit} sur les pronostics gelés de la ${f.lignee}.`);
  s.push(`${f.comptes.pronostics.toLocaleString('fr-FR')} pronostics comptés, ${f.comptes.lignes.toLocaleString('fr-FR')} issues mesurées sur ${f.comptes.matchs.toLocaleString('fr-FR')} matchs.`);
  if (f.comptes.ecartees.length) s.push(`Pronostics écartés (les raisons les plus fréquentes) : ${liste(f.comptes.ecartees.map((e) => `${e.libelle} : ${Number(e.n).toLocaleString('fr-FR')}`))}.`);
  s.push('La règle : un « vrai défaut » dure (les 2 derniers mois comptés vont dans le même sens), fait au moins 2 points et dépasse la marge du hasard — 22 cases × 12 mois : la marge du hasard en tient compte ; sinon, c’est de la malchance ou un petit écart.');
  s.push(`Les 22 cases (11 familles de marchés × 2 mesures) : ${liste(f.statuts.map((x) => `${x.n.toLocaleString('fr-FR')} « ${x.dit} »`)) || 'aucune'}.`);
  s.push(`Cases jugées (au moins deux mois comptés) : ${f.jugees.toLocaleString('fr-FR')}, dont ${f.malchance.toLocaleString('fr-FR')} dans la marge normale (malchance).`);
  if (f.cases.length) {
    s.push(`ÉCARTS JUGÉS HORS MALCHANCE (le plus grave d'abord${f.casesTotal > f.cases.length ? `, ${f.cases.length.toLocaleString('fr-FR')} sur ${f.casesTotal.toLocaleString('fr-FR')}` : ''})`);
    s.push('| famille | mesure | statut | sens | écart sur les mois comptés | matchs | mois comptés | ce qui est proposé |');
    for (const c of f.cases) s.push(`| ${c.famille} | ${c.mesure} | ${c.statutDit} | ${c.sensDit ?? '–'} | ${c.ecart} | ${c.matchs} | ${c.mois.join(', ') || '–'} | ${c.propose ?? 'rien'} |`);
  } else {
    s.push('Aucun écart jugé hors malchance ce mois-ci.');
  }
  for (const g of f.pasEncoreJugees) s.push(`Pas encore jugé (${g.statutDit}) : ${g.familles}.`);
  if (f.enEssai) s.push(`${f.enEssai.replace(/^./, (x) => x.toUpperCase())}.`);

  s.push('', 'CE QUI EST ARRIVÉ AUX CORRECTIONS');
  s.push(f.journal.depuisDit ? `Journal de la boucle depuis le dernier résumé (le ${f.journal.depuisDit}) :` : `Journal de la boucle depuis le début de ${f.moisDit} :`);
  if (!f.journal.compte) s.push('Rien d’autre que le tri du mois.');
  else {
    s.push(`${f.journal.compte.toLocaleString('fr-FR')} événement${f.journal.compte >= 2 ? 's' : ''} : ${liste(f.journal.parEvenement.map((e) => `${e.n.toLocaleString('fr-FR')} « ${e.dit} »`))}.`);
    for (const e of f.journal.evenements) s.push(`- ${e.jour} · ${e.dit} : ${e.phrase}.`);
    if (f.journal.nonListes) s.push(`(${f.journal.nonListes.toLocaleString('fr-FR')} événement${f.journal.nonListes >= 2 ? 's plus anciens non listés' : ' plus ancien non listé'})`);
  }
  if (f.propositions.length) {
    s.push(`Les corrections ouvertes ou qui ont bougé${f.propositionsTotal > f.propositions.length ? ` (${f.propositions.length.toLocaleString('fr-FR')} sur ${f.propositionsTotal.toLocaleString('fr-FR')})` : ''} :`);
    s.push('| réglage | changement | état | d’où elle vient | mesure au banc | essai à blanc |');
    for (const p of f.propositions) s.push(`| ${p.reglage} | ${p.changement} | ${p.etatDit} | ${p.sourceDite} | ${p.banc ?? 'pas encore mesurée'} | ${p.essai ?? '–'} |`);
  } else {
    s.push('Aucune correction ouverte.');
  }
  if (f.place) s.push(f.place);
  if (f.essais) s.push(f.essais);
  if (f.formulaire) s.push(`Le formulaire « Proposer une correction » : ${f.formulaire}`);

  s.push('', 'POUR SITUER : ANNONCÉ FACE À RÉALISÉ DU MOIS (calibration figée, issue choisie)');
  if (f.calibration) {
    s.push(`${f.calibration.pronostics.toLocaleString('fr-FR')} pronostics réglés sur ${f.calibration.matchs.toLocaleString('fr-FR')} matchs : annoncé ${f.calibration.annonce}, réalisé ${f.calibration.realise}, écart ${f.calibration.ecart}, ${f.calibration.verdict}.`);
  } else {
    s.push('Pas de bilan figé de la calibration pour ce mois : n’en parle pas.');
  }

  if (f.problemes?.length) {
    s.push('', 'LECTURES QUI ONT ÉCHOUÉ (ce que tu ne sais donc pas)');
    for (const p of f.problemes) s.push(`- ${p}`);
  }
  s.push('', 'Écris le résumé du mois à partir de cette fiche.');
  return s.join('\n');
}

// ============================================================ les consignes fixes

/** Consignes FIXES du résumé du mois (aucun mot propre au mois : relues depuis la mémoire cache de Claude). */
export const CONSIGNES_RESUME = [
  "Tu écris LE RÉSUMÉ DU MOIS de la boucle de correction de CôteMaster, l'appli de paris sur le football de Pierre. Pierre n'est pas développeur : écris en français simple, avec des phrases courtes, sans jargon (jamais « lignée », « variante », « regards », « levier » ni « K » : dis « la version du moteur », « une correction essayée », « la marge du hasard », « le réglage »).",
  "Ce que fait la boucle : chaque mois, l'appli compare ce que le moteur annonçait à ce qui est arrivé, sur 22 cases (11 familles de marchés, chacune mesurée deux fois : le « niveau », qui dit si l'issue de référence arrive aussi souvent qu'annoncé, et la « confiance », qui dit si le favori de chaque pronostic arrive aussi souvent qu'annoncé). Un écart qui peut venir du hasard est de la « malchance ». Un « vrai défaut » est un écart qui dure, d'au moins 2 points, et trop grand pour le hasard même en comptant tous les regards de l'année. Explique ces deux mots simplement quand tu les emploies. Une case « trop tôt » n'a qu'un mois compté ; « en essai » : une candidate en essai à blanc corrige déjà ces familles.",
  "Le message est une FICHE CHIFFRÉE préparée par le code (lignes et petits tableaux, colonnes « | », décimales à la virgule, « – » = non connu). Tu résumes et tu expliques cette fiche ; tu n'apportes AUCUNE information qui n'y soit pas.",
  "RÈGLE ABSOLUE — LES CHIFFRES : tu n'écris JAMAIS un chiffre qui n'est pas dans la fiche. Reprends chaque nombre tel qu'il y est écrit (points, pourcentages, comptes, dates), sans l'arrondir, le recalculer, l'additionner ni le déduire. Écris les nombres en CHIFFRES, jamais en lettres (sauf « un » et « deux ») ; pour les compositions d'équipe, écris « les compositions ». Le code contrôle chaque nombre de ton texte : un seul nombre absent de la fiche et le texte entier est refusé.",
  "Rôle : tu expliques, tu ne décides rien. Tu ne proposes aucun réglage, aucune valeur, aucun pari, aucune mise. Ne dis jamais qu'une correction est adoptée, essayée ou retenue si la fiche ne le dit pas : seul Pierre adopte, dans Réglages. Rien ne change dans les chiffres du moteur sans son clic. Dis ce qui MANQUE (« pas encore jugé », « pas de bilan figé ») plutôt que de le deviner.",
  'Forme : un `titre` d’une ligne (le mois et l’essentiel), puis `phrases` : de trois à six phrases courtes (deux à quatre en mode économe), dans cet ordre — ce que dit le tri (vrais défauts, à surveiller, ou rien de jugé et pourquoi), ce qui est arrivé aux corrections, ce qui attend Pierre. Réponds exclusivement par la sortie structurée demandée, sans aucun texte en dehors.'
].join(' ');

// ============================================================ le schéma de sortie

/** La sortie demandée : un titre et quelques phrases (chacune contrôlée par la garde des chiffres, sous son propre nom). */
export const SCHEMA_RESUME = Object.freeze({
  type: 'object',
  properties: {
    titre: { type: 'string', description: 'Une ligne : le mois et l’essentiel. Aucun chiffre qui ne soit dans la fiche.' },
    phrases: {
      type: 'array',
      description: 'De trois à six phrases courtes en français simple (deux à quatre en mode économe). Aucun chiffre qui ne soit dans la fiche.',
      items: { type: 'string' }
    }
  },
  required: ['titre', 'phrases'],
  additionalProperties: false
});

const RAPPEL_APRES_UN_REFUS =
  "RAPPEL : ta réponse précédente a été refusée parce qu'elle citait des nombres qui ne sont pas dans la fiche. Cette fois, n'écris que des nombres copiés de la fiche, tels quels, en chiffres, et rien de calculé.";

/**
 * La demande du résumé : consignes fixes, fiche en texte, schéma. `apresUnRefus` : un essai précédent a été refusé par
 * la garde des chiffres — un rappel est ajouté APRÈS la fiche (hors fiche : les nombres autorisés restent ceux de
 * `ficheTexte`).
 * @returns {{ system: string, userMessage: string, ficheTexte: string, jsonSchema: object }}
 */
export function demandeDuResume(fiche, { apresUnRefus = false } = {}) {
  const ficheTexte = rendreLaFicheDuMois(fiche);
  return { system: CONSIGNES_RESUME, userMessage: apresUnRefus ? `${ficheTexte}\n\n${RAPPEL_APRES_UN_REFUS}` : ficheTexte, ficheTexte, jsonSchema: SCHEMA_RESUME };
}

// ============================================================ la réponse de l'IA

/** La réponse n'a pas la forme demandée (schéma non respecté, titre ou phrases absents). */
export class ResumeInvalide extends Error {}

/** Les longueurs permises (caractères) : un texte plus long est coupé à la fin d'une phrase — la garde lit le texte coupé. */
export const LONGUEURS = Object.freeze({ titre: 100, phrase: 300, phrases: 6 });

/** Les balises qui fuient parfois d'un ancien format d'appel d'outil, retirées (même règle que bulletinPrompt.js). */
const sansBalises = (t) => String(t ?? '').replace(/<\/?[a-zA-Z_][\w:-]*(?:\s+[^<>]*)?>/g, '').replace(/[ \t]+\n/g, '\n').trim();

/** Coupe `texte` à `max` caractères, à la fin d'une phrase si possible (même règle que bulletinPrompt.js). */
export function couperProprement(texte, max) {
  if (texte.length <= max) return texte;
  const coupe = texte.slice(0, max);
  const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '));
  return fin >= max * 0.5 ? coupe.slice(0, fin + 1) : `${coupe.slice(0, max - 1).trimEnd()}…`;
}

/** Le texte de l'IA, contrôlé et nettoyé : { titre, phrases } ; lève ResumeInvalide si la forme n'est pas celle du schéma. */
export function lireLeResume(sortie) {
  if (!sortie || typeof sortie !== 'object' || Array.isArray(sortie)) throw new ResumeInvalide('la réponse n’est pas un objet');
  if (typeof sortie.titre !== 'string' || !sansBalises(sortie.titre)) throw new ResumeInvalide('« titre » manque ou est vide');
  if (!Array.isArray(sortie.phrases)) throw new ResumeInvalide('« phrases » manque');
  const phrases = sortie.phrases
    .filter((p) => typeof p === 'string' && sansBalises(p))
    .slice(0, LONGUEURS.phrases)
    .map((p) => couperProprement(sansBalises(p).replace(/\s+/g, ' '), LONGUEURS.phrase));
  if (!phrases.length) throw new ResumeInvalide('aucune phrase');
  return { titre: couperProprement(sansBalises(sortie.titre).replace(/\s+/g, ' '), LONGUEURS.titre), phrases };
}

/** Les champs NOMMÉS du résumé, un par un, pour la garde des chiffres (constat 13) : { titre, phrase1, phrase2, … }. */
export function champsDuResume(texte) {
  const champs = { titre: texte.titre };
  texte.phrases.forEach((p, i) => {
    champs[`phrase${i + 1}`] = p;
  });
  return champs;
}
