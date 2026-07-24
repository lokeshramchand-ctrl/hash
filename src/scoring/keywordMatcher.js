function getMatchedKeywords(jdTokens, resumeTokens) {
    const resumeSet = new Set(resumeTokens);
    const jdSet = new Set(jdTokens);
    const matched = [];

    for (const keyword of jdSet) {
        if (resumeSet.has(keyword)) {
            matched.push(keyword);
        }
    }
    
    return matched;
}

module.exports = { getMatchedKeywords };