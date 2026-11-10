/**
 * LA NUIT DES DÉBUTS DE SAISON (étape 35, lot 1b, 10/11/2026) — sur le magasin fabriqué de debutsNuitFabrique.mjs (forme
 * réelle, aucune donnée réelle), dans une copie isolée (réseau coupé, heure figée ; la vraie nuit dans le VRAI processus à
 * part) :
 *   node --test test/debutsNuit.test.mjs        (depuis server/)
 *
 *   T-N1 les fiches des matchs de championnat des 14 prochains jours, réécrites tant que le coup d'envoi n'est pas passé
 *        (heure inconnue : tant que leur date est après le jour de la nuit) ; un match sans ses deux identifiants FotMob :
 *        compté, ses noms dits, pas de fiche ; une coupe : pas de fiche, comptée ; aucun nom rangé ; rien au-delà des
 *        14 jours, même quand la liste du calendrier va plus loin (18 jours) ;
 *   T-N2 les tables du jour = l'état de DebutsAuJourJ au jour de la nuit (rejoué à part, à l'octet) ; les mouvements plantés
 *        (parti vu ailleurs, pas revu blessé, double possible) et la part des minutes sans identifiant ;
 *   T-N3 le jeton pris → « reporté », rien d'écrit ; le délai dépassé → enfant arrêté, rien rangé ; l'annuaire pas prêt →
 *        « reporté » ;
 *   T-N4 les tranches de 250 (5 ici), `en_cours` posé puis retiré, la reprise d'une nuit interrompue ; la main jamais rendue
 *        pendant une transaction ;
 *   T-N5 le contrôle anti-fuite : 20 couples, 0 écart ; une fuite plantée (le jour J compté dans le rang et les sommes) →
 *        des écarts nommés, l'alerte durable, le résumé ; à l'écran, le dixième contrôle anti-fuite (le dernier), ses écarts
 *        dits avec leur phrase ;
 *   T-N6 la place de l'étape (après les coupes, juste avant le contrôle quotidien, toujours dernier), `due`, le module chargé
 *        par import() DYNAMIQUE : cassé dans une copie, l'actualisation se charge, gelPronostics et moteurABlanc y sont,
 *        l'étape sort « en échec » sans lever.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import { __testing, __debutsPourLesTests } from '../src/jobs/matchStatsAutoRefresh.js';
import { NOMS, NUIT_D_ESSAI, SECONDE_NUIT } from './aides/debutsNuitFabrique.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-debuts-nuit.mjs');
const memo = new Map();
function phase(nom, { scripts = false } = {}) {
  if (memo.has(nom)) return memo.get(nom);
  const c = preparerCopie({ base: false });
  try {
    if (scripts) fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(c.serveur, 'scripts'), { recursive: true });
    const x = executer(c, SCRIPT, { args: [nom, '{}'], timeout: 300_000 });
    assert.equal(x.code, 0, `script-debuts-nuit ${nom} :\n${x.erreurs.slice(-3000)}`);
    assert.equal(x.reseau, false, 'un appel réseau a été tenté');
    assert.ok(x.json?.ok, x.sortie.slice(-2000));
    memo.set(nom, x.json);
    return x.json;
  } finally {
    c.nettoyer();
  }
}
const nuit = () => phase('nuit');
const cle = (f) => `${f.date}|${f.home_id}|${f.away_id}`;

test('T-N1 — les fiches des 14 prochains jours (championnat), réécrites tant que le coup d’envoi n’est pas passé ; un match sans ses deux identifiants : compté, nommé, sans fiche', () => {
  const j = nuit();
  assert.equal(j.nuit1.mode, 'complet', JSON.stringify(j.nuit1));
  // 13 fiches : Liga MX du jour même, EPL et Championship du 13/09, Serie A du 14/09, EPL du 20/09 — ni la coupe du 17/09,
  // ni le club inconnu du 16/09, ni l'EPL du 27/09 (au-delà des 14 jours).
  assert.deepEqual(j.fiches1.map((f) => `${f.date} ${f.league}`).sort(), [
    '2025-09-08 Liga MX',
    ...Array(3).fill('2025-09-13 EPL'),
    ...Array(3).fill('2025-09-13 Championship'),
    ...Array(3).fill('2025-09-14 Serie A - Italy'),
    ...Array(3).fill('2025-09-20 EPL')
  ].sort());
  assert.ok(j.fiches1.every((f) => f.date >= '2025-09-08' && f.date <= '2025-09-22'));
  assert.ok(!j.fiches1.some((f) => f.league === 'EFL Cup'), 'une coupe n’a jamais de fiche');
  assert.equal(j.nuit1.bilan.coupesSansFiche, 1);
  assert.equal(j.nuit1.bilan.sansIdentifiant, 1);
  assert.deepEqual(j.nuit1.bilan.noms, [{ league: 'Championship', homeName: 'Ombres Inconnues FC', awayName: 'Forez Albion', inconnus: ['Ombres Inconnues FC'] }]);
  assert.match(j.resultat1.summary, /13 fiches pour les 14 prochains jours \(0 figée, 1 match de championnat sans fiche faute d’identifiant FotMob\)/);
  // La fiche du jour même : écrite pour la première fois alors que son coup d'envoi (heure inconnue) a peut-être eu lieu.
  const duJour = j.fiches1.find((f) => f.date === '2025-09-08');
  assert.equal(duJour.apres_coup_d_envoi, 1);
  assert.equal(j.fiches1.filter((f) => f.apres_coup_d_envoi).length, 1);
  assert.ok(j.fiches1.every((f) => f.kickoff === null && f.kickoff_connu === 0 && f.calcule_le === NUIT_D_ESSAI && f.note === '2026-11-09'));
  // Aucun nom rangé : des numéros FotMob seulement.
  for (const f of j.fiches1) for (const nom of Object.values(NOMS)) assert.ok(!f.entrees.includes(nom) && !(f.bras ?? '').includes(nom), `${nom} rangé dans une fiche`);
  // La seconde nuit (14/09) : les fiches du 14/09 et d'avant figées, celles du 20/09 réécrites, celle du 27/09 neuve.
  assert.equal(j.nuit2.mode, 'complet', JSON.stringify(j.nuit2));
  assert.deepEqual(j.nuit2.ecrites.fiches, { ecrites: 4, nouvelles: 1, reecrites: 3, figees: 3, apresCoupDEnvoi: 0 });
  const avant = new Map(j.fiches1.map((f) => [cle(f), f]));
  for (const f of j.fiches2) {
    if (f.date <= '2025-09-14') {
      assert.equal(f.calcule_le, NUIT_D_ESSAI, `${cle(f)} réécrite après son jour`);
      assert.equal(f.entrees, avant.get(cle(f)).entrees);
      assert.equal(f.bras, avant.get(cle(f)).bras);
    } else assert.equal(f.calcule_le, SECONDE_NUIT, `${cle(f)} pas réécrite avant son jour`);
  }
  assert.deepEqual(j.fiches2.filter((f) => f.date === '2025-09-27').map(cle), ['2025-09-27|1|3']);
  assert.equal(j.fiches2.length, 14);
  // L'EPL du 02/10 est dans les 18 jours de la liste du calendrier dès le 14/09, jamais dans les 14 jours d'une nuit.
  assert.ok(j.fiches2.every((f) => f.date <= '2025-09-28'), 'une fiche au-delà des 14 jours de la seconde nuit');
});

test('T-N2 — les tables du jour = l’état de DebutsAuJourJ au jour de la nuit, à l’octet ; mouvements, doubles, minutes sans identifiant', () => {
  const j = nuit();
  assert.equal(j.oracle.clubs, 31);
  assert.deepEqual(j.oracle.ecartsClubs, []);
  assert.equal(j.oracle.fiches, 13);
  assert.equal(j.oracle.nEcartsFiches, 0, JSON.stringify(j.oracle.ecartsFiches));
  const club = (n) => j.clubs1.find((c) => c.club === n);
  // Le retour après deux ans (14) : nouveau venu ; les autres, un début de saison dans leur championnat.
  assert.equal(club(14).statut, 'nouveau');
  assert.equal(club(14).ligue_avant, null);
  assert.equal(club(1).statut, 'debut');
  assert.equal(club(1).rang, 5);
  assert.equal(club(61).rang, 1, 'Serie A : la saison 2025-26 pas encore commencée au magasin');
  assert.equal(club(16).league, 'Championship', 'vu dans les 400 derniers jours, absent cette saison : gardé');
  assert.equal(j.clubs1.some((c) => c.club === 99 || c.club === 13), false, 'vus il y a plus de 400 jours : pas gardés');
  // Les mouvements plantés (Bocage United, 2) : 2005 parti, vu jouer pour Morvan Orient (21) ; 2007 pas revu, blessé.
  const m2 = JSON.parse(club(2).mouvements);
  const parti = m2.reference.find((r) => r.j === 2005);
  assert.deepEqual({ etat: parti.etat, club: parti.club, date: parti.date }, { etat: 'parti', club: 21, date: '2025-08-16' });
  const blesse = m2.reference.find((r) => r.j === 2007);
  assert.deepEqual({ etat: blesse.etat, raison: blesse.raison, jour: blesse.jourRaison }, { etat: 'pas-revu', raison: 'blesse', jour: '2025-09-05' });
  assert.ok(m2.reference.every((r) => r.etat !== 'parti' || (Number.isInteger(r.club) && /^\d{4}-\d{2}-\d{2}$/.test(r.date))), 'jamais « parti » sans club ni date');
  // Le double possible (Causses City, 3) : 3099 pas revu, 3015 arrivé, même naissance et même poste — dit, jamais réuni.
  const m3 = JSON.parse(club(3).mouvements);
  assert.deepEqual(m3.doubles.map((d) => [d.pasRevu, d.arrive, d.naissance]), [[3099, 3015, '1999-04-12']]);
  assert.equal(m3.reference.find((r) => r.j === 3099).etat, 'pas-revu');
  assert.ok(m3.arrives.some((a) => a.j === 3015));
  // La part des minutes sans identifiant FotMob (Esterel Town, 5) : 30 minutes par match, jamais comptées ailleurs.
  assert.ok(Math.abs(club(5).sans_identifiant - 120 / 4160) < 1e-12, String(club(5).sans_identifiant));
  // La force de l'effectif à blanc (fiches des joueurs) et la fiche gelée qui garde ses Δ (la preuve de 2027).
  const force = JSON.parse(club(1).force_effectif);
  assert.equal(force.fichesDu, '2025-09-07');
  assert.ok(Number.isFinite(force.dOff) && Number.isFinite(force.dDef));
  const f = JSON.parse(j.fiches1.find((x) => x.date === '2025-09-13' && x.home_id === 1).entrees);
  assert.deepEqual(f.home.effectif, force);
  assert.equal(f.home.rang, 5);
  assert.equal(JSON.parse(j.fiches1.find((x) => x.date === '2025-09-20' && x.home_id === 2).entrees).home.rang, 6, 'le rang du jour du match : les matchs déjà au calendrier d’ici là');
});

test('T-N3 — jeton pris → « reporté », rien d’écrit ; délai dépassé → enfant arrêté, rien rangé ; annuaire pas prêt → « reporté »', () => {
  const j = nuit();
  assert.equal(j.reporte.mode, 'reporte');
  assert.match(j.reporte.raison, /autre calcul lourd/i);
  assert.deepEqual(j.reporte.apres, j.reporte.avant, 'rien d’écrit');
  assert.equal(j.reporte.resultat.status, 'warn');
  assert.equal(j.reporte.resultat.details.reporte, true);
  assert.match(j.reporte.resultat.summary, /^Reporté : .* — les débuts de saison seront calculés à la passe suivante\.$/);
  assert.equal(j.reporte.resultat.summary.split('passe suivante').length, 2, 'dit une seule fois');
  assert.equal(j.delai.mode, 'echec');
  assert.match(j.delai.erreur, /calcul à part arrêté/);
  assert.deepEqual(j.delai.apres, j.delai.avant, 'rien rangé');
  assert.match(j.delai.resultat.summary, /^En échec : .* — rien d’avancé, les tables d’avant restent ; la passe suivante recommence/);
  assert.equal(j.annuaire.mode, 'reporte', JSON.stringify(j.annuaire));
  assert.match(j.annuaire.raison, /les annuaires des clubs ne sont pas prêts/);
  assert.doesNotMatch(j.annuaire.raison, /contexte du match|^Error/);
});

test('T-N4 — tranches de 250 (5 ici), `en_cours` posé puis retiré, reprise ; jamais la main rendue pendant une transaction', () => {
  const j = nuit();
  assert.equal(j.tranche, 250);
  assert.deepEqual(j.etat1, ['comptes', 'controle', 'nuit'], '`en_cours` retiré à la fin');
  assert.equal(j.reprise.mode, 'complet');
  assert.equal(j.reprise.repriseApres, '2025-09-16T00:41:00.000Z');
  assert.equal(j.reprise.enCours, 0);
  assert.ok(j.reprise.transactions >= 10, `${j.reprise.transactions} transactions de 5`);
  assert.equal(j.reprise.pausesEnTransaction, 0);
  assert.deepEqual(j.parTranches, { rendus: 2, enTransaction: 0, transactions: 3, finEnTransaction: false });
});

test('T-N5 — contrôle anti-fuite : 20 couples, 0 écart ; une fuite plantée → écarts nommés, alerte durable', async () => {
  const j = nuit();
  assert.equal(j.nuit1.controle.couples, 20);
  assert.equal(j.nuit1.controle.lignes, 20);
  assert.deepEqual(j.nuit1.controle.ecarts, []);
  assert.equal(j.resultat1.status, 'ok');
  assert.equal(j.resultat1.alert.key, 'debutsDeSaison');
  assert.equal(j.resultat1.alert.value, null);
  assert.match(j.resultat1.summary, / ; contrôle anti-fuite : 20 couples, 0 écart\.$/);
  assert.match(j.resultat1.summary, /^Débuts de saison : 31 clubs \(30 en début de saison, 0 promu ou relégué, 1 nouveau venu\), /);
  assert.equal(j.etatNuit1.controle.ecarts.length, 0);
  // La fuite plantée : le jour J déjà compté (rang, sommes, continuité) — chaque écart nommé, avec sa phrase.
  assert.equal(j.fuite.couples, 20);
  assert.ok(j.fuite.ecarts > 0);
  for (const c of ['rang', 'candidate.n', 'candidate.sa']) assert.ok(j.fuite.colonnes.includes(c), `${c} : ${j.fuite.colonnes}`);
  for (const t of j.fuite.premiers) assert.match(t, /^[A-Z][^:]* avant le \d{2}\/\d{2}\/\d{4} : /);
  assert.equal(j.alerteFuite.total, j.fuite.ecarts);
  assert.ok(j.alerteFuite.ecarts.length <= 20 && j.alerteFuite.ecarts.length > 0);
  assert.equal(j.resultatFuite.status, 'warn');
  assert.equal(j.resultatFuite.alert.key, 'debutsDeSaison');
  assert.ok(j.resultatFuite.alert.value);
  assert.ok(j.resultatFuite.summary.includes(`${j.fuite.ecarts} écarts (${j.fuite.premiers[0]})`));
  // L'alerte durable À L'ÉCRAN (ui/src/utils/controlesAntiFuite.js) : le dixième contrôle, le dernier, ses écarts dits avec
  // leur phrase ; sans écart, rien à dire.
  const A = await import(pathToFileURL(path.join(SERVEUR, '..', 'ui', 'src', 'utils', 'controlesAntiFuite.js')).href);
  assert.equal(A.CONTROLES_ANTI_FUITE.length, 10);
  assert.deepEqual(A.CONTROLES_ANTI_FUITE.at(-1), { cle: 'debutsDeSaison', nom: 'Débuts de saison (rangs, statuts et sommes au jour du match)' });
  const dits = A.controlesAntiFuiteDits({ debutsDeSaison: j.alerteFuite });
  assert.equal(dits.length, 1);
  assert.ok(dits[0].texte.startsWith(`Débuts de saison (rangs, statuts et sommes au jour du match) : ${j.fuite.ecarts} écarts sur ${j.alerteFuite.lignes} lignes recalculées (contrôle du `), dits[0].texte);
  assert.ok(dits[0].texte.includes(` — par exemple ${j.fuite.premiers[0]}`), dits[0].texte);
  assert.deepEqual(A.controlesAntiFuiteDits({ debutsDeSaison: j.resultat1.alert.value }), [], 'sans écart : rien à dire');
});

test('T-N6 — la place de l’étape, `due`, et le module chargé par import() dynamique (cassé : l’étape en échec, la passe ne lève pas)', async () => {
  const cles = __testing.ETAPES().map((e) => e.key);
  const i = cles.indexOf('debutsDeSaison');
  assert.equal(cles[i - 1], 'coupesEtMatchsAPart');
  assert.equal(cles[i + 1], 'controleQuotidien');
  assert.equal(cles.at(-1), 'controleQuotidien');
  const etape = __testing.ETAPES()[i];
  assert.equal(typeof etape.due, 'function', 'une étape à « due » : jamais forcée par un clic');
  const ctx = (derniere, details = null) => ({ derniere: () => derniere, derniersDetails: () => details });
  assert.equal(__debutsPourLesTests.dueDebuts(ctx(null)), true);
  assert.equal(__debutsPourLesTests.dueDebuts(ctx('2026-11-08T00:40:00.000Z')), true);
  assert.equal(__debutsPourLesTests.dueDebuts(ctx(new Date().toISOString())), false);
  assert.equal(__debutsPourLesTests.dueDebuts(ctx(new Date().toISOString(), { reporte: true })), true, 'reprise si reportée');
  // Le chargeur qui échoue, ou un module sans le nom attendu : « en échec », jamais une exception.
  const r1 = await __debutsPourLesTests.passeDebuts({}, { chargerLeModule: async () => { throw new Error('module cassé'); } });
  assert.equal(r1.status, 'error');
  assert.match(r1.summary, /^En échec : le module des débuts de saison ne se charge pas \(module cassé\) — rien d’avancé ; le reste de la nuit n’en dépend pas\.$/);
  const r2 = await __debutsPourLesTests.passeDebuts({}, { chargerLeModule: async () => ({}) });
  assert.equal(r2.status, 'error');
  // Le fichier CASSÉ dans une copie : l'actualisation se charge, le chemin de l'essai 27 est là, l'étape sort « en échec ».
  const s = phase('casse', { scripts: true });
  assert.equal(s.etapeDebuts.status, 'error');
  assert.match(s.etapeDebuts.summary, /^En échec : le module des débuts de saison ne se charge pas \(module des débuts cassé \(essai\)\)/);
  assert.deepEqual(s.cheminEssai, [
    { cle: 'gelPronostics', present: true, avant: true, run: 'function' },
    { cle: 'moteurABlanc', present: true, avant: true, run: 'function' }
  ]);
  assert.deepEqual(s.etapes.slice(-3), ['coupesEtMatchsAPart', 'debutsDeSaison', 'controleQuotidien']);
  // Le module se charge (le garde « le module se charge »).
  const m = await import('../src/data/debutsDeSaison/debutsNuit.js');
  assert.equal(typeof m.faireLesDebutsDeLaNuit, 'function');
  assert.equal(typeof m.resultatDeLEtape, 'function');
});
