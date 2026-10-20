/**
 * Exécuté DANS une copie de travail (cf. isolement.mjs), jamais directement :
 *   node --import garde.mjs script-deroule.mjs <serveur de la copie>
 *
 * Étape 43 — LE DÉROULÉ DU MATCH dans la revue d'après-match, sur des matchs
 * RÉELS de la base d'essai (les vrais événements FotMob, la vraie carte des
 * tirs, le vrai cadre), avec les vraies fonctions de l'appli : lecture du
 * magasin, fiche compacte, ancienne forme, enregistrement, journal. Seules
 * choses fabriquées : la réponse de Claude (simulée, aucun appel) et FotMob
 * (faux fetch : le texte minute par minute vient d'un fichier réduit de vraies
 * réponses).
 *
 *  1. Les 11 matchs du fixture : la fiche compacte (section des faits) et
 *     l'ancienne forme (empreinte, faits envoyés).
 *  2. La chaîne complète (runPostMatchAnalysis) : texte minute par minute lu
 *     (« en » absent puis « en_gen »), absent (403 partout), en panne, langues
 *     connues du match (meta.tickerLangs), aucun texte à demander.
 *  3. Les lecteurs d'événements d'avant : le direct (fetchLiveDetail) et les
 *     repères de championnat (valeursDUneRencontre) face à des événements de la
 *     forme neuve.
 *  4. Les 201 matchs à déroulé de la base d'essai : le déroulé dit-il vrai ?
 * Variables lues : AI_ANALYSIS_FICHE, AI_COMMENTAIRE_MATCH (cf. config/env.js).
 * Sortie : une ligne JSON.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { importeur } from './claudeSimule.mjs';
import { installerFauxFetch, rencontre, listeDuJour, detailEnDirect } from './fotmobSimule.mjs';
import { MATCHS, priorPour, resultatPour } from './revueFabriquee.mjs';
import { valeursManquantes } from './ficheSansPerte.mjs';

const [serveur] = process.argv.slice(2);
const imp = importeur(serveur);
const { env } = await imp('config/env.js');
if (env.claudeCode.oauthToken) throw new Error('Un jeton Claude est présent : refus.');
if (env.claudeCode.bin && fs.existsSync(env.claudeCode.bin)) throw new Error('L’exécutable Claude configuré existe : refus.');
const cc = await imp('core/ai/claudeCodeClient.js');
const service = await imp('core/ai/matchAiAnalysisService.js');
const prompt = await imp('core/ai/matchAiAnalysisPrompt.js');
const repo = await imp('data/repositories/matchAiAnalysisRepository.js');
const store = await imp('data/db/matchStatsDb.js');
const read = await imp('data/db/matchStatsRead.js');
const deroule = await imp('core/ai/derouleDuMatch.js');
const compact = await imp('core/ai/compactContext.js');
const sha1 = (t) => crypto.createHash('sha1').update(t).digest('hex');
const FIXTURES = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'fixtures');
const COMMENTAIRE = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'commentaire-fotmob-etape-43.json'), 'utf8'));
const fichierTexte = (c) => ({ Lang: c.langue, Events: c.Events });

// -------------------------------------------- Claude simulé, qui lit la fiche de la revue
const messages = [];
const lignesDuTableau = (texte, titre) => {
  const lignes = texte.split('\n');
  const i = lignes.findIndex((l) => l.startsWith(titre));
  const sortie = [];
  for (let k = i + 2; i !== -1 && k < lignes.length && lignes[k].trim() && !lignes[k].startsWith('#'); k++) {
    if (lignes[k].startsWith('  ') || !lignes[k].includes(' | ')) continue;
    sortie.push(lignes[k].split(' | ')[0]);
  }
  return sortie;
};
cc.__testing.simulerClaude(async ({ args, userMessage }) => {
  const schema = JSON.parse(args[args.indexOf('--json-schema') + 1]);
  const systeme = args[args.indexOf('--system-prompt') + 1];
  messages.push({ system: systeme, user: userMessage, revue: Boolean(schema.properties?.marketReviews) });
  const marches = userMessage.startsWith('#') ? lignesDuTableau(userMessage, '## marketOutcomes') : [];
  return {
    is_error: false,
    structured_output: { summary: 'Bilan simulé.', whatWasRight: 'Juste.', whatWasMissed: 'Manqué.', outcomeVsEngine: 'Dans le sens du moteur.', marketReviews: marches.map((market) => ({ market, explanation: `Issue : ${market}.`, lesson: `Leçon : ${market}.` })), caveats: 'Limites.' },
    usage: { input_tokens: 2, cache_creation_input_tokens: 9000, cache_read_input_tokens: 4500, output_tokens: 3000 },
    total_cost_usd: 0.03
  };
});
const essai = async (f) => {
  try {
    await f();
    return 'ABOUTI';
  } catch (e) {
    return `ECHEC ${e.message}`;
  }
};
const section = (texte) => {
  const i = texte.indexOf('\n## matchStats');
  return i === -1 ? null : texte.slice(i + 1);
};

const s = { env: { fiche: env.ficheIa, commentaire: env.commentaireMatch } };

// ------------------------------------------------ 1. les 11 matchs, sans appeler Claude
s.preparees = {};
for (const m of Object.values(MATCHS)) {
  const prior = priorPour(m);
  const result = resultatPour(m);
  const ancienne = service.preparerRevueApresMatch({ prior, result, fiche: 'ancienne' });
  const compacte = service.preparerRevueApresMatch({ prior, result, fiche: 'compacte' });
  s.preparees[m.cle] = {
    ancienne: { sha1: sha1(`${ancienne.system}\n${ancienne.userMessage}`), faits: JSON.stringify(ancienne.matchStats), contientSectionNeuve: /Déroulé \(\d+ ligne|Texte minute par minute|non publié par FotMob|Cartons du déroulé/.test(ancienne.userMessage), systemSansLaRegleNeuve: !ancienne.system.includes('déroulé minute par minute') },
    compacte: {
      systemEgalAuxConsignes: compacte.system === prompt.CONSIGNES_APRES_MATCH,
      longueurMessage: compacte.userMessage.length,
      faits: section(compacte.userMessage),
      pageFotMob: compacte.pageFotMob,
      clesDesFaits: compacte.matchStats ? Object.keys(compacte.matchStats) : null,
      issues: compacte.marketOutcomes.map((o) => [o.market, o.outcome]),
      // « rien d'utile perdu » (étape 41) pour les faits : chaque valeur de l'ancien message des faits se retrouve dans la fiche neuve
      valeursManquantes: ancienne.matchStats ? valeursManquantes({ faits: JSON.parse(JSON.stringify(ancienne.matchStats)) }, compacte.userMessage, { dispenses: compact.NON_RECOPIES_REVUE, nombre: compact.nombre }) : null
    }
  };
}

// ------------------------------------------------ 2. la chaîne complète, avec le texte minute par minute
const faux = installerFauxFetch({});
const base = store.openDb();
const fotmobIdDe = (cle) => base.prepare('SELECT fotmob_id FROM matches WHERE match_key = ?').get(cle)?.fotmob_id ?? null;
const poserLangues = (cle, langs) => base.prepare("UPDATE matches SET meta = json_set(COALESCE(meta, '{}'), '$.tickerLangs', ?) WHERE match_key = ?").run(langs, cle);
s.identifiants = Object.fromEntries(Object.values(MATCHS).map((m) => [m.cle, fotmobIdDe(m.cle)]));
// Sunderland – Arsenal : « en » n'existe pas (403), « en_gen » oui — comme pour un match allemand ou sud-américain.
faux.textes[`${s.identifiants['2026-09-12-sunderland-arsenal']}_en_gen`] = fichierTexte(COMMENTAIRE.fil_de_faits);
// Chelsea – Luton : aucun fichier (403 partout).
// Peterborough – Barnsley : le réseau tombe.
faux.textes[`${s.identifiants['2026-09-15-peterborough-united-barnsley']}_en`] = new Error('réseau coupé (essai)');
faux.textes[`${s.identifiants['2026-09-15-peterborough-united-barnsley']}_en_gen`] = new Error('réseau coupé (essai)');
// Kansas City – Philadelphie : un commentaire de rédaction, en anglais d'origine.
faux.textes[`${s.identifiants['2026-09-20-sporting-kansas-city-philadelphia-union']}_en`] = fichierTexte(COMMENTAIRE.redaction);
// Akhmat – Dynamo : le match annonce « de,en_gen,… » (voir plus bas) ; son fichier « en_gen » existe.
faux.textes[`${s.identifiants['2026-09-13-fc-akhmat-grozny-fc-dynamo-makhachkala']}_en_gen`] = fichierTexte(COMMENTAIRE.fil_de_faits);
// Millwall – West Ham : le match dit qu'il n'a aucun texte (chaîne vide) ; un fichier qu'on ne doit jamais aller chercher.
faux.textes[`${s.identifiants['2026-09-19-millwall-west-ham']}_en`] = fichierTexte(COMMENTAIRE.redaction);

const lancer = async (cle, extra = {}) => {
  const m = Object.values(MATCHS).find((x) => x.cle === cle);
  const prior = priorPour(m);
  repo.savePreMatchAnalysis({ matchId: prior.matchId, homeName: prior.homeName, awayName: prior.awayName, league: prior.league, commenceTime: prior.commenceTime, timing: prior.timing, analysedAt: prior.analysedAt, engineSnapshot: prior.engineSnapshot, analysis: prior.analysis, model: 'claude-code:sonnet' });
  const avant = faux.appelsTexte.length;
  const nMessages = messages.length;
  const statut = await essai(() => service.runPostMatchAnalysis({ matchId: prior.matchId, result: resultatPour(m), appel: { type: 'revue', mode: 'normal' }, ...extra }));
  const envoye = messages.slice(nMessages);
  const e = repo.getByMatchId(prior.matchId);
  return {
    statut,
    requetes: faux.appelsTexte.slice(avant).map((u) => u.replace(/^.*\/gsm\//, '')),
    messages: envoye.length,
    system: envoye[0]?.system ?? null,
    user: envoye[0]?.user ?? null,
    revue: e?.postMatchReview ? { fiche: e.postMatchReview.fiche ?? null, deroule: e.postMatchReview.deroule ?? null, marches: e.postMatchReview.marketReviews?.length ?? 0 } : null
  };
};
const extrait = (r) => ({ ...r, user: undefined, system: undefined, section: r.user ? section(r.user) : null, systemEgalAuxConsignes: r.system === prompt.CONSIGNES_APRES_MATCH });
s.chaine = {
  avecTexte: extrait(await lancer('2026-09-12-sunderland-arsenal')),
  sansFichier: extrait(await lancer('2026-08-27-chelsea-luton-town')),
  reseauEnPanne: extrait(await lancer('2026-09-15-peterborough-united-barnsley')),
  redaction: extrait(await lancer('2026-09-20-sporting-kansas-city-philadelphia-union')),
  // l'ancienne forme au paramètre : jamais de texte demandé
  ancienneAuParametre: extrait(await lancer('2026-09-20-leeds-crystal-palace', { fiche: 'ancienne' }))
};
// Langues connues du match : « de,en_gen,… » -> « en_gen » d'abord ; chaîne vide -> rien à demander.
poserLangues('2026-09-13-fc-akhmat-grozny-fc-dynamo-makhachkala', 'de,en_gen,es_gen,fr_gen,it_gen');
poserLangues('2026-09-19-millwall-west-ham', '');
s.chaine.languesConnues = extrait(await lancer('2026-09-13-fc-akhmat-grozny-fc-dynamo-makhachkala'));
s.chaine.aucunTexte = extrait(await lancer('2026-09-19-millwall-west-ham'));
// Un match que le magasin n'a pas : la revue part sans faits, sans demander de texte.
{
  const m = { cle: 'inconnu-1', home: 'Équipe Inconnue', away: 'Autre Inconnue', league: 'Ligue Imaginaire', date: '2026-09-20', score: { home: 1, away: 0 } };
  const prior = priorPour(m);
  repo.savePreMatchAnalysis({ matchId: prior.matchId, homeName: prior.homeName, awayName: prior.awayName, league: prior.league, commenceTime: prior.commenceTime, timing: prior.timing, analysedAt: prior.analysedAt, engineSnapshot: prior.engineSnapshot, analysis: prior.analysis, model: 'claude-code:sonnet' });
  const avant = faux.appelsTexte.length;
  const n = messages.length;
  const statut = await essai(() => service.runPostMatchAnalysis({ matchId: prior.matchId, result: resultatPour(m), appel: { type: 'revue' } }));
  s.chaine.matchInconnu = { statut, requetes: faux.appelsTexte.length - avant, section: section(messages[n].user), revue: repo.getByMatchId(prior.matchId).postMatchReview.deroule ?? null };
}
s.requetesTexteEnTout = faux.appelsTexte.length;

// ------------------------------------------------ 3. les lecteurs d'événements d'avant
{
  const ancien = [
    { type: 'goal', minute: 10, side: 'home', player: 'A', playerId: 'fotmob-1' },
    { type: 'goal', minute: 44, side: 'away', addedTime: 2, player: 'B', detail: 'Penalty' },
    { type: 'card', minute: 60, side: 'home', player: 'C', card: 'yellowred' },
    { type: 'goal', minute: 70, side: 'home', player: 'D', ownGoal: true, detail: 'Own goal' },
    { type: 'substitution', minute: 75, side: 'away', addedTime: 0, playerIn: 'E', playerOut: 'F' }
  ];
  const neuf = [
    { type: 'goal', minute: 10, side: 'home', player: 'A', playerId: 'fotmob-1' },
    { type: 'goal', minute: 44, side: 'away', addedTime: 2, player: 'B', detail: 'Penalty', penalty: true },
    { type: 'missedpenalty', minute: 52, side: 'home', player: 'X', playerId: 'fotmob-9' },
    { type: 'card', minute: 60, side: 'home', player: 'C', card: 'yellowred', reason: 'foul' },
    { type: 'goal', minute: 70, side: 'home', player: 'D', ownGoal: true, detail: 'Own goal' },
    { type: 'substitution', minute: 75, side: 'away', addedTime: 0, playerIn: 'E', playerOut: 'F', injured: true },
    { type: 'card', minute: 90, side: 'away', addedTime: 10, player: 'G', card: 'yellow', note: 'not_on_pitch' }
  ];
  const { valeursDUneRencontre } = await imp('data/db/leagueBenchmarks.js');
  const v = (events) => valeursDUneRencontre({ homeGoals: 2, awayGoals: 1, events });
  s.lecteurs = { reperesAncien: v(ancien), reperesNeuf: v(neuf) };
  // Le direct : les rouges du déroulé (2e jaune comprise), le penalty manqué n'y change rien.
  const faux2 = installerFauxFetch({
    details: {
      9100001: detailEnDirect({ id: 9100001, cartons: [{ minute: 30, side: 'home', card: 'YellowRed', nom: 'A' }, { minute: 55, side: 'away', card: 'Red', nom: 'B' }], sansStats: true }),
      9100002: (() => {
        const p = detailEnDirect({ id: 9100002, cartons: [{ minute: 30, side: 'home', card: 'YellowRed', nom: 'A' }, { minute: 55, side: 'away', card: 'Red', nom: 'B' }], sansStats: true });
        p.content.matchFacts.events.events.push({ type: 'MissedPenalty', time: 40, isHome: false, player: { id: 5, name: 'X' } }, { type: 'Substitution', time: 70, isHome: true, injuredPlayerOut: true, swap: [{ name: 'E' }, { name: 'F' }] });
        return p;
      })()
    }
  });
  const { fetchLiveDetail } = await imp('data/providers/fotMobProvider.js');
  const [d1, d2] = [await fetchLiveDetail(9100001), await fetchLiveDetail(9100002)];
  s.lecteurs.direct = { ancien: [d1.homeRedCards, d1.awayRedCards], neuf: [d2.homeRedCards, d2.awayRedCards], requetes: faux2.appels.length };
  // L'import du magasin (fetchMatchStats) : la vraie lecture des événements d'une vraie page (réduite) et la liste des langues du texte.
  const PAGES = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'evenements-fotmob-etape-43.json'), 'utf8'));
  const pageImport = (id, liveticker) => ({
    general: { homeTeam: { id: 9788, name: 'Domicile' }, awayTeam: { id: 9905, name: 'Extérieur' }, leagueId: 54, coverageLevel: 'xG' },
    header: { status: { started: true, finished: true, scoreStr: '3 - 4' }, teams: [{ id: 9788 }, { id: 9905 }] },
    content: { matchFacts: PAGES.gladbach_mainz.content.matchFacts, ...(liveticker === undefined ? {} : { liveticker }) }
  });
  installerFauxFetch({
    details: {
      9300001: pageImport(9300001, { langs: 'de,en_gen,es_gen,fr_gen,it_gen', teams: ['A', 'B'] }),
      9300002: pageImport(9300002, { langs: '', teams: ['A', 'B'] }),
      9300003: pageImport(9300003, undefined)
    }
  });
  const { fetchMatchStats, mapEvents } = await imp('data/providers/fotMobProvider.js');
  const [i1, i2, i3] = [await fetchMatchStats(9300001), await fetchMatchStats(9300002), await fetchMatchStats(9300003)];
  const types = (e) => e.reduce((n, x) => ({ ...n, [x.type]: (n[x.type] ?? 0) + 1 }), {});
  s.lecteurs.importMagasin = {
    langues: [i1.meta.tickerLangs, i2.meta.tickerLangs, i3.meta.tickerLangs ?? null],
    evenements: types(i1.events),
    memesEvenementsQueLaLecture: JSON.stringify(i1.events) === JSON.stringify(mapEvents(pageImport(1, undefined))),
    penaltyManque: i1.events.filter((e) => e.type === 'missedpenalty').map((e) => [e.minute, e.side, e.player]),
    penaltyMarque: i1.events.filter((e) => e.penalty).map((e) => [e.minute, e.detail]),
    note: { rev: i1.meta.rev, noSheet: i1.noSheet, score: [i1.homeGoals, i1.awayGoals] }
  };
  // Le règlement : les statistiques lues pour les corners et les tirs sont celles d'avant.
  const m = MATCHS.kansas_philadelphie;
  const STATS_CLES = ['expected_goals', 'Total Shots', 'Shots on Goal', 'big_chances', 'Ball Possession', 'Corner Kicks', 'Yellow Cards', 'Red Cards'];
  const garderStats = (x) => Object.fromEntries(Object.entries(x).filter(([k]) => STATS_CLES.includes(k)));
  const details = read.matchDetailsFromStore(m.home, m.date);
  const faits = service.__testing.faitsDuMatch(m.home, m.date);
  s.lecteurs.reglement = {
    clesDesFaits: Object.keys(faits),
    statsIdentiques: isDeepStrictEqual(faits.stats, { home: garderStats(details.stats.home), away: garderStats(details.stats.away) }),
    pourReglement: service.__testing.statsPourReglement(faits),
    detailsInchange: !('deroule' in details),
    detailsAvecDeroule: Object.keys(read.matchDetailsFromStore(m.home, m.date, { avecDeroule: true }).deroule)
  };
}

// ------------------------------------------------ 4. les 201 matchs à déroulé de la base d'essai : le déroulé dit-il vrai ?
{
  const lignes = base
    .prepare('SELECT match_key, home_goals hg, away_goals ag, events, shotmap, meta FROM matches WHERE events IS NOT NULL AND home_goals IS NOT NULL')
    .all();
  const parse = (t) => {
    try {
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  };
  const noms = { home: 'DOM', away: 'EXT' };
  const bilan = { matchs: lignes.length, chronoMax: 0, chronoMin: 999, parLignes: {}, ecarts: [], moins10AvecAssezDEvenements: [], penaltys: { evenements: 0, lignes: 0 }, csc: { evenements: 0, lignes: 0 }, expulsions: { evenements: 0, lignes: 0 }, jaunes: { evenements: 0, lignes: 0, recapitulatif: 0 }, remplacements: { evenements: 0, lignes: 0 }, buts: { evenements: 0, lignes: 0 }, incoherents: 0, partiels: 0, manquesDeLaCarte: 0, manquesLus: 0 };
  for (const r of lignes) {
    const events = parse(r.events);
    const d = deroule.lireDeroule({ events, shotmap: parse(r.shotmap), meta: parse(r.meta), score: { home: r.hg, away: r.ag } });
    const chrono = deroule.lignesDeLaChronologie(d, noms);
    const toutes = deroule.lignesDuDeroule(d, noms);
    bilan.chronoMax = Math.max(bilan.chronoMax, chrono.length);
    bilan.chronoMin = Math.min(bilan.chronoMin, chrono.length);
    bilan.parLignes[chrono.length] = (bilan.parLignes[chrono.length] ?? 0) + 1;
    if (chrono.length > 20 || (events.length >= 14 && chrono.length < 10)) bilan.moins10AvecAssezDEvenements.push([r.match_key, events.length, chrono.length]);
    if (!d.coherent) bilan.incoherents++;
    if (d.partiel) bilan.partiels++;
    const texte = chrono.join('\n');
    const compte = (re) => (texte.match(re) ?? []).length;
    const ev = (f) => events.filter(f).length;
    // les événements stockés contre ce que le texte en dit
    const compter = (nom, evenements, lignesTexte) => {
      bilan[nom].evenements += evenements;
      bilan[nom].lignes += lignesTexte;
      if (evenements !== lignesTexte) bilan.ecarts.push([r.match_key, nom, evenements, lignesTexte]);
    };
    compter('buts', ev((e) => e.type === 'goal'), compte(/ : but /g));
    compter('penaltys', ev((e) => e.type === 'goal' && e.detail === 'Penalty' && !e.ownGoal), compte(/ \(penalty\) — /g));
    compter('csc', ev((e) => e.type === 'goal' && e.ownGoal), compte(/but contre son camp de /g));
    compter('expulsions', ev((e) => e.type === 'card' && /red/.test(e.card)), compte(/ : rouge /g));
    // jaunes : une ligne chacun, ou regroupés par équipe (« Jaunes X : 19' A · 55' B »)
    const jaunesLignes = compte(/ : jaune /g) + chrono.filter((l) => l.startsWith('Jaunes ')).reduce((n, l) => n + l.split(' · ').length, 0);
    compter('jaunes', ev((e) => e.type === 'card' && e.card === 'yellow'), jaunesLignes);
    const recap = toutes.find((l) => l.startsWith('Cartons du déroulé'));
    if (recap) bilan.jaunes.recapitulatif += [...recap.split(' · ')[0].matchAll(/ (\d+)(?:,|$)/g)].reduce((n, x) => n + Number(x[1]), 0);
    // remplacements : « remplace » dans les lignes
    compter('remplacements', ev((e) => e.type === 'substitution'), compte(/ remplace /g));
    // penalties manqués lus dans la carte des tirs : chacun une ligne (hors séance de tirs au but)
    const tirs = (parse(r.shotmap) ?? []).filter((t) => t.situation === 'penalty' && t.result !== 'goal' && t.minute <= (parse(r.meta)?.reason === 'afterpenalties' ? d.duree : 120));
    bilan.manquesDeLaCarte += tirs.length;
    bilan.manquesLus += compte(/penalty manqué/g);
  }
  s.deuxCentUn = bilan;
}

console.log(JSON.stringify({ ok: true, ...s }));
