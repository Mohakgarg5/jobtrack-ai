# JobTrack AI – Resume & JD Analyzer

A Chrome extension that acts as your personal AI-powered job search assistant. It sits in your browser's side panel and helps you track applications, analyze resume-to-job-description fit, generate cover letters, and prep for interviews — all without leaving the job listing page.

---

## Features

- **Resume vs JD Analysis** — Paste or upload your resume and get an instant match score against any job description, including keyword gaps and improvement suggestions
- **AI Cover Letter Generator** — Generate tailored cover letters based on your resume and the specific JD
- **Interview Prep** — Get role-specific interview questions and suggested answers
- **Job Application Tracker** — Track all your applications (status, notes, dates) in one place
- **Auto JD Extraction** — Automatically extracts job descriptions from supported job boards when you open a listing
- **Multi-Provider AI** — Works with both **Google Gemini** and **Anthropic Claude** (you bring your own API key)
- **Profile & Pre-fill Answers** — Save your profile info and reusable answers (strengths, weaknesses, about me) for faster applications

---

## Supported Job Boards

Works out of the box on 30+ job platforms including:

LinkedIn · Indeed · Greenhouse · Lever · Workday · Glassdoor · Naukri · SmartRecruiters · Ashby · BambooHR · Workable · ZipRecruiter · Monster · Dice · We Work Remotely · Remotive · Jobvite · iCIMS · Taleo · SuccessFactors · SimplyHired · Google Careers · Apple Jobs · Amazon Jobs · Wellfound · AngelList · Rippling · Otta · Builtin · and more

---

## Installation

Since this extension is not published on the Chrome Web Store, you can load it manually:

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer Mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the project folder
5. The JobTrack AI icon will appear in your toolbar

---

## Setup

1. Click the extension icon and open the **Settings** tab
2. Enter your API key:
   - **Gemini**: Get a free key at [Google AI Studio](https://aistudio.google.com/app/apikey)
   - **Claude**: Get a key at [Anthropic Console](https://console.anthropic.com/)
3. Select your preferred AI provider and model
4. You're ready to go!

> Your API key is stored locally in your browser using `chrome.storage.local` and is never sent anywhere except directly to the AI provider's API.

---

## Usage

1. Navigate to any supported job listing page
2. Open the side panel by clicking the extension icon
3. The job description is auto-extracted — or paste it manually
4. Upload or select one of your saved resumes
5. Click **Analyze** to get your match score, gaps, and suggestions
6. Use the **Cover Letter** or **Interview Prep** tabs for more AI assistance
7. Save the job and track your application status from the **Dashboard**

---

## Project Structure

```
Plugin/
├── manifest.json          # Chrome extension manifest (MV3)
├── background/
│   └── service_worker.js  # Background service worker
├── content/
│   └── content.js         # Content script for JD extraction
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js           # Extension popup (toolbar click)
├── sidepanel/
│   ├── sidepanel.html
│   ├── sidepanel.css
│   └── sidepanel.js       # Main side panel application
├── lib/
│   ├── pdf.min.js         # PDF.js for resume parsing
│   └── pdf.worker.min.js
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Requirements

- Google Chrome (version 114 or later, for Side Panel API support)
- A Gemini or Claude API key

---

## License

MIT License — feel free to use, modify, and distribute.
