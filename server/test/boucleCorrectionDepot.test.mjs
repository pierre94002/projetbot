/**
 * La boucle de correction (étape 26 du plan, 27/10/2026, partie A) — LE DÉPÔT : depotCorrections.js, seul écrivain
 * des tables correction_*, dans une copie isolée (aides/script-boucle-depot.mjs) — jamais dans le processus des tests.
 *   node --test test/boucleCorrectionDepot.test.mjs        (depuis server/)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';

const SCRIPT = path.join(SERVEUR, 'test', 'aides', 'script-boucle-depot.mjs');

let sortie = null;
function reel() {
  if (sortie) return sortie;
  const copie = preparerCopie({});
  try {
    const r = executer(copie, SCRIPT, { maintenant: '2027-02-01T08:00:00.000Z' });
    assert.equal(r.code, 0, r.erreurs.slice(-3000));
    assert.equal(r.reseau, false, 'aucun appel réseau');
    assert.ok(r.json, `sortie illisible : ${r.sortie.slice(-500)}`);
    sortie = r.json;
    return sortie;
  } finally {
    copie.nettoyer();
  }
}
const pas = (s, cle) => s.pas.find((p) => p.cle === cle);

test('une proposition naît « proposée » avec son entrée de journal ; un identifiant déjà pris ou une source inconnue : refusés, rien d’écrit', () => {
  const s = reel();
  assert.equal(s.creee.etat, 'proposee');
  assert.equal(s.creee.levier, 'modeleDeButs.rho');
  assert.equal(s.creee.avant, -0.05);
  assert.deepEqual(s.creee.cas, ['bothTeamsScore|niveau']);
  assert.equal(s.dejaPrise.raison, 'deja-prise');
  assert.equal(s.sourceInconnue.raison, 'invalide');
  assert.equal(s.toutes, 1);
});

test('les changements d’état : seulement les transitions permises (rien d’accepté pendant le banc), seulement depuis l’état VU (un double clic ou un écran périmé ne change rien : 409), un banc interrompu revient à « proposée » ; chaque changement écrit UNE entrée de journal, chaque refus n’en écrit aucune', () => {
  const s = reel();
  assert.deepEqual(pas(s, 'au-banc'), { cle: 'au-banc', ok: true, raison: null, statut: null, avant: 'proposee', apres: 'au-banc', journal: 1 });
  assert.deepEqual([pas(s, 'accepter-sans-banc-fini').raison, pas(s, 'accepter-sans-banc-fini').statut, pas(s, 'accepter-sans-banc-fini').apres, pas(s, 'accepter-sans-banc-fini').journal], ['transition', 409, 'au-banc', 0]);
  assert.deepEqual([pas(s, 'vue-perimee').raison, pas(s, 'vue-perimee').statut, pas(s, 'vue-perimee').journal], ['deja-change', 409, 0]);
  assert.deepEqual([pas(s, 'banc-interrompu').ok, pas(s, 'banc-interrompu').apres], [true, 'proposee']);
  assert.equal(pas(s, 'bancee').apres, 'bancee');
  assert.equal(pas(s, 'accepter').apres, 'acceptee');
  assert.deepEqual([pas(s, 'double-clic').raison, pas(s, 'double-clic').journal], ['deja-change', 0]);
  assert.equal(pas(s, 'mise-a-l-essai').apres, 'a-blanc');
  assert.deepEqual([pas(s, 'inconnue').raison, pas(s, 'inconnue').statut], ['inconnue', 404]);
  assert.deepEqual([pas(s, 'evenement-sans-etat').raison, pas(s, 'evenement-sans-etat').statut], ['invalide', 400]);
  assert.deepEqual(s.aBlanc, ['c26-2027-01-rho-1']);
  assert.deepEqual(s.proposition.banc, { verdict: 'retenu', gainPct: 1.2 });
  assert.equal(s.proposition.rangFile, 1);
  assert.equal(s.proposition.essai.numero, 1);
});

test('état et journal dans UNE transaction : une entrée de journal refusée (source inconnue) n’écrit pas l’état non plus ; un champ du contenu ne passe jamais par un changement d’état', () => {
  const s = reel();
  const j = pas(s, 'journal-refuse');
  assert.deepEqual([j.ok, j.raison, j.avant, j.apres, j.journal], [false, 'invalide', 'acceptee', 'acceptee', 0]);
  const c = pas(s, 'champ-interdit');
  assert.deepEqual([c.ok, c.raison, c.apres, c.journal], [false, 'invalide', 'acceptee', 0]);
});

test('la base garde le contenu d’une proposition (réglage, valeurs, déclaration) et ne l’efface jamais ; son suivi (rang, banc, essai) peut avancer', () => {
  const s = reel();
  assert.match(s.refus.contenu, /le contenu d’une proposition ne change jamais/);
  assert.match(s.refus.levier, /le contenu d’une proposition ne change jamais/);
  assert.match(s.refus.effacer, /une proposition ne s’efface jamais/);
  assert.equal(s.refus.suiviPermis, 'accepté');
});

test('le journal : ajout seul (la base refuse modification et effacement), chaque entrée avec sa phrase ; les événements d’état passent par changerLEtat ; lu par pages, du plus récent au plus ancien, ou par proposition', () => {
  const s = reel();
  assert.equal(s.ajoutSansEtat.ok, true);
  assert.equal(s.ajoutAvecEtat.raison, 'invalide');
  assert.equal(s.ajoutSansPhrase.raison, 'invalide');
  assert.deepEqual(s.journal.map((e) => e.evenement).reverse(), ['proposee', 'au-banc', 'banc-interrompu', 'au-banc', 'bancee', 'acceptee', 'mise-a-l-essai', 'demande-du-code']);
  assert.deepEqual(s.journal.find((e) => e.evenement === 'banc-interrompu'), { n: s.journal.find((e) => e.evenement === 'banc-interrompu').n, evenement: 'banc-interrompu', source: 'nuit', proposition: 'c26-2027-01-rho-1', de: 'au-banc', vers: 'proposee' });
  assert.deepEqual(s.page2, s.journal.slice(0, 2).map((e) => e.n));
  assert.deepEqual(s.pageAvant, s.journal.slice(2, 4).map((e) => e.n));
  assert.equal(s.dUneProposition, 7);
  assert.match(s.refusJournal.update, /le journal ne se réécrit jamais/);
  assert.match(s.refusJournal.delete, /le journal ne s’efface jamais/);
});

test('les résumés du mois : un par mois et par forme du tri, jamais réécrit ni effacé ; leurs essais ratés notés, jamais réécrits ni effacés', () => {
  const s = reel();
  assert.deepEqual(s.resume1, { ecrit: true });
  assert.deepEqual(s.resume2, { ecrit: false }, 'un résumé écrit empêche tout autre');
  assert.deepEqual(s.resumeVersion2, { ecrit: true }, 'une forme du tri corrigée a son propre résumé');
  assert.deepEqual(s.resumes, [{ version: 2, titre: 'Janvier 2027', sansAppel: false }, { version: 1, titre: 'Janvier 2027', sansAppel: false }]);
  assert.deepEqual(s.essais, ['garde', 'panne']);
  assert.equal(s.essaisV2, 0);
  assert.match(s.refusResume.update, /un résumé écrit ne se réécrit jamais/);
  assert.match(s.refusResume.delete, /un résumé écrit ne s’efface jamais/);
  assert.match(s.refusResume.updateEssai, /un essai noté ne se réécrit jamais/);
  assert.match(s.refusResume.deleteEssai, /un essai noté ne s’efface jamais/);
});
