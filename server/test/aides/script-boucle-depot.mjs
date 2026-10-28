/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-boucle-depot.mjs <serveur de la copie>
 *
 * Étape 26, partie A — LE DÉPÔT de la boucle de correction (data/correction/depotCorrections.js), le seul écrivain
 * des tables correction_* : une proposition créée avec son entrée de journal ; ses changements d'état contrôlés
 * (transition permise, état vu à l'écran), chacun avec son entrée de journal dans UNE transaction (un journal
 * refusé n'écrit pas l'état non plus) ; le contenu d'une proposition figé par la base ; le journal en ajout seul,
 * lu par pages ; les résumés du mois et leurs essais, jamais réécrits. Sortie : une ligne JSON.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [serveur] = process.argv.slice(2);
const imp = (rel) => import(pathToFileURL(path.join(serveur, 'src', rel)).href);

const { openDb, resolveDbPath } = await imp('data/db/matchStatsDb.js');
if (path.resolve(resolveDbPath()).toLowerCase() !== path.resolve(process.env.MATCH_STATS_DB).toLowerCase()) throw new Error('Base inattendue');
const db = openDb();
const D = await imp('data/correction/depotCorrections.js');

const sortie = { ok: true };
const essayer = (f) => {
  try {
    const r = f();
    return { ok: true, r };
  } catch (error) {
    return { ok: false, type: error.constructor.name, raison: error.raison ?? null, statut: error.statut ?? null, message: error.message };
  }
};
const etat = (id) => D.lireUneProposition(id, { database: db })?.etat ?? null;
const journal = () => D.lireLeJournal({ database: db, limite: 200 });
const sql = (requete) => {
  try {
    db.exec(requete);
    return 'accepté';
  } catch (error) {
    return error.message;
  }
};

const ID = 'c26-2027-01-rho-1';
const proposition = {
  id: ID,
  source: 'regle',
  levier: 'modeleDeButs.rho',
  avant: -0.05,
  apres: -0.02,
  marches: ['totalGoals', 'bothTeamsScore', 'teamGoals', 'resultAndTotal'],
  declaration: { id: ID, etape: '26', quoi: 'Correction du mois', modifications: { football: { modeleDeButs: { rho: -0.02 } } }, marches: ['bothTeamsScore'] },
  base: 'empreinte-des-pronostics-essai',
  triMois: '2027-01',
  triVersion: 1,
  cas: ['bothTeamsScore|niveau']
};
const t0 = Date.parse('2027-02-01T08:00:00.000Z');
const a = (n) => ({ database: db, maintenant: t0 + n * 60_000 });

sortie.creee = D.creerUneProposition(proposition, { ...a(0), phrase: 'Proposée par le tri de janvier 2027.' });
sortie.dejaPrise = essayer(() => D.creerUneProposition(proposition, { ...a(1), phrase: 'Encore.' }));
sortie.sourceInconnue = essayer(() => D.creerUneProposition({ ...proposition, id: 'c26-autre', source: 'ia' }, { ...a(1), phrase: 'Proposée.' }));
const pas = [];
const avancer = (cle, args) => {
  const avantJournal = journal().length;
  const avantEtat = etat(args.id ?? ID);
  const r = essayer(() => D.changerLEtat({ id: ID, source: 'nuit', phrase: `Phrase ${cle}.`, ...args }, a(pas.length + 2)));
  pas.push({ cle, ok: r.ok, raison: r.ok ? null : r.raison, statut: r.ok ? null : r.statut, avant: avantEtat, apres: etat(args.id ?? ID), journal: journal().length - avantJournal });
  return r;
};
avancer('au-banc', { evenement: 'au-banc', vue: 'proposee', source: 'pierre' });
avancer('accepter-sans-banc-fini', { evenement: 'acceptee', vue: 'au-banc', source: 'pierre' });
avancer('vue-perimee', { evenement: 'bancee', vue: 'proposee' });
avancer('banc-interrompu', { evenement: 'banc-interrompu', vue: 'au-banc', phrase: 'Banc interrompu (appli fermée) : relancé.' });
avancer('au-banc-2', { evenement: 'au-banc', vue: 'proposee', source: 'pierre' });
avancer('bancee', { evenement: 'bancee', vue: 'au-banc', maj: { banc: { verdict: 'retenu', gainPct: 1.2 } } });
avancer('accepter', { evenement: 'acceptee', vue: 'bancee', source: 'pierre', maj: { rangFile: 1 } });
avancer('double-clic', { evenement: 'acceptee', vue: 'bancee', source: 'pierre' });
avancer('journal-refuse', { evenement: 'mise-a-l-essai', vue: 'acceptee', source: 'inconnue' });
avancer('champ-interdit', { evenement: 'mise-a-l-essai', vue: 'acceptee', maj: { levier: 'modeleDeButs.prior' } });
avancer('mise-a-l-essai', { evenement: 'mise-a-l-essai', vue: 'acceptee', maj: { essai: { candidate: ID, numero: 1, depuis: '2027-02-02T01:00:00.000Z' } } });
avancer('inconnue', { id: 'c26-nulle-part', evenement: 'refusee' });
avancer('evenement-sans-etat', { evenement: 'tri' });
sortie.pas = pas;
sortie.proposition = D.lireUneProposition(ID, { database: db });
sortie.aBlanc = D.lireLesPropositions({ database: db, etats: ['a-blanc'] }).map((p) => p.id);
sortie.toutes = D.lireLesPropositions({ database: db }).length;
sortie.refus = {
  contenu: sql(`UPDATE correction_propositions SET apres = '0.1' WHERE id = '${ID}'`),
  levier: sql(`UPDATE correction_propositions SET levier = 'x' WHERE id = '${ID}'`),
  effacer: sql(`DELETE FROM correction_propositions WHERE id = '${ID}'`),
  suiviPermis: sql(`UPDATE correction_propositions SET rang_file = 2 WHERE id = '${ID}'`)
};
// Le journal : ajout seul, par pages.
sortie.ajoutSansEtat = essayer(() => D.ajouterAuJournal({ proposition: null, evenement: 'demande-du-code', source: 'nuit', phrase: 'Corners du match : demande du code.' }, a(40)));
sortie.ajoutAvecEtat = essayer(() => D.ajouterAuJournal({ proposition: ID, evenement: 'acceptee', source: 'pierre', phrase: 'Acceptée.' }, a(41)));
sortie.ajoutSansPhrase = essayer(() => D.ajouterAuJournal({ proposition: null, evenement: 'place-liberee', source: 'nuit', phrase: '  ' }, a(42)));
const tout = journal();
sortie.journal = tout.map((e) => ({ n: e.n, evenement: e.evenement, source: e.source, proposition: e.proposition, de: e.details?.de ?? null, vers: e.details?.vers ?? null }));
sortie.page2 = D.lireLeJournal({ database: db, limite: 2 }).map((e) => e.n);
sortie.pageAvant = D.lireLeJournal({ database: db, avant: tout[1].n, limite: 2 }).map((e) => e.n);
sortie.dUneProposition = D.lireLeJournal({ database: db, proposition: ID }).length;
sortie.refusJournal = { update: sql('UPDATE correction_journal SET phrase = \'x\''), delete: sql('DELETE FROM correction_journal WHERE n = 1') };
// Les résumés du mois et leurs essais.
const resume = { mois: '2027-01', version: 1, modele: 'sonnet', mode: 'normal', texte: { titre: 'Janvier 2027', phrases: ['Un écart.', 'Deux.', 'Trois.'] }, fiche: { mois: '2027-01' }, garde: { ok: true }, usage: { tokens: 4400 }, coutUsd: 0.024, essai: 1 };
sortie.resume1 = D.ecrireUnResume(resume, a(50));
sortie.resume2 = D.ecrireUnResume({ ...resume, texte: { titre: 'Autre' } }, a(51));
sortie.resumeVersion2 = D.ecrireUnResume({ ...resume, version: 2 }, a(52));
sortie.resumes = D.lireLesResumes({ database: db, mois: '2027-01' }).map((r) => ({ version: r.version, titre: r.texte?.titre ?? null, sansAppel: r.sansAppel }));
D.noterUnEssaiDeResume({ mois: '2027-01', version: 1, type: 'garde', raison: 'un chiffre absent de la fiche', tokens: 4393 }, a(53));
D.noterUnEssaiDeResume({ mois: '2027-01', version: 1, type: 'panne', raison: 'Claude indisponible' }, a(54));
sortie.essais = D.essaisDeResume('2027-01', { database: db, version: 1 }).map((e) => e.type);
sortie.essaisV2 = D.essaisDeResume('2027-01', { database: db, version: 2 }).length;
sortie.refusResume = { update: sql("UPDATE correction_resumes SET modele = 'x'"), delete: sql('DELETE FROM correction_resumes'), updateEssai: sql("UPDATE correction_resumes_essais SET type = 'x'"), deleteEssai: sql('DELETE FROM correction_resumes_essais') };
console.log(JSON.stringify(sortie));
