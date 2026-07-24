const { Ollama } = require('ollama');

const ollama = new Ollama({ host: 'https://ollama.lokeshrc.me/' });

// 1. Updated Scoring Function
async function scoreResumeWithOllama(resumeText, jdText) {
    const prompt = `
    You are an expert ATS (Applicant Tracking System) reviewer. Analyze the candidate resume against the provided Job Description.

    JOB DESCRIPTION:
    ${jdText}

    RESUME:
    ${resumeText}

    Formatting rules:
    - Do NOT include any emojis.
    - Extract clean, high-value technical skills only.
    - Extract the candidate's CGPA or GPA if available (otherwise put "N/A").
    - Extract the candidate's years of experience if available (otherwise put "N/A").

    Return ONLY a JSON object matching this schema:
    {
      "score": <number 0-100>,
      "status": "<1-2 sentence hire recommendation and fit summary>",
      "cgpa": "<extracted CGPA or N/A>",
      "experience": "<extracted years of experience or N/A>",
      "matched": ["<clean matched skill 1>", "<clean matched skill 2>"],
      "missing": ["<clean missing skill 1>", "<clean missing skill 2>"]
    }
    `;

    try {
        const response = await ollama.chat({
            model: 'gemma4:latest',
            messages: [{ role: 'user', content: prompt }],
            format: 'json'
        });

        return JSON.parse(response.message.content);
    } catch (error) {
        console.error('Ollama processing error:', error);
        return {
            score: 0,
            status: "Evaluation failed during AI analysis.",
            cgpa: "N/A",
            experience: "N/A",
            matched: [],
            missing: []
        };
    }
}

// 2. NEW: Function to answer general questions across all candidates
async function answerQuestionWithOllama(question, candidatesData) {
    const prompt = `
    You are an expert hiring manager assistant. 
    Use the following JSON data of evaluated candidates to answer the user's question. 
    
    CANDIDATE DATA:
    ${JSON.stringify(candidatesData, null, 2)}

    USER QUESTION:
    ${question}

    Formatting rules:
    - Answer directly and professionally.
    - Base your answer ONLY on the provided candidate data.
    - Do NOT use emojis.
    - Keep it concise.
    `;

    try {
        const response = await ollama.chat({
            model: 'gemma4:latest',
            messages: [{ role: 'user', content: prompt }]
        });

        return response.message.content;
    } catch (error) {
        console.error('Ollama Q&A error:', error);
        return "I encountered an error trying to analyze the candidates.";
    }
}

module.exports = { scoreResumeWithOllama, answerQuestionWithOllama };