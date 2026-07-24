// src/utils/tokenizer.js

// Comprehensive list of standard English and conversational filler words
const STOP_WORDS = new Set([
    "i", "me", "my", "we", "our", "ours", "you", "your", "yours", "he", "him", "his",
    "she", "her", "hers", "it", "its", "they", "them", "their", "what", "which", "who",
    "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be",
    "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a",
    "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at",
    "by", "for", "with", "about", "against", "between", "into", "through", "during",
    "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on",
    "off", "over", "under", "again", "further", "then", "once", "here", "there", "when",
    "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other",
    "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too",
    "very", "can", "will", "just", "don", "should", "now", "ll", "e.g",
    // JD specific conversational noise
    "bonus", "help", "grow", "explored", "coursework", "self", "learning", "signal",
    "none", "following", "dealbreakers", "haven", "covered", "yet", "exposure", "conceptual",
    "awareness", "welcome", "expected", "assist", "generating", "cases", "review",
    "strong", "plus", "similar", "powered", "speed", "strengthen", "qa", "workflows",
    "work", "ships", "knowledge", "interest", "projects", "tools", "using", "code", "development", "habit", "signal", "yet", "powered",
    "strength", "strengths", "suggestions", "missing"
]);
const KNOWN_SKILLS = [
    "html", "css", "javascript", "typescript", "react", "next.js",
    "node.js", "express", "postgresql", "sql", "testing", "jest",
    "playwright", "rag", "embeddings", "vector search", "langchain",
    "python", "docker", "aws", "git"
];
function extractJDSkills(jdText) {
    if (!jdText) return [];

    // Extract only the skills section
    const sectionMatch = jdText.match(/Technical Skills([\s\S]*?)(?:Nice to Have|Why Join Us|$)/i);
    if (!sectionMatch) return [];

    return sectionMatch[1]
        .toLowerCase()
        // Remove category headers explicitly
        .replace(/\b(front end|back end|quality & testing|al|ai|bonus we ll help you grow here)\b/ig, ' ')
        // Keep alphanumeric, spaces, and valid tech punctuation (. + # -)
        .replace(/[^a-z0-9\s\.\+\#\-]/g, ' ')
        .split(/\s+/)
        // Remove standalone punctuation, short letters, and stop words
        .filter(word => word.length > 1 && /[a-z0-9]/.test(word))
        .filter(word => !STOP_WORDS.has(word));
}

function normalizeText(text) {
    if (!text) return [];

    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s\.\+\#\-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 1)
        .filter(word => !STOP_WORDS.has(word));
}

module.exports = { extractJDSkills, normalizeText };