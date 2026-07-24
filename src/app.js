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

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: process.env.SLACK_APP_TOKEN
});

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Stores session state: { jds: [...], candidates: [...] }
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

function getDisplayName(filename) {
    let name = filename.replace(/\.[^/.]+$/, "");
    name = name.replace(/\.pdf$/, "");
    name = name.replace(/^\d+[_]*/, "");
    name = name.replace(/[_]/g, " ");
    return name.trim();
}

app.message(async ({ message, say }) => {

    // 0. RESET COMMAND
    if (message.text && message.text.trim().toLowerCase() === 'reset') {
        channelCache.delete(message.channel);
        await say("Channel cache cleared. Upload new Job Descriptions and Resumes to start fresh.");
        return;
    }

    // 1. FILE UPLOAD & MULTI-JD EVALUATION
    if (message.files && message.files.length > 0) {
        await say(`Received ${message.files.length} file(s). Downloading and classifying documents...`);

        const parsedFiles = [];

        try {
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

                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            // Parallel document classification
            const classifiedFiles = await Promise.all(
                parsedFiles.map(async (file) => {
                    const classification = await classifyDocumentWithOllama(file.text, file.filename);
                    return { ...file, docType: classification.type, title: classification.title };
                })
            );

            const jdFiles = classifiedFiles.filter(f => f.docType === 'JOB_DESCRIPTION');
            const resumes = classifiedFiles.filter(f => f.docType === 'RESUME');

            if (jdFiles.length === 0) {
                await say("No Job Descriptions identified among uploaded files. Please upload at least one Job Description.");
                return;
            }

            if (resumes.length === 0) {
                await say(`Identified ${jdFiles.length} Job Description(s), but no candidate resumes were detected.`);
                return;
            }

            const jdTitles = jdFiles.map(j => `• *${j.title}* (\`${j.filename}\`)`).join("\n");
            await say(`Identified *${jdFiles.length} Job Description(s)*:\n${jdTitles}\n\nEvaluating *${resumes.length} Candidate Resume(s)* across ALL Job Descriptions...`);

            // Evaluate candidates against all JDs
            const candidatesData = [];

            for (const resume of resumes) {
                const result = await scoreResumeWithOllama(resume.text, jdFiles);

                const candidateName = (result.name && result.name !== "N/A" && result.name.trim().length > 0)
                    ? result.name
                    : getDisplayName(resume.filename);

                candidatesData.push({
                    filename: resume.filename,
                    displayName: candidateName,
                    cgpa: result.cgpa || 'N/A',
                    experience: result.experience || 'N/A',
                    experience_calculation_notes: result.experience_calculation_notes || 'N/A',
                    college: result.college || 'N/A',
                    evaluations: result.evaluations || []
                });
            }

            // Save full context (JDs + Candidates) in channel cache for Q&A
            const sessionData = {
                jds: jdFiles.map(j => ({ filename: j.filename, title: j.title, text: j.text })),
                candidates: candidatesData
            };
            channelCache.set(message.channel, sessionData);

            // Construct Multi-JD Output Cards
            const blocks = [
                {
                    type: "header",
                    text: { type: "plain_text", text: "Multi-Role Evaluation Matrix", emoji: false }
                },
                { type: "divider" }
            ];

            candidatesData.forEach((candidate) => {
                let evalSectionText = "";

                candidate.evaluations.forEach((evalItem) => {
                    const matchedSkills = evalItem.matched.length > 0
                        ? evalItem.matched.map(s => `\`${s}\``).join(", ")
                        : "_None matched_";

                    const missingSkills = evalItem.missing.length > 0
                        ? evalItem.missing.map(s => `\`${s}\``).join(", ")
                        : "_None missing_";

                    evalSectionText +=
                        `\n> *Role: ${evalItem.jd_title}* (\`${evalItem.jd_filename}\`)
> • *Score:* *${evalItem.score}/100*
> • *Status:* ${evalItem.status}
> • *Matched:* ${matchedSkills}
> • *Missing:* ${missingSkills}\n`;
                });

                const candidateCard =
                    `*Candidate:* *${candidate.displayName}*
• *CGPA:* ${candidate.cgpa}
• *College:* ${candidate.college}
• *Experience:* ${candidate.experience}
• *Exp Notes:* _${candidate.experience_calculation_notes}_

*Evaluations Across Job Descriptions:*${evalSectionText}`;

                blocks.push({ type: "section", text: { type: "mrkdwn", text: candidateCard } });
                blocks.push({ type: "divider" });
            });

            await say({ text: "Multi-Role Evaluation Matrix", blocks: blocks });

        } catch (error) {
            console.error('Error processing files:', error);
            await say('Error processing uploaded files. Check server console for details.');
        }
        return;
    }

    // 2. RIGOROUS Q&A PHASE
    if (message.text && !message.files) {
        const queryText = message.text;
        const sessionData = channelCache.get(message.channel);

        if (sessionData && sessionData.candidates.length > 0) {
            await say("_Analyzing multi-role candidate dataset..._");

            const answer = await answerQuestionWithOllama(queryText, sessionData);
            await say(answer);
        } else {
            await say("Please upload Job Descriptions and Resumes first before asking testing questions.");
        }
    }
});

(async () => {
    await app.start();
    console.log('Multi-JD ATS Evaluation Server is running!');
})();