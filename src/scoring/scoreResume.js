const { normalizeText } = require('../utils/tokenizer');
const { getMatchedKeywords } = require('./keywordMatcher');
const { getMissingKeywords } = require('./suggestions');

function scoreResume(resumeText, jdText) {
    const resumeTokens = normalizeText(resumeText);
    
    // In a real scenario, you might have a predefined list of valid skills to extract from the JD.
    // For this MVP, we treat every unique word in the JD as a keyword requirement.
    const jdTokens = Array.from(new Set(normalizeText(jdText)));

    if (jdTokens.length === 0) {
        return { score: 0, matched: [], missing: [] };
    }

    const matched = getMatchedKeywords(jdTokens, resumeTokens);
    const missing = getMissingKeywords(jdTokens, matched);

    // Score = (Matched Keywords / Total JD Keywords) * 100
    const score = Math.round((matched.length / jdTokens.length) * 100);

    return {
        score,
        matched,
        missing
    };
}

module.exports = { scoreResume };