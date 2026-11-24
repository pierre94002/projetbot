/**
 * Lot « bulletin-comptes » (23/11/2026) : chaque tableau des fiches du bulletin dit combien de lignes il montre, et sur combien
 * quand il est coupé (« 3 lignes sur 7 ») ou, quand son total n'est pas dans la fiche, qu'il est coupé (sans nombre neuf).
 *   node --test test/bulletinComptes.test.mjs        (depuis server/)
 *
 * D'OÙ : le bulletin du 18/11/2026 a été refusé trois fois puis abandonné. L'IA avait écrit « Trois chutes de cote ressortent » et
 * « Pour ces trois lignes » : elle comptait les lignes du tableau des chutes de cote (3 montrées, limite du mode normal) alors que
 * la fiche ne disait que le TOTAL des chutes. Le compte était vrai, mais absent de la fiche : la garde des chiffres
 * (gardeDesChiffres.js) avait raison de le refuser. La garde NE CHANGE PAS ; c'est la fiche qui dit désormais le compte.
 * bulletinFiches.js est ÉPINGLÉ (test/aides/enService.mjs, EPINGLES_HORS_MANIFESTE ; miseFrontiere.test.mjs T-X14) : le lot ne le
 * touche pas, tout se lit dans la fiche telle qu'elle est.
 *
 * Pur : aucune base, aucun réseau, aucun appel à Claude (les entrées sont celles de test/aides/decorBulletins.mjs, retouchées ici).
 *
 *  T-BC1  le cas du 18/11 : 7 chutes, 3 montrées → « 3 lignes sur 7 » ; « Trois chutes de cote » et « ces trois lignes » acceptés ;
 *         témoin : la même fiche sans le compte refuse « trois » (le 3 n'est nulle part ailleurs) ; le prix connu du compte.
 *  T-BC2  le mode économe (1 chute montrée sur 7) et un tableau non coupé (2 chutes : « 2 lignes », sans « sur ») ; les values
 *         vertes avec et sans le masque des buts.
 *  T-BC3  les autres tableaux du jour : favoris (10 sur 14), contrôles en échec (5 sur 7), compositions lues chez FotMob (FILTRÉ,
 *         pas coupé : « 1 ligne », jamais « sur »).
 *  T-BC4  la fiche de la semaine : par marché et par championnat (coupés : « d'autres … non montrés », déduit de la fiche) ; témoin
 *         non coupé.
 *  T-BC5  le carnet de l'IA : son compte après sa phrase d'avant, inchangée (« : 4 lignes sur 5 »).
 *  T-BC6  les tableaux dont le total n'est pas dans la fiche : avis de l'IA par marché (coupe exacte), meilleurs / pires paris et
 *         championnats (à la limite du mode : « d'autres … peuvent exister »), cases vertes (« sur M ») ; témoins sous la limite.
 *  T-BC7  une semaine chargée : les titres de rubrique d'avant restent des lignes en majuscules à l'octet (le contrôle « aucune
 *         rubrique en moins » de script-bulletins-service.mjs les lit) et sont les mêmes en normal et en économe ; dans les deux
 *         fiches et les deux modes, chaque tableau a son compte juste au-dessus.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/core/ai/bulletinFiches.js';
import * as P from '../src/core/ai/bulletinPrompt.js';
import { verifierLesChiffres, autorisationsDeLaFiche, NOMBRES_EN_LETTRES } from '../src/core/ai/gardeDesChiffres.js';
import { entreesDuJour, entreesDeLaSemaine } from './aides/decorBulletins.mjs';
import { masqueEnService } from '../src/data/masqueDesButs.js';

const LETTRES = 'ABCDEFGHIJKLMNOP';

/** Les entrées du jour, avec `n` chutes de cote (aucune value verte), 12 values vertes sur 7 jours, et 2 contrôles en échec sur 2. */
function jourAvecChutes(n) {
  const e = entreesDuJour();
  const modele = e.opportunites.lignes.find((l) => l.chute);
  const chutes = Array.from({ length: n }, (_, i) => ({
    ...modele,
    home: `Domicile ${LETTRES[i]}`,
    away: `Exterieur ${LETTRES[i]}`,
    cle: `Domicile ${LETTRES[i]}-Exterieur ${LETTRES[i]}|Match nul`,
    matchId: `essai-chute-${LETTRES[i]}`,
    mouvement: { dropPct: 9 - i * 0.5 }
  }));
  return {
    ...e,
    opportunites: { ...e.opportunites, resume: { vertes: 12 }, lignes: chutes },
    // Contrôle lu à 4 h 20 (heure de Paris) : l'heure d'origine (3 h 10) mettait un 3 dans la fiche, qui aurait autorisé « trois »
    // sans le compte de l'en-tête (le témoin de T-BC1 ne prouverait plus rien).
    controle: { ...e.controle, enEchecTotal: 2, le: '2026-10-05T02:20:00.000Z' }
  };
}

/**
 * Une semaine chargée, comme celle de test/aides/script-bulletins-service.mjs (le contrôle « aucune rubrique en moins ») : 40
 * pronostics sur 8 marchés et 8 championnats, 14 paris (7 gagnés, 7 perdus), 8 matchs analysés (deux erreurs chacun), 8 marchés au
 * carnet de l'IA.
 */
function semaineChargee() {
  const charge = entreesDeLaSemaine();
  const marches = [['result', 'Résultat'], ['totalGoals', 'Total buts'], ['bothTeamsScore', 'Les 2 équipes marquent'], ['teamCorners', 'Corners'], ['totalShots', 'Tirs'], ['totalCorners', 'Total corners'], ['totalShotsOnTarget', 'Tirs cadrés'], ['teamGoals', 'Buts d’une équipe']];
  const ligues = ['EPL', 'Ligue 1', 'Serie A', 'La Liga - Spain', 'Bundesliga - Germany', 'Eredivisie', 'Liga Portugal', 'MLS'];
  for (let k = 0; k < 40; k++) {
    const [marketId, market] = marches[k % marches.length];
    charge.pronostics.push({ id: `p${k}`, status: k % 3 ? 'correct' : 'incorrect', marketId, market, league: ligues[k % ligues.length], settledAt: '2026-10-01T22:00:00.000Z', homeName: 'A', awayName: 'B' });
  }
  for (let k = 0; k < 14; k++) {
    charge.paris.push({ id: `b${k}`, status: k % 2 ? 'won' : 'lost', stake: 5 + k, odds: 1.5 + k / 10, createdAt: '2026-09-29T10:00:00.000Z', settledAt: '2026-10-02T21:00:00.000Z', legs: [{ matchId: `x${k}`, homeName: `Club ${k}`, awayName: `Autre ${k}`, league: ligues[k % ligues.length], market: 'Résultat', marketId: 'result', pick: `Club ${k} gagne`, odds: 1.5 + k / 10, status: k % 2 ? 'won' : 'lost' }], bookmaker: 'winamax_fr', bookmakerTitle: 'Winamax (FR)' });
  }
  marches.forEach(([marketId, market], k) => {
    const jourDuMatch = `2026-10-0${1 + (k % 4)}`;
    charge.analyses.push({ homeName: `Chargé ${k}`, awayName: `Semaine ${k}`, league: ligues[k], commenceTime: `${jourDuMatch}T19:00:00.000Z`, postMatchReview: { createdAt: `${jourDuMatch}T23:00:00.000Z`, marketReviews: [0, 1, 2].map((j) => ({ market, marketId, pick: `pronostic ${market} ${j}`, aiVerdict: 'confirme', aiConfidence: j === 1 ? 'moyenne' : 'forte', aiWasRight: j === 0, outcome: j === 0 ? 'juste' : 'faux', minOdds: 1.2 })) } });
  });
  charge.carnet.carnet.types = marches.map(([marketType, label], k) => ({ marketType, label, bilan: { aiVerdicts: 100 + k, aiRight: 50 + k } }));
  return charge;
}

const enTete = (texte, debut) => texte.split('\n').find((l) => l.startsWith(debut)) ?? null;
/** La ligne qui suit la ligne `titre` (à l'octet), ou null. */
const ligneApres = (texte, titre) => {
  const lignes = texte.split('\n');
  const i = lignes.indexOf(titre);
  return i >= 0 ? lignes[i + 1] ?? null : null;
};
/** Le filtre des titres de rubrique de la semaine, recopié de test/aides/script-bulletins-service.mjs (le contrôle « aucune rubrique en moins »). */
const titresMajuscules = (t) => t.split('\n').filter((l) => l.length > 8 && l === l.toUpperCase() && /[A-Z]{4}/.test(l) && !l.startsWith('FICHE') && !l.startsWith('|') && !l.startsWith('CE SONT'));
/** Chaque tableau (sa ligne d'en-tête « | … | », la première de son bloc) a son compte sur la ligne juste au-dessus. */
function tableauxSansCompte(texte) {
  const lignes = texte.split('\n');
  const compte = /\b\d+ lignes?\b|\(\d+( sur \d+)?[,)]/;
  return lignes.filter((l, i) => l.startsWith('| ') && !(lignes[i - 1] ?? '').startsWith('| ') && !compte.test(lignes[i - 1] ?? '')).map((l, i) => `${l} (après « ${lignes[lignes.indexOf(l) - 1]} »)`);
}

test('T-BC1 le cas du 18/11 : 7 chutes, 3 montrées → « 3 lignes sur 7 » ; « Trois chutes de cote » accepté, sans le compte refusé', () => {
  const fiche = F.construireLaFicheDuJour(jourAvecChutes(7));
  assert.equal(fiche.opportunites.chutes, 7);
  assert.equal(fiche.opportunites.chutesRetenues.length, 3, 'la limite du mode normal (LIMITES.normal.chutes)');
  const texte = P.rendreLaFicheDuJour(fiche);
  assert.equal(enTete(texte, 'CHUTES DE COTE'), "CHUTES DE COTE (sans value verte, la plus forte d'abord, 3 lignes sur 7)");

  // Les deux phrases refusées le 18/11 (bulletin abandonné après trois essais) : acceptées désormais.
  const textes = {
    resume: "Aucune value verte : pas de pari aujourd'hui. Trois chutes de cote ressortent, sans value verte.",
    opportunites: 'Pour ces trois lignes, la cote vient de vos bookmakers.'
  };
  const avec = verifierLesChiffres({ textes, fiche: texte });
  assert.equal(avec.ok, true, JSON.stringify(avec.refuses));

  // Témoin : la MÊME fiche sans le compte (l'en-tête d'avant le correctif) refuse « Trois » et « trois » — le 3 n'est nulle part
  // ailleurs dans la fiche : c'est bien le compte de l'en-tête qui l'autorise.
  const sansLeCompte = texte.replace("CHUTES DE COTE (sans value verte, la plus forte d'abord, 3 lignes sur 7)", "CHUTES DE COTE (sans value verte, la plus forte d'abord)");
  assert.notEqual(sansLeCompte, texte);
  const sans = verifierLesChiffres({ textes, fiche: sansLeCompte });
  assert.equal(sans.ok, false);
  assert.deepEqual(sans.refuses.map((r) => [r.nombre, r.valeur, r.champ]), [['Trois', 3, 'resume'], ['trois', 3, 'opportunites']]);

  // Le PRIX connu du compte (relecture indépendante du 23/11, C3) : la garde ne lit que les nombres, pas leur sens ; le 3 du compte
  // laisse donc aussi passer une phrase FAUSSE qu'elle refusait avant (« trois chutes » : il y en a 7). C'est la limite de la garde,
  // déjà ouverte dès qu'un 3 est ailleurs dans la fiche (le cas ordinaire) ; accepté face aux bulletins perdus (25/10, 18/11).
  const faussePhrase = { resume: "Il y a trois chutes de cote aujourd'hui." };
  assert.equal(verifierLesChiffres({ textes: faussePhrase, fiche: texte }).ok, true, 'le prix du compte, écrit ici pour ne pas être découvert plus tard');
  assert.equal(verifierLesChiffres({ textes: faussePhrase, fiche: sansLeCompte }).ok, false);

  // La garde refuse toujours un nombre absent de la fiche (contrôle de la garde elle-même, inchangée).
  const { valeurs } = autorisationsDeLaFiche(texte);
  const absent = Object.entries(NOMBRES_EN_LETTRES).find(([, v]) => !valeurs.has(String(v)));
  assert.ok(absent, 'au moins un nombre en lettres absent de la fiche');
  const faux = verifierLesChiffres({ textes: { resume: `${absent[0][0].toUpperCase()}${absent[0].slice(1)} chutes de cote ressortent.` }, fiche: texte });
  assert.equal(faux.ok, false);
  assert.equal(faux.refuses[0].valeur, absent[1]);
});

test('T-BC2 le mode économe dit « 1 ligne sur 7 » ; un tableau non coupé dit « 2 lignes », sans « sur » ; les values vertes avec et sans le masque', () => {
  const econome = P.rendreLaFicheDuJour(F.construireLaFicheDuJour(jourAvecChutes(7), { econome: true }));
  assert.equal(enTete(econome, 'CHUTES DE COTE'), "CHUTES DE COTE (sans value verte, la plus forte d'abord, 1 ligne sur 7)");
  const entier = P.rendreLaFicheDuJour(F.construireLaFicheDuJour(jourAvecChutes(2)));
  assert.equal(enTete(entier, 'CHUTES DE COTE'), "CHUTES DE COTE (sans value verte, la plus forte d'abord, 2 lignes)");
  // Les values vertes de la fiche ordinaire (2 vertes, dont « Plus de 2,5 buts ») : sans masque (null), les 2 sont montrées ; avec
  // le masque des buts EN SERVICE (lot 0, actif depuis le 15/11), la ligne de buts est retirée et le total reste celui du Repérage.
  const ficheOrdinaire = F.construireLaFicheDuJour(entreesDuJour());
  assert.equal(enTete(P.rendreLaFicheDuJour(ficheOrdinaire, null), 'VALUES VERTES'), "VALUES VERTES (la plus forte d'abord, 2 lignes)");
  assert.equal(masqueEnService()?.actif, true, 'le masque des buts est en service (sinon cette attente change : la dire)');
  const avecMasque = P.rendreLaFicheDuJour(ficheOrdinaire);
  assert.equal(enTete(avecMasque, 'VALUES VERTES'), "VALUES VERTES (la plus forte d'abord, 1 ligne sur 2)");
  assert.equal(enTete(avecMasque, 'CHUTES DE COTE'), "CHUTES DE COTE (sans value verte, la plus forte d'abord, 1 ligne)");
});

test('T-BC3 les autres tableaux du jour disent leur compte : favoris (10 sur 14), contrôles en échec (5 sur 7), compositions', () => {
  const e = entreesDuJour();
  const modele = e.matchs.find((m) => m.home === 'Arsenal');
  const favoris = Array.from({ length: 12 }, (_, i) => ({
    ...modele,
    cle: `EPL|Club ${LETTRES[i]}|Rival ${LETTRES[i]}|${e.jour}`,
    home: `Club ${LETTRES[i]}`,
    away: `Rival ${LETTRES[i]}`,
    favori: { championnat: true, equipes: [] },
    compo: null
  }));
  const enEchec = Array.from({ length: 7 }, (_, i) => ({ libelle: `Contrôle ${LETTRES[i]}`, statut: i % 2 ? 'orange' : 'rouge', total: 1 }));
  const entrees = { ...e, matchs: [...e.matchs, ...favoris], controle: { ...e.controle, enEchecTotal: 7, enEchec } };
  const fiche = F.construireLaFicheDuJour(entrees);
  const texte = P.rendreLaFicheDuJour(fiche);
  assert.equal(fiche.favoris.matchs.length, 10);
  assert.equal(enTete(texte, 'MATCHS DE VOS FAVORIS'), `MATCHS DE VOS FAVORIS (le plus tôt d'abord, 10 lignes sur ${fiche.favoris.matchsDuJour})`);
  assert.equal(fiche.favoris.matchsDuJour, 14, 'les 12 ajoutés + Arsenal et Lyon');
  assert.equal(fiche.controle.enEchec.length, 5);
  assert.equal(enTete(texte, 'CONTRÔLES EN ÉCHEC'), 'CONTRÔLES EN ÉCHEC (5 lignes sur 7)');
  assert.match(texte, /\(2 autres contrôles en échec non listés\)/);
  // En économe : les limites du mode (favoris 5, contrôles 3).
  const econome = P.rendreLaFicheDuJour(F.construireLaFicheDuJour(entrees, { econome: true }));
  assert.equal(enTete(econome, 'MATCHS DE VOS FAVORIS'), `MATCHS DE VOS FAVORIS (le plus tôt d'abord, ${F.LIMITES.econome.favoris} lignes sur 14)`);
  assert.equal(enTete(econome, 'CONTRÔLES EN ÉCHEC'), `CONTRÔLES EN ÉCHEC (${F.LIMITES.econome.controle} lignes sur 7)`);
  // Les compositions : seules celles lues chez FotMob sont en tableau (Lyon - Nice), sur les matchs de la fiche. Le tableau est
  // FILTRÉ, pas coupé : son compte ne dit jamais « sur » (les matchs concernés sont comptés dans la phrase juste au-dessus).
  const ordinaire = F.construireLaFicheDuJour(entreesDuJour());
  assert.ok(ordinaire.compositions.matchsConcernes > ordinaire.compositions.matchs.length, 'des matchs concernés sans composition FotMob');
  assert.equal(enTete(P.rendreLaFicheDuJour(ordinaire), 'COMPOSITIONS LUES CHEZ FOTMOB'), 'COMPOSITIONS LUES CHEZ FOTMOB (1 ligne)');
  assert.equal(ordinaire.compositions.matchs.length, 1);
  // Plus aucun tableau sans son compte dans la fiche du jour (normal et économe).
  assert.deepEqual(tableauxSansCompte(texte), []);
  assert.deepEqual(tableauxSansCompte(econome), []);
});

test('T-BC4 la fiche de la semaine : par marché et par championnat (coupés : « d’autres … non montrés », sans nombre neuf) ; témoin non coupé', () => {
  const e = entreesDeLaSemaine();
  // La coupe se lit dans la fiche telle qu'elle est : les réglés des lignes montrées n'atteignent pas le total des réglés.
  const marches = ['result', 'totalGoals', 'bothTeamsScore', 'corners', 'cards', 'shots', 'shotsOnTarget', 'doubleChance'];
  const ligues = ['EPL', 'Ligue 1', 'Serie A', 'La Liga', 'Bundesliga', 'Eredivisie', 'Liga Portugal'];
  const ajout = marches.map((m, i) => ({ id: `bc-${i}`, status: i % 2 ? 'incorrect' : 'correct', marketId: m, market: m, league: ligues[i % ligues.length], settledAt: '2026-10-01T18:00:00.000Z', homeName: 'A', awayName: 'B' }));
  const entrees = { ...e, pronostics: [...e.pronostics, ...ajout] };
  const fiche = F.construireLaFicheDeLaSemaine(entrees);
  assert.equal(fiche.pronostics.parMarche.length, 6, 'la limite du mode normal (LIMITES.normal.parMarche)');
  assert.equal(fiche.pronostics.parChampionnat.length, 5);
  assert.ok(fiche.pronostics.parMarche.reduce((s, g) => s + g.regles, 0) < fiche.pronostics.regles, 'des marchés réglés ne sont pas montrés');
  const texte = P.rendreLaFicheDeLaSemaine(fiche);
  assert.equal(enTete(texte, 'PAR MARCHÉ'), "PAR MARCHÉ (le plus fourni d'abord, 6 lignes ; d'autres marchés non montrés)");
  assert.equal(enTete(texte, 'PAR CHAMPIONNAT'), "PAR CHAMPIONNAT (le plus fourni d'abord, 5 lignes ; d'autres championnats non montrés)");
  // En économe : les limites du mode (4 marchés, 3 championnats), toujours coupés.
  const econome = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(entrees, { econome: true }));
  assert.equal(enTete(econome, 'PAR MARCHÉ'), `PAR MARCHÉ (le plus fourni d'abord, ${F.LIMITES.econome.parMarche} lignes ; d'autres marchés non montrés)`);
  assert.equal(enTete(econome, 'PAR CHAMPIONNAT'), `PAR CHAMPIONNAT (le plus fourni d'abord, ${F.LIMITES.econome.parChampionnat} lignes ; d'autres championnats non montrés)`);
  // Témoin : la semaine d'essai telle quelle n'est pas coupée → le compte seul, sans « d'autres ».
  const entiere = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(e));
  assert.match(enTete(entiere, 'PAR MARCHÉ'), /^PAR MARCHÉ \(le plus fourni d'abord, \d+ lignes?\)$/);
  assert.match(enTete(entiere, 'PAR CHAMPIONNAT'), /^PAR CHAMPIONNAT \(le plus fourni d'abord, \d+ lignes?\)$/);
});

test('T-BC5 le carnet de l’IA dit son compte APRÈS sa phrase d’avant, inchangée (bulletins.test.mjs le lit à l’octet)', () => {
  const type = (marketType, label, aiVerdicts, aiRight) => ({ marketType, label, bilan: { aiVerdicts, aiRight } });
  const c = entreesDeLaSemaine();
  c.carnet.carnet.types = [
    type('result', 'Résultat', 300, 170),
    type('totalGoals', 'Total buts', 40, 12),
    type('bothTeamsScore', 'Les deux équipes marquent', 25, 20),
    type('totalCorners', 'Total corners', 19, 2),
    type('totalShots', 'Total tirs', 100, 60),
    type('totalShotsOnTarget', 'Total tirs cadrés', 50, 25)
  ];
  // Économe : quatre marchés montrés sur cinq jugés, celui du milieu compté.
  const econome = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(c, { econome: true }));
  assert.equal(enTete(econome, "Marchés d'au moins"), "Marchés d'au moins 20 avis, du moins fiable au plus fiable (1 marché du milieu non montré) : 4 lignes sur 5");
  // Normal : les cinq montrés, rien du milieu.
  const normal = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(c));
  assert.equal(enTete(normal, "Marchés d'au moins"), "Marchés d'au moins 20 avis, du moins fiable au plus fiable : 5 lignes");
});

test('T-BC6 les tableaux dont le total n’est pas dans la fiche : avis de l’IA, meilleurs / pires paris, championnats, cases vertes', () => {
  const fiche = F.construireLaFicheDeLaSemaine(entreesDeLaSemaine());
  const N = F.LIMITES.normal;
  const E = F.LIMITES.econome;
  const texte = P.rendreLaFicheDeLaSemaine(fiche);
  // La semaine d'essai est sous toutes les limites : les comptes seuls, sans note.
  assert.equal(enTete(texte, 'SES AVIS PAR MARCHÉ'), `SES AVIS PAR MARCHÉ (${fiche.ia.semaine.parMarche.length} ${fiche.ia.semaine.parMarche.length > 1 ? 'lignes' : 'ligne'})`);
  assert.equal(ligneApres(texte, 'MEILLEURS PARIS'), `(${fiche.paris.meilleurs.length} ${fiche.paris.meilleurs.length > 1 ? 'lignes' : 'ligne'})`);
  assert.equal(ligneApres(texte, 'PIRES PARIS'), `(${fiche.paris.pires.length} ${fiche.paris.pires.length > 1 ? 'lignes' : 'ligne'})`);
  const nCh = fiche.championnats.rentables.length + fiche.championnats.perdants.length;
  assert.equal(ligneApres(texte, 'VOS PARIS DE LA SEMAINE, CHAMPIONNAT PAR CHAMPIONNAT'), `(les rentables d'abord, ${nCh} ${nCh > 1 ? 'lignes' : 'ligne'}, sans les championnats à gain nul)`);
  assert.equal(enTete(texte, 'CASES VERTES'), `CASES VERTES (${fiche.championnats.carteOuParier.listeDesVertes.length} ${fiche.championnats.carteOuParier.listeDesVertes.length > 1 ? 'lignes' : 'ligne'})`);

  // SES AVIS PAR MARCHÉ : la coupe est EXACTE (chaque avis compté tombe dans un seul groupe). Six lignes de 4 avis (24) sur 30 avis
  // → coupé ; témoin : 24 avis en tout, six lignes pile (la limite atteinte sans coupe) → pas de note.
  const avis = (i) => ({ libelle: `Marché d’essai ${LETTRES[i]}`, avis: 4, tenus: 2, tauxPct: 50 });
  const coupe = structuredClone(fiche);
  coupe.ia.semaine.parMarche = Array.from({ length: N.carnet }, (_, i) => avis(i));
  coupe.ia.semaine.avis = 30;
  assert.equal(enTete(P.rendreLaFicheDeLaSemaine(coupe), 'SES AVIS PAR MARCHÉ'), `SES AVIS PAR MARCHÉ (${N.carnet} lignes ; d'autres marchés non montrés)`);
  const pile = structuredClone(coupe);
  pile.ia.semaine.avis = 4 * N.carnet;
  assert.equal(enTete(P.rendreLaFicheDeLaSemaine(pile), 'SES AVIS PAR MARCHÉ'), `SES AVIS PAR MARCHÉ (${N.carnet} lignes)`);

  // MEILLEURS / PIRES PARIS et CHAMPIONNATS : à la limite du mode, la note ; en économe, la limite du mode économe.
  const pari = (i, gain) => ({ pari: `Essai ${LETTRES[i]} : Essai gagne`, cote: 2, mise: 5, gain, bookmaker: 'Winamax (FR)' });
  const champ = (i, gain) => ({ championnat: `Championnat d’essai ${LETTRES[i]}`, regles: 2, gagnes: 1, perdus: 1, gain, roiPct: gain > 0 ? 5 : -5 });
  const pleine = structuredClone(fiche);
  pleine.paris.meilleurs = Array.from({ length: N.extremes }, (_, i) => pari(i, 4));
  pleine.paris.pires = Array.from({ length: N.extremes }, (_, i) => pari(i, -5));
  pleine.championnats.rentables = [champ(0, 3)];
  pleine.championnats.perdants = Array.from({ length: N.ligues }, (_, i) => champ(i + 1, -2));
  const t = P.rendreLaFicheDeLaSemaine(pleine);
  assert.equal(ligneApres(t, 'MEILLEURS PARIS'), `(${N.extremes} lignes ; la limite de la fiche : d'autres paris gagnants peuvent exister)`);
  assert.equal(ligneApres(t, 'PIRES PARIS'), `(${N.extremes} lignes ; la limite de la fiche : d'autres paris perdants peuvent exister)`);
  assert.equal(ligneApres(t, 'VOS PARIS DE LA SEMAINE, CHAMPIONNAT PAR CHAMPIONNAT'), `(les rentables d'abord, ${N.ligues + 1} lignes, sans les championnats à gain nul ; la limite de la fiche : d'autres championnats peuvent exister)`);
  const econome = structuredClone(pleine);
  econome.mode = 'econome';
  econome.paris.meilleurs = econome.paris.meilleurs.slice(0, E.extremes);
  econome.paris.pires = econome.paris.pires.slice(0, E.extremes - 1);
  econome.championnats.rentables = Array.from({ length: E.ligues }, (_, i) => champ(i, 3));
  econome.championnats.perdants = [];
  const te = P.rendreLaFicheDeLaSemaine(econome);
  assert.equal(ligneApres(te, 'MEILLEURS PARIS'), `(${E.extremes} lignes ; la limite de la fiche : d'autres paris gagnants peuvent exister)`);
  assert.equal(ligneApres(te, 'PIRES PARIS'), `(${E.extremes - 1} ${E.extremes - 1 > 1 ? 'lignes' : 'ligne'})`, 'sous la limite économe : pas de note');
  assert.equal(ligneApres(te, 'VOS PARIS DE LA SEMAINE, CHAMPIONNAT PAR CHAMPIONNAT'), `(les rentables d'abord, ${E.ligues} lignes, sans les championnats à gain nul ; la limite de la fiche : d'autres championnats peuvent exister)`);

  // CASES VERTES : « sur M » (M = les cases vertes de la carte) quand la liste est coupée (5 en normal, 3 en économe).
  const vertes = structuredClone(fiche);
  vertes.championnats.carteOuParier.vertes = 7;
  vertes.championnats.carteOuParier.listeDesVertes = Array.from({ length: N.casesVertes }, (_, i) => ({ championnat: `Championnat ${LETTRES[i]}`, marche: 'Résultat (1N2)', matchs: 100 + i }));
  assert.equal(enTete(P.rendreLaFicheDeLaSemaine(vertes), 'CASES VERTES'), `CASES VERTES (${N.casesVertes} lignes sur 7)`);
});

test('T-BC7 une semaine chargée : les titres d’avant restent à l’octet et les mêmes en économe ; chaque tableau des deux fiches a son compte', () => {
  const charge = semaineChargee();
  const n = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(charge, { econome: false }));
  const e = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(charge, { econome: true }));
  // Le contrôle « aucune rubrique en moins » (script-bulletins-service.mjs, lu par bulletins.test.mjs) voit de nouveau ses quatre
  // titres d'avant le lot, en normal comme en économe (la relecture du 23/11 l'avait vu réduit à « LES CHAMPIONNATS »).
  const attendus = ['MEILLEURS PARIS', 'PIRES PARIS', 'LES CHAMPIONNATS', 'VOS PARIS DE LA SEMAINE, CHAMPIONNAT PAR CHAMPIONNAT'];
  for (const titre of attendus) {
    assert.ok(titresMajuscules(n).includes(titre), `normal : « ${titre} » est un titre`);
    assert.ok(titresMajuscules(e).includes(titre), `économe : « ${titre} » est un titre`);
  }
  assert.deepEqual(titresMajuscules(e), titresMajuscules(n), 'aucune rubrique en moins');
  // La semaine chargée coupe vraiment les meilleurs et les pires paris (7 gagnés, 7 perdus) : la note, dans les deux modes.
  assert.equal(ligneApres(n, 'MEILLEURS PARIS'), `(${F.LIMITES.normal.extremes} lignes ; la limite de la fiche : d'autres paris gagnants peuvent exister)`);
  assert.equal(ligneApres(e, 'PIRES PARIS'), `(${F.LIMITES.econome.extremes} lignes ; la limite de la fiche : d'autres paris perdants peuvent exister)`);
  // Les en-têtes des tableaux (coupés avant « ( » ou « : » ; quand le compte est sur sa propre ligne « (…) », le titre juste
  // au-dessus) : les mêmes en normal et en économe.
  const entetes = (t) => {
    const ls = t.split('\n');
    return ls
      .map((l, i) => ((ls[i + 1] ?? '').startsWith('| ') && !l.startsWith('| ') ? (l.startsWith('(') ? ls[i - 1] : l) : null))
      .filter((l) => l !== null)
      .map((l) => l.split(' (')[0].split(' :')[0]);
  };
  assert.deepEqual(entetes(e), entetes(n));
  // Chaque tableau, dans les deux fiches et les deux modes, a son compte juste au-dessus.
  assert.deepEqual(tableauxSansCompte(n), []);
  assert.deepEqual(tableauxSansCompte(e), []);
  for (const econome of [false, true]) assert.deepEqual(tableauxSansCompte(P.rendreLaFicheDuJour(F.construireLaFicheDuJour(jourAvecChutes(7), { econome }))), [], `jour, économe ${econome}`);
});
