/**
 * Le BULLETIN DU JOUR et le BILAN DE LA SEMAINE (étape 42 du plan, 22/10/2026) : deux textes écrits par l'IA, un appel à Claude Code
 * par jour et par semaine, sur une fiche chiffrée que le code prépare sans token.
 *   node --test test/bulletins.test.mjs        (depuis server/)
 *
 * AUCUN vrai appel : Claude est SIMULÉ (test/aides/decorBulletins.mjs : la réponse du CLI est fabriquée, le reste de callClaudeCode —
 * contrôles et journal — tourne pour de vrai ; le test refuse de s'installer si un jeton ou l'exécutable existent). Les parties pures
 * (la garde des chiffres, les constructeurs de fiches, le texte envoyé à l'IA) tournent ici ; tout le reste dans des copies ISOLÉES de
 * la base d'essai (isolement.mjs : réseau coupé, heure figée au 05/10/2026 12 h UTC), avec des valeurs attendues recalculées par un
 * SECOND chemin (la route d'analyse d'un match de Mes paris, la page des Chutes de cotes, du SQL, des boucles écrites à la main).
 *
 *  1. La garde des chiffres : tout nombre du texte qui n'est pas dans la fiche fait refuser le texte (et pourquoi refuser).
 *  2. Les fiches (pures) : ce qu'elles trient, tronquent, comptent ; le mode économe ; ce qui est « rien à dire » et ce qui est « on ne
 *     sait pas » ; la composition dite comme l'écran ; les semaines (lundi → dimanche).
 *  3. Les fiches lues dans la base d'essai : le jour (opportunités, favoris, compositions, contrôle) et la semaine (pronostics,
 *     paris, valeur de clôture, IA, championnats), chaque chiffre retrouvé par un autre chemin.
 *  4. Le service : un seul bulletin par jour et un seul bilan par semaine, le rattrapage ; le budget de l'étape 4 (journal, plafond de
 *     150, mode économe) ; les pannes ; rien à dire ; l'écriture par atomicJson ; les deux étapes de l'actualisation ; la route.
 *  5. L'hygiène : pas d'API payante, pas un fichier du moteur.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { entreesDuJour, entreesDeLaSemaine } from './aides/decorBulletins.mjs';

const imp = (rel) => import(pathToFileURL(path.join(SERVEUR, 'src', rel)).href);
const G = await imp('core/ai/gardeDesChiffres.js');
const F = await imp('core/ai/bulletinFiches.js');
const P = await imp('core/ai/bulletinPrompt.js');
const UI = path.resolve(SERVEUR, '..', 'ui');
const interfacePrete = fs.existsSync(path.join(UI, 'src', 'utils', 'langageParis.js'));

const script = (nom) => path.join(SERVEUR, 'test', 'aides', nom);

/** Exécute une phase d'un script d'essai dans une copie neuve et rend son JSON (l'échec lisible sinon). */
function lancer(nom, phase) {
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, script(nom), { args: [phase], timeout: 300_000, env: { CLAUDE_CODE_BIN: path.join(copie.dossier, 'pas-de-claude-ici.exe'), MATCH_STATS_AUTO_REFRESH: 'false' } });
    assert.equal(r.code, 0, `${nom} ${phase} a échoué :\n${r.erreurs.slice(-4000)}\n${r.sortie.slice(-1500)}`);
    assert.ok(r.json?.ok, `${nom} ${phase} : sortie illisible\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, `${nom} ${phase} : un appel réseau a été tenté\n${r.erreurs.slice(-2000)}`);
    return r.json;
  } finally {
    copie.nettoyer();
  }
}
const uneFois = (fabrique) => {
  let valeur;
  return () => (valeur ??= fabrique());
};
const service = (phase) => uneFois(() => lancer('script-bulletins-service.mjs', phase));
const fiches = (phase) => uneFois(() => lancer('script-bulletins-fiches.mjs', phase));

const unePhase = {
  uneFois: service('une-fois'),
  budget: service('budget'),
  econome: service('econome'),
  pannes: service('pannes'),
  rien: service('rien'),
  ecriture: service('ecriture'),
  etapes: service('etapes'),
  route: service('route'),
  jour: fiches('jour'),
  semaine: fiches('semaine')
};

/** Les nombres français s'écrivent avec des espaces insécables (milliers) : comparés en espaces simples. */
const espaces = (t) => String(t).replace(/[  ]/g, ' ');
const proche = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message ?? ''} : ${a} ≠ ${b} (à ${tolerance} près)`);

// ================================================================================ 1. la garde des chiffres

test('garde : les nombres d’un texte, quelle que soit l’écriture — virgule ou point, milliers, heures, dates, signes, plages ; jamais un nom (N2, U21, 1N2)', () => {
  const cles = (t) => G.nombresEnChiffres(t).map((n) => n.cle);
  assert.deepEqual(cles('cote 2,20 puis 2.5 et 02'), ['2.2', '2.5', '2']);
  assert.deepEqual(cles('gain de 1 234,50 € sur 12 034 pronostics'), ['1234.5', '12034'], 'les groupes de milliers sont réunis');
  assert.deepEqual(cles('cote 2,20 150 fois'), ['2.2', '150'], 'la partie décimale d’un nombre ne se colle jamais au nombre suivant');
  assert.deepEqual(cles('à 21h30, le 22/10/2026'), ['21', '30', '22', '10', '2026'], '« 21h30 » : les deux nombres sont lus');
  assert.deepEqual(cles('à 21:30 ou 21 h 30'), ['21', '30', '21', '30']);
  assert.deepEqual(cles('perte de −3,2 pts, soit -4'), ['3.2', '4'], 'la valeur absolue : « perte » et « gain » portent le signe');
  assert.deepEqual(cles('score 2-1, entre 3 et 5'), ['2', '1', '3', '5']);
  assert.deepEqual(cles('un 58 % de réussite'), ['58']);
  assert.deepEqual(cles('le marché 1N2 et 1X2, N2, U21, J7, xG2'), [], 'les noms ne sont pas des nombres');
  assert.deepEqual(cles('1er'), ['1'], 'un quantième « 1er » est le nombre 1');
  assert.deepEqual(G.nombresEnChiffres('x 1,95').map((n) => [n.texte, n.valeur]), [['1,95', 1.95]]);
});

test('garde : un nombre qui n’est pas dans la fiche fait refuser le texte — cote inventée, pourcentage arrondi ou recalculé, total fait par l’IA', () => {
  const fiche = 'Arsenal - Chelsea | 21 h 00 | cote 2,20 | proba 57,6 % | value +6,1 % | 3 lignes lues | 22/10/2026';
  const garde = (texte) => G.verifierLesChiffres({ fiche, textes: { texte } });
  assert.equal(garde('Arsenal à 2,20 vers 21 h, value de 6,1 %, 3 lignes le 22/10.').ok, true, 'tous ses nombres sont ceux de la fiche');
  // Une cote inventée.
  const inventee = garde('Une cote de 1,95 chez Unibet.');
  assert.equal(inventee.ok, false);
  assert.deepEqual(inventee.refuses.map((r) => [r.nombre, r.champ]), [['1,95', 'texte']]);
  assert.match(inventee.refuses[0].extrait, /1,95/);
  // Arrondi : « 58 % » n’est pas « 57,6 % » — l’IA reprend, elle n’arrondit pas.
  assert.equal(garde('Probabilité de 58 %.').ok, false);
  assert.equal(garde('Probabilité de 57,6 %.').ok, true);
  assert.equal(garde('Probabilité de 57.6 pour cent.').ok, true, '« pour cent » n’est pas un nombre, 57.6 est celui de la fiche');
  // Un total fait par l’IA (3 + 22 = 25) : le 25 n’est pas dans la fiche.
  assert.equal(garde('Cela fait 25 au total.').ok, false);
  // La même valeur, une autre écriture : acceptée.
  assert.equal(garde('Cote 2,2 et 2.20, value 6,10 %.').ok, true);
  // Plusieurs fautes, plusieurs champs : toutes dites, une fois chacune par champ.
  const deux = G.verifierLesChiffres({ fiche, textes: { titre: 'Bulletin de 99 pronostics', resume: 'Cote 7,77, puis 7,77 encore et 3.', 'sections.0.texte': 'Rien.' } });
  assert.deepEqual(deux.refuses.map((r) => [r.champ, r.nombre]), [['titre', '99'], ['resume', '7,77']]);
  assert.equal(deux.nombresVus, 4, 'les nombres du texte, comptés (les répétitions aussi) : 99, 7,77, 7,77 et 3');
  assert.equal(deux.politique, 'refuser');
  assert.equal(G.refusesDits(deux.refuses), '99 ; 7,77');
  assert.equal(G.refusesDits(Array.from({ length: 9 }, (_, i) => ({ nombre: String(100 + i) })), { max: 3 }), '100 ; 101 ; 102 ; … (9 au total)');
  // Une fiche vide autorise… rien : tout nombre est refusé.
  assert.equal(G.verifierLesChiffres({ fiche: '', textes: { t: 'un seul 1' } }).ok, false);
  assert.equal(G.verifierLesChiffres({ fiche: 'rien', textes: { t: 'sans aucun chiffre' } }).ok, true);
  assert.equal(G.verifierLesChiffres({ fiche: 'x 5', textes: {} }).ok, true);
});

test('garde : un nombre écrit en lettres doit valoir un nombre de la fiche — « un », « deux » et « pour cent » restent des mots', () => {
  const fiche = 'Arsenal - Chelsea | 5 octobre | 7 prochains jours | les deux équipes marquent';
  const ok = (texte) => G.verifierLesChiffres({ fiche, textes: { t: texte } });
  assert.deepEqual(ok('Les deux équipes, un match, 58 pour cent.').refuses.map((r) => r.nombre), ['58'], '« deux », « un » et « pour cent » ne sont pas contrôlés : seul le 58 (absent de la fiche) est refusé');
  assert.deepEqual(ok('Il y a trois paris.').refuses.map((r) => [r.nombre, r.valeur, r.enLettres]), [['trois', 3, true]], 'trois : ni 3 ni le mot dans la fiche');
  assert.deepEqual(ok('Sur cinq jours et sept matchs.').refuses, [], 'cinq (5 est dans la fiche) et sept (7 y est) passent');
  assert.equal(ok('Sur cinq jours et sept matchs.').nombresVus, 2);
});

test('garde : les nombres en lettres — dizaines, cent, mille ; une partie d’un mot n’en est pas un ; un mot déjà écrit dans la fiche passe', () => {
  const nombres = (t) => G.nombresEnLettres(t).map((n) => n.mot);
  assert.deepEqual(nombres('trois, quatre, cinq, six, sept, huit, neuf, dix, onze, douze, treize, quatorze, quinze, seize'), ['trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']);
  assert.deepEqual(nombres('vingt-sept, quarante, cinquante, soixante, cent, mille'), ['vingt', 'sept', 'quarante', 'cinquante', 'soixante', 'cent', 'mille']);
  assert.deepEqual(nombres('Septembre, sixième, centre, neuvième, dixit, onzième, quatrième'), [], 'aucune partie de mot');
  assert.deepEqual(nombres('à 58 pour cent'), [], '« pour cent » est le signe %, pas le nombre cent');
  assert.deepEqual(nombres('deux et un, une et zéro'), [], '« un », « deux » ne sont pas contrôlés');
  // Une valeur déjà dans la fiche, ou le mot lui-même, passe.
  assert.equal(G.verifierLesChiffres({ fiche: 'sur 6 matchs', textes: { t: 'six matchs' } }).ok, true);
  assert.equal(G.verifierLesChiffres({ fiche: 'la Serie A des dix clubs', textes: { t: 'les dix clubs' } }).ok, true, 'le mot est dans la fiche');
  assert.equal(G.verifierLesChiffres({ fiche: 'sur 6 matchs', textes: { t: 'sept matchs' } }).ok, false);
  assert.equal(G.nombresEnLettres('Quarante ans').length, 1, 'la casse ne compte pas');
});

test('garde : sur la VRAIE fiche, chaque nombre du texte envoyé passe, et un seul nombre de plus la fait refuser', () => {
  const textes = [P.rendreLaFicheDuJour(F.construireLaFicheDuJour(entreesDuJour())), P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(entreesDeLaSemaine()))];
  for (const fiche of textes) {
    const tous = G.nombresEnChiffres(fiche).map((n) => n.texte);
    assert.ok(tous.length > 40, 'une fiche pleine de chiffres');
    // Un texte qui cite TOUS les nombres de la fiche, dans tous leurs champs : accepté.
    assert.equal(G.verifierLesChiffres({ fiche, textes: { t: tous.join(' ; ') } }).ok, true);
    // Un nombre qui n’y est pas : refusé, quelle que soit la place où il se glisse.
    for (const ajout of ['4321,7', '9999', '0,001', '31,5']) {
      assert.ok(!G.nombresEnChiffres(fiche).some((n) => n.texte === ajout), `${ajout} ne doit pas être dans la fiche d’essai`);
      const r = G.verifierLesChiffres({ fiche, textes: { t: `${tous.slice(0, 5).join(' ')} et ${ajout}.` } });
      assert.equal(r.ok, false, ajout);
      assert.deepEqual(r.refuses.map((x) => x.nombre), [ajout], 'seul le nombre ajouté est refusé');
    }
  }
  // Le texte du rappel (après un refus) n’autorise rien de plus : ses nombres ne sont pas ceux de la fiche seule.
  const demande = P.demandeDuBulletin(F.construireLaFicheDuJour(entreesDuJour()), { apresUnRefus: true });
  assert.ok(demande.userMessage.startsWith(demande.ficheTexte));
  assert.ok(demande.userMessage.length > demande.ficheTexte.length);
  assert.equal(G.nombresEnChiffres(demande.userMessage.slice(demande.ficheTexte.length)).length, 0, 'le rappel ne contient aucun nombre');
});

// ================================================================================ 2. les fiches (pures)

test('fiche du jour : les value vertes d’abord (la plus forte en tête), puis les chutes de cote ; heure de Paris, case, cote relevée, composition', () => {
  const f = F.construireLaFicheDuJour(entreesDuJour());
  assert.equal(f.jourEnLettres, 'lundi 5 octobre 2026');
  assert.equal(f.mode, 'normal');
  const o = f.opportunites;
  assert.equal(o.etat, 'pret');
  assert.deepEqual([o.lignesLues, o.valuesVertes, o.chutes, o.valuesVertesSur7Jours], [3, 2, 1, 3]);
  assert.deepEqual(o.retenues.map((l) => l.match), ['Lyon - Nice', 'Arsenal - Chelsea'], 'la plus forte value (+7,1 %) avant +6,1 %');
  assert.deepEqual(o.retenues.map((l) => l.valuePct), [7.1, 6.1]);
  assert.equal(o.retenues[0].heure, '21 h 45', 'l’heure de Paris (19 h 45 UTC en octobre)');
  assert.deepEqual(o.retenues[0].carte, { couleur: 'vert', mot: 'Prouvé' });
  assert.deepEqual(o.retenues[0].coteRelevee, { fraiche: true, ageMinutes: 12 });
  assert.equal(o.retenues[0].probabilitePct, 55);
  assert.equal(o.retenues[1].compo, 'non-publiee');
  assert.equal(o.retenues[0].compo, 'officielle');
  assert.deepEqual(o.chutesRetenues.map((l) => [l.match, l.chutePct, l.compo]), [['Roma - Lazio', 8.4, 'derniere-alignee']]);
  // Les favoris : par heure, avec la raison.
  assert.deepEqual(f.favoris.matchs.map((m) => [m.match, m.pourquoi, m.compo, m.valuesVertes]), [
    ['Arsenal - Chelsea', 'équipe favorite : Arsenal', 'non-publiee', 1],
    ['Lyon - Nice', 'championnat favori', 'officielle', 1]
  ]);
  assert.equal(f.favoris.matchsDuJour, 2);
  // Les compositions : seulement celles des matchs de la fiche ; les absents annoncés par FotMob.
  assert.deepEqual([f.compositions.matchsConcernes, f.compositions.officielles, f.compositions.probables, f.compositions.dernieresAlignees, f.compositions.nonPubliees], [3, 1, 0, 1, 1]);
  assert.deepEqual(f.compositions.matchs.map((m) => [m.match, m.etat, m.minutesAvantLeCoupDEnvoi, m.absentsDomicile, m.absentsExterieur]), [['Lyon - Nice', 'officielle', 45, ['Tolisso'], []]]);
  // Le contrôle quotidien.
  assert.deepEqual(f.controle.enEchec, [{ libelle: 'Score différent de football-data', statut: 'rouge', constats: 2 }, { libelle: 'Zéros « non relevé »', statut: 'orange', constats: 14 }]);
  assert.equal(f.controle.feu, 'orange');
  assert.equal(F.ficheDuJourVide(f), false);
});

test('fiche du jour : le mode économe réduit les lignes de chaque rubrique, jamais une rubrique ; les paris d’un autre jour, ou déjà commencés, sont écartés', () => {
  const e = entreesDuJour();
  const plus = [...e.opportunites.lignes];
  for (let k = 0; k < 12; k++) plus.push({ ...plus[0], home: `Club ${k}`, away: `Autre ${k}`, cle: `c${k}`, verdict: { ...plus[0].verdict, pourcent: 5 - k * 0.1 } });
  // un pari de demain, un pari qui a déjà commencé
  plus.push({ ...plus[0], home: 'Demain', away: 'Match', commenceTime: '2026-10-06T19:00:00.000Z', verdict: { ...plus[0].verdict, pourcent: 99 } });
  plus.push({ ...plus[0], home: 'Déjà', away: 'Commencé', commenceTime: '2026-10-05T03:00:00.000Z', verdict: { ...plus[0].verdict, pourcent: 98 } });
  e.opportunites.lignes = plus;
  const normal = F.construireLaFicheDuJour(e, { econome: false });
  const econome = F.construireLaFicheDuJour(e, { econome: true });
  assert.equal(normal.opportunites.retenues.length, F.LIMITES.normal.opportunites);
  assert.equal(econome.opportunites.retenues.length, F.LIMITES.econome.opportunites);
  assert.equal(normal.opportunites.valuesVertes, 2 + 12, 'les 14 value vertes d’aujourd’hui, ni celle de demain ni celle qui a commencé');
  assert.equal(econome.opportunites.valuesVertes, 14, 'les mêmes totaux dans les deux modes');
  assert.ok(!normal.opportunites.retenues.some((l) => /Demain|Déjà/.test(l.match)));
  assert.equal(econome.mode, 'econome');
  assert.deepEqual(Object.keys(normal), Object.keys(econome), 'les mêmes rubriques dans les deux modes');
  assert.ok(P.rendreLaFicheDuJour(econome).length < P.rendreLaFicheDuJour(normal).length);
  assert.match(P.rendreLaFicheDuJour(econome), /mode économe \(fiche réduite\)/);
  // Les limites : l’économe est plus étroite que la normale, rubrique par rubrique.
  for (const cle of Object.keys(F.LIMITES.normal)) assert.ok(F.LIMITES.econome[cle] <= F.LIMITES.normal[cle], cle);
  assert.ok(Object.keys(F.LIMITES.normal).every((cle) => Object.hasOwn(F.LIMITES.econome, cle)));
});

test('fiche du jour : « rien à dire » (aucun appel) n’est pas « on ne sait pas » — le Repérage en calcul ou en erreur, la liste des matchs illisible, les favoris illisibles', () => {
  const vide = F.construireLaFicheDuJour(entreesDuJour({ vide: true, favoris: false }));
  assert.equal(F.ficheDuJourVide(vide), true, 'prêt, sans pari, sans chute, sans match de vos favoris : rien à dire');
  assert.match(P.rendreLaFicheDuJour(vide), /Aucune value verte aujourd'hui\./);
  for (const etat of ['en-calcul', 'erreur']) {
    const f = F.construireLaFicheDuJour(entreesDuJour({ opportunites: etat, vide: true, favoris: false }));
    assert.equal(F.ficheDuJourVide(f), false, `${etat} : on ne sait pas`);
    assert.match(P.rendreLaFicheDuJour(f), etat === 'erreur' ? /Les opportunités sont indisponibles \(le Repérage est tombé\)/ : /Les opportunités ne sont pas encore calculées/);
  }
  // Un match de vos favoris suffit à ne pas être vide.
  assert.equal(F.ficheDuJourVide(F.construireLaFicheDuJour(entreesDuJour({ vide: true, favoris: false, opportunites: 'pret' }))), true);
  const avecFavori = entreesDuJour({ vide: true, favoris: false });
  avecFavori.matchs = [{ cle: 'x', home: 'Lyon', away: 'Nice', league: 'Ligue 1', commenceTime: '2026-10-05T19:45:00.000Z', heureSure: true, favori: { championnat: true, equipes: [] }, compo: null }];
  assert.equal(F.ficheDuJourVide(F.construireLaFicheDuJour(avecFavori)), false);
  // La liste des matchs illisible : ce n’est pas « aucun match ».
  const illisible = entreesDuJour({ vide: true, favoris: false });
  illisible.lectures = { matchs: false, compositions: false, controle: true };
  illisible.problemes = ['liste des matchs illisible : disque plein'];
  const f2 = F.construireLaFicheDuJour(illisible);
  assert.equal(F.ficheDuJourVide(f2), false);
  const texte = P.rendreLaFicheDuJour(f2);
  assert.match(texte, /La liste des matchs du jour est illisible pour l’instant : ne dis rien des matchs de vos favoris\./);
  assert.match(texte, /Les compositions sont illisibles pour l’instant : ne dis rien d’elles\./);
  assert.match(texte, /LECTURES QUI ONT ÉCHOUÉ[\s\S]*liste des matchs illisible : disque plein/);
  // Des favoris illisibles.
  const fav = entreesDuJour({ vide: true, favoris: false });
  fav.favoris = { equipes: 0, ligues: 0, illisible: true };
  assert.equal(F.ficheDuJourVide(F.construireLaFicheDuJour(fav)), false);
  assert.match(P.rendreLaFicheDuJour(F.construireLaFicheDuJour(fav)), /Vos favoris sont illisibles pour l’instant/);
  // Le contrôle jamais fait / illisible : dit, pas deviné.
  const sansControle = entreesDuJour();
  sansControle.controle = { etat: 'jamais' };
  assert.match(P.rendreLaFicheDuJour(F.construireLaFicheDuJour(sansControle)), /Le contrôle quotidien n’a pas encore tourné/);
  sansControle.controle = null;
  assert.match(P.rendreLaFicheDuJour(F.construireLaFicheDuJour(sansControle)), /Le contrôle quotidien est illisible/);
});

test('composition : la règle de l’écran, rendue à l’identique — officielle dans l’heure avant le coup d’envoi, probable avant, dernière alignée, non publiée', { skip: interfacePrete ? false : 'ui/src manque' }, async () => {
  const ecran = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'langageParis.js')).href);
  const onze = (noms) => noms.map((name) => ({ name }));
  const cas = [
    null,
    undefined,
    {},
    { source: 'magasin' },
    { source: 'FotMob', minutesBeforeKickoff: 45, home: { startXI: onze(['A', 'B']), unavailable: [] }, away: { startXI: onze(['C']), unavailable: [] } },
    { source: 'FotMob', minutesBeforeKickoff: 60, home: { startXI: [], unavailable: [] }, away: { startXI: [], unavailable: [] } },
    { source: 'FotMob', minutesBeforeKickoff: 61, home: { startXI: [], unavailable: [] }, away: { startXI: [], unavailable: [] } },
    { source: 'FotMob', minutesBeforeKickoff: 300, home: { startXI: [], unavailable: [] }, away: { startXI: [], unavailable: [] } },
    { source: 'FotMob', minutesBeforeKickoff: 30, home: { startXI: onze(['A', 'B']), unavailable: onze(['B']) }, away: { startXI: [], unavailable: [] } },
    { source: 'FotMob', minutesBeforeKickoff: 30, home: { startXI: onze(['A']), unavailable: onze(['Z']) }, away: { startXI: onze(['C']), unavailable: onze(['C']) } },
    { source: 'FotMob', minutesBeforeKickoff: null },
    { source: 'FotMob', minutesBeforeKickoff: -5, home: { startXI: [], unavailable: [] } }
  ];
  const mot = { officielle: 'officielle', probable: 'probable', derniere: 'derniere-alignee', absente: 'non-publiee' };
  for (const c of cas) assert.equal(F.etatDeLaComposition(c), mot[ecran.etatComposition(c).etat], JSON.stringify(c));
  assert.equal(F.COMPO_OFFICIELLE_MINUTES, ecran.COMPO_OFFICIELLE_MINUTES, 'la même limite que l’écran');
});

test('semaines : la dernière semaine COMPLÈTE (lundi → dimanche, jours de Paris), à toute date, y compris autour d’un changement de mois ou d’année', () => {
  const lecture = (jour) => {
    const s = F.semaineEcoulee(jour);
    return [s.du, s.au, s.jours.length];
  };
  assert.deepEqual(lecture('2026-10-05'), ['2026-09-28', '2026-10-04', 7], 'un lundi : la semaine qui vient de finir');
  assert.deepEqual(lecture('2026-10-11'), ['2026-09-28', '2026-10-04', 7], 'un dimanche : la semaine en cours n’est pas finie');
  assert.deepEqual(lecture('2026-10-12'), ['2026-10-05', '2026-10-11', 7]);
  assert.deepEqual(lecture('2026-11-02'), ['2026-10-26', '2026-11-01', 7], 'à cheval sur deux mois');
  assert.deepEqual(lecture('2027-01-01'), ['2026-12-21', '2026-12-27', 7]);
  assert.deepEqual(lecture('2027-01-04'), ['2026-12-28', '2027-01-03', 7], 'à cheval sur deux années');
  assert.deepEqual(lecture('2026-03-30'), ['2026-03-23', '2026-03-29', 7], 'le jour du changement d’heure');
  for (const j of ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']) assert.equal(F.semaineEcoulee(j).cle, '2026-09-28', `${j} : une seule semaine pour tous les jours de celle-ci`);
  assert.equal(F.semaineEnLettres(F.semaineEcoulee('2026-10-05')), 'du lundi 28 septembre au dimanche 4 octobre 2026');
  assert.equal(F.semaineEnLettres(F.semaineEcoulee('2026-10-12')), 'du lundi 5 au dimanche 11 octobre 2026');
  assert.equal(F.semaineEnLettres(F.semaineEcoulee('2026-11-02')), 'du lundi 26 octobre au dimanche 1er novembre 2026', 'le premier du mois s’écrit « 1er »');
  assert.equal(F.semaineEnLettres(F.semaineEcoulee('2027-01-04')), 'du lundi 28 décembre 2026 au dimanche 3 janvier 2027', 'sur deux années : les deux années dites');
  assert.equal(F.jourEnLettres('2026-11-01'), 'dimanche 1er novembre 2026');
  assert.equal(F.jourEnLettres('2026-10-22'), 'jeudi 22 octobre 2026');
});

test('fiche de la semaine : pronostics, paris, valeur de clôture, IA, championnats — comptés, arrondis pour l’affichage, jamais un total de pourcentages', () => {
  const f = F.construireLaFicheDeLaSemaine(entreesDeLaSemaine());
  assert.equal(f.semaine.enLettres, 'du lundi 28 septembre au dimanche 4 octobre 2026');
  // Les pronostics réglés DE la semaine : le réglé la veille et celui en attente sont écartés.
  assert.deepEqual([f.pronostics.regles, f.pronostics.justes, f.pronostics.faux, f.pronostics.tauxPct], [5, 3, 2, 60]);
  assert.deepEqual(f.pronostics.parMarche.map((g) => [g.libelle, g.regles, g.justes, g.tauxPct]), [['Total de buts', 2, 2, 100], ['Résultat (1 / N / 2)', 2, 1, 50], ['Les deux équipes marquent', 1, 0, 0]], 'les plus fournis d’abord, à égalité ceux qui ont le plus de justes');
  // Les paris : gagné + perdu comptés, le gain réel de la règle du carnet, le ROI sur la mise.
  const p = f.paris;
  assert.deepEqual([p.regles, p.gagnes, p.perdus, p.annules, p.enAttente], [3, 1, 2, 0, 1]);
  assert.deepEqual([p.mise, p.gainReel, p.roiPct, p.tauxReussitePct], [23, -2, -8.7, 33]);
  assert.deepEqual(p.attendu, { paris: 2, gainAttendu: 0.72, gainReel: 6, ecart: 5.28 }, 'seulement les paris simples qui portent la probabilité du moteur');
  assert.deepEqual(p.meilleurs.map((x) => [x.gain, x.cote, x.mise]), [[11, 2.1, 10]]);
  assert.deepEqual(p.pires.map((x) => x.gain), [-8, -5]);
  // La valeur de clôture : la moyenne des paris simples mesurés, sans le pari d’une autre semaine.
  assert.deepEqual(f.valeurDeCloture, { disponible: true, raison: null, parisMesures: 2, moyennePct: 0.9, positifs: 1 });
  // L’IA : les avis jugés de la semaine, ses erreurs ; son carnet.
  assert.deepEqual([f.ia.semaine.avis, f.ia.semaine.tenus, f.ia.semaine.tauxPct], [2, 1, 50], 'un avis nuancé n’est jamais compté');
  assert.deepEqual(f.ia.semaine.erreurs.map((e) => [e.match, e.marche, e.avisDeLIA, e.issue]), [['Lyon - Nice', 'Total buts', 'confirme', 'faux']]);
  assert.deepEqual([f.ia.carnet.avis, f.ia.carnet.tenus, f.ia.carnet.tauxPct, f.ia.carnet.matchsAnalysesEtJoues], [716, 394, 55, 240]);
  // Les championnats : les rentables et les perdants de la semaine, puis la carte « où parier ».
  assert.deepEqual(f.championnats.rentables.map((x) => [x.championnat, x.regles, x.gain]), [['Ligue 1', 1, 11]]);
  assert.deepEqual(f.championnats.perdants.map((x) => [x.championnat, x.regles, x.gain]), [['EPL', 2, -13]]);
  assert.deepEqual(f.championnats.carteOuParier.listeDesVertes, [{ championnat: 'EPL', marche: 'Résultat (1N2)', matchs: 412 }]);
  assert.deepEqual([f.championnats.carteOuParier.vertes, f.championnats.carteOuParier.rouges, f.championnats.carteOuParier.grises], [1, 19, 929]);
  assert.equal(F.ficheDeLaSemaineVide(f), false);
  // Le texte : sans « undefined », « NaN », « null » ni objet.
  const texte = P.rendreLaFicheDeLaSemaine(f);
  assert.doesNotMatch(texte, /undefined|NaN|null|\[object|Infinity/);
  assert.match(texte, /1 gagné, 2 perdus/);
  assert.match(texte, /gain réel −2,00 €, ROI −8,7 %/);
  assert.match(texte, /attendu \+0,72 €, réel \+6,00 €, écart \+5,28 €/);
});

test('fiche de la semaine : le mode économe réduit les lignes, jamais les rubriques ; une lecture qui échoue est dite, jamais prise pour « aucun »', () => {
  const e = entreesDeLaSemaine();
  const marches = ['result', 'totalGoals', 'bothTeamsScore', 'teamCorners', 'totalShots', 'totalCorners', 'totalShotsOnTarget', 'teamGoals'];
  for (let k = 0; k < 40; k++) e.pronostics.push({ id: `p${k}`, status: k % 3 ? 'correct' : 'incorrect', marketId: marches[k % marches.length], market: marches[k % marches.length], league: `Ligue ${k % 8}`, settledAt: '2026-10-01T22:00:00.000Z' });
  const n = F.construireLaFicheDeLaSemaine(e, { econome: false });
  const s = F.construireLaFicheDeLaSemaine(e, { econome: true });
  assert.ok(s.pronostics.parMarche.length < n.pronostics.parMarche.length && s.pronostics.parChampionnat.length < n.pronostics.parChampionnat.length);
  assert.deepEqual([s.pronostics.regles, s.paris.gainReel, s.ia.semaine.avis], [n.pronostics.regles, n.paris.gainReel, n.ia.semaine.avis], 'les mêmes totaux');
  assert.deepEqual(Object.keys(s), Object.keys(n));
  // Les lectures qui échouent.
  const casse = entreesDeLaSemaine();
  casse.lectures = { pronostics: false, paris: false, analyses: false };
  casse.pronostics = [];
  casse.paris = [];
  casse.analyses = [];
  casse.problemes = ['carnet de paris illisible : bets.json illisible'];
  const f = F.construireLaFicheDeLaSemaine(casse);
  assert.equal(F.ficheDeLaSemaineVide(f), false, 'illisible n’est pas vide : l’appel ne serait pas jeté en « rien à commenter »');
  const texte = P.rendreLaFicheDeLaSemaine(f);
  assert.match(texte, /Le journal des pronostics est illisible pour l’instant/);
  assert.match(texte, /Le carnet de paris est illisible pour l’instant : ne dis rien de vos paris/);
  assert.match(texte, /Les analyses de l’IA sont illisibles pour l’instant/);
  assert.match(texte, /Vos paris sont illisibles : aucun championnat à classer\./);
  assert.match(texte, /LECTURES QUI ONT ÉCHOUÉ[\s\S]*bets\.json illisible/);
  assert.doesNotMatch(texte, /Aucun pari réglé cette semaine\./, 'jamais « aucun pari » pour un carnet qui ne se lit pas');
  // Une semaine vraiment vide.
  const vide = F.construireLaFicheDeLaSemaine(entreesDeLaSemaine({ vide: true }));
  assert.equal(F.ficheDeLaSemaineVide(vide), true);
  assert.match(P.rendreLaFicheDeLaSemaine(vide), /Aucun pronostic réglé cette semaine\./);
  // Une valeur de clôture indisponible, ou un carnet de l’IA absent : dits.
  const indispo = entreesDeLaSemaine();
  indispo.cloture = { disponible: false, raison: 'base des cotes indisponible', mesures: [] };
  indispo.carnet = { etat: 'absent', carnet: null };
  const ti = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(indispo));
  assert.match(ti, /Valeur de clôture indisponible \(base des cotes indisponible\)/);
  assert.match(ti, /Carnet de l'IA : pas encore calculé/);
});

test('fiche de la semaine : les erreurs de l’IA sont choisies pour instruire (les plus sûres d’elle d’abord, une par match avant une seconde, deux au plus par match), jamais cinq lignes du même match', () => {
  const err = (jour, match, marche, confiance) => ({ jour, match, marche, confiance, pari: 'x', avisDeLIA: 'confirme', issue: 'faux' });
  const liste = [
    err('2026-10-03', 'Lyon - Nice', 'Résultat', 'moyenne'),
    err('2026-10-03', 'Lyon - Nice', 'Total buts', 'faible'),
    err('2026-10-03', 'Lyon - Nice', 'Total corners', 'forte'),
    err('2026-10-03', 'Lyon - Nice', 'Total tirs', 'forte'),
    err('2026-10-01', 'Brest - Metz', 'Résultat', 'forte'),
    err('2026-10-02', 'Lille - Lens', 'Résultat', 'moyenne'),
    err('2026-10-02', 'Nantes - Reims', 'Résultat', null)
  ];
  const copie = JSON.stringify(liste);
  const noms = (l) => l.map((e) => `${e.match} | ${e.marche}`);
  assert.deepEqual(noms(F.choisirLesErreurs(liste, 5)), ['Lyon - Nice | Total corners', 'Lyon - Nice | Total tirs', 'Brest - Metz | Résultat', 'Lille - Lens | Résultat', 'Nantes - Reims | Résultat']);
  // Peu de place : UNE par match d’abord (la seconde erreur forte de Lyon - Nice cède la place à une autre rencontre).
  assert.deepEqual(noms(F.choisirLesErreurs(liste, 3)), ['Lyon - Nice | Total corners', 'Brest - Metz | Résultat', 'Lille - Lens | Résultat']);
  // Beaucoup de place : jamais plus de deux par match (7 erreurs, 5 montrées).
  assert.equal(F.ERREURS_PAR_MATCH, 2);
  assert.deepEqual(noms(F.choisirLesErreurs(liste, 50)), noms(F.choisirLesErreurs(liste, 5)));
  assert.deepEqual(F.choisirLesErreurs(liste, 0), []);
  // Le même résultat quel que soit l’ordre d’arrivée, et la liste d’entrée n’est pas touchée.
  assert.deepEqual(noms(F.choisirLesErreurs([...liste].reverse(), 5)), noms(F.choisirLesErreurs(liste, 5)));
  assert.equal(JSON.stringify(liste), copie);

  // Dans la fiche : six erreurs en deux matchs, trois montrées, et la phrase le dit.
  const e = entreesDeLaSemaine();
  const rv = (market, confiance) => ({ market, marketId: 'totalGoals', pick: 'pronostic', aiVerdict: 'confirme', aiConfidence: confiance, aiWasRight: false, outcome: 'faux', minOdds: 1.2 });
  e.analyses.push({ homeName: 'Brest', awayName: 'Metz', league: 'Ligue 1', commenceTime: '2026-10-01T19:00:00.000Z', postMatchReview: { createdAt: '2026-10-01T23:00:00.000Z', marketReviews: [rv('Total buts', 'forte'), rv('Total corners', 'forte'), rv('Total tirs', 'moyenne'), rv('Résultat', 'faible'), rv('Double chance', null)] } });
  const f = F.construireLaFicheDeLaSemaine(e);
  assert.equal(f.ia.semaine.erreursTotal, 6);
  assert.deepEqual(noms(f.ia.semaine.erreurs), ['Brest - Metz | Total buts', 'Brest - Metz | Total corners', 'Lyon - Nice | Total buts']);
  assert.match(P.rendreLaFicheDeLaSemaine(f), /OÙ ELLE S'EST TROMPÉE \(3 sur 6, celles où elle se disait la plus sûre d'abord, au plus 2 par match\)/);
  // Toutes montrées : la phrase ne dit que le total.
  assert.match(P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(entreesDeLaSemaine())), /OÙ ELLE S'EST TROMPÉE \(1\)/);
});

test('fiche de la semaine : le carnet de l’IA va du moins fiable au plus fiable, sur les marchés d’au moins 20 avis seulement ; les autres sont comptés, jamais listés', () => {
  const type = (marketType, label, aiVerdicts, aiRight) => ({ marketType, label, bilan: { aiVerdicts, aiRight } });
  const c = entreesDeLaSemaine();
  c.carnet.carnet.types = [
    type('result', 'Résultat', 300, 170),
    type('totalGoals', 'Total buts', 40, 12),
    type('bothTeamsScore', 'Les deux équipes marquent', 25, 20),
    type('totalCorners', 'Total corners', 19, 2),
    type('teamCorners', 'Corners d’une équipe', 0, 0),
    type('totalShots', 'Total tirs', 100, 60),
    type('totalShotsOnTarget', 'Total tirs cadrés', 50, 25)
  ];
  const lignes = (fiche) => fiche.ia.carnet.parMarche.map((g) => [g.libelle, g.avis, g.tauxPct]);
  const n = F.construireLaFicheDeLaSemaine(c);
  assert.equal(F.SEUIL_AVIS_DU_CARNET, 20);
  assert.deepEqual(lignes(n), [['Total buts', 40, 30], ['Total tirs cadrés', 50, 50], ['Résultat', 300, 57], ['Total tirs', 100, 60], ['Les deux équipes marquent', 25, 80]], 'du plus faible taux au plus fort, « Total corners » (19 avis) écarté, « Corners d’une équipe » (aucun avis) ignoré');
  assert.deepEqual([n.ia.carnet.marchesJuges, n.ia.carnet.marchesDuMilieu, n.ia.carnet.marchesTropPeuFournis, n.ia.carnet.seuilAvis], [5, 0, 1, 20]);
  // Économe (quatre places pour cinq marchés) : les deux moins fiables ET les deux plus fiables, le milieu seulement compté.
  const s = F.construireLaFicheDeLaSemaine(c, { econome: true });
  assert.deepEqual(lignes(s), [['Total buts', 40, 30], ['Total tirs cadrés', 50, 50], ['Total tirs', 100, 60], ['Les deux équipes marquent', 25, 80]]);
  assert.deepEqual([s.ia.carnet.marchesJuges, s.ia.carnet.marchesDuMilieu, s.ia.carnet.marchesTropPeuFournis], [5, 1, 1]);
  const texte = P.rendreLaFicheDeLaSemaine(s);
  assert.match(texte, /Marchés d'au moins 20 avis, du moins fiable au plus fiable \(1 marché du milieu non montré\) :/);
  assert.match(texte, /1 autre marché a moins de 20 avis : trop peu pour juger, ne les commente pas\./);
  const duCarnet = texte.slice(texte.indexOf('Marchés d'));
  assert.ok(duCarnet.indexOf('| Total buts |') >= 0 && duCarnet.indexOf('| Total buts |') < duCarnet.indexOf('| Les deux équipes marquent |'), 'le plus faible est écrit avant le plus fort');
  assert.ok(!/\| Résultat \| 300 \|/.test(texte), 'le marché du milieu n’est pas listé');
  // Aucun marché assez fourni : rien de listé, mais dit.
  c.carnet.carnet.types = [type('result', 'Résultat', 12, 7)];
  const peu = F.construireLaFicheDeLaSemaine(c);
  assert.deepEqual([peu.ia.carnet.parMarche.length, peu.ia.carnet.marchesTropPeuFournis], [0, 1]);
  const textePeu = P.rendreLaFicheDeLaSemaine(peu);
  assert.match(textePeu, /1 marché a moins de 20 avis : trop peu pour juger, ne les commente pas\./);
  assert.doesNotMatch(textePeu, /Marchés d'au moins 20 avis/);
  // Le total du carnet est celui du fichier, pas la somme des lignes montrées.
  assert.deepEqual([peu.ia.carnet.avis, peu.ia.carnet.tenus, peu.ia.carnet.tauxPct], [716, 394, 55]);
});

test('les fiches restent compactes : de l’ordre de mille à deux mille cinq cents tokens, même pleines — l’estimation est dite estimation', () => {
  const pleine = entreesDuJour();
  const base = pleine.opportunites.lignes;
  for (let k = 0; k < 30; k++) base.push({ ...base[0], home: `Club ${k}`, away: `Adversaire ${k}`, cle: `c${k}`, verdict: { ...base[0].verdict, pourcent: 4 + k / 100 } });
  for (let k = 0; k < 30; k++) pleine.matchs.push({ cle: `m${k}`, home: `Club ${k}`, away: `Adversaire ${k}`, league: 'Ligue 1', commenceTime: '2026-10-05T19:45:00.000Z', heureSure: true, favori: { championnat: true, equipes: [] }, compo: { source: 'FotMob', minutesBeforeKickoff: 45, home: { startXI: [], unavailable: [{ name: 'Joueur A' }, { name: 'Joueur B' }, { name: 'Joueur C' }, { name: 'Joueur D' }] }, away: { startXI: [], unavailable: [] } } });
  const jour = P.rendreLaFicheDuJour(F.construireLaFicheDuJour(pleine));
  assert.ok(F.estimerLesTokens(jour) < 2_500, `fiche du jour pleine : ${F.estimerLesTokens(jour)} tokens`);
  assert.ok(F.estimerLesTokens(jour) > 500);
  assert.equal(F.estimerLesTokens('x'.repeat(300)), 100, 'trois caractères par token, arrondi au-dessus');
  assert.equal(F.estimerLesTokens(''), 0);
  assert.ok(F.estimerLesTokens(P.rendreLaFicheDuJour(F.construireLaFicheDuJour(pleine, { econome: true }))) < F.estimerLesTokens(jour));
  const semaine = P.rendreLaFicheDeLaSemaine(F.construireLaFicheDeLaSemaine(entreesDeLaSemaine()));
  assert.ok(F.estimerLesTokens(semaine) < 2_500, `fiche de la semaine : ${F.estimerLesTokens(semaine)} tokens`);
  // Les consignes fixes (relues depuis la mémoire cache de Claude) ne contiennent rien de propre au jour ni à la semaine.
  assert.doesNotMatch(P.CONSIGNES_BULLETIN, /\d{4}|Arsenal|octobre/);
  assert.doesNotMatch(P.CONSIGNES_BILAN, /\d{4}|Arsenal|octobre/);
  assert.match(P.CONSIGNES_BULLETIN, /RÈGLE ABSOLUE — LES CHIFFRES/);
  assert.match(P.CONSIGNES_BILAN, /RÈGLE ABSOLUE — LES CHIFFRES/);
  assert.match(P.CONSIGNES_BULLETIN, /ne proposes jamais de pari/);
  assert.match(P.CONSIGNES_BILAN, /aucun conseil de mise/);
});

test('la réponse de l’IA est lue avec soin : la forme du schéma exigée, les balises qui fuient retirées, les trop longs textes coupés à la fin d’une phrase', () => {
  const bon = { titre: 'T', resume: 'R', sections: [{ cle: 'opportunites', titre: 'Les paris', texte: 'Texte 1.' }, { cle: 'alertes', titre: 'Alertes', texte: 'Texte 2.' }], aRetenir: 'Prudence.' };
  assert.deepEqual(P.lireLeTexte(bon, 'bulletin'), bon);
  assert.equal(P.lireLeTexte({ ...bon, aRetenir: undefined }, 'bulletin').aRetenir, undefined);
  assert.equal(P.lireLeTexte({ ...bon, sections: [{ cle: 'marche', titre: 'Ce qui a marché', texte: 'x' }] }, 'bilan').sections[0].cle, 'marche');
  assert.equal(P.lireLeTexte({ titre: 'T', resume: 'R', sections: [{ cle: 'perdu', titre: 'Ce qui a perdu', texte: 'x' }], aRetenir: 'ignoré' }, 'bilan').aRetenir, undefined, 'le bilan n’a pas de champ « à retenir »');
  for (const [mauvais, message] of [
    [null, /pas un objet/],
    [[], /pas un objet/],
    [{ ...bon, titre: '  ' }, /« titre » manque/],
    [{ ...bon, resume: 5 }, /« resume » manque/],
    [{ ...bon, sections: [] }, /« sections » manque/],
    [{ ...bon, sections: [{ cle: 'inconnue', titre: 'x', texte: 'y' }] }, /rubrique inconnue/],
    [{ ...bon, sections: [bon.sections[0], bon.sections[0]] }, /écrite deux fois/],
    [{ ...bon, sections: [{ cle: 'favoris', titre: '', texte: 'y' }] }, /sections\[0\]\.titre/]
  ]) assert.throws(() => P.lireLeTexte(mauvais, 'bulletin'), (e) => e instanceof P.TexteInvalide && message.test(e.message), message.toString());
  assert.throws(() => P.lireLeTexte({ ...bon, sections: [{ cle: 'opportunites', titre: 'x', texte: 'y' }] }, 'bilan'), P.TexteInvalide, 'une rubrique du bulletin n’est pas une rubrique du bilan');
  // Des balises qui fuient d’un ancien format d’appel d’outil, retirées.
  assert.equal(P.lireLeTexte({ ...bon, resume: 'Bon </caveats></invoke> résumé' }, 'bulletin').resume, 'Bon  résumé');
  // Trop long : coupé à la fin d’une phrase, jamais au milieu d’un nombre.
  const long = `${'Une phrase de quarante caractères ici. '.repeat(40)}Fin.`;
  const coupe = P.lireLeTexte({ ...bon, resume: long }, 'bulletin').resume;
  assert.ok(coupe.length <= P.LONGUEURS.resume && coupe.endsWith('.'), coupe.slice(-40));
  assert.equal(P.couperProprement('court', 50), 'court');
  assert.ok(P.couperProprement('x'.repeat(100), 20).endsWith('…'));
  assert.deepEqual(Object.keys(P.champsDuTexte(bon)), ['titre', 'resume', 'sections.0.titre', 'sections.0.texte', 'sections.1.titre', 'sections.1.texte', 'aRetenir'], 'la garde lit chaque champ de texte, un par un');
  // Les schémas demandés à Claude Code : les rubriques de chaque texte, sans « à retenir » pour le bilan.
  assert.deepEqual(P.SCHEMA_BULLETIN.properties.sections.items.properties.cle.enum, ['opportunites', 'favoris', 'compositions', 'alertes']);
  assert.deepEqual(P.SCHEMA_BILAN.properties.sections.items.properties.cle.enum, ['marche', 'perdu', 'ia', 'cloture', 'championnats', 'retenir']);
  assert.ok(P.SCHEMA_BULLETIN.properties.aRetenir && !P.SCHEMA_BILAN.properties.aRetenir);
  for (const sch of [P.SCHEMA_BULLETIN, P.SCHEMA_BILAN]) assert.deepEqual(sch.required, ['titre', 'resume', 'sections']);
});

// ================================================================================ 3. les fiches lues dans la base d’essai

test('fiche du jour LUE : les value vertes sont celles de la route d’analyse d’un match (Mes paris), les chutes celles de la page Chutes de cotes, les compositions celles du cache', () => {
  const s = unePhase.jour();
  assert.equal(s.reperage.matchs, 5);
  assert.equal(s.lecteur.ecritures, 0, 'la lecture n’écrit rien dans la base');
  assert.deepEqual(s.lecteur.problemes, []);
  const o = s.fiche.opportunites;
  // Second chemin n° 1 : les verdicts de la route d’analyse d’un match.
  const verts = Object.entries(s.verdictsParRoute).flatMap(([id, v]) => Object.entries(v).filter(([, x]) => x.vert).map(([issue, x]) => ({ id, issue, ...x })));
  assert.deepEqual(verts.map((v) => `${v.id}|${v.issue}`).sort(), ['essai-a|home', 'essai-d|home']);
  assert.equal(o.valuesVertes, verts.length);
  assert.equal(o.retenues.length, 2);
  for (const l of o.retenues) {
    const v = verts.find((x) => l.match.startsWith({ 'essai-a': 'Man City', 'essai-d': 'Newcastle' }[x.id]));
    assert.ok(v, l.match);
    assert.equal(l.cote, v.cote);
    assert.equal(l.bookmaker, v.bookmakerTitle);
    assert.equal(l.valuePct, Math.round(v.pourcent * 10) / 10);
    assert.equal(l.coteJuste, v.coteJuste);
    assert.equal(l.probabilitePct, Math.round(v.probabilite * 100));
  }
  assert.deepEqual(o.retenues.map((l) => l.pari), ['Man City gagne', 'Newcastle gagne']);
  assert.deepEqual(o.retenues.map((l) => l.heure), ['14 h 40', '21 h 30'], 'l’heure de Paris du faux relevé (12 h 40 et 19 h 30 UTC)');
  // Second chemin n° 2 : la page des Chutes de cotes. Man City – Liverpool, « Plus de 2,5 buts » : chute de la cote juste ≥ 5 %, sans value verte.
  const chutes = s.chutesParLaPage.fixtures.flatMap((f) => f.drops ?? []).filter((d) => d.dropPct >= 5);
  const over = chutes.find((d) => d.market === 'ou' && d.issue === 'over');
  assert.ok(over, 'la page des chutes voit la chute du plus de 2,5 buts');
  assert.equal(o.chutes, s.ligne.filter((l) => l.chute && !l.vert).length);
  assert.deepEqual(o.chutesRetenues.map((l) => [l.match, l.pari, l.chutePct]), [['Man City - Liverpool', 'Plus de 2,5 buts', Math.round(over.dropPct * 10) / 10]]);
  assert.equal(o.chutesRetenues[0].cote, null, 'aucune cote chez vos bookmakers pour cette issue : dit « – », jamais inventé');
  assert.equal(o.lignesLues, s.ligne.length, 'toutes les lignes de la page pour aujourd’hui');
  // Les compositions : le cache (SQL). A lue 45 min avant, D 5 h avant (probable) ; Rodri absent chez Man City.
  const sql = Object.fromEntries(s.lignesCompo.map((l) => [`${l.home}|${l.away}`, Math.round((Date.parse(l.kickoff) - Date.parse(l.fetchedAt)) / 60_000)]));
  assert.deepEqual(sql, { 'Man City|Liverpool': 45, 'Arsenal|Chelsea': 30, 'Newcastle|Leeds': 300 });
  assert.deepEqual(s.fiche.compositions.matchs.map((m) => [m.match, m.etat, m.minutesAvantLeCoupDEnvoi, m.absentsDomicile]), [['Man City - Liverpool', 'officielle', 45, ['Rodri']], ['Newcastle - Leeds', 'probable', 300, []]]);
  assert.deepEqual(o.retenues.map((l) => l.compo), ['officielle', 'probable']);
  // Les favoris : Newcastle, par son identifiant FotMob ; Leeds n’est pas favori.
  assert.deepEqual(s.fiche.favoris.matchs.map((m) => [m.match, m.pourquoi, m.valuesVertes]), [['Newcastle - Leeds', 'équipe favorite : Newcastle', 1]]);
  assert.deepEqual([s.fiche.favoris.equipes, s.fiche.favoris.championnats, s.fiche.favoris.matchsDuJour], [1, 0, 1]);
  assert.deepEqual(s.lecteur.matchs.filter((m) => m.favori).map((m) => m.cle), ['EPL|Newcastle|Leeds|2026-10-05']);
  // Le contrôle quotidien : le rouge récent est rouge (le feu aussi), l’orange est orange.
  assert.equal(s.fiche.controle.feu, 'rouge');
  // (La ligne « Claude » de la santé des sources — jeton présent, absent ou expiré — dépend de la machine, pas des contrôles plantés : écartée.)
  assert.deepEqual(s.fiche.controle.enEchec.filter((x) => x.libelle !== 'Claude').map((x) => [x.libelle, x.statut, x.constats]), [['Score différent de football-data', 'rouge', 2], ['Zéros « non relevé »', 'orange', 1]]);
  // Le texte : tous ses nombres sont dans la fiche ; un autre ne l’est pas.
  assert.equal(s.garde.sur, true);
  assert.equal(s.garde.inventé, false);
  assert.ok(s.tokensEstimes.jour > 400 && s.tokensEstimes.jour < 2_500, `${s.tokensEstimes.jour} tokens estimés`);
  assert.match(s.texte, /\| Man City - Liverpool \| EPL \| 14 h 40 \| Man City gagne \| 2,30 \| William Hill \| 49 % \| 2,05 \| \+12,4 % \|/);
  assert.equal(s.vide, false);
  assert.equal(s.ficheEconome.mode, 'econome');
});

test('fiche du jour LUE — les cas qui changent le texte : championnat favori, aucun favori, favoris illisibles, Repérage en calcul ou en erreur, attente du Repérage, jour sans match', () => {
  const s = unePhase.jour();
  assert.deepEqual(s.championnatFavori.matchs.map((m) => m[1]), Array(5).fill('championnat favori'), 'un championnat favori : tous ses matchs, la raison dite ainsi');
  assert.deepEqual([s.championnatFavori.matchsDuJour, s.championnatFavori.equipes, s.championnatFavori.championnats], [5, 0, 1]);
  assert.deepEqual([s.sansFavori.matchs, s.sansFavori.matchsDuJour], [0, 0]);
  assert.match(s.sansFavori.texte[0], /^0 équipe et 0 championnat en favoris ; 0 match de vos favoris aujourd'hui\.$/);
  assert.equal(s.favorisIllisibles.illisible, true);
  assert.match(s.favorisIllisibles.texte[0], /Vos favoris sont illisibles pour l’instant/);
  assert.equal(s.pasPret.calcul.etat, 'en-calcul');
  assert.equal(s.pasPret.calcul.vide, false, 'en calcul n’est pas « rien »');
  assert.match(s.pasPret.calcul.texte[0], /Les opportunités ne sont pas encore calculées/);
  assert.deepEqual([s.pasPret.erreur.etat, s.pasPret.erreur.erreur, s.pasPret.erreur.vide], ['erreur', 'le Repérage est tombé', false]);
  assert.deepEqual(s.attente, { appels: 4, etat: 'pret', lignes: 16 }, 'le lecteur attend le Repérage, par pas, puis lit ses lignes');
  assert.deepEqual(s.sansMatch, { vide: true, lignes: 0, favoris: 0, etat: 'pret' }, 'un jour sans match : rien à dire, aucun appel ne partira');
  // Les matchs du jour : ceux qui ne sont pas commencés (un match coté commencé et un match de demain écartés, un match du calendrier sans cote gardé).
  assert.deepEqual(s.listeInjectee, { nombre: 2, lectures: { matchs: true, compositions: true, controle: true }, problemes: [] });
});

test('fiche de la semaine LUE : pronostics, paris, gain attendu, IA — chaque chiffre retrouvé par des boucles écrites à la main sur les fichiers plantés', () => {
  const s = unePhase.semaine();
  assert.deepEqual(s.entrees.problemes, []);
  assert.deepEqual(s.entrees.semaine.jours.length, 7);
  assert.equal(s.entrees.semaine.cle, '2026-09-28', 'le 05/10/2026 est un lundi : la semaine écoulée est celle du 28/09');
  const a = s.attendu;
  const f = s.fiche;
  // Les pronostics réglés (jours de Paris : le 27/09 à 22 h 30 UTC est le lundi 28/09 à Paris, le 04/10 à 22 h 30 UTC est le lundi 05/10).
  assert.deepEqual([f.pronostics.regles, f.pronostics.justes], [a.pronostics.regles, a.pronostics.justes]);
  assert.equal(f.pronostics.regles, 13, 'dont celui du 27/09 à 22 h 30 UTC (lundi à Paris) et sans celui du 04/10 à 22 h 30 UTC');
  const libellesMarche = { result: 'Résultat (1 / N / 2)', totalGoals: 'Total de buts', bothTeamsScore: 'Les deux équipes marquent', teamCorners: 'Corners d’une équipe' };
  for (const g of f.pronostics.parMarche) {
    const [cle] = Object.entries(libellesMarche).find(([, l]) => l === g.libelle);
    assert.deepEqual([g.regles, g.justes], [a.pronostics.parMarche[cle].regles, a.pronostics.parMarche[cle].justes], g.libelle);
  }
  assert.equal(f.pronostics.parMarche.length, Object.keys(a.pronostics.parMarche).length);
  for (const g of f.pronostics.parChampionnat) assert.deepEqual([g.regles, g.justes], [a.pronostics.parLigue[g.libelle].regles, a.pronostics.parLigue[g.libelle].justes], g.libelle);
  // Les paris : gain réel, mise, ROI, annulés écartés des taux ; en attente.
  const p = f.paris;
  assert.deepEqual([p.regles, p.gagnes, p.perdus, p.annules, p.enAttente], [a.paris.regles, a.paris.gagnes, a.paris.perdus, a.paris.annules, a.paris.enAttente]);
  proche(p.mise, a.paris.mise, 0.005, 'mise');
  proche(p.gainReel, a.paris.gainReel, 0.005, 'gain réel');
  proche(p.roiPct, a.paris.roiPct, 0.05, 'ROI');
  // Le gain attendu : la règle du carnet arrondit chaque pari à deux décimales (0,23 + 0,50 + 0,80) — à un centime près de la somme brute.
  assert.equal(p.attendu.paris, a.paris.attendu.paris);
  proche(p.attendu.gainAttendu, a.paris.attendu.gainAttendu, 0.01, 'gain attendu');
  proche(p.attendu.gainReel, a.paris.attendu.gainReel, 0.005, 'gain réel des mêmes paris');
  proche(p.attendu.ecart, p.attendu.gainReel - p.attendu.gainAttendu, 0.011, 'écart = réel − attendu');
  // Les championnats : le gain de chaque championnat, le combiné de Ligue 1 compris ; les annulés ne comptent pas parmi les réglés.
  const lignes = [...f.championnats.rentables, ...f.championnats.perdants];
  assert.deepEqual(lignes.map((x) => x.championnat).sort(), Object.keys(a.paris.ligues).sort());
  for (const x of lignes) {
    proche(x.gain, a.paris.ligues[x.championnat].gain, 0.005, x.championnat);
    assert.equal(x.regles, a.paris.ligues[x.championnat].paris, `${x.championnat} : les paris RÉGLÉS (gagnés + perdus), pas l’annulé`);
  }
  // L’IA : les avis jugés dont le MATCH est dans la semaine ; ceux d’avant la cote minimale, nuancés ou sans revue sont écartés.
  assert.deepEqual([f.ia.semaine.avis, f.ia.semaine.tenus], [a.ia.avis, a.ia.tenus]);
  assert.deepEqual(f.ia.semaine.erreurs.map((e) => `${e.match} | ${e.marche}`).sort(), [...a.ia.erreurs].sort());
  assert.deepEqual([f.ia.carnet.etat, f.ia.carnet.avis, f.ia.carnet.tenus], ['lu', 716, 394]);
  assert.deepEqual(f.ia.carnet.parMarche.map((g) => g.libelle), ['Résultat'], 'un marché sans avis n’est pas listé');
  // La carte « où parier » : aucune carte dans la base d’essai, dit.
  assert.equal(f.championnats.carteOuParier, null);
  assert.match(s.texte, /Carte « où parier » : pas encore mesurée\./);
  assert.ok(s.tokensEstimes.semaine > 400 && s.tokensEstimes.semaine < 2_500, `${s.tokensEstimes.semaine} tokens estimés`);
  assert.equal(s.vide, false);
});

test('fiche de la semaine LUE — la valeur de clôture, un carnet de l’IA absent ou illisible, un carnet de paris illisible, une semaine vide', () => {
  const s = unePhase.semaine();
  assert.equal(s.entrees.cloture.disponible, true, 'le vrai rapport de clôture tourne sur la base d’essai (sans cote gratuite : rien de mesuré)');
  assert.equal(s.fiche.valeurDeCloture.parisMesures, 0);
  assert.match(s.texte, /Aucun pari simple de la semaine n’a de valeur de clôture mesurée/);
  // Des mesures connues : la moyenne des seuls paris de la semaine (4,0 − 2,0 + 7,0)/3 = 3,0, le pari d’une autre semaine écarté.
  assert.deepEqual(s.cloture, { disponible: true, raison: null, parisMesures: 3, moyennePct: 3, positifs: 2 });
  assert.deepEqual(s.clotureIndisponible.fiche, { disponible: false, raison: 'base des cotes indisponible', parisMesures: 0, moyennePct: null, positifs: 0 });
  assert.match(s.clotureIndisponible.texte[0], /Valeur de clôture indisponible \(base des cotes indisponible\) : ne dis rien d'elle\./);
  assert.equal(s.sansCarnet.etat, 'absent');
  assert.match(s.sansCarnet.texte[0], /pas encore calculé : ne dis rien de sa fiabilité d'ensemble/);
  assert.equal(s.carnetIllisible.etat, 'illisible');
  assert.match(s.carnetIllisible.texte[0], /illisible pour l’instant/);
  assert.equal(s.parisIllisibles.problemes.length, 1);
  assert.match(s.parisIllisibles.problemes[0], /carnet de paris illisible/);
  assert.ok(s.parisIllisibles.texte.some((l) => /ÉCHOUÉ/.test(l)));
  // Une lecture qui échoue est DITE par la fiche (jamais prise pour « aucun pari ») : le drapeau « lu » tombe, pour chacun des trois journaux.
  assert.deepEqual([s.parisIllisibles.lu, s.parisIllisibles.lectures], [false, { pronostics: true, paris: false, analyses: true }]);
  assert.ok(s.parisIllisibles.texte.some((l) => /Le carnet de paris est illisible pour l’instant/.test(l)));
  assert.deepEqual(s.toutIllisible.lectures, { pronostics: false, paris: false, analyses: false });
  assert.deepEqual(s.toutIllisible.lu, [false, false, false]);
  assert.equal(s.toutIllisible.vide, false, 'illisible n’est pas vide : l’appel ne serait pas jeté en « rien à commenter »');
  assert.equal(s.toutIllisible.problemes, 3);
  assert.ok(s.toutIllisible.lignesIllisibles >= 3, `${s.toutIllisible.lignesIllisibles} lignes qui disent « illisible »`);
  assert.equal(s.semaineVide.vide, true);
  assert.ok(s.semaineVide.texte.length >= 4, 'chaque rubrique dit qu’elle est vide, aucune ne disparaît');
});

// ================================================================================ 4. le service

test('UNE FOIS par jour, UNE FOIS par semaine : le deuxième appel de la journée ne part pas, le lendemain oui ; le bilan de la dernière semaine complète seulement', () => {
  const s = unePhase.uneFois();
  assert.deepEqual(s.avantTout.bulletin.code, 'a-faire');
  assert.equal(s.premier.code, 'ecrit');
  assert.equal(s.premier.appelFait, true);
  assert.equal(s.appelsApresLePremier, 1, 'un seul appel pour le premier bulletin');
  assert.equal(s.fichierApresLePremier.bulletins['2026-10-05'].essai, 1);
  assert.deepEqual(s.memeJour.map((r) => [r.code, r.appelFait]), [['deja-fait', false], ['deja-fait', false]], 'deux passes plus tard, le même jour : rien ne part');
  assert.equal(s.appelsMemeJour, 1);
  assert.equal(s.memeTexte, true, 'le texte du jour reste le premier');
  assert.equal(s.decisionMemeJour.du, false);
  assert.match(s.decisionMemeJour.pourquoi, /^Le bulletin du 05\/10\/2026 est déjà écrit \(à 06 h 10\) : un seul par jour\.$/);
  assert.equal(s.lendemain.code, 'ecrit');
  assert.equal(s.appelsLendemain, 2);
  assert.deepEqual(s.clesDuFichier, ['2026-10-05', '2026-10-06']);
  // Le bilan : une fois pour la semaine du 28/09, que ce soit le lundi, le soir ou le mercredi.
  assert.equal(s.bilan1.code, 'ecrit');
  assert.deepEqual(s.bilanMemeSemaine.map((r) => r.code), ['deja-fait', 'deja-fait']);
  assert.deepEqual(s.clesBilans, ['2026-09-28'], 'la clé d’un bilan est le lundi de la semaine couverte');
  assert.equal(s.appelsBilan, 1);
  assert.match(s.decisionBilan.pourquoi, /^Le bilan de la semaine du 28\/09\/2026 au 04\/10\/2026 est déjà écrit \(à 06 h 10\) : un seul par semaine\.$/);
  assert.equal(s.bilanSuivant.code, 'ecrit', 'le lundi suivant : un nouveau bilan, pour la semaine suivante');
  assert.deepEqual(s.clesBilansApres, ['2026-09-28', '2026-10-05']);
  // Pas avant 6 h (heure de Paris) : à 5 h 59 rien, à 6 h 00 le bulletin ; le bilan non plus.
  assert.equal(s.avant6h.code, 'trop-tot');
  assert.match(s.avant6h.resume, /^Pas avant 6 h \(heure de Paris\)/);
  assert.equal(s.six.code, 'ecrit');
  assert.equal(s.appelsPlus, 1);
  assert.equal(s.bilanAvant6h.code, 'trop-tot');
  // Rattrapage : deux semaines d’arrêt — un seul bilan, celui de la dernière semaine complète, jamais ceux des semaines manquées.
  assert.equal(s.rattrapage.code, 'ecrit');
  assert.deepEqual(s.clesRattrapage, ['2026-10-05']);
  assert.deepEqual(Object.fromEntries(Object.entries(s.semaines).map(([j, w]) => [j, w.cle])), { '2026-10-05': '2026-09-28', '2026-10-11': '2026-09-28', '2026-10-12': '2026-10-05', '2026-11-02': '2026-10-26', '2027-01-01': '2026-12-21', '2026-03-30': '2026-03-23' });
  assert.deepEqual(s.enLettres, ['du lundi 28 septembre au dimanche 4 octobre 2026', 'du lundi 5 au dimanche 11 octobre 2026', 'du lundi 26 octobre au dimanche 1er novembre 2026']);
});

test('BUDGET (étape 4) : le bulletin et le bilan sont notés au journal à leur type, comptent sur le plafond de 150 (qui ne change pas), et le compteur s’accorde avec le journal', () => {
  const s = unePhase.budget();
  assert.deepEqual(s.resultats.map((r) => [r.code, r.tokens]), [['ecrit', 4000], ['ecrit', 4000]]);
  // Le journal des appels Claude.
  assert.deepEqual(s.journal.lignes.map((l) => [l.type, l.statut, l.modele, l.mode, l.tokens]), [['bulletin', 'ok', 'claude-code:sonnet', 'normal', 4000], ['bilan-semaine', 'ok', 'claude-code:sonnet', 'normal', 4000]]);
  assert.deepEqual(s.journal.lignes.map((l) => l.detail), ['bulletin du 2026-10-05', 'bilan de la semaine du 2026-09-28']);
  assert.ok(s.journal.lignes.every((l) => l.match === null && l.usd === 0.016));
  assert.ok(s.journal.lignes.every((l) => l.taille.consignes > 1000 && l.taille.message > 1000), 'la taille des consignes et de la fiche est notée');
  assert.deepEqual(s.journal.totaux, { appels: 2, tokens: 8000, parType: { bulletin: { appels: 1, ok: 1, tokens: 4000 }, 'bilan-semaine': { appels: 1, ok: 1, tokens: 4000 } } });
  // Le modèle et l’effort : ceux des analyses de match ; aucun outil (le modèle ne lit que la fiche).
  assert.deepEqual(s.appels.map((a) => [a.type, a.model, a.effort, a.tools]), [['bulletin', 'sonnet', 'low', ''], ['bilan-semaine', 'sonnet', 'low', '']]);
  // Le compteur du plafond : une place par appel, rangée dans son champ.
  assert.deepEqual(s.compteur, { day: '2026-10-05', count: 2, preMatch: 0, postMatch: 0, bulletin: 1, bilanSemaine: 1, skippedPreMatch: 0, skippedPostMatch: 0 });
  // L’état du budget : les deux types sont des appels AUTOMATIQUES ; le compteur et le journal s’accordent.
  assert.deepEqual(s.etat.types, ['avance', 'coup-d-envoi', 'reprise', 'revue', 'bulletin', 'bilan-semaine', 'manuel', 'autre']);
  assert.deepEqual(s.etat.parType, [{ type: 'bulletin', libelle: 'Bulletin du jour', automatique: true, appels: 1, tokens: 4000 }, { type: 'bilan-semaine', libelle: 'Bilan de la semaine', automatique: true, appels: 1, tokens: 4000 }]);
  assert.equal(s.etat.coherence.egal, true);
  assert.deepEqual([s.etat.coherence.compteur, s.etat.coherence.journalAutomatiques], [2, 2]);
  assert.deepEqual([s.etat.plafond.limite, s.etat.plafond.aujourdhui, s.etat.plafond.bulletin, s.etat.plafond.bilanSemaine, s.etat.plafond.restant], [150, 2, 1, 1, 148]);
  assert.deepEqual([s.etat.aujourdhui.tokens, s.etat.aujourdhui.appels], [8000, 2]);
  // Le plafond : une place restait — le bulletin passe ; plus aucune — le bilan attend, aucun appel de trop.
  assert.equal(s.dernierePlace.bulletin.code, 'ecrit');
  assert.equal(s.dernierePlace.compteur.count, 150);
  assert.equal(s.dernierePlace.compteur.bulletin, 1);
  assert.equal(s.dernierePlace.appelsDeTrop, 1, 'un seul appel : celui du bulletin');
  assert.equal(s.plein.code, 'plafond');
  assert.equal(s.plein.appels, 0, 'plafond atteint : rien ne part');
  assert.equal(s.plein.essais, null, 'et aucun essai raté n’est noté pour autant');
  assert.match(s.plein.resume, /^Plafond quotidien \(150\) atteint : le bulletin attend, reprise demain\.$/);
  assert.equal(s.plafond, 150);
  assert.equal(s.plafondApres, 150, 'le plafond de 150 analyses n’a pas bougé');
});

test('MODE ÉCONOME (étape 4) : choisi par Pierre ou à 80 % du budget du jour, il compacte la fiche et le dit au journal — il ne supprime jamais le texte', () => {
  const s = unePhase.econome();
  assert.equal(s.normal.code, 'ecrit');
  assert.equal(s.normal.modeNote, 'normal');
  assert.equal(s.econome.code, 'ecrit', 'le bulletin se fait aussi en mode économe');
  assert.equal(s.econome.modeNote, 'econome');
  assert.equal(s.econome.texte, true);
  assert.deepEqual(s.modesDesAppels, ['normal', 'econome'], 'le journal note le mode de chaque appel');
  assert.match(s.econome.resume, /mode économe/);
  assert.match(s.econome.fiche, /· mode économe \(fiche réduite\)/);
  assert.match(s.normal.fiche, /· mode normal/);
  assert.match(s.bilanEconome.resume, /mode économe/);
  // L’économe AUTOMATIQUE : le budget de l’appli (jamais l’abonnement) à 80 % du jour.
  assert.deepEqual(s.modeA80, { mode: 'econome', declencheurs: ['jour'], partJour: 1 });
  assert.equal(s.auto80.code, 'ecrit');
  assert.equal(s.auto80.modeNote, 'econome');
  // La fiche réduite : moins de lignes à chaque rubrique, les mêmes rubriques, les mêmes totaux.
  assert.deepEqual(s.lignesFiche, { normal: 8, econome: 4, sectionsN: s.lignesFiche.sectionsN, sectionsE: s.lignesFiche.sectionsN });
  assert.ok(s.tailles.econome < s.tailles.normal, `${s.tailles.econome} < ${s.tailles.normal}`);
  assert.deepEqual(s.titresDesRubriques.econome, s.titresDesRubriques.normal, 'aucune rubrique en moins');
  assert.ok(s.semaine.econome < s.semaine.normal);
  assert.deepEqual(s.semaine.rubriques.econome, s.semaine.rubriques.normal);
  assert.deepEqual(s.semaine.titres.econome, s.semaine.titres.normal);
  assert.equal(s.semaine.totauxIdentiques, true);
  for (const [n, e] of Object.values(s.semaine.lignes)) assert.ok(e < n, `${e} < ${n}`);
  assert.deepEqual(s.semaine.lignes.erreurs, [5, 3], 'cinq erreurs de l’IA en mode normal, trois en économe — de matchs différents');
  for (const cle of Object.keys(s.limites.normal)) assert.ok(s.limites.econome[cle] <= s.limites.normal[cle], cle);
});

test('PANNES comme pour les analyses : une panne, une réponse en erreur ou hors schéma n’écrit rien et se compte ; trois essais ratés, l’abandon ; une panne vue par les analyses l’arrête', () => {
  const s = unePhase.pannes();
  const [panne, erreur, sansSortie, abandon] = s.suite;
  assert.deepEqual([panne.statut, panne.code, panne.appels, panne.compteurPlus, panne.fichierBulletin], ['error', 'panne', 1, 0, false], 'une panne : en erreur, un appel, pas une place sur le plafond, rien d’écrit');
  assert.match(panne.resume, /^Panne de Claude Code \(Claude Code \(headless\) n'a pas répondu : panne simulée\) : rien d’écrit, essai 1 sur 3, nouvel essai à la passe suivante\.$/);
  assert.deepEqual([erreur.code, erreur.essai, erreur.compteurPlus], ['panne', 2, 0], 'is_error (quota épuisé…) : une panne de Claude Code aussi');
  assert.deepEqual([sansSortie.statut, sansSortie.code, sansSortie.essai], ['warn', 'forme', 3], 'un schéma non respecté : « à regarder », propre à cette réponse');
  assert.deepEqual(sansSortie.essais.map((e) => e.type), ['panne', 'panne', 'forme']);
  assert.deepEqual([abandon.code, abandon.appels, abandon.statut], ['essais-epuises', 0, 'ok'], 'trois essais ratés : plus aucun appel ce jour-là');
  assert.match(abandon.resume, /^Abandonné pour aujourd’hui : 3 essais ratés \(dernier : Claude Code \(headless\) : réponse sans sortie structurée \(schéma non respecté\)\)\. Nouvel essai demain\.$/);
  assert.equal(s.decision.du, false);
  assert.equal(s.lendemain.code, 'ecrit', 'le lendemain, un nouvel essai');
  // Des chiffres refusés : l’appel a consommé du quota (compté), rien d’écrit, le motif noté ; le deuxième essai porte un rappel.
  assert.deepEqual([s.refus.statut, s.refus.code, s.refus.compteurPlus, s.refus.fichierBulletin, s.refus.aRappel], ['warn', 'chiffres-refuses', 1, false, false]);
  assert.deepEqual(s.refus.refusesDuService, ['4321,7']);
  assert.deepEqual(s.refus.essais.map((e) => [e.type, e.refuses, e.champs, e.tokens]), [['chiffres', ['4321,7'], ['sections.0.texte'], 4000]]);
  assert.match(s.refus.essais[0].extraits[0], /4321,7/);
  assert.equal(s.refus.resume, 'Texte refusé : il citait 4321,7, absent(s) de la fiche. Rien n’est affiché ; essai 1 sur 3, nouvel essai à la passe suivante.');
  assert.deepEqual([s.reprise.code, s.reprise.aRappel, s.reprise.entree.essai, s.reprise.essaisApres, s.reprise.compteurPlus], ['ecrit', true, 2, null, 2], 'le deuxième essai réussit : rappel envoyé, essais effacés, deux places prises');
  assert.equal(s.memeFiche, true, 'le rappel vient APRÈS la fiche, qui est la même : les nombres autorisés restent ceux de la fiche seule');
  // Un nombre écrit en lettres qui n’est pas dans la fiche est refusé aussi.
  assert.deepEqual([s.lettres.code, s.lettres.refuses], ['chiffres-refuses', [['quarante', true]]]);
  // Une forme invalide : la réponse a coûté, elle prend sa place sur le plafond.
  assert.deepEqual([s.forme.code, s.forme.compteurPlus, s.forme.essais], ['forme', 1, ['forme']]);
  assert.match(s.forme.resume, /« sections » manque ou est vide/);
  // Une panne que les analyses viennent de voir ; Claude Code non connecté ; l’interrupteur des analyses automatiques coupé.
  assert.deepEqual([s.enPanne.code, s.enPanne.appels, s.enPanne.essais], ['panne-en-cours', 0, null], 'aucun appel, et pas un essai raté de plus');
  assert.deepEqual([s.nonConnecte.code, s.nonConnecte.appels, s.nonConnecte.statut], ['non-configure', 0, 'warn']);
  assert.deepEqual([s.coupe.code, s.coupe.appels], ['interrupteur', 0]);
  // Le bilan a les mêmes règles.
  assert.deepEqual([s.bilan.panne.code, s.bilan.panne.essai, s.bilan.ok.code, s.bilan.ok.essai, s.bilan.essaisApres], ['panne', 1, 'ecrit', 2, null]);
  assert.equal(s.bilan.entree.essai, 2);
  // Le journal : chaque échec y est, au type du texte.
  assert.deepEqual(s.journalTypes['2026-10-05'].slice(0, 3), ['bulletin:echec', 'bulletin:echec', 'bulletin:echec']);
  assert.ok(s.journalTypes['2026-10-05'].includes('bilan-semaine:echec'));
});

test('RIEN À DIRE : aucun appel (0 token), le jour est fait quand même ; le Repérage pas prêt fait attendre le matin, l’après-midi le bulletin part avec ce qu’il y a', () => {
  const s = unePhase.rien();
  assert.deepEqual([s.vide.code, s.vide.appels, s.vide.compteur, s.vide.appelFait], ['ecrit-sans-appel', 0, 0, false]);
  assert.equal(s.vide.entree.sansAppel, true);
  assert.equal(s.vide.entree.texte, null);
  assert.equal(s.vide.entree.usage, null);
  assert.match(s.vide.entree.raison, /^Rien à commenter aujourd'hui/);
  assert.deepEqual([s.videSemaine.code, s.videSemaine.appels], ['ecrit-sans-appel', 0]);
  assert.equal(s.encore.code, 'deja-fait', 'la journée est faite : une autre passe ne rappelle rien');
  // Le Repérage pas prêt.
  assert.deepEqual([s.matin.code, s.matin.appels, s.matin.fichier], ['opportunites-en-attente', 0, null], 'le matin : on attend, sans appel ni essai noté');
  assert.equal(s.matinErreur.code, 'opportunites-en-attente');
  assert.match(s.matinErreur.resume, /le Repérage n’a rien rendu : le Repérage est tombé\)/);
  assert.deepEqual([s.apresMidi.code, s.apresMidi.appels], ['ecrit', 1], 'l’après-midi, avec des favoris à commenter : le bulletin part');
  assert.deepEqual(s.apresMidi.fiche, ['Les opportunités sont indisponibles (le Repérage est tombé) : ne dis rien des paris du jour.'], 'sa fiche dit que les opportunités manquent');
  assert.deepEqual([s.apresMidiSansFavori.code, s.apresMidiSansFavori.appels, s.apresMidiSansFavori.fichier], ['opportunites-en-attente', 0, null], 'sans favori et sans Repérage : rien à écrire pour l’instant');
});

test('ÉCRITURE par atomicJson : fichier temporaire renommé d’un bloc, jamais d’écriture sur le fichier lui-même ; un blocage OneDrive passager ne perd rien ; un fichier illisible n’est jamais réécrit ni payé', () => {
  const s = unePhase.ecriture();
  assert.equal(s.chemin, 'data/runtime/ai-bulletins.json');
  assert.deepEqual(s.ecrituresDuFichier, [], 'aucun writeFileSync direct sur ai-bulletins.json');
  assert.equal(s.ecrituresTemporaires, 1);
  assert.equal(s.renommagesVersLeFichier, 1);
  assert.equal(s.renommagesDepuisUnTmp, 1, 'le renommage part d’un fichier temporaire à côté');
  assert.deepEqual(s.resteDesTmp, [], 'aucun fichier temporaire oublié');
  assert.equal(s.json, true);
  assert.deepEqual([s.apresBlocage.code, s.apresBlocage.blocages], ['ecrit', 2], 'EBUSY deux fois (OneDrive tient le fichier) : l’écriture finit par passer');
  assert.deepEqual(s.apresBlocage.cles, ['2026-10-05', '2026-10-06'], 'et le texte du premier jour est toujours là');
  // Une fois par clé, même appelé directement.
  assert.deepEqual(s.deuxFois, { ecrit: false, raison: 'deja-ecrit', titreGarde: true });
  assert.deepEqual(s.remplacer, { ecrit: true, titre: 'autre' }, 'seul « remplacer: true » remplace — et rien dans l’appli ne le passe');
  // Illisible ou de mauvaise forme : jamais réécrit, jamais d’appel.
  assert.deepEqual([s.illisible.code, s.illisible.statut, s.illisible.appels, s.illisible.leve, s.illisible.intact, s.illisible.lu], ['illisible', 'error', 0, 'BulletinsIllisibles', true, 'illisible']);
  assert.match(s.illisible.resume, /illisible .* — aucun appel à Claude ne part tant que ce fichier ne se relit pas\.$/);
  assert.deepEqual(s.mauvaiseForme, { lu: 'illisible', intact: true });
  // On ne garde que les derniers textes ; les essais ratés d’une clé disparue partent avec elle.
  assert.deepEqual(s.rangement.garder, { bulletins: 31, bilans: 13 });
  assert.deepEqual([s.rangement.bulletins, s.rangement.premierBulletin, s.rangement.dernierBulletin], [31, '2026-08-10', '2026-09-09']);
  assert.deepEqual([s.rangement.bilans, s.rangement.premierBilan], [13, '2026-06-22']);
  assert.deepEqual(s.rangement.essais, ['bulletin:2026-09-09']);
  assert.deepEqual(s.essaisEfface, { avant: true, apres: false }, 'un texte écrit efface les essais ratés de sa clé');
});

test('les DEUX ÉTAPES de l’actualisation : après le carnet de l’IA, avant le contrôle quotidien (toujours dernier) ; jamais forcées par un clic ni contre l’interrupteur ; leur « pourquoi » dit en français', () => {
  const s = unePhase.etapes();
  const i = s.etapes.indexOf('bulletin');
  // Étape 44 (23/10/2026) : la mémoire de l'IA s'intercale entre le carnet et le bulletin.
  assert.equal(s.etapes[i - 2], 'carnetIA');
  assert.equal(s.etapes[i - 1], 'dossiersIA');
  assert.equal(s.etapes[i + 1], 'bilanSemaine');
  assert.equal(s.etapes[i + 2], 'controleQuotidien');
  assert.equal(s.etapes.at(-1), 'controleQuotidien');
  assert.equal(s.etapes.filter((k) => k === 'bulletin' || k === 'bilanSemaine').length, 2);
  assert.deepEqual(s.labels, { bulletin: "Bulletin du jour (texte de l'IA, un seul appel par jour)", bilanSemaine: "Bilan de la semaine (texte de l'IA, un seul appel par semaine)" });
  assert.deepEqual(s.ordre, s.etapes);
  assert.deepEqual(s.dueAuDepart, { bulletin: true, bilan: true });
  // Une passe écrit le bulletin : un appel, un résultat à la forme des autres étapes, rien à recharger.
  assert.deepEqual([s.passeBulletin.status, s.passeBulletin.changed, s.passeBulletin.code, s.passeBulletin.appelFait, s.passeBulletin.tokens, s.passeBulletin.ecrit], ['ok', false, 'ecrit', true, 4000, false]);
  assert.match(espaces(s.passeBulletin.summary), /^Bulletin du lundi 5 octobre 2026 écrit en un seul appel à Claude Code \(4 000 tokens, mode normal\) : 2 partie\(s\), \d+ nombre\(s\) cité\(s\), tous dans la fiche\. Il se lit dans Réglages\.$/);
  assert.match(s.passeBilan.summary, /^Bilan de la semaine du lundi 28 septembre au dimanche 4 octobre 2026 écrit en un seul appel à Claude Code/);
  assert.deepEqual(s.dueApres, { bulletin: false, bilan: true }, 'le bulletin est fait ; le bilan, pas encore');
  assert.deepEqual(s.dueFin, { bulletin: false, bilan: false });
  assert.deepEqual(s.dueFinManuel, { bulletin: false, bilan: false }, 'un clic « Actualiser maintenant » ne refait pas un texte déjà écrit');
  assert.deepEqual(s.dueDesEtapes, { bulletin: false, bilan: false, bulletinManuel: false, bilanManuel: false }, 'les deux étapes de la liste ne sont plus dues une fois leur texte écrit, à la passe comme au clic');
  assert.equal(s.appelsPasses, 2, 'deux passes, deux appels');
  assert.equal(s.pourquoiPasDue, 'Le bulletin du 05/10/2026 est déjà écrit (à 06 h 10) : un seul par jour.', 'la liste des étapes dit POURQUOI, pas seulement « pas due »');
  assert.equal(s.pourquoiSiAFaire, 'À faire.');
  assert.deepEqual(s.etapesTableau.map((e) => e.aUnPourquoi), [true, true]);
  // L’interrupteur des analyses automatiques coupé : ni la passe, ni un clic.
  assert.deepEqual(s.interrupteurCoupe, { bulletin: false, bulletinManuel: false, bilanManuel: false });
  // Les pannes que les analyses voient valent pour la passe : le bulletin n’enchaîne pas un appel sur une panne constatée.
  assert.deepEqual(s.apresPannesDesAnalyses, { analyses: 'error', claudeEnPanne: true, bulletin: { status: 'warn', code: 'panne-en-cours' }, appels: 0 });
  assert.deepEqual(s.sansPanne, { claudeEnPanne: false });
});

test('la ROUTE GET /api/match-ai-analysis/bulletins : même forme avant et après le premier texte, lecture seule, POST refusé, fichier illisible = 503 jamais pris pour vide', () => {
  const s = unePhase.route();
  assert.deepEqual([s.vide.code, s.vide.etat, s.vide.bulletin, s.vide.bilan], [200, 'absent', null, null]);
  assert.deepEqual(s.vide.semaine, { cle: '2026-09-28', du: '2026-09-28', au: '2026-10-04', enLettres: 'du lundi 28 septembre au dimanche 4 octobre 2026' });
  assert.deepEqual([s.vide.situation.bulletin.code, s.vide.situation.bilan.code], ['a-faire', 'a-faire']);
  assert.deepEqual(s.vide.historique, { bulletins: [], bilans: [] });
  assert.deepEqual(s.vide.regles, { heureDuBulletin: 6, essaisMax: 3, heureSansOpportunites: 12, garderBulletins: 31, garderBilans: 13, politiqueDesChiffres: 'refuser', modele: 'Claude Sonnet (Claude Code, quota de l’abonnement)' });
  assert.equal(s.vide.budget, 'normal');
  assert.deepEqual(s.rienEcrit, { fichiers: true, base: true, fichierDesTextesCree: false }, 'lire ne crée aucun fichier et n’écrit rien');
  assert.deepEqual(s.vide.cles.slice().sort(), ['bilan', 'budget', 'bulletin', 'dernierBilan', 'dernierBulletin', 'erreur', 'essais', 'etat', 'fichier', 'generatedAt', 'historique', 'interrupteur', 'jour', 'regles', 'semaine', 'situation']);
  // Rempli.
  assert.deepEqual([s.rempli.code, s.rempli.etat], [200, 'lu']);
  assert.deepEqual([s.rempli.bulletin.jour, s.rempli.bulletin.sections, s.rempli.bulletin.tokens, s.rempli.bulletin.mode], ['2026-10-05', 2, 4000, 'normal']);
  assert.equal(s.rempli.bulletin.garde.politique, 'refuser');
  assert.ok(s.rempli.bulletin.garde.nombresVus > 0 && s.rempli.bulletin.garde.nombresDeLaFiche > 20, 'les nombres cités et ceux de la fiche sont comptés');
  assert.match(s.rempli.bulletin.fiche, /^FICHE DU JOUR/);
  assert.equal(s.rempli.bilan.cle, '2026-09-28');
  assert.deepEqual([s.rempli.situation.bulletin.code, s.rempli.situation.bilan.code], ['deja-fait', 'deja-fait']);
  assert.deepEqual(s.rempli.historique.bulletins.map((t) => [t.cle, t.tokens, t.sansAppel]), [['2026-10-05', 4000, false]]);
  assert.deepEqual(s.rempli.historique.bilans.map((t) => [t.cle, t.tokens]), [['2026-09-28', 4000]]);
  assert.deepEqual(s.lectureSeule, { fichiers: true, base: true, memeReponse: true, appelsDeClaude: 0 }, 'lire deux fois ne change rien et n’appelle jamais Claude');
  assert.deepEqual([s.post.code, s.post.erreur], [404, 'Route introuvable : POST /api/match-ai-analysis/bulletins'], 'aucun bouton, aucune route n’écrit un bulletin');
  assert.deepEqual([s.illisible.code, s.illisible.etat, s.illisible.situation, s.illisible.historique], [503, 'illisible', 'illisible', { bulletins: [], bilans: [] }]);
  assert.match(s.illisible.erreur, /^Les textes du bulletin sont illisibles pour l’instant : ai-bulletins\.json illisible \(.*\) : rien n'est écrit tant qu'il ne l'est pas — rien n’est réécrit tant qu’ils ne se relisent pas\.$/);
  assert.deepEqual([s.voisines.status, s.voisines.tout], [200, 200], 'les autres routes du même routeur répondent comme avant');
  assert.equal(s.appelsDeClaude, 2, 'seulement les deux appels de l’essai lui-même');
});

// ================================================================================ 5. l’hygiène

const lireSrc = (...p) => fs.readFileSync(path.join(SERVEUR, 'src', ...p), 'utf8');
const NOUVEAUX = ['core/ai/bulletinService.js', 'core/ai/bulletinPrompt.js', 'core/ai/bulletinFiches.js', 'core/ai/gardeDesChiffres.js', 'data/repositories/aiBulletinRepository.js', 'api/controllers/bulletins.controller.js'];

test('hygiène : jamais l’API Anthropic à la clé ni l’ancien audit par lot ; un seul chemin vers Claude (Claude Code) ; aucun réseau ; jamais d’écriture directe', () => {
  for (const f of NOUVEAUX) {
    const t = lireSrc(...f.split('/')).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(t, /anthropicClient|aiAnalysisService|webLookup|ANTHROPIC_API_KEY|api\.anthropic\.com/, `${f} : pas d’API payante`);
    assert.doesNotMatch(t, /\bfetch\(|http\.request|https\.request|node:https?'/, `${f} : aucun réseau`);
    assert.doesNotMatch(t, /fs\.writeFileSync|writeFile\(|appendFile|createWriteStream/, `${f} : jamais d’écriture directe (atomicJson)`);
  }
  assert.match(lireSrc('core', 'ai', 'bulletinService.js'), /import \{ callClaudeCode, ClaudeCodeIndisponible, isClaudeCodeAuthenticated \} from '\.\/claudeCodeClient\.js';/);
  assert.match(lireSrc('data', 'repositories', 'aiBulletinRepository.js'), /import \{ readJsonFile, writeJsonAtomic \} from '\.\.\/\.\.\/utils\/atomicJson\.js';/);
  assert.equal(lireSrc('data', 'repositories', 'aiBulletinRepository.js').match(/writeJsonAtomic\(/g).length, 2, 'deux écritures, toutes deux par atomicJson (un texte, un essai raté)');
  // Le seul appel à Claude du service : un seul endroit.
  assert.equal(lireSrc('core', 'ai', 'bulletinService.js').match(/await appeler\(/g).length, 1, 'un seul appel à Claude dans tout le service');
  // Le journal : les deux types sont des types d’appel connus du budget.
  const ledger = lireSrc('data', 'repositories', 'claudeUsageLedger.js');
  assert.match(ledger, /bulletin: 'Bulletin du jour',\s*'bilan-semaine': 'Bilan de la semaine'/);
  assert.match(ledger, /TYPES_AUTOMATIQUES = Object\.freeze\(\['avance', 'coup-d-envoi', 'reprise', 'revue', 'bulletin', 'bilan-semaine'\]\)/);
});

test('aucun fichier du moteur n’est touché par l’étape : les nouveaux fichiers et ceux qu’elle retouche n’en font pas partie, aucun fichier du moteur ne les importe', async () => {
  const V = await imp('core/engine/engineVersions.js');
  const moteur = new Set(V.fichiersDuMoteur());
  const retouches = ['jobs/matchStatsAutoRefresh.js', 'data/opportunities.js', 'core/ai/claudeBudget.js', 'data/repositories/claudeUsageLedger.js', 'data/repositories/autoAiAnalysisRepository.js', 'api/routes/matchAiAnalysis.routes.js', 'data/roadmap/historique.js'];
  for (const f of [...NOUVEAUX, ...retouches]) assert.ok(!moteur.has(f), `${f} n’est pas un fichier du moteur`);
  assert.ok(![...moteur].some((f) => f.startsWith('core/ai/')), 'core/ai n’est pas dans le moteur');
  for (const f of moteur) {
    const texte = lireSrc(...f.split('/'));
    assert.doesNotMatch(texte, /bulletinService|bulletinPrompt|bulletinFiches|gardeDesChiffres|aiBulletinRepository|bulletins\.controller|ai-bulletins/, `${f}`);
  }
  assert.equal(moteur.size, 37, 'le moteur compte 37 fichiers, comme avant l’étape');
});
