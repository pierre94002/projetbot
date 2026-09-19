// Comparaison floue de noms d'équipe, partagée par toutes les sources
// tierces dont l'orthographe ne correspond pas exactement à celle déjà
// utilisée dans CôteMaster (Odds API/API-Football) — ex. FlashScore "Dep. A
// Coruna" vs "Deportivo La Coruña", ou football-data.co.uk "Man United" vs
// "Manchester United". Comparaison par recouvrement de tokens significatifs
// plutôt qu'une égalité stricte, délibérément permissive : une source
// additive qui rate une équipe perd juste un bonus de contexte. Le revers
// (deux clubs distincts confondus : Inter/Milan, Paris FC/PSG) est contenu
// par findBestTeamNameMatch — égalité exacte d'abord, puis le candidat le
// plus proche, jamais le premier venu.

// Sigles de type de club et articles : présents dans beaucoup de noms sans
// rien distinguer ("and" faisait matcher Brighton and Hove Albion avec
// Anderlecht par préfixe).
const STOP_WORDS = new Set([
  'fc', 'afc', 'cf', 'sc', 'ac', 'as', 'ss', 'ssc', 'us', 'ud', 'cd', 'sd', 'rc', 'rcd', 'bsc', 'sv', 'vfb', 'vfl', 'tsg', 'fsv',
  'sk', 'fk', 'nk', 'hnk', 'gnk', 'kv', 'rsc', 'kaa', 'krc', 'ogc', 'club', 'de', 'del', 'la', 'las', 'los', 'le', 'the', 'and', 'und'
]);
// Un préfixe n'est accepté que pour une abréviation ("man" → manchester,
// "weds" → wednesday) : au-delà, "villa" ferait matcher Villarreal avec Aston Villa.
const MAX_PREFIX_TOKEN_LENGTH = 4;

function normalizeTeamName(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTokens(name) {
  const tokens = normalizeTeamName(name)
    .split(' ')
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token));
  const meaningful = tokens.filter((token) => !STOP_WORDS.has(token));
  return meaningful.length ? meaningful : tokens;
}

function tokensEquivalent(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length <= MAX_PREFIX_TOKEN_LENGTH && long.startsWith(short);
}

function overlap(tokensA, tokensB) {
  const [shorter, longer] = tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  const matched = shorter.filter((token) => longer.some((other) => tokensEquivalent(token, other))).length;
  return { matched, shorter: shorter.length, union: tokensA.length + tokensB.length - matched };
}

export function teamNamesEqual(a, b) {
  const normalizedA = normalizeTeamName(a);
  return Boolean(normalizedA) && normalizedA === normalizeTeamName(b);
}

export function teamNamesLikelyMatch(a, b) {
  const normalizedA = normalizeTeamName(a);
  const normalizedB = normalizeTeamName(b);
  if (!normalizedA || !normalizedB) return false;
  if (normalizedA === normalizedB) return true;

  const tokensA = significantTokens(a);
  const tokensB = significantTokens(b);
  if (!tokensA.length || !tokensB.length) return false;

  const { matched, shorter } = overlap(tokensA, tokensB);
  return matched / shorter >= 0.6;
}

/**
 * Meilleur candidat pour un nom d'équipe : égalité (normalisée) d'abord,
 * sinon le candidat flou dont les tokens recouvrent le mieux le nom cherché
 * (Jaccard), avec le premier token comme départage ("Inter Milan" → "Inter"
 * plutôt que "Milan"). `null` si aucun candidat ne correspond ou si deux
 * restent indiscernables — mieux vaut pas de donnée qu'une autre équipe.
 */
export function findBestTeamNameMatch(teamName, candidates, getName = (candidate) => candidate) {
  const target = normalizeTeamName(teamName);
  if (!target) return null;

  const exact = candidates.find((candidate) => normalizeTeamName(getName(candidate)) === target);
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
