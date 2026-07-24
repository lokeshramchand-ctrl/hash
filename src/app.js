require('dotenv').config();
const { App } = require('@slack/bolt');
const fs = require('fs');
const path = require('path');
const { extractPdfText } = require('./parser/pdfParser');
const { extractDocxText } = require('./parser/docxParser');
const {
    scoreResumeWithOllama,
    answerQuestionWithOllama,
    classifyDocumentWithOllama
} = require('./scoring/ollamaScorer');

// Initialize Slack Bolt App
const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Channel state cache
const channelCache = new Map();

// Helper to parse file based on extension
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

// Fallback helper to clean raw filenames if AI extraction fails
function getDisplayName(filename) {
    let name = filename.replace(/\.[^/.]+$/, ""); // Remove primary extension (.pdf)
    name = name.replace(/\.pdf$/, "");            // Handle double extensions (.pdf.pdf)
    name = name.replace(/^\d+[_]*/, "");          // Remove leading student ID/numbers
    name = name.replace(/[_]/g, " ");             // Replace remaining underscores with spaces
    return name.trim();
}

// Main Slack Message Handler
app.message(async ({ message, say }) => {

    // 0. HANDLE RESET / CLEAR COMMANDS
    if (message.text && message.text.trim().toLowerCase() === 'reset') {
        channelCache.delete(message.channel);
        await say("Channel cache cleared. You can upload a new Job Description and Resumes.");
        return;
    }

    // 1. HANDLE FILE UPLOADS (Resume Evaluation Phase)
    if (message.files && message.files.length > 0) {
        await say(`Received ${message.files.length} file(s). Downloading and classifying documents with AI...`);

        const parsedFiles = [];

        try {
            // Download and parse files
            for (const file of message.files) {
                const response = await fetch(file.url_private_download, {
                    headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` }
                });

                if (!response.ok) throw new Error(`Failed to download ${file.name}`);

                const buffer = await response.arrayBuffer();
                const filePath = path.join(uploadsDir, file.name);

                fs.writeFileSync(filePath, Buffer.from(buffer));

                // Extract text from document
                const text = await parseFileText(filePath);
                parsedFiles.push({ filename: file.name, text });

                // Clean up disk immediately after reading
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            // 2. AI DYNAMIC DOCUMENT CLASSIFICATION
            // Classify all uploaded documents concurrently using Ollama
            const classifiedFiles = await Promise.all(
                parsedFiles.map(async (file) => {
                    const docType = await classifyDocumentWithOllama(file.text, file.filename);
                    return { ...file, docType };
                })
            );

            const jdFiles = classifiedFiles.filter(f => f.docType === 'JOB_DESCRIPTION');
            const resumes = classifiedFiles.filter(f => f.docType === 'RESUME');

            // Validate presence of Job Description
            if (jdFiles.length === 0) {
                await say("No Job Description identified. AI classified all uploaded files as resumes. Please include a Job Description document.");
                return;
            }

            // Use primary Job Description
            const jdFile = jdFiles[0];
            if (jdFiles.length > 1) {
                await say(`Multiple Job Descriptions detected. Using *${jdFile.filename}* as the primary benchmark.`);
            }

            // Validate presence of Resumes
            if (resumes.length === 0) {
                await say(`Found Job Description (*${jdFile.filename}*), but no candidate resumes were detected among the uploaded files.`);
                return;
            }

            await say(`Identified Job Description (*${jdFile.filename}*) and ${resumes.length} resume(s). Analyzing candidates now...`);

            const jdText = jdFile.text;

            // 3. SCORE RESUMES
            const rankedCandidates = [];

            for (const resume of resumes) {
                const result = await scoreResumeWithOllama(resume.text, jdText);

                // Prefer LLM extracted candidate name, fall back to cleaned filename
                const candidateName = (result.name && result.name !== "N/A" && result.name.trim().length > 0)
                    ? result.name
                    : getDisplayName(resume.filename);

                rankedCandidates.push({
                    filename: resume.filename,
                    displayName: candidateName,
                    score: result.score || 0,
                    status: result.status || 'Evaluation complete.',
                    cgpa: result.cgpa || 'N/A',
                    experience: result.experience || 'N/A',
                    experience_calculation_notes: result.experience_calculation_notes || 'N/A',
                    college: result.college || 'N/A',
                    matched: result.matched || [],
                    missing: result.missing || []
                });
            }

            // Sort candidates highest to lowest score
            rankedCandidates.sort((a, b) => b.score - a.score);

            // Store results in channel context for follow-up Q&A
            channelCache.set(message.channel, rankedCandidates);

            // Construct Slack Block UI
            const blocks = [
                {
                    type: "header",
                    text: { type: "plain_text", text: "Resume Ranking Results", emoji: false }
                },
                { type: "divider" }
            ];

            rankedCandidates.forEach((candidate) => {
                const matchedSkills = candidate.matched.length > 0
                    ? candidate.matched.map(s => `• \`${s}\``).join("\n")
                    : "• _None matched_";

                const missingSkills = candidate.missing.length > 0
                    ? candidate.missing.map(s => `• \`${s}\``).join("\n")
                    : "• _None missing_";

                const cardContent =
                    `*Candidate:* *${candidate.displayName}*
• *ATS Score:* *${candidate.score}/100*
• *CGPA:* ${candidate.cgpa}
• *College:* ${candidate.college}
• *Experience:* ${candidate.experience}
• *Exp Notes:* _${candidate.experience_calculation_notes}_
• *Status:* ${candidate.status}

*Matched Skills:*
${matchedSkills}

*Missing Skills:*
${missingSkills}`;

                blocks.push({ type: "section", text: { type: "mrkdwn", text: cardContent } });
                blocks.push({ type: "divider" });
            });

            await say({ text: "Resume Ranking Results", blocks: blocks });

        } catch (error) {
            console.error('Error during batch file processing:', error);
            await say('Error processing the uploaded files. Please check server logs.');
        }
        return;
    }

    // 2. HANDLE TEXT QUESTIONS (Q&A Phase)
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

// Start Slack Socket Server
(async () => {
    await app.start();
    console.log('Slack Bot with Ollama ATS Scorer & Q&A is running!');
})();