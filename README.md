# Resume Ranker Slack Bot

## Overview

Resume Ranker is a Slack-native Applicant Tracking System (ATS) assistant that automatically evaluates multiple resumes against a Job Description (JD) and ranks candidates based on keyword relevance.

The system is designed as an MVP for recruiters to quickly shortlist candidates directly inside Slack without requiring any external web application.

The workflow consists of:

- Upload one Job Description (PDF)
- Upload one or more resumes (PDF/DOCX)
- Automatically extract text
- Compare each resume against the JD
- Generate ATS scores
- Rank candidates
- Return results directly inside Slack

---

# Features

- Slack-native workflow
- Multiple resume support
- PDF parsing
- DOCX parsing
- Automatic Job Description detection
- Keyword-based ATS scoring
- Candidate ranking
- Missing skill suggestions
- Slack Block Kit response formatting

---

# Technology Stack

| Layer | Technology |
|--------|------------|
| Runtime | Node.js |
| Language | JavaScript |
| Slack SDK | Slack Bolt |
| File Parsing | pdf-parse, Mammoth |
| Environment | dotenv |
| Communication | Slack Socket Mode |

---

# System Architecture

```text
                           Recruiter
                               │
                               │ Upload PDFs
                               ▼
                     Slack Workspace Channel
                               │
                               │ Socket Mode Events
                               ▼
                    Slack Bolt Application
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
        Download Uploaded Files      Detect File Types
                │                             │
                └──────────────┬──────────────┘
                               │
                               ▼
                      File Parsing Layer
                ┌──────────────┼──────────────┐
                │              │              │
                ▼              ▼              ▼
            PDF Parser     DOCX Parser     TXT Reader
                │
                ▼
         Plain Extracted Text
                │
                ▼
      Job Description Identification
                │
                ▼
          Resume Scoring Engine
                │
      ┌─────────┼─────────┐
      │         │         │
      ▼         ▼         ▼
 Tokenizer  Keyword Match Suggestions
      │
      ▼
 ATS Score Generation
      │
      ▼
 Candidate Ranking
      │
      ▼
 Slack Block Kit Response
      │
      ▼
      Recruiter
```

---

# Project Structure

```text
.
├── src
│   ├── app.js
│   │
│   ├── parser
│   │   ├── pdfParser.js
│   │   └── docxParser.js
│   │
│   ├── scoring
│   │   ├── scoreResume.js
│   │   ├── keywordMatcher.js
│   │   └── suggestions.js
│   │
│   └── utils
│       └── tokenizer.js
│
├── uploads
│
├── package.json
└── README.md
```

---

# Processing Pipeline

```text
Slack Upload

        │

        ▼

Download Files

        │

        ▼

Store Locally

        │

        ▼

Extract Text

        │

        ▼

Detect Job Description

        │

        ▼

Tokenize JD

        │

        ▼

Tokenize Resume

        │

        ▼

Keyword Matching

        │

        ▼

Missing Skill Detection

        │

        ▼

ATS Score

        │

        ▼

Ranking

        │

        ▼

Slack Response
```

---

# Internal Architecture

## 1. Slack Layer

Responsible for:

- Receiving uploaded files
- Downloading attachments
- Sending ranking results
- Maintaining Socket Mode connection

Implemented using:

```
@slack/bolt
```

---

## 2. Parsing Layer

Converts uploaded documents into plain text.

Supported formats

| Format | Parser |
|---------|----------|
| PDF | pdf-parse |
| DOCX | Mammoth |
| TXT | Native File Reader |

Output

```
Raw Text
```

---

## 3. Job Description Detection

The application identifies the Job Description based on filename.

Examples

```
JD.pdf

JobDescription.pdf

Job_Description.pdf
```

Remaining uploaded files are treated as resumes.

---

## 4. Tokenizer

The tokenizer performs text normalization.

Responsibilities

- Lowercase conversion
- Remove punctuation
- Remove stop words
- Extract meaningful technical tokens

Example

Input

```
Strong knowledge of React, Node.js and Docker.
```

Output

```
react
node.js
docker
```

---

## 5. Keyword Matching

The matcher compares

```
JD Keywords
```

against

```
Resume Keywords
```

using set intersection.

Example

```
JD

React
Node
Docker
AWS
Git

Resume

React
Docker
Git
```

Matched

```
React
Docker
Git
```

---

## 6. ATS Scoring

Current scoring algorithm

```
Score

=

Matched Keywords

/

Total JD Keywords

×

100
```

Example

```
JD Skills

10

Matched

7

ATS Score

70%
```

---

## 7. Suggestion Engine

The engine identifies missing keywords.

Example

```
Missing Skill

Docker

Missing Skill

AWS

Missing Skill

Testing
```

These suggestions are displayed to recruiters.

---

## 8. Candidate Ranking

Each candidate receives

- ATS Score
- Matched Skills
- Missing Skills

Candidates are sorted in descending order.

```
91%

87%

82%

74%

61%
```

---

# End-to-End Flow

```text
Recruiter

     │

     ▼

Uploads

JD.pdf

Resume1.pdf

Resume2.pdf

Resume3.pdf

     │

     ▼

Slack Bot

     │

     ▼

Download

     │

     ▼

Extract Text

     │

     ▼

Identify JD

     │

     ▼

Score Resume 1

Score Resume 2

Score Resume 3

     │

     ▼

Sort Scores

     │

     ▼

Slack Block Kit

     │

     ▼

Recruiter receives ranked candidates
```

---

# Current Scoring Strategy

Current implementation uses deterministic keyword matching.

Pipeline

```
Normalize Text

↓

Extract JD Skills

↓

Normalize Resume

↓

Set Matching

↓

Compute Score

↓

Generate Suggestions
```

---

# Supported File Types

| Type | Supported |
|--------|-----------|
| PDF | Yes |
| DOCX | Yes |
| TXT | Yes (optional) |

---

# Environment Variables

```env
SLACK_BOT_TOKEN=

SLACK_APP_TOKEN=

SLACK_SIGNING_SECRET=
```

---

# Installation

Install dependencies

```bash
npm install
```

Start application

```bash
node src/app.js
```

---

# Example Workflow

Step 1

Upload

```
JD.pdf
```

Step 2

Upload

```
Lokesh.pdf

Alice.pdf

Bob.pdf
```

Step 3

Bot processes files.

Step 4

Slack displays

```
Resume Rankings

1. Alice

ATS Score 92%

Matched Skills

React

Node

Docker

Missing

AWS

--------------------------------

2. Lokesh

ATS Score 87%

--------------------------------

3. Bob

ATS Score 74%
```

---

# Current Limitations

Current implementation intentionally focuses on deterministic ATS ranking.

Known limitations include

- Exact keyword matching
- No semantic understanding
- No synonym resolution
- No embeddings
- No vector search
- No LLM-based reasoning
- Filename-based JD detection
- In-memory processing
- No persistent storage

---

# Future Enhancements

Potential production improvements include

- Semantic search using embeddings
- LLM-based resume analysis
- Skill synonym matching
- Weighted keyword scoring
- Experience-aware ranking
- Resume section parsing
- Recruiter dashboard
- Database persistence
- Batch processing
- Asynchronous job queues
- Resume history
- Candidate analytics
- Feedback learning loop

---

# Design Principles

The project follows a modular architecture.

- Separation of concerns
- Independent parser layer
- Independent scoring engine
- Reusable tokenizer
- Extensible ranking pipeline
- Slack-first user experience

Each module performs a single responsibility, allowing future replacement or extension without affecting the overall pipeline.

