// src/scoring/scoreResume.js

const { normalizeText, extractJDSkills } = require('../utils/tokenizer');
const { getMatchedKeywords } = require('./keywordMatcher');
const { getMissingKeywords } = require('./suggestions');

function scoreResume(resumeText, jdText) {
    const resumeTokens = normalizeText(resumeText);
    
    const jdTokens = Array.from(new Set(extractJDSkills(jdText)));

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