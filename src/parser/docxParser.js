const mammoth = require('mammoth');

async function extractDocxText(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
}

module.exports = { extractDocxText };