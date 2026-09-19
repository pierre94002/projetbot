// Comparaison de noms d'équipe, partagée par toutes les sources tierces dont
// l'orthographe ne correspond pas à celle d'Odds API/API-Football — ex.
// football-data.co.uk "Man United", FlashScore "Dep. A Coruna", ou un
// classement web "Sparta Praha" la ou l'app dit "Sparta Prague".
//
// Deux mecanismes, dans cet ordre :
//  1. Un REGISTRE de clubs connus (ci-dessous). Quand les deux noms y sont,
//     le verdict est ferme : meme club ou non, sans approximation. C'est ce
//     qui separe des clubs que tout rapprochement flou confondrait
//     (Inter/Milan, Paris FC/PSG, Villarreal/Aston Villa, Union Berlin/SG).
//  2. Sinon, un rapprochement flou par recouvrement de tokens, volontairement
//     permissif : une source additive qui rate une equipe perd un bonus de
//     contexte, pas une fonctionnalite.

// Caracteres que la decomposition Unicode (NFD) ne separe pas : sans ca,
// "Lillestrøm" et "Lillestrom" sont deux equipes differentes.
const LETTER_EQUIVALENTS = [
  [/ß/g, 'ss'],
  [/ø/g, 'o'],
  [/æ/g, 'ae'],
  [/œ/g, 'oe'],
  [/đ|ð/g, 'd'],
  [/ł/g, 'l'],
  [/þ/g, 'th'],
  [/ı/g, 'i']
];

function normalizeTeamName(name) {
  let text = (name ?? '').toLowerCase();
  for (const [pattern, replacement] of LETTER_EQUIVALENTS) text = text.replace(pattern, replacement);
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clubs dont le nom varie trop d'une source a l'autre pour etre rapproches
 * sans risque, ET clubs distincts qui se ressemblent assez pour etre
 * confondus. Un nom present ici est resolu de facon deterministe : ajouter
 * une entree est toujours plus sur que d'assouplir le rapprochement flou.
 */
const TEAM_ALIASES = {
  // Noms radicalement differents selon la source
  'borussia monchengladbach': ["m'gladbach", 'mgladbach', 'gladbach', 'borussia mgladbach'],
  'crvena zvezda': ['red star belgrade', 'red star', 'fk crvena zvezda'],
  'sparta prague': ['sparta praha', 'ac sparta praha', 'ac sparta prague'],
  olympiakos: ['olympiacos', 'olympiakos piraeus', 'olympiacos piraeus', 'olympiacos fc'],
  omonia: ['omonoia', 'omonoia fc', 'omonia nicosia', 'ac omonia'],
  nordsjaelland: ['fc nordsjaelland', 'fc nordsjalland'],
  copenhagen: ['f c kobenhavn', 'fc kobenhavn', 'kobenhavn', 'fc copenhagen'],
  // Deux clubs de Craiova coexistent : on n'enregistre que la forme complete
  // de chacun, jamais l'abrege "u craiova" qui vaut pour les deux.
  'universitatea craiova': ['csu craiova'],
  'sheffield wednesday': ['sheffield weds'],
  'sheffield united': ['sheffield utd'],
  'west bromwich albion': ['west brom'],
  'wolverhampton wanderers': ['wolves'],
  'queens park rangers': ['qpr'],
  'deportivo la coruna': ['dep a coruna', 'deportivo', 'dep la coruna'],
  'athletic bilbao': ['ath bilbao', 'athletic club'],
  'atletico madrid': ['ath madrid', 'atl madrid'],
  espanyol: ['espanol', 'rcd espanyol'],
  'rayo vallecano': ['vallecano'],
  'real sociedad': ['sociedad'],
  'saint etienne': ['st etienne', 'asse'],
  rennes: ['stade rennais', 'stade rennais fc'],
  // Nom trop court pour le rapprochement par tokens (moins de 3 lettres).
  'az alkmaar': ['az'],

  // Clubs DISTINCTS qui se ressemblent : chacun doit exister ici pour que le
  // registre puisse trancher entre eux.
  'paris saint germain': ['psg', 'paris sg'],
  'paris fc': [],
  'inter milan': ['inter', 'internazionale'],
  'ac milan': ['milan'],
  villarreal: [],
  'aston villa': [],
  'union berlin': ['1 fc union berlin'],
  'union saint gilloise': ['union sg', 'royale union saint gilloise'],
  'sporting cp': ['sporting lisbon', 'sporting clube de portugal'],
  'sporting gijon': ['sporting de gijon'],
  'bristol city': [],
  'bristol rovers': [],
  'manchester united': ['man united', 'man utd'],
  'manchester city': ['man city'],
  'real madrid': [],
  'real betis': ['betis'],
  'nottingham forest': ["nott'm forest", 'nottm forest']
};

const ALIAS_TO_CANONICAL = new Map();
for (const [canonical, variants] of Object.entries(TEAM_ALIASES)) {
  ALIAS_TO_CANONICAL.set(normalizeTeamName(canonical), canonical);
  for (const variant of variants) ALIAS_TO_CANONICAL.set(normalizeTeamName(variant), canonical);
}

function canonicalTeamName(name) {
  return ALIAS_TO_CANONICAL.get(normalizeTeamName(name)) ?? null;
}

// Sigles de type de club et articles : presents dans beaucoup de noms sans
// rien distinguer ("and" faisait matcher Brighton and Hove Albion avec
// Anderlecht par prefixe).
const STOP_WORDS = new Set([
  'fc', 'afc', 'cf', 'sc', 'ac', 'as', 'ss', 'ssc', 'us', 'ud', 'cd', 'sd', 'rc', 'rcd', 'bsc', 'sv', 'vfb', 'vfl', 'tsg', 'fsv',
  'sk', 'fk', 'nk', 'hnk', 'gnk', 'kv', 'rsc', 'kaa', 'krc', 'ogc', 'club', 'de', 'del', 'la', 'las', 'los', 'le', 'the', 'and', 'und'
]);

function significantTokens(name) {
  const tokens = normalizeTeamName(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
  const meaningful = tokens.filter((token) => !STOP_WORDS.has(token));
  return meaningful.length ? meaningful : tokens;
}

// Villes ecrites en langue locale ou traduites selon la source : "Slavia
// Praha" et "Slavia Prague" sont le meme club. Une equivalence par ville
// couvre d'un coup tous les clubs qui la portent.
const TOKEN_SYNONYMS = new Map([
  ['praha', 'prague'],
  ['munchen', 'munich'],
  ['koln', 'cologne'],
  ['wien', 'vienna'],
  ['beograd', 'belgrade'],
  ['moskva', 'moscow'],
  ['lisboa', 'lisbon'],
  ['antwerpen', 'antwerp'],
  ['bucuresti', 'bucharest'],
  ['warszawa', 'warsaw']
]);

const canonicalToken = (token) => TOKEN_SYNONYMS.get(token) ?? token;

// Un token en abrege ("man" -> manchester) ou une terminaison qui varie
// ("karlsruhe" -> "karlsruher", "laval" -> "lavallois"). Au-dela de 4 lettres
// d'ecart, deux mots qui commencent pareil sont deux mots differents
// ("villa" n'est pas "villarreal").
function tokensEquivalent(rawA, rawB) {
  const a = canonicalToken(rawA);
  const b = canonicalToken(rawB);
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (!long.startsWith(short)) return false;
  return short.length <= 4 || long.length - short.length <= 4;
}

function overlap(tokensA, tokensB) {
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const matched = shorter.filter((token) => longer.some((other) => tokensEquivalent(token, other))).length;
  return { matched, shorter: shorter.length, union: tokensA.length + tokensB.length - matched };
}

export function teamNamesEqual(a, b) {
  const normalizedA = normalizeTeamName(a);
  if (!normalizedA) return false;
  if (normalizedA === normalizeTeamName(b)) return true;
  const canonicalA = canonicalTeamName(a);
  return Boolean(canonicalA) && canonicalA === canonicalTeamName(b);
}

export function teamNamesLikelyMatch(a, b) {
  const normalizedA = normalizeTeamName(a);
  const normalizedB = normalizeTeamName(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;

  // Deux clubs connus du registre : verdict ferme, jamais d'approximation.
  const canonicalA = canonicalTeamName(a);
  const canonicalB = canonicalTeamName(b);
  if (canonicalA && canonicalB) return canonicalA === canonicalB;

  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  if (!tokensA.length || !tokensB.length) return false;

  const { matched, shorter } = overlap(tokensA, tokensB);
  return matched / shorter >= 0.6;
}

/**
 * Meilleur candidat pour un nom d'equipe : egalite (ou equivalence connue)
 * d'abord, sinon le candidat flou dont les tokens recouvrent le mieux le nom
 * cherche (Jaccard), avec le premier token comme departage ("Inter Milan" ->
 * "Inter" plutot que "Milan"). `null` si aucun candidat ne correspond ou si
 * deux restent indiscernables — mieux vaut pas de donnee qu'une autre equipe.
 */
export function findBestTeamNameMatch(teamName, candidates, getName = (candidate) => candidate) {
  const target = normalizeTeamName(teamName);
  if (!target) return null;

  const exact = candidates.find((candidate) => teamNamesEqual(teamName, getName(candidate)));
  if (exact) return exact;

  const targetTokens = significantTokens(teamName);
  if (!targetTokens.length) return null;

  const scored = [];
  for (const candidate of candidates) {
    const name = getName(candidate);
    if (!teamNamesLikelyMatch(teamName, name)) continue;
    const candidateTokens = significantTokens(name);
    const { matched, union } = overlap(targetTokens, candidateTokens);
    const firstTokenMatch = candidateTokens.length > 0 && tokensEquivalent(targetTokens[0], candidateTokens[0]) ? 1 : 0;
    scored.push({ candidate, score: matched / union, firstTokenMatch });
  }
  if (!scored.length) return null;

  scored.sort((x, y) => y.score - x.score || y.firstTokenMatch - x.firstTokenMatch);
  const [best, runnerUp] = scored;
  if (runnerUp && runnerUp.score === best.score && runnerUp.firstTokenMatch === best.firstTokenMatch) return null;
  return best.candidate;
}
