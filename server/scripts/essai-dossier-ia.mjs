/**
 * essai-dossier-ia.mjs — UNE vraie analyse d'avant-match qui lit la MÉMOIRE DE L'IA (étape 44 du plan, 23/10/2026),
 * à lancer CHEZ PIERRE, après la mise en service, et SEULEMENT AVEC SON ACCORD.
 * -----------------------------------------------------------------------
 * Le bac à sable coupe Claude : le « fini quand » de l'étape (« une analyse réelle montre l'usage d'un dossier ») ne se
 * constate que chez Pierre. Ce script est un simple CLIENT de l'appli qui tourne (http://localhost:4000) : il n'ouvre
 * ni la base ni aucun fichier, il n'écrit rien lui-même — c'est le serveur, seul écrivain, qui fait l'analyse et la range,
 * exactement comme un clic sur « Analyser » de la page du match (appel noté « manuel » au journal des appels Claude, hors
 * du plafond des analyses automatiques).
 *
 *   node scripts/essai-dossier-ia.mjs                        APERÇU SEULEMENT : le match choisi, le texte des dossiers que
 *                                                            l'IA recevrait (mots, tokens estimés). AUCUN appel à Claude.
 *   node scripts/essai-dossier-ia.mjs --match <id>           le même aperçu, pour ce match (identifiant de la page Matchs).
 *   node scripts/essai-dossier-ia.mjs --accord-de-pierre     UNE vraie analyse (environ 15 000 à 25 000 tokens du quota
 *                                                            de l'abonnement), puis : ses tokens réels, la mémoire remise,
 *                                                            et si l'analyse cite une leçon ou un dossier.
 *   --serveur http://localhost:4000                          l'adresse de l'appli (seulement sur ce PC).
 *
 * Sans `--accord-de-pierre`, aucun appel à Claude ne part, jamais. Le match par défaut : le premier à venir (plus d'une
 * heure avant son coup d'envoi) dont les deux équipes ont un dossier, de préférence avec une leçon confirmée.
 * -----------------------------------------------------------------------
 */

import { pathToFileURL } from 'node:url';

const HEURE_MS = 3_600_000;

/** Lit les options de la ligne de commande. */
export function lireOptions(argv) {
  const o = { accord: false, matchId: null, serveur: 'http://localhost:4000' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--accord-de-pierre') o.accord = true;
    else if (argv[i] === '--match') o.matchId = argv[++i] ?? null;
    else if (argv[i] === '--serveur') o.serveur = argv[++i] ?? o.serveur;
  }
  return o;
}

/** Les leçons citées par l'analyse : la date « JJ/MM » et le match d'origine de chaque leçon remise, cherchés dans tout son texte. */
export function leconsCitees(analysis, texteMemoire) {
  const texte = JSON.stringify(analysis ?? {});
  const lecons = [...String(texteMemoire ?? '').matchAll(/Leçon(?: du championnat)? : \[(\d{2}\/\d{2}), ([^,\]]+)/g)].map((m) => ({ jour: m[1], match: m[2].trim() }));
  return {
    lecons: lecons.filter((l) => texte.includes(l.jour) || texte.includes(l.match)),
    motsDuDossier: /dossier|leçon|carnet/i.test(texte)
  };
}

/**
 * L'ESSAI : `fetch` (celui de Node, ou un faux dans les tests), `serveur`, `accord`, `matchId`, `ecrire` (une ligne de
 * sortie). Rend { etape, match, apercu, appels, analyse } — `appels` : ce qui a été demandé au serveur, dans l'ordre.
 */
export async function essai({ fetch: f = globalThis.fetch, serveur = 'http://localhost:4000', accord = false, matchId = null, ecrire = console.log, maintenant = Date.now() } = {}) {
  const u = new URL(serveur);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw new Error(`Ce script ne parle qu’à l’appli de ce PC (localhost), pas à « ${u.hostname} ».`);
  const appels = [];
  const lire = async (chemin) => {
    appels.push(`GET ${chemin}`);
    const r = await f(`${serveur}/api${chemin}`);
    const corps = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`${chemin} : ${corps?.error ?? `réponse ${r.status}`}`);
    return corps;
  };

  const statut = await lire('/match-ai-analysis/status');
  const { matches = [] } = await lire('/matches?source=odds-api');
  const aVenir = matches.filter((m) => Date.parse(m.commenceTime ?? '') - maintenant > HEURE_MS);
  const candidats = matchId ? matches.filter((m) => String(m.matchId) === String(matchId)) : aVenir;
  if (!candidats.length) throw new Error(matchId ? `Match introuvable dans la page Matchs : ${matchId}` : 'Aucun match à venir (plus d’une heure avant son coup d’envoi) dans la page Matchs.');

  // Le premier match dont les deux équipes ont un dossier, avec une leçon si possible (au plus 25 aperçus demandés).
  let choisi = null;
  let apercu = null;
  for (const m of candidats.slice(0, 25)) {
    const q = new URLSearchParams({ home: m.home, away: m.away, matchId: String(m.matchId) });
    if (m.league) q.set('league', m.league);
    const a = await lire(`/match-ai-analysis/dossiers/apercu?${q.toString()}`);
    const deux = a.memoire?.equipes?.home?.dossier && a.memoire?.equipes?.away?.dossier;
    if (!choisi || (deux && !(apercu.memoire?.equipes?.home?.dossier && apercu.memoire?.equipes?.away?.dossier)) || (deux && a.memoire.lecons.length && !apercu.memoire.lecons.length)) {
      choisi = m;
      apercu = a;
    }
    if (matchId || (deux && a.memoire.lecons.length)) break;
  }
  ecrire(`Match : ${choisi.home} – ${choisi.away} (${choisi.league ?? 'compétition inconnue'}), coup d’envoi ${choisi.commenceTime}, identifiant ${choisi.matchId}.`);
  if (!apercu.memoire) {
    ecrire(`Les dossiers ne sont pas lisibles (état : ${apercu.etat}) : l’analyse partirait avec la fiche d’avant. Lancez d’abord une actualisation (Réglages › Actualiser maintenant).`);
    return { etape: 'sans-dossiers', match: choisi, apercu, appels, analyse: null };
  }
  const m = apercu.memoire;
  ecrire(`Dossiers remis à l’IA : ${m.mots} mots, environ ${m.tokens} tokens (estimés comme le budget de l’étape 41), ${m.lecons.length} leçon(s) confirmée(s) citable(s).`);
  ecrire('--- texte des dossiers ---');
  ecrire(m.texte);
  ecrire('--- fin ---');
  if (!accord) {
    ecrire('APERÇU SEULEMENT : aucun appel à Claude n’a été fait. Pour UNE vraie analyse, relancez avec --accord-de-pierre.');
    return { etape: 'apercu', match: choisi, apercu, appels, analyse: null };
  }
  if (!statut.connected) throw new Error('Claude Code n’est pas connecté sur ce PC (jeton absent) : aucune analyse possible.');

  // UNE vraie analyse : le résultat du moteur (comme la page du match), puis la demande au serveur.
  const engineResult = await lire(`/analysis/match/${encodeURIComponent(choisi.matchId)}?source=odds-api&bankroll=10000&includeCorners=false`);
  appels.push(`POST /match-ai-analysis/match/${choisi.matchId}`);
  const r = await f(`${serveur}/api/match-ai-analysis/match/${encodeURIComponent(choisi.matchId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ home: choisi.home, away: choisi.away, league: choisi.league ?? null, engineResult })
  });
  const entree = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Analyse en échec : ${entree?.error ?? `réponse ${r.status}`}`);
  const u2 = entree.usage ?? {};
  const tokens = (u2.input_tokens ?? 0) + (u2.cache_creation_input_tokens ?? 0) + (u2.cache_read_input_tokens ?? 0) + (u2.output_tokens ?? 0);
  const cite = leconsCitees(entree.analysis, m.texte);
  ecrire(`Analyse faite : ${tokens} tokens réels (journal des appels Claude, carte « Budget Claude »).`);
  ecrire(`Mémoire gardée avec l’analyse : ${JSON.stringify(entree.memoire ?? null)}.`);
  ecrire(
    cite.lecons.length
      ? `L’analyse CITE ${cite.lecons.length} leçon(s) : ${cite.lecons.map((l) => `${l.jour}, ${l.match}`).join(' ; ')}.`
      : cite.motsDuDossier
        ? 'L’analyse parle de son dossier ou de son carnet, sans citer de leçon datée.'
        : 'L’analyse ne cite aucune leçon (elle n’en avait peut-être pas besoin) : le texte reçu est dans le journal, l’onglet Analyse IA montre l’avis.'
  );
  return { etape: 'analyse', match: choisi, apercu, appels, analyse: { tokens, memoire: entree.memoire ?? null, cite } };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const o = lireOptions(process.argv.slice(2));
  essai({ serveur: o.serveur, accord: o.accord, matchId: o.matchId })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`Essai impossible : ${error.message}`);
      process.exit(1);
    });
}
