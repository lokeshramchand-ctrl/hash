function normalizeText(text) {
    if (!text) return [];
    
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 0);
}

module.exports = { normalizeText };