# JobTrack AI – Resume & JD Analyzer

A Chrome extension that acts as your personal AI-powered job search assistant. It sits in your browser's side panel and helps you track applications, analyze resume-to-job fit, generate cover letters, prep for interviews, tailor your resume, and download ATS-optimized versions — all without leaving the job listing page.

---

## Features

### Core
- **Auto JD Extraction** — Automatically captures job descriptions from 30+ job boards the moment you open a listing (including LinkedIn SPA navigation). Deduplicates by URL (strips tracking params) so reopening the same listing never creates a duplicate
- **Auto Apply Detection** — Detects when you click "Apply" on any job page and marks it as applied automatically
- **Job Application Tracker** — Track all your applications with status (Saved → Applied → Interview → Offer → Rejected), notes, stage log, and dates. Tracker is fully profile-aware — each profile sees only its own applications
- **Dashboard** — At-a-glance stats: resumes, jobs saved, applications sent, response rate, offers, follow-ups needed, and activity this week

### Resume & Matching
- **ATS-Grade Local Match (Free)** — Instant keyword match score with no API call needed:
  - Synonym expansion (60+ mappings: `k8s` → `kubernetes`, `pgm` → `program manager`, `mvp` → `minimum viable product`, etc.)
  - Required vs preferred JD section detection — required skills weighted 2×
  - Fallback word-overlap scoring for niche JDs with no structured skills detected
  - 200+ skills covering engineering, product, program management, data science, design, marketing, sales
  - Role taxonomy with 9 role categories — correctly distinguishes PM vs PgM, SWE vs DevOps, etc.
  - Shows present ✓ and missing ✗ keywords, with preferred skills marked ✦
- **✨ AI Resume Tailoring** — When ATS match is below 80%, one click rewrites your resume to better fit the JD:
  - **Strict preservation** — section headings, company names, job titles, dates, education, GPA, contact info, and all metrics are kept character-for-character
  - **Aggressive ATS optimization** — injects 15–20 exact JD keywords, rewrites the summary, reorders skills and bullets, upgrades action verbs
  - **Never fabricates** — no invented skills, technologies, certifications, companies, or achievements
  - **Output post-processing** — strips AI markdown fences and preamble text before showing the preview; rejects truncated outputs with a clear error
  - **Preview before saving** — review the full tailored resume in a modal before committing
  - **Download directly** — download as `.txt` without saving to library, or save + download both
  - Auto-named `Resume – Company Role`
  - Costs less than 1 cent per tailoring with Gemini Flash or Claude Haiku
- **📥 Resume Download** — Download any resume from your library as a `.txt` file at any time
- **AI Deep Analysis** — Full AI-powered match score, keyword gaps, strengths, improvement suggestions, ATS tips, salary insight, recruiter red flags, and interview questions (1 API call)
- **Smart Resume Auto-Selection** — When you select a job, the best-matching resume from your profile is auto-picked using a multi-factor ATS score (role match, keyword coverage, distinctive phrases, title presence, bigram overlap)

### AI Assistants
- **Cover Letter Generator** — Tailored cover letters based on your resume + specific JD (~250 words, professional tone, no placeholders)
- **Interview Prep** — 8 role-specific questions (behavioral + technical) with 1-sentence tips each

### Profiles & Multi-Person Support
- **2 Profiles** — Apply for 2 different people (e.g. yourself + a family member) with completely separate data
- **Profile-wise Resumes** — Each profile has its own resume library; switching profiles instantly swaps the resume list
- **Profile-wise Tracker** — Each profile's Tracker, Dashboard stats, and "Applied" badges on jobs reflect only that profile's applications
- **Profile & Pre-fill Answers** — Save contact info and reusable answers (strengths, weaknesses, about me) per profile
- **Seamless switching** — Switching profiles while on any tab (Tracker, Analyze, Jobs, Resumes) instantly re-renders the correct data with no stale state

### AI Providers
- **Google Gemini** — `gemini-2.0-flash` (default, free tier available), `gemini-2.0-flash-lite`
- **Anthropic Claude** — `claude-haiku-4-5-20251001` (cheapest), `claude-sonnet-4-6`, `claude-opus-4-6`
- Bring your own API key — stored locally in `chrome.storage.local`, never sent anywhere except directly to the provider

---

## Supported Job Boards

Works out of the box on 30+ platforms:

LinkedIn · Indeed · Greenhouse · Lever · Workday · Glassdoor · Naukri · SmartRecruiters · Ashby · BambooHR · Workable · ZipRecruiter · Monster · Dice · We Work Remotely · Remotive · Jobvite · iCIMS · Taleo · SuccessFactors · SimplyHired · Google Careers · Apple Jobs · Amazon Jobs · Wellfound · AngelList · Rippling · Otta · Builtin · and more

---

## Installation

Since this extension is not yet published on the Chrome Web Store, load it manually:

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. The JobTrack AI icon will appear in your toolbar

---

## Setup

1. Click the extension icon → open the **Settings** tab
2. Enter your API key:
   - **Gemini** — Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey)
   - **Claude** — Get a key at [Anthropic Console](https://console.anthropic.com) (separate from Claude Pro — $5 free credit on signup)
3. Select your preferred provider and model
4. Fill in your profile info for autofill support
5. You're ready to go!

> Your API key is stored locally in your browser using `chrome.storage.local` and is never sent anywhere except directly to the AI provider's API.

---

## API Cost Reference

The ATS keyword match is completely **free** (no API call). AI features consume tokens:

| Feature | Gemini 2.0 Flash | Claude Haiku | Claude Sonnet |
|---|---|---|---|
| Resume Tailoring | ~$0.0005 | ~$0.006 | ~$0.02 |
| AI Analysis | ~$0.001 | ~$0.01 | ~$0.04 |
| Cover Letter | ~$0.001 | ~$0.008 | ~$0.03 |
| Interview Prep | ~$0.001 | ~$0.008 | ~$0.03 |

**$5 of API credit = ~800 resume tailorings with Claude Haiku** (Anthropic gives $5 free on signup).

---

## Usage

1. Navigate to any supported job listing
2. Open the side panel by clicking the extension icon
3. JD is auto-extracted — or paste it manually in the Jobs tab
4. Go to **Analyze** → select your resume and the job → run free ATS match
5. If score < 80%, click **✨ Tailor Resume** to generate an ATS-optimized version
6. Review in the preview modal → **Save to Library** and/or **Download .txt**
7. Use **AI Analyze** for a deep match report, or generate a cover letter / interview prep
8. Track your application status from the **Tracker** tab
9. Switch profiles at the top bar to manage a second person's job search

---

## Project Structure

```
Plugin/
├── manifest.json           # Chrome extension manifest (MV3)
├── background/
│   └── service_worker.js   # Background service worker — JD save, apply detection, URL dedup
├── content/
│   └── content.js          # Content script — JD extraction, apply button detection, SPA navigation
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js            # Toolbar popup
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js        # Main side panel app (ATS matching, profiles, tailoring, AI, tracker)
├── lib/
│   ├── pdf.min.js          # PDF.js for resume parsing
│   └── pdf.worker.min.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Requirements

- Google Chrome 114 or later (for Side Panel API support)
- A Gemini or Claude API key (for AI features; ATS match is free)

---

## License

MIT License — feel free to use, modify, and distribute.
