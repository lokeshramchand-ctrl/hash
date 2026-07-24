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

app.message(async ({ message, say }) => {
    if (!message.files || message.files.length === 0) return;

    await say(`Received ${message.files.length} file(s). Downloading and processing...`);

    try {
        const filePaths = [];

        // Phase 1: Download files
        for (const file of message.files) {
            const response = await fetch(file.url_private_download, {
                headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
            });

            if (!response.ok) throw new Error(`Failed to download ${file.name}`);

            const buffer = await response.arrayBuffer();
            const filePath = path.join(uploadsDir, file.name);
            
            fs.writeFileSync(filePath, Buffer.from(buffer));
            filePaths.push(filePath);
        }

        let jdText = "";
        const resumes = [];

        // Phase 2: Extract Text
        for (const filePath of filePaths) {
            const ext = path.extname(filePath).toLowerCase();
            const filename = path.basename(filePath);

            if (ext === '.txt') {
                jdText = fs.readFileSync(filePath, 'utf8');
            } else if (ext === '.pdf') {
                const text = await extractPdfText(filePath);
                resumes.push({ filename, text });
            } else if (ext === '.docx') {
                const text = await extractDocxText(filePath);
                resumes.push({ filename, text });
            }
        }

        if (!jdText) {
            await say("No Job Description (.txt) found. Please upload a JD alongside the resumes.");
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
            .sort((a, b) => b.score - a.score); // Sorting highest to lowest

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
            const matchedSkills = candidate.matched.length > 0 
                ? candidate.matched.map(s => `- ${s}`).join("\n") 
                : "None matched";
            
            const improvementSuggestions = candidate.missing.length > 0 
                ? candidate.missing.map(s => `• ${s}`).join("\n") 
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

        // Send payload back to Slack
        await say({
            text: "Resume Ranking Results", // Fallback text
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