/**
 * Fuzzy search utility for client and site searching.
 * Provides tolerant matching for typos, abbreviations, prefixes, and partial matches.
 */

function normalize(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Standard Levenshtein distance calculation between two strings.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const row: number[] = [];
  for (let i = 0; i <= b.length; i++) row[i] = i;

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      let val: number;
      if (a[i - 1] === b[j - 1]) {
        val = row[j - 1];
      } else {
        val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
      }
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
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
  const q = normalize(query);
  const target = normalize(candidate);

  if (!q) {
    return { matches: false, score: 0 };
  }
  if (!target) {
    return { matches: false, score: 0 };
  }

  // 1. Exact match
  if (target === q) {
    return { matches: true, score: 1000 };
  }

  // 2. Starts with query
  if (target.startsWith(q)) {
    return { matches: true, score: 850 + Math.min(100, (q.length / target.length) * 100) };
  }

  // 3. Contains exact substring
  const subIndex = target.indexOf(q);
  if (subIndex !== -1) {
    const isWordStart = subIndex === 0 || /[\s\-_./]/.test(target[subIndex - 1]);
    const score = (isWordStart ? 700 : 500) - Math.min(subIndex, 50);
    return { matches: true, score };
  }

  // Word-level analysis
  const targetWords = target.split(/[\s\-_./]+/).filter(Boolean);
  const queryWords = q.split(/[\s\-_./]+/).filter(Boolean);

  // 4. Acronym match (e.g. "bny" for "Bank of New York" or "app" for "Apex Packaging Products")
  if (q.length >= 2 && targetWords.length >= 2) {
    const acronym = targetWords.map((w) => w[0]).join('');
    if (acronym.startsWith(q)) {
      return { matches: true, score: 450 + (q.length / acronym.length) * 50 };
    }
    if (acronym.includes(q)) {
      return { matches: true, score: 400 };
    }
  }

  // 5. Multi-word match: check if every query word matches some word in the target
  if (queryWords.length > 0) {
    let allQueryWordsMatched = true;
    let wordMatchScore = 0;

    for (const qWord of queryWords) {
      let matchedThisQWord = false;
      let bestQWordScore = 0;

      for (const tWord of targetWords) {
        if (tWord === qWord) {
          matchedThisQWord = true;
          bestQWordScore = Math.max(bestQWordScore, 100);
          break;
        }
        if (tWord.startsWith(qWord)) {
          matchedThisQWord = true;
          bestQWordScore = Math.max(bestQWordScore, 80 + (qWord.length / tWord.length) * 15);
        } else if (tWord.includes(qWord)) {
          matchedThisQWord = true;
          bestQWordScore = Math.max(bestQWordScore, 60);
        } else if (qWord.length >= 4) {
          // Check for typo in word
          const maxDist = qWord.length <= 5 ? 1 : 2;
          const dist = levenshtein(qWord, tWord.slice(0, qWord.length + 1));
          if (dist <= maxDist) {
            matchedThisQWord = true;
            bestQWordScore = Math.max(bestQWordScore, 50 - dist * 10);
          }
        }
      }

      if (!matchedThisQWord) {
        allQueryWordsMatched = false;
        break;
      }
      wordMatchScore += bestQWordScore;
    }

    if (allQueryWordsMatched) {
      return { matches: true, score: 300 + wordMatchScore };
    }
  }

  // 6. Subsequence match (characters in sequence with gaps)
  let tIdx = 0;
  let qIdx = 0;
  let consecutiveCount = 0;
  let subseqScore = 0;

  while (tIdx < target.length && qIdx < q.length) {
    if (target[tIdx] === q[qIdx]) {
      qIdx++;
      consecutiveCount++;
      subseqScore += 10 + consecutiveCount * 5;
    } else {
      consecutiveCount = 0;
    }
    tIdx++;
  }

  if (qIdx === q.length && q.length >= 3) {
    // Subsequence completed
    return { matches: true, score: 150 + subseqScore - (target.length - q.length) };
  }

  // 7. Full typo tolerance: Levenshtein distance on any word or sliding window
  if (q.length >= 4) {
    const maxDist = q.length <= 5 ? 1 : 2;
    for (const tWord of targetWords) {
      const d = levenshtein(q, tWord);
      if (d <= maxDist) {
        return { matches: true, score: 120 - d * 20 };
      }
    }

    // Sliding window check over whole target
    for (let i = 0; i <= target.length - q.length; i++) {
      const window = target.substring(i, i + q.length);
      const d = levenshtein(q, window);
      if (d <= maxDist) {
        return { matches: true, score: 100 - d * 20 };
      }
    }
  }

  return { matches: false, score: 0 };
}

/**
 * Filter an array of items using fuzzy search.
 * If query is empty or whitespace only, returns an empty array [] so client names remain hidden
 * until the user starts searching.
 * Results are sorted by relevance score descending.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): T[] {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    // Hide all items if query is empty
    return [];
  }

  const scored: Array<{ item: T; score: number }> = [];

  for (const item of items) {
    const text = getText(item);
    const result = fuzzyMatch(text, trimmed);
    if (result.matches) {
      scored.push({ item, score: result.score });
    }
  }

  // Sort by score descending (highest score first)
  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.item);
}
