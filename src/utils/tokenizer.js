// src/utils/tokenizer.js

function extractJDSkills(jdText) {
    if (!jdText) return [];

    // Regex to extract everything between "Technical Skills" and the next major heading
    const sectionMatch = jdText.match(/Technical Skills([\s\S]*?)(?:Bonus We'll Help You Grow Here|Nice to Have|Why Join Us|$)/i);
    
    if (!sectionMatch) return [];

    return sectionMatch[1]
        .toLowerCase()
        // Remove conversational filler words specifically used in the JD
        .replace(/\b(and|or|understanding of|familiarity with|tools such as|is a plus|curiosity about|a habit of)\b/g, ' ')
        // Remove category headers
        .replace(/\b(front end|back end|quality & testing|al|ai)\b/g, ' ')
        // Modified Regex: Keep alphanumeric, spaces, and valid tech punctuation (like . in Node.js)
        // Replace bullets, commas, slashes, etc., with spaces
        .replace(/[^a-z0-9\s\.\+\#\-]/g, ' ')
        .split(/\s+/)
        // Remove standalone periods/symbols and single letters
        .filter(word => word.length > 1 && /[a-z0-9]/.test(word));
}

function normalizeText(text) {
    if (!text) return [];
    
    return text
        .toLowerCase()
        // Modified Regex: Keeps . + # - to preserve skills like "Node.js" or "C++"
        .replace(/[^a-z0-9\s\.\+\#\-]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 1);
}

module.exports = { extractJDSkills, normalizeText };