require('dotenv').config();
const { App } = require('@slack/bolt');
const fs = require('fs');
const path = require('path');

// Import Parsers
const { extractPdfText } = require('./parser/pdfParser');
const { extractDocxText } = require('./parser/docxParser');

// Import Scoring
const { scoreResume } = require('./scoring/scoreResume');

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN
});

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Helper function to extract text based on extension
async function parseFileText(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
        return await extractPdfText(filePath);
    } else if (ext === '.docx') {
        return await extractDocxText(filePath);
    } else if (ext === '.txt') {
        return fs.readFileSync(filePath, 'utf8');
    }
    return '';
}

app.message(async ({ message, say }) => {
    if (!message.files || message.files.length === 0) return;

    await say(`Received ${message.files.length} file(s). Downloading and processing...`);

    try {
        const parsedFiles = [];

        // Phase 1 & 2: Download and Extract Text
        for (const file of message.files) {
            const response = await fetch(file.url_private_download, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });

            if (!response.ok) throw new Error(`Failed to download ${file.name}`);

            const buffer = await response.arrayBuffer();
            const filePath = path.join(uploadsDir, file.name);
            
            fs.writeFileSync(filePath, Buffer.from(buffer));

            const text = await parseFileText(filePath);
            parsedFiles.push({ filename: file.name, text });
        }

        // Identify JD vs Resumes
        // A file is considered a JD if its name contains "jd" or "job", or if it is a .txt file
        let jdFile = parsedFiles.find(f => {
            const lowerName = f.filename.toLowerCase();
            return lowerName.includes('jd') || lowerName.includes('job') || lowerName.endsWith('.txt');
        });

        if (!jdFile) {
            await say("No Job Description found. Please name your JD file with 'jd' or 'job' in the title (e.g., JD.pdf, Job_Description.docx) or upload it as a .txt file.");
            return;
        }

        const jdText = jdFile.text;
        const resumes = parsedFiles.filter(f => f.filename !== jdFile.filename);

        if (resumes.length === 0) {
            await say("Found Job Description, but no resume files were uploaded alongside it.");
            return;
        }

        // Phase 3 & 4: Score and Rank Candidates
        const rankedCandidates = resumes
            .map(resume => {
                const result = scoreResume(resume.text, jdText);
                return {
                    filename: resume.filename,
                    score: result.score,
                    matched: result.matched,
                    missing: result.missing
                };
            })
            .sort((a, b) => b.score - a.score);

        // Phase 5 & 6: Generate Slack Block Kit Response
        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "Resume Ranking",
                    emoji: false
                }
            },
            {
                type: "divider"
            }
        ];

rankedCandidates.forEach((candidate, index) => {
            const maxItems = 10; // Limit to prevent Slack 3000 character error

            const matchedSkills = candidate.matched.length > 0 
                ? candidate.matched.slice(0, maxItems).map(s => `- ${s}`).join("\n") + 
                  (candidate.matched.length > maxItems ? `\n- ...and ${candidate.matched.length - maxItems} more` : "")
                : "None matched";
            
            const improvementSuggestions = candidate.missing.length > 0 
                ? candidate.missing.slice(0, maxItems).map(s => `• ${s}`).join("\n") + 
                  (candidate.missing.length > maxItems ? `\n• ...and ${candidate.missing.length - maxItems} more` : "")
                : "No suggestions";

            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${index + 1}. ${candidate.filename}*\n*Score:* ${candidate.score}%\n\n*Strengths:*\n${matchedSkills}\n\n*Suggestions:*\n${improvementSuggestions}`
                }
            });

            blocks.push({
                type: "divider"
            });
        });

        await say({
            text: "Resume Ranking Results",
            blocks: blocks
        });

    } catch (error) {
        console.error(error);
        await say('Error processing the files. Check the server console for details.');
    }
});

(async () => {
    await app.start();
    console.log('Resume Ranker Slack bot is running!');
})();