const { Ollama } = require('ollama');

const ollama = new Ollama({ host: 'https://ollama.lokeshrc.me/' });

/**
 * Classifies a document as "JOB_DESCRIPTION" or "RESUME" and extracts a descriptive role/title.
 */
async function classifyDocumentWithOllama(text, filename) {
    const prompt = `
    You are an expert ATS document classification engine.
    Analyze the filename and text content sample below to classify the document and extract its role title or document name.

    FILENAME: ${filename}

    TEXT SAMPLE:
    ${text.slice(0, 2000)}

    CLASSIFICATION CRITERIA:
    - "JOB_DESCRIPTION": Outlines hiring requirements, job responsibilities, role expectations, or required qualifications.
    - "RESUME": Represents an individual candidate's CV/resume containing personal education, work history, projects, or skills.

    Return ONLY a valid JSON object matching this schema:
    {
      "type": "JOB_DESCRIPTION" | "RESUME",
      "title": "string (If JOB_DESCRIPTION, extract the job/role title e.g. 'Software Engineer'. If RESUME, return candidate name or filename)"
    }
    `;

    try {
        const response = await ollama.chat({
            model: 'gemma4:latest',
            messages: [{ role: 'user', content: prompt }],
            format: 'json',
            options: { temperature: 0.0 }
        });

        const result = JSON.parse(response.message.content);
        return {
            type: result.type === 'JOB_DESCRIPTION' ? 'JOB_DESCRIPTION' : 'RESUME',
            title: result.title || filename
        };
    } catch (error) {
        console.error(`Classification error for ${filename}:`, error.message || error);

        // Fallback heuristics
        const lowerName = filename.toLowerCase();
        const isJD = lowerName.includes('jd') || lowerName.includes('job') || lowerName.includes('description');
        return {
            type: isJD ? 'JOB_DESCRIPTION' : 'RESUME',
            title: filename
        };
    }
}

/**
 * Evaluates a candidate resume against ALL provided Job Descriptions simultaneously.
 */
async function scoreResumeWithOllama(resumeText, jdList) {
    const jdsFormatted = jdList.map((jd, idx) => `
--- JOB DESCRIPTION ${idx + 1}: ${jd.title} (File: ${jd.filename}) ---
${jd.text}
    `).join('\n\n');

    const prompt = `
    You are an elite, highly accurate ATS reviewer and candidate extraction engine.
    Analyze the candidate resume against ALL provided Job Descriptions (JDs) below.

    JOB DESCRIPTIONS:
    ${jdsFormatted}

    CANDIDATE RESUME:
    ${resumeText}

    CRITICAL EXTRACTION RULES:
    1. Name: Extract candidate's full name. Return "N/A" if missing.
    2. CGPA: Extract CGPA/GPA (e.g., "8.88", "3.7/4.0"). Return "N/A" if missing.
    3. College: Extract full university/college name. Return "N/A" if missing.
    4. Experience: Total years of professional work experience.
       - Calculate duration using start/end months and years for all listed roles.
       - If roles/internships are listed BUT lack start/end dates entirely, return EXACTLY: "Dates missing - Requires manual verification".
       - If no work experience is listed, return "0".
    5. Experience Calculation Notes: Step-by-step note explaining how experience was computed or why dates are flagged.
    6. Evaluations: Create a separate evaluation object for EVERY Job Description provided above containing:
       - jd_filename: exact filename of the JD.
       - jd_title: role title of the JD.
       - score: Integer 0-100 based on alignment with this specific JD.
       - status: Concise 1-sentence fit evaluation for this specific JD.
       - matched: Technical skills present in BOTH the resume and this JD.
       - missing: Required technical skills in this JD missing from the resume.

    FORMATTING RULES:
    - Do NOT include any emojis anywhere.
    - Extract high-value technical skills only.
    - Return ONLY a valid JSON object matching this EXACT schema:

    {
      "name": "string",
      "cgpa": "string",
      "college": "string",
      "experience": "string",
      "experience_calculation_notes": "string",
      "evaluations": [
        {
          "jd_filename": "string",
          "jd_title": "string",
          "score": 0,
          "status": "string",
          "matched": ["skill1"],
          "missing": ["skill1"]
        }
      ]
    }
    `;

    try {
        const response = await ollama.chat({
            model: 'gemma4:latest',
            messages: [{ role: 'user', content: prompt }],
            format: 'json',
            options: {
                temperature: 0.1,
                top_p: 0.9
            }
        });

        return JSON.parse(response.message.content);
    } catch (error) {
        console.error('Ollama processing error details:', error.message || error);
        return {
            name: "N/A",
            cgpa: "N/A",
            college: "N/A",
            experience: "N/A",
            experience_calculation_notes: "LLM processing error.",
            evaluations: jdList.map(jd => ({
                jd_filename: jd.filename,
                jd_title: jd.title,
                score: 0,
                status: `Evaluation failed: ${error.message || 'Unknown error'}`,
                matched: [],
                missing: []
            }))
        };
    }
}

/**
 * Answers hiring manager queries using the complete multi-JD and multi-candidate session dataset.
 */
async function answerQuestionWithOllama(question, sessionData) {
    const prompt = `
    You are an expert hiring manager assistant conducting rigorous candidate evaluation.
    Use the following structured dataset containing ALL Job Descriptions and Candidate Evaluations across all roles to answer the user's question accurately.

    FULL SESSION DATASET:
    ${JSON.stringify(sessionData, null, 2)}

    USER QUESTION:
    ${question}

    RULES FOR RIGOROUS Q&A:
    - Base your answer strictly on the provided dataset. Do not assume unstated details.
    - When comparing candidates across roles, explicitly reference the specific Job Description title/filename.
    - If experience dates are missing, explicitly state that they require manual verification.
    - Do NOT use emojis.
    - Keep answers structured, professional, and concise.
    `;

    try {
        const response = await ollama.chat({
            model: 'gemma4:latest',
            messages: [{ role: 'user', content: prompt }],
            options: { temperature: 0.2 }
        });

        return response.message.content;
    } catch (error) {
        console.error('Ollama Q&A error details:', error.message || error);
        return "I encountered an error analyzing the multi-JD dataset.";
    }
}

module.exports = { scoreResumeWithOllama, answerQuestionWithOllama, classifyDocumentWithOllama };