/**
 * LA MISE À L'ÉCRAN (étape 39 « La mise juste », lot 1a, 04/11/2026) — les réponses du VRAI serveur (copie isolée,
 * aides/script-mise.mjs : un faux relevé The Odds API, la requête portant TOUJOURS bankroll=10000), les mots de l'écran
 * (ui/src/utils/miseAffichee.js, pur) et les écrans qui les montrent.
 *   node --test test/miseEcran.test.mjs        (depuis server/)
 *
 * T-E1 € et % partout, à la française (toLocaleString('fr-FR') : l'espace fine insécable des milliers) ;
 * T-E2 jamais un euro ni « 10 000 » sans capital ; « votre capital » ne vient JAMAIS d'un chiffre de la requête ; avec le
 *      capital, les euros = la mise du moteur sur ce capital (le même centime partout : page du match, Repérage, Opportunités) ;
 * T-E3 la règle candidate (à blanc) ne remplace jamais le conseil, en gris, quand elle diffère ; jamais « sûr » ;
 * T-E4 le ticket « J'ai parié » : vide sans capital, pré-rempli et marqué « conseil du moteur, modifiable » avec, pour LE
 *      pari du moteur seulement ;
 * T-E5 l'IA : la part dans le message (jamais un euro), la revue recalcule la part (jamais les euros gardés), le changement
 *      du message daté dans le carnet de l'IA ;
 * T-E6 les places : le capital dans Réglages › Gestion du risque sous le coupe-circuit, la phrase des séries, DESIGN.md.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preparerCopie, executer, SERVEUR } from './aides/isolement.mjs';
import * as C from '../src/core/ai/compactContext.js';
import { DEFAULT_ENGINE_CONFIG_BY_SPORT } from '../src/core/engine/engineConfig.js';
import { MOTS_DE_LA_MISE } from '../src/data/mise/regleDeMise.js';

const UI = path.resolve(SERVEUR, '..', 'ui');
const U = await import(pathToFileURL(path.join(UI, 'src', 'utils', 'miseAffichee.js')).href);
const lireUi = (...p) => fs.readFileSync(path.join(UI, 'src', ...p), 'utf8');
/** Le code seul (sans commentaires JS ni HTML) : un mot cité dans une explication n'est pas du code. */
const codeUi = (...p) =>
  lireUi(...p)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const fr2 =(x) => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fr = (x) => x.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(x) ? 0 : 2, maximumFractionDigits: 2 });

let memo = null;
function serveur() {
  if (memo) return memo;
  const copie = preparerCopie({});
  try {
    fs.cpSync(path.join(SERVEUR, 'scripts'), path.join(copie.serveur, 'scripts'), { recursive: true });
    const r = executer(copie, path.join(SERVEUR, 'test', 'aides', 'script-mise.mjs'), { args: ['analyse', '{}'], timeout: 300_000 });
    assert.equal(r.code, 0, `script-mise.mjs analyse :\n${r.erreurs.slice(-3000)}\n${r.sortie.slice(-1500)}`);
    assert.equal(r.reseau, false, 'un appel réseau a été tenté');
    memo = r.json;
    return memo;
  } finally {
    copie.nettoyer();
  }
}
const sansEuros = (objet) => !/"(stake|mise)":\s*-?\d/.test(JSON.stringify(objet)) && !/misePlafonnee/.test(JSON.stringify(objet));

test('T-E1 € et % partout, à la française : la part, les euros d’une mise, le capital, les euros signés', () => {
  assert.equal(U.pourcentDuCapital(0.0039), `${fr2(0.39)} %`);
  assert.equal(U.pourcentDuCapital(0.02), `${fr2(2)} %`);
  assert.equal(U.eurosDeMise(7.8), `${fr2(7.8)} €`);
  assert.equal(U.eurosDuCapital(2000), `${fr(2000)} €`);
  assert.ok(U.eurosDuCapital(2000).includes(String.fromCharCode(0x202f)), 'l’espace fine insécable des milliers (toLocaleString fr-FR)');
  assert.equal(U.eurosDuCapital(2012.5), `${fr(2012.5)} €`);
  assert.equal(U.eurosSignes(12), `+${fr(12)} €`);
  assert.equal(U.eurosSignes(-8.5), `−${fr(8.5)} €`);
  const s = serveur();
  const l = U.lignesDeLaMise(s.analyseAvec.mise);
  assert.equal(l.titre, `Mise conseillée : ${U.pourcentDuCapital(s.analyseAvec.mise.fraction)} de votre capital`);
  assert.match(l.titre, / %/);
  assert.equal(l.euros, `soit ${fr2(s.analyseAvec.mise.euros)} € sur votre capital de ${fr(2000)} € (réglé le 05/10 · suivi de vos paris : ${fr(0)} €)`);
  // Les anciens affichages sans symbole ont disparu (« mise 39 », « mise recommandée : 39 », la mise en euros de la carte).
  assert.doesNotMatch(lireUi('views', 'UpcomingMatchView.vue'), /pariConseille\.stake/);
  assert.doesNotMatch(lireUi('components', 'analysis', 'MatchAiReviewPanel.vue'), /s\.stake/);
  assert.doesNotMatch(lireUi('components', 'analysis', 'ResultPredictionCard.vue'), /euros\(s\.stake\)|s\.stake/);
  assert.doesNotMatch(lireUi('views', 'MyBetsView.vue'), /formatCurrency\(c\.recommendedStake\)|Kelly fractionné sur la bankroll/);
});

test('T-E2 jamais un euro ni « 10 000 » sans capital ; votre capital ne vient JAMAIS de la requête (bankroll=10000 envoyé, 2 000 € réglés → 2 000) ; avec lui, le même centime partout', () => {
  const s = serveur();
  // Sans capital : la liste, la fiche et l'analyse n'ont aucun euro interne, aucun « 10000 », aucune base.
  assert.equal(s.listeSans.code, 200);
  assert.equal(s.listeSans.n, 2);
  assert.deepEqual(s.listeSans.capital, { indique: false, montant: null, raison: 'non-indique' });
  for (const t of [s.listeSans.texte, s.ficheSans.texte, JSON.stringify(s.analyseSans)]) {
    assert.doesNotMatch(t, /10000|10 000|bankroll/, 'aucun 10 000 ni aucune base dans la réponse');
  }
  const a = s.analyseSans;
  assert.equal(a.staking.action, 'RECOMMENDED', 'la value de Man City – Liverpool chez William Hill');
  assert.ok(!('stake' in a.staking), 'staking.stake retiré sans capital');
  assert.ok(sansEuros({ staking: a.staking, verdicts: a.verdicts, comparateur: a.comparateur }), 'aucune mise en euros dans la décision, les verdicts, le comparateur');
  assert.equal(a.mise.conseil, true);
  assert.equal(a.mise.euros, null);
  assert.equal(a.mise.capital.indique, false);
  assert.equal(a.mise.fraction, s.partAttendue, 'la part = partDeMise(ev, cote nette), recalculée');
  const l = U.lignesDeLaMise(a.mise);
  assert.equal(l.euros, null);
  assert.equal(l.sansCapital, MOTS_DE_LA_MISE.capitalNonIndique);
  // Avec 2 000 € réglés, la MÊME requête (bankroll=10000) : le capital vient du serveur.
  assert.equal(s.put.code, 200);
  const b = s.analyseAvec;
  assert.equal(b.mise.capital.indique, true);
  assert.equal(b.mise.capital.montant, 2000, '« votre capital » = le capital réglé, jamais le 10 000 de la requête');
  const attendu = Number((s.partAttendue * 2000).toFixed(2));
  assert.equal(b.staking.stake, attendu, 'la mise du moteur sur 2 000 €');
  assert.equal(b.mise.euros, attendu, 'les euros = la mise du moteur (une seule place)');
  assert.notEqual(b.mise.euros, Number((s.partAttendue * 10000).toFixed(2)), 'jamais la mise sur 10 000');
  assert.doesNotMatch(JSON.stringify(b), /10000|bankroll/);
  assert.equal(s.listeAvec.capital.montant, 2000);
  assert.doesNotMatch(s.listeAvec.texte, /10000|bankroll/);
  // Le Repérage et les Opportunités : la même part, les mêmes euros, aucun euro de leur base interne.
  const r = s.reperage.data.matches.find((m) => m.matchId === 'essai-a');
  assert.equal(r.mise.fraction, b.mise.fraction);
  assert.equal(r.mise.euros, b.mise.euros, 'le même centime que la page du match');
  assert.ok(sansEuros(s.reperage.data.matches.map((m) => m.markets)), 'aucune mise dans les verdicts du Repérage');
  assert.equal(s.reperage.data.capital.montant, 2000);
  const o = s.opportunites.data.lignes.find((x) => x.cle === 'essai-a|home');
  assert.equal(o.mise.euros, b.mise.euros);
  assert.ok(sansEuros(s.opportunites.data.lignes.map((x) => x.verdict)));
  assert.ok(sansEuros(s.vertes));
  // Sans capital, le Repérage et les Opportunités : la part seule.
  const rs = s.reperageSans.data.matches.find((m) => m.matchId === 'essai-a');
  assert.equal(rs.mise.euros, null);
  assert.equal(rs.mise.fraction, b.mise.fraction);
  assert.doesNotMatch(JSON.stringify(s.opportunitesSans), /10000|"(stake|mise)":\s*\d/);
  // L'interface n'envoie plus de bankroll et n'en garde plus.
  for (const f of [['services', 'matchesApi.js'], ['services', 'analysisApi.js'], ['stores', 'matchesStore.js'], ['stores', 'analysisStore.js'], ['views', 'TeamView.vue'], ['views', 'UpcomingMatchView.vue']]) {
    assert.doesNotMatch(codeUi(...f), /bankroll|setBankroll|10000/, f.join('/'));
  }
  assert.doesNotMatch(codeUi('views', 'MyBetsView.vue'), /matchesStore\.bankroll|label="Bankroll"|10000/);
});

test('T-E3 la règle candidate (à blanc) : en gris, seulement quand elle diffère, jamais à la place du conseil ; jamais « sûr »', () => {
  const s = serveur();
  const m = s.analyseAttente.mise;
  assert.equal(m.capital.montant, 1000);
  assert.equal(m.euros, Number((s.partAttendue * 1000).toFixed(2)), 'le conseil reste celui du moteur');
  assert.equal(m.aBlanc.differe, true);
  assert.equal(m.aBlanc.f, 0, 'un pari de 50 € en attente sur ce match : la place est prise');
  const l = U.lignesDeLaMise(m);
  assert.equal(l.titre, `Mise conseillée : ${U.pourcentDuCapital(m.fraction)} de votre capital`, 'le titre reste le conseil');
  assert.match(l.euros, new RegExp(`^soit ${fr2(m.euros).replace(/\s/gu, '\\s')} €`, 'u'));
  assert.ok(l.aBlanc.startsWith(`${MOTS_DE_LA_MISE.aBlanc} : ${U.pourcentDuCapital(0)} de votre capital`), l.aBlanc);
  assert.match(l.aBlanc, /la place est prise/);
  assert.equal(U.lignesDeLaMise(s.analyseAvec.mise).aBlanc, null, 'identique au conseil : rien en gris');
  for (const t of [fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'mise', 'regleDeMise.js'), 'utf8'), fs.readFileSync(path.join(SERVEUR, 'src', 'data', 'mise', 'miseRead.js'), 'utf8'), lireUi('utils', 'miseAffichee.js'), lireUi('components', 'settings', 'CapitalPanel.vue')]) {
    assert.doesNotMatch(t.replace(/«\s*sûr\s*»\s*n’augmente rien|« sûr » n'augmente/g, ''), /['"«]\s*sûr\s*['"»]/, 'jamais « sûr » à l’écran');
  }
  // À l'écran : la ligne à blanc vient APRÈS le conseil, dans son propre élément gris.
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.ok(page.indexOf('miseDuConseil.titre') < page.indexOf('miseDuConseil.aBlanc'));
  assert.match(page, /upcoming__advice-mise-blanc/);
  assert.match(lireUi('components', 'analysis', 'ResultPredictionCard.vue'), /data-mise="a-blanc"/);
});

test('T-E4 le ticket « J’ai parié » : vide sans capital ; pré-rempli et marqué « conseil du moteur, modifiable » avec, pour LE pari du moteur seulement', () => {
  const s = serveur();
  assert.equal(U.misePourLeTicket(s.analyseSans.mise), null, 'sans capital : vide');
  assert.deepEqual(U.misePourLeTicket(s.analyseAvec.mise), { montant: s.analyseAvec.mise.euros, marque: 'conseil du moteur, modifiable' });
  assert.equal(U.misePourLeTicket(null), null);
  assert.equal(U.misePourLeTicket({ ...s.analyseAvec.mise, conseil: false }), null);
  const staking = s.analyseAvec.staking;
  const selection = { marketId: 'result', params: { outcome: staking.outcome }, bookmaker: staking.bookmaker };
  assert.deepEqual(U.misePourLaSelection({ selections: [selection], staking, mise: s.analyseAvec.mise }), U.misePourLeTicket(s.analyseAvec.mise));
  assert.equal(U.misePourLaSelection({ selections: [{ ...selection, bookmaker: 'betclic_fr' }], staking, mise: s.analyseAvec.mise }), null, 'un autre bookmaker : pas le conseil');
  assert.equal(U.misePourLaSelection({ selections: [{ ...selection, params: { outcome: 'draw' } }], staking, mise: s.analyseAvec.mise }), null);
  assert.equal(U.misePourLaSelection({ selections: [selection, { marketId: 'totalGoals' }], staking, mise: s.analyseAvec.mise }), null, 'un combiné : jamais pré-rempli');
  assert.equal(U.misePourLaSelection({ selections: [selection], staking, mise: s.analyseSans.mise }), null, 'sans capital : vide');
  // Les deux tickets partent vides et ne se pré-remplissent que par ces règles.
  const page = lireUi('views', 'UpcomingMatchView.vue');
  assert.match(page, /mise: null, prerempli: null/);
  assert.doesNotMatch(page, /mise: 10\b/);
  assert.match(page, /misePourLaSelection\(\{ selections: ticket\.selections/);
  assert.match(page, /data-mise="ticket-marque"/);
  const mesParis = lireUi('views', 'MyBetsView.vue');
  assert.match(mesParis, /const slipStake = ref\(null\);/);
  assert.match(mesParis, /misePourLeTicket\(legs\[0\]\.mise\)/);
  assert.doesNotMatch(mesParis, /recommendedStake\.toFixed|slipStake = ref\(10\)/);
  assert.match(mesParis, /data-mise="ticket-marque"/);
});

test('T-E5 l’IA : la PART dans le message (jamais un euro), la revue recalcule la part, le changement du message daté dans le carnet de l’IA', () => {
  const F = JSON.parse(fs.readFileSync(path.join(SERVEUR, 'test', 'fixtures', 'fiche-ia-etape-41.json'), 'utf8'));
  const x = F.avantA.entree;
  const fiche = C.ficheAvantMatch({ home: x.home, away: x.away, league: x.league, commenceTime: x.commenceTime, timing: x.timing, engineSummary: x.engineSummary });
  const reglage = { kellyFraction: DEFAULT_ENGINE_CONFIG_BY_SPORT.football.kellyFraction, maxStakePercent: DEFAULT_ENGINE_CONFIG_BY_SPORT.football.maxStakePercent };
  const part = C.partDuCapitalPourIA({ ev: 0.0599, cote: 2.3, reglage });
  assert.match(fiche, new RegExp(`RECOMMENDED : ${(100 * part).toFixed(2).replace('.', ',')} % du capital sur Girona gagne à 2,3 chez William Hill`));
  const moteur = fiche.slice(fiche.indexOf('Mise (staking)'), fiche.indexOf('Mise (staking)') + 600);
  assert.doesNotMatch(moteur, /21,5|€/, 'la mise interne (21,5) n’est jamais écrite, aucun euro');
  assert.equal(C.NON_RECOPIES['moteur.staking.stake'].length > 15, true, 'la raison de la mise non recopiée est écrite');
  // La revue : la part recalculée depuis l'avantage et la cote gardés, jamais les euros gardés.
  assert.equal(U.miseDeLaRevue({ action: 'RECOMMENDED', ev: 0.0599, odds: 2.3, stake: 21.5 }), `mise recommandée : ${U.pourcentDuCapital(part)} du capital`);
  assert.equal(U.miseDeLaRevue({ action: 'PASS', stake: null }), 'pas de mise');
  assert.deepEqual({ ...U.REGLE_DE_MISE_AFFICHEE }, reglage, 'la règle de l’écran = celle du moteur');
  assert.match(lireUi('components', 'analysis', 'MatchAiReviewPanel.vue'), /miseDeLaRevue\(engine\.value\?\.staking/);
  // Le changement daté, dans le carnet de l'IA.
  assert.match(C.MISE_EN_PART_DANS_LE_MESSAGE.le, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(C.MISE_EN_PART_DANS_LE_MESSAGE.etape, 39);
  const carnet = lireUi('components', 'analysis', 'AiScorecardPanel.vue');
  assert.match(carnet, /data-mise="message-date"/);
  assert.match(carnet, /MISE_EN_PART_DANS_LE_MESSAGE/);
});

test('T-E6 les places : le capital sous le coupe-circuit (Réglages › Gestion du risque), la phrase des séries, le Repérage et les Opportunités, DESIGN.md', () => {
  const reglages = lireUi('views', 'SettingsView.vue');
  const i = reglages.indexOf('<RiskControlPanel');
  const j = reglages.indexOf('<CapitalPanel />');
  const k = reglages.indexOf('<GardeFousPanel');
  assert.ok(i > 0 && j > i && k > j, 'Capital entre le coupe-circuit et les garde-fous');
  const panneau = lireUi('components', 'settings', 'CapitalPanel.vue');
  for (const mot of ['Votre capital réservé aux paris', 'Suit mes paris enregistrés', 'Jamais plus bas que … sous mon plus haut', 'Vide : rien (aucun plancher)', 'MOTS_DE_LA_MISE.nonEnregistres', 'Vos comptes déclarent']) assert.ok(panneau.includes(mot), mot);
  assert.doesNotMatch(panneau, /motDePasse|password|iban/i);
  assert.match(lireUi('components', 'settings', 'GardeFousPanel.vue'), /data-mise="series-liees">\{\{ MOTS_DE_LA_MISE\.seriesLiees \}\}/);
  assert.match(lireUi('views', 'ScreenerView.vue'), /data-mise="reperage"/);
  assert.match(lireUi('views', 'OpportunitiesView.vue'), /data-mise="opportunites"/);
  const design = fs.readFileSync(path.join(UI, 'DESIGN.md'), 'utf8');
  assert.match(design, /Depuis l'étape 39 du plan \(lot 1a, 04\/11\/2026\) : \*\*la mise juste\*\*/);
  // La règle pure de l'écran : aucun import, aucun effet de bord.
  assert.doesNotMatch(lireUi('utils', 'miseAffichee.js'), /^import /m);
});
