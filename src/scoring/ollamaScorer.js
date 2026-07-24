const { Ollama } = require('ollama');

const ollama = new Ollama({ host: 'https://ollama.lokeshrc.me/' });

/**
 * Classifies a document as either a "JOB_DESCRIPTION" or a "RESUME" based on its content.
 */
async function classifyDocumentWithOllama(text, filename) {
    const prompt = `
    You are an expert ATS document classification system.
    Analyze the filename and text content sample below and classify the document as either "JOB_DESCRIPTION" or "RESUME".

    FILENAME: ${filename}

    TEXT SAMPLE:
    ${text.slice(0, 2000)}

    CLASSIFICATION CRITERIA:
    - "JOB_DESCRIPTION": Outlines hiring requirements, job responsibilities, company profile, qualifications, "Who we are looking for", or candidate expectations.
    - "RESUME": Represents an individual candidate's personal CV/Resume. Contains contact info, personal education (CGPA/GPA), work history, personal projects, or technical skills.

    Return ONLY a valid JSON object matching this schema:
    {
      "type": "JOB_DESCRIPTION" | "RESUME"
    }
    `;

    try {
        const response = await ollama.chat({
            model: 'gemma4:latest',
            messages: [{ role: 'user', content: prompt }],
            format: 'json',
            options: {
                temperature: 0.0 // Strict zero-temperature for deterministic classification
            }
        });

        const result = JSON.parse(response.message.content);
        return result.type === 'JOB_DESCRIPTION' ? 'JOB_DESCRIPTION' : 'RESUME';
    } catch (error) {
        console.error(`Classification error for ${filename}:`, error.message || error);

        // Smart fallback heuristic if LLM fails
        const lowerName = filename.toLowerCase();
        if (lowerName.includes('jd') || lowerName.includes('job_description') || lowerName.includes('job')) {
            return 'JOB_DESCRIPTION';
        }
        return 'RESUME';
    }
}

/**
 * Parses, extracts, and scores a candidate resume against a Job Description.
 */
async function scoreResumeWithOllama(resumeText, jdText) {
    const prompt = `
    You are an elite, highly accurate ATS (Applicant Tracking System) reviewer and candidate data extraction engine.
    Analyze the candidate resume against the provided Job Description (JD) and extract details with extreme precision.

    JOB DESCRIPTION:
    ${jdText || "N/A - General Data Extraction"}

    RESUME TEXT:
    ${resumeText}

    CRITICAL EXTRACTION RULES:
    1. Name: Extract the candidate's full name. If missing, return "N/A".
    2. CGPA: Extract CGPA or GPA (e.g., "8.88", "3.7/4.0"). If missing, return "N/A".
    3. College: Extract the full name of the university or college attended. If missing, return "N/A".
    4. Experience: Total years of professional work experience.
       - If total years are explicitly stated, output that value.
       - If not explicitly stated, calculate total duration by identifying start/end months and years for each listed role.
       - If work roles or internships are listed BUT lack start/end dates entirely, return EXACTLY: "Dates missing - Requires manual verification".
       - If no work experience is listed at all, return "0".
    5. Experience Calculation Notes: Provide a concise step-by-step note on how experience was computed or why it was flagged (e.g., "Siemens EDA internship listed without start or end dates.").
    6. Skills:
       - matched: Extract high-value technical skills present in BOTH the resume and JD.
       - missing: Extract required technical skills listed in the JD that are absent from the resume.
    7. Score: Integer from 0 to 100 based on overall candidate compatibility with the JD.
    8. Status: A single sentence summary of the candidate's overall fit.

    FORMATTING RULES:
    - Do NOT include any emojis anywhere in the output.
    - Extract high-value technical skills only.
    - Return ONLY a valid JSON object matching this EXACT schema:

    {
      "name": "string",
      "score": 0,
      "status": "string",
      "cgpa": "string",
      "experience": "string",
      "experience_calculation_notes": "string",
      "college": "string",
      "matched": ["skill1", "skill2"],
      "missing": ["skill1", "skill2"]
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
            score: 0,
            status: `Evaluation failed: ${error.message || 'Unknown error'}`,
            cgpa: "N/A",
            experience: "N/A",
            experience_calculation_notes: "Error occurred during LLM processing.",
            college: "N/A",
            matched: [],
            missing: []
        };
    }
}

/**
 * Answers hiring manager queries using cached evaluation data.
 */
async function answerQuestionWithOllama(question, candidatesData) {
    const prompt = `
    You are an expert hiring manager assistant.
    Use the following JSON dataset of evaluated candidates to answer the user's question directly and accurately.

    CANDIDATE DATASET:
    ${JSON.stringify(candidatesData, null, 2)}

    USER QUESTION:
    ${question}

    RULES:
    - Answer directly, professionally, and concisely.
    - Base your answer ONLY on the provided candidate dataset.
    - If a candidate's experience states "Dates missing - Requires manual verification", state this explicitly if asked.
    - Do NOT use emojis.
    `;

    try {
        const response = await ollama.chat({
            model: 'gemma4:latest',
            messages: [{ role: 'user', content: prompt }],
            options: {
                temperature: 0.2
            }
        });

        return response.message.content;
    } catch (error) {
        console.error('Ollama Q&A error details:', error.message || error);
        return "I encountered an error trying to analyze the candidate dataset.";
    }
}

module.exports = { scoreResumeWithOllama, answerQuestionWithOllama, classifyDocumentWithOllama };