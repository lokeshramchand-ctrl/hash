function getMissingKeywords(jdTokens, matchedKeywords) {
    const matchedSet = new Set(matchedKeywords);
    const jdSet = new Set(jdTokens);
    const missing = [];

    for (const keyword of jdSet) {
        if (!matchedSet.has(keyword)) {
            missing.push(`Missing Skill: ${keyword}`);
        }
    }

    if (missing.length < 3) {
        missing.push("Mention measurable impact");
    }

    return missing;
}

module.exports = { getMissingKeywords };