require('dotenv').config();
const { App } = require('@slack/bolt');
const fs = require('fs');
const path = require('path');
const { extractPdfText } = require('./parser/pdfParser');
const { extractDocxText } = require('./parser/docxParser');
const { scoreResumeWithOllama, answerQuestionWithOllama } = require('./scoring/ollamaScorer');

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

const channelCache = new Map();

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

    if (message.files && message.files.length > 0) {
        await say(`Received ${message.files.length} file(s). Downloading and analyzing resumes with AI...`);

        try {
            const parsedFiles = [];

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

            let jdFile = parsedFiles.find(f => {
                const lowerName = f.filename.toLowerCase();
                return lowerName.includes('jd') || lowerName.includes('job') || lowerName.endsWith('.txt');
            });

            if (!jdFile) {
                await say("No Job Description found. Please name your JD file with 'jd' or 'job' in the title.");
                return;
            }

            const jdText = jdFile.text;
            const resumes = parsedFiles.filter(f => f.filename !== jdFile.filename);

            if (resumes.length === 0) {
                await say("Found Job Description, but no resume files were uploaded alongside it.");
                return;
            }

            const rankedCandidates = [];

            for (const resume of resumes) {
                const result = await scoreResumeWithOllama(resume.text, jdText);
                rankedCandidates.push({
                    filename: resume.filename,
                    score: result.score || 0,
                    status: result.status || 'Evaluation complete.',
                    cgpa: result.cgpa || 'N/A',               // SAVING NEW DATA
                    experience: result.experience || 'N/A',   // SAVING NEW DATA
                    matched: result.matched || [],
                    missing: result.missing || []
                });
            }

            rankedCandidates.sort((a, b) => b.score - a.score);
            channelCache.set(message.channel, rankedCandidates);

            const blocks = [
                {
                    type: "header",
                    text: { type: "plain_text", text: "Resume Ranking Results", emoji: false }
                },
                { type: "divider" }
            ];

            rankedCandidates.forEach((candidate) => {
                const matchedSkills = candidate.matched.length > 0 ? candidate.matched.map(s => `• ${s}`).join("\n") : "• None matched";
                const missingSkills = candidate.missing.length > 0 ? candidate.missing.map(s => `• ${s}`).join("\n") : "• None missing";

                const cardContent =
                    `File: ${candidate.filename}

ATS Score  : ${candidate.score}/100
CGPA       : ${candidate.cgpa}
Experience : ${candidate.experience}
Status     : ${candidate.status}

Top Strengths
${matchedSkills}

Missing Skills
${missingSkills}`;

                blocks.push({ type: "section", text: { type: "mrkdwn", text: cardContent } });
                blocks.push({ type: "divider" });
            });

            await say({ text: "Resume Ranking Results", blocks: blocks });

        } catch (error) {
            console.error(error);
            await say('Error processing the files. Check the server console for details.');
        }
        return;
    }

    // 2. HANDLE TEXT QUESTIONS (Q&A Phase) - Fully Dynamic AI Handling
    if (message.text && !message.files) {
        const queryText = message.text;
        const cachedCandidates = channelCache.get(message.channel);

        if (cachedCandidates && cachedCandidates.length > 0) {
            await say("_Analyzing candidates..._");

            const answer = await answerQuestionWithOllama(queryText, cachedCandidates);

            await say(answer);
        } else {
            await say("Please upload a Job Description and Resumes first before asking questions.");
        }
    }
});

(async () => {
    await app.start();
    console.log('Slack Bot with Ollama Q&A is running!');
})();