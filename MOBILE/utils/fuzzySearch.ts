/**
 * High-performance, robust fuzzy search utility for client and site searching.
 *
 * Provides intelligent, multi-tier matching:
 * 1. Exact & Normalized Match (case, punctuation, and accent-insensitive)
 * 2. Prefix & Word-start Match
 * 3. Deep Acronym & Initialism Matching (e.g. "udf" -> "Unique Delta Force" or "The Unique Delta Force Pvt Ltd")
 * 4. Damerau-Levenshtein Distance with single-cost Transposition (e.g. "assualt" -> "Dassault")
 * 5. Sliding-Window Substring Edit Distance (catches typos inside prefixes/suffixes)
 * 6. Order-Independent Multi-Word Token Matching (e.g. "force delta" -> "Unique Delta Force")
 * 7. Phonetic & Double-Letter Collapse (e.g. "dasault" -> "Dassault", "infosis" -> "Infosys")
 * 8. Sequential Subsequence Matching with word-boundary bonus (fzf-style)
 */

const GRAMMAR_WORDS = new Set([
  'the', 'of', 'and', 'for', 'in', 'at', 'to', 'a', 'an', '&', 'by', 'with'
]);

const CORP_SUFFIXES = new Set([
  'pvt', 'ltd', 'private', 'limited', 'co', 'corp', 'corporation',
  'llc', 'llp', 'inc', 'incorporated', 'enterprises', 'enterprise', 'ventures', 'venture'
]);

const GENERIC_TERMS = new Set([
  'services', 'solutions', 'technologies', 'technology', 'group',
  'systems', 'systemes', 'security', 'industries', 'industry', 'facility', 'management'
]);

/**
 * Normalize a string by removing accents/diacritics, lowercase, and trimming.
 */
function normalize(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Strip all non-alphanumeric characters.
 */
function cleanAlphaNum(str: string): string {
  return normalize(str).replace(/[^a-z0-9]/g, '');
}

/**
 * Tokenize a string into distinct words, splitting CamelCase and punctuation.
 */
function tokenize(str: string): string[] {
  if (!str) return [];
  // Split camelCase boundaries e.g. "DeltaForce" -> "Delta Force"
  const spaced = str.replace(/([a-z])([A-Z])/g, '$1 $2');
  return normalize(spaced)
    .split(/[\s\-_./&,()#+*~`'":;?!\\|]+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/**
 * Damerau-Levenshtein distance calculation.
 * Accurately treats adjacent character transposition (e.g. "ua" -> "au" in "assualt" vs "assault")
 * as a single edit operation (cost 1).
 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (!la) return lb;
  if (!lb) return la;

  const d: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));

  for (let i = 0; i <= la; i++) d[i][0] = i;
  for (let j = 0; j <= lb; j++) d[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost  // substitution
      );

      // Transposition check
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }

  return d[la][lb];
}

/**
 * Backward compatibility alias for levenshtein.
 */
export const levenshtein = damerauLevenshtein;

/**
 * Maximum allowed edit distance based on query length.
 */
function getMaxAllowedDistance(len: number): number {
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  if (len <= 11) return 3;
  return Math.min(4, Math.floor(len * 0.35));
}

/**
 * Phonetic and duplicate reduction for forgiving matching:
 * - Collapses consecutive double letters ("ss" -> "s", "ll" -> "l")
 * - Normalizes common phonetic duplicates ("ph" -> "f", "ck" -> "k", "ee" -> "i", "oo" -> "u")
 */
function phoneticReduce(str: string): string {
  return normalize(str)
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/z/g, 's')
    .replace(/w/g, 'v');
}

/**
 * Generates all practical acronym / initialism variants for a list of words.
 * Handles cases like:
 * - "Unique Delta Force" -> "udf"
 * - "The Unique Delta Force Pvt Ltd" -> "udf", "tudfpl", "udfpl"
 * - "State Bank of India" -> "sbi", "sboi"
 * - "Tata Consultancy Services" -> "tcs"
 */
function getAcronymVariants(words: string[]): string[] {
  if (!words || words.length === 0) return [];
  const variants = new Set<string>();

  // 1. All words
  const all = words.map((w) => w[0]).join('');
  if (all.length >= 2) variants.add(all);

  // 2. Without grammar words (e.g. "State Bank of India" -> "sbi")
  const noGrammar = words.filter((w) => !GRAMMAR_WORDS.has(w));
  const noGrammarInitials = noGrammar.map((w) => w[0]).join('');
  if (noGrammarInitials.length >= 2) variants.add(noGrammarInitials);

  // 3. Without corporate suffixes (e.g. "Unique Delta Force Pvt Ltd" -> "udf")
  const noCorp = words.filter((w) => !CORP_SUFFIXES.has(w));
  const noCorpInitials = noCorp.map((w) => w[0]).join('');
  if (noCorpInitials.length >= 2) variants.add(noCorpInitials);

  // 4. Without grammar AND corporate suffixes (e.g. "The Unique Delta Force Pvt Ltd" -> "udf")
  const coreWords = words.filter((w) => !GRAMMAR_WORDS.has(w) && !CORP_SUFFIXES.has(w));
  const coreInitials = coreWords.map((w) => w[0]).join('');
  if (coreInitials.length >= 2) variants.add(coreInitials);

  // 5. Without generic industry terms (e.g. "Unique Delta Force Security Services" -> "udf")
  const superCoreWords = coreWords.filter((w) => !GENERIC_TERMS.has(w));
  const superCoreInitials = superCoreWords.map((w) => w[0]).join('');
  if (superCoreInitials.length >= 2) variants.add(superCoreInitials);

  return Array.from(variants);
}

export interface FuzzyMatchResult {
  matches: boolean;
  score: number;
}

/**
 * Evaluate if a candidate text matches the search query and assign a relevance score.
 * Higher score = more relevant match.
 */
export function fuzzyMatch(candidate: string, query: string): FuzzyMatchResult {
  const normQuery = normalize(query);
  const normTarget = normalize(candidate);

  if (!normQuery || !normTarget) {
    return { matches: false, score: 0 };
  }

  const cleanQuery = cleanAlphaNum(normQuery);
  const cleanTarget = cleanAlphaNum(normTarget);

  if (!cleanQuery) {
    return { matches: false, score: 0 };
  }

  // 1. Exact match
  if (normTarget === normQuery || cleanTarget === cleanQuery) {
    return { matches: true, score: 1000 };
  }

  // 2. Starts with query
  if (normTarget.startsWith(normQuery) || cleanTarget.startsWith(cleanQuery)) {
    const coverage = cleanQuery.length / cleanTarget.length;
    return { matches: true, score: 880 + Math.round(coverage * 80) };
  }

  const targetWords = tokenize(normTarget);
  const queryWords = tokenize(normQuery);

  let maxScore = 0;

  // 3. Acronym / Initialism Matching (e.g. "udf" -> "Unique Delta Force")
  if (cleanQuery.length >= 2) {
    const acronyms = getAcronymVariants(targetWords);
    for (const acr of acronyms) {
      if (acr === cleanQuery) {
        maxScore = Math.max(maxScore, 870);
      } else if (acr.startsWith(cleanQuery)) {
        const coverage = cleanQuery.length / acr.length;
        maxScore = Math.max(maxScore, 780 + Math.round(coverage * 40));
      } else if (acr.includes(cleanQuery)) {
        maxScore = Math.max(maxScore, 720);
      } else if (cleanQuery.length >= 3 && damerauLevenshtein(cleanQuery, acr) <= 1) {
        maxScore = Math.max(maxScore, 710);
      }
    }
  }

  // 4. Exact Substring match
  const subIdx = normTarget.indexOf(normQuery);
  if (subIdx !== -1) {
    const isWordStart = subIdx === 0 || /[\s\-_./&,]/.test(normTarget[subIdx - 1]);
    const score = (isWordStart ? 760 : 630) - Math.min(subIdx, 50);
    maxScore = Math.max(maxScore, score);
  } else if (cleanTarget.includes(cleanQuery) && cleanQuery.length >= 3) {
    maxScore = Math.max(maxScore, 640);
  }

  // 5. Word-level analysis: checking each target word against the query
  // Example: query "assualt" against candidate "Dassault"
  const maxAllowedDist = getMaxAllowedDistance(cleanQuery.length);

  for (const tWord of targetWords) {
    const cleanTWord = cleanAlphaNum(tWord);
    if (!cleanTWord) continue;

    // Check exact or prefix on individual word
    if (cleanTWord === cleanQuery) {
      maxScore = Math.max(maxScore, 830);
      continue;
    }
    if (cleanTWord.startsWith(cleanQuery)) {
      maxScore = Math.max(maxScore, 760 + Math.round((cleanQuery.length / cleanTWord.length) * 50));
      continue;
    }
    if (cleanTWord.includes(cleanQuery)) {
      maxScore = Math.max(maxScore, 660);
      continue;
    }

    // Direct Damerau-Levenshtein between query and word
    const d = damerauLevenshtein(cleanQuery, cleanTWord);
    if (d <= maxAllowedDist) {
      const maxLen = Math.max(cleanQuery.length, cleanTWord.length);
      const similarity = 1 - d / maxLen;
      // Close typo like "assualt" vs "dassault" (d=2 on len 8 -> 0.75 sim) scores ~650
      const typoScore = Math.round(520 + similarity * 230 - d * 20);
      maxScore = Math.max(maxScore, typoScore);
    }

    // Sliding window check inside words:
    // E.g., if target word is "Dassault" and query is "assualt",
    // the window substring "assault" has edit distance 1 from "assualt"!
    if (cleanTWord.length >= cleanQuery.length - 1 && cleanQuery.length >= 4) {
      for (const wLen of [cleanQuery.length - 1, cleanQuery.length, cleanQuery.length + 1]) {
        if (wLen <= 0 || wLen > cleanTWord.length) continue;
        for (let i = 0; i <= cleanTWord.length - wLen; i++) {
          const window = cleanTWord.substring(i, i + wLen);
          const winDist = damerauLevenshtein(cleanQuery, window);
          if (winDist <= Math.min(2, maxAllowedDist)) {
            const winSim = 1 - winDist / cleanQuery.length;
            const winScore = Math.round(510 + winSim * 200 - winDist * 25 - (i === 0 ? 0 : 20));
            maxScore = Math.max(maxScore, winScore);
          }
        }
      }
    }
  }

  // 6. Multi-word query matching (e.g. "delta unique" or "dassault aviation")
  if (queryWords.length > 1) {
    let matchedQWordsCount = 0;
    let sumQWordScore = 0;

    for (const qWord of queryWords) {
      const cleanQWord = cleanAlphaNum(qWord);
      if (!cleanQWord) continue;
      const qDist = getMaxAllowedDistance(cleanQWord.length);

      let matchedThis = false;
      let highestWordMatch = 0;

      for (const tWord of targetWords) {
        const cleanTWord = cleanAlphaNum(tWord);
        if (!cleanTWord) continue;

        if (cleanTWord === cleanQWord) {
          matchedThis = true;
          highestWordMatch = Math.max(highestWordMatch, 100);
          break;
        } else if (cleanTWord.startsWith(cleanQWord)) {
          matchedThis = true;
          highestWordMatch = Math.max(highestWordMatch, 85);
        } else if (cleanTWord.includes(cleanQWord)) {
          matchedThis = true;
          highestWordMatch = Math.max(highestWordMatch, 70);
        } else {
          const wd = damerauLevenshtein(cleanQWord, cleanTWord);
          if (wd <= qDist) {
            matchedThis = true;
            highestWordMatch = Math.max(highestWordMatch, 60 - wd * 10);
          }
        }
      }

      if (matchedThis) {
        matchedQWordsCount++;
        sumQWordScore += highestWordMatch;
      }
    }

    if (matchedQWordsCount === queryWords.length) {
      const multiScore = 650 + Math.round((sumQWordScore / queryWords.length) * 2);
      maxScore = Math.max(maxScore, multiScore);
    }
  }

  // 7. Phonetic match check
  const phonQuery = phoneticReduce(cleanQuery);
  const phonTarget = phoneticReduce(cleanTarget);
  if (phonQuery.length >= 3) {
    if (phonTarget.includes(phonQuery)) {
      maxScore = Math.max(maxScore, 560);
    } else {
      for (const tWord of targetWords) {
        const phonTWord = phoneticReduce(tWord);
        if (phonTWord === phonQuery || phonTWord.includes(phonQuery)) {
          maxScore = Math.max(maxScore, 550);
        } else if (damerauLevenshtein(phonQuery, phonTWord) <= 1) {
          maxScore = Math.max(maxScore, 520);
        }
      }
    }
  }

  // 8. Sequential Subsequence Match (fzf-style)
  let tIdx = 0;
  let qIdx = 0;
  let consecutive = 0;
  let subseqScore = 0;
  while (tIdx < cleanTarget.length && qIdx < cleanQuery.length) {
    if (cleanTarget[tIdx] === cleanQuery[qIdx]) {
      qIdx++;
      consecutive++;
      subseqScore += 10 + consecutive * 5;
    } else {
      consecutive = 0;
    }
    tIdx++;
  }

  if (qIdx === cleanQuery.length && cleanQuery.length >= 3) {
    const penalty = Math.min(100, cleanTarget.length - cleanQuery.length);
    const calculatedSubseq = 320 + subseqScore - penalty;
    maxScore = Math.max(maxScore, calculatedSubseq);
  }

  if (maxScore > 0) {
    return { matches: true, score: maxScore };
  }

  return { matches: false, score: 0 };
}

/**
 * Filter an array of items using high-resilience fuzzy search.
 *
 * If query is empty or whitespace only, returns an empty array [] so client names remain hidden
 * until the user starts searching.
 *
 * Results are sorted by relevance score descending (best matches first).
 *
 * @param items Array of items to filter
 * @param query Search query string
 * @param getText Accessor function returning string or array of strings to match against
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string | string[] | undefined | null
): T[] {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    // Hide all items if query is empty
    return [];
  }

  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const raw = getText(item);
    if (!raw) continue;

    let bestScore = 0;
    let anyMatch = false;

    if (Array.isArray(raw)) {
      for (const text of raw) {
        if (!text) continue;
        const result = fuzzyMatch(text, trimmed);
        if (result.matches) {
          anyMatch = true;
          bestScore = Math.max(bestScore, result.score);
        }
      }
    } else {
      const result = fuzzyMatch(raw, trimmed);
      if (result.matches) {
        anyMatch = true;
        bestScore = result.score;
      }
    }

    if (anyMatch) {
      scored.push({ item, score: bestScore });
    }
  }

  // Sort by score descending (highest score first)
  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.item);
}
