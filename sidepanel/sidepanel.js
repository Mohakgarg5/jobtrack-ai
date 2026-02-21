/* =====================================================================
   JobTrack AI – Side Panel Main Script
   ===================================================================== */

'use strict';

// ── Storage Keys ──────────────────────────────────────────────────────
const SK = {
  RESUMES:      'jt_resumes',
  JOBS:         'jt_jobs',
  APPLICATIONS: 'jt_applications',
  ANALYSES:     'jt_analyses',
  SETTINGS:     'jt_settings',
  PROFILE:      'jt_profile',
  PRE_ANSWERS:  'jt_pre_answers'
};

// ── App State ─────────────────────────────────────────────────────────
const state = {
  resumes: [],
  jobs: [],
  applications: [],
  analyses: {},
  settings:    { apiKey: '', provider: 'gemini', model: 'gemini-1.5-pro' },
  profile:     { firstName:'', lastName:'', email:'', phone:'', linkedin:'', github:'', portfolio:'', city:'', state:'', country:'', zipCode:'', salary:'', availability:'' },
  preAnswers:  { whyThisRole:'', aboutMe:'', strength:'', weakness:'', coverLetter:'' },
  activeTab:   'dashboard'
};

// ── Load / Save ───────────────────────────────────────────────────────
async function loadAll() {
  const data = await chrome.storage.local.get(Object.values(SK));
  state.resumes      = data[SK.RESUMES]      || [];
  state.jobs         = data[SK.JOBS]         || [];
  state.applications = data[SK.APPLICATIONS] || [];
  state.analyses     = data[SK.ANALYSES]     || {};
  state.settings     = { apiKey: '', provider: 'gemini', model: 'gemini-1.5-pro', ...(data[SK.SETTINGS] || {}) };
  state.profile      = { ...state.profile,     ...(data[SK.PROFILE]     || {}) };
  state.preAnswers   = { ...state.preAnswers,  ...(data[SK.PRE_ANSWERS] || {}) };
}

const save = async (key, val) => chrome.storage.local.set({ [key]: val });

// ── Toast ─────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = '', duration = 3000) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast hidden'; }, duration);
}

// ── Modal ─────────────────────────────────────────────────────────────
function showModal(title, content) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent = content;
  document.getElementById('modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}

// HTML variant for notes (all user text must be escaped with escHtml before passing)
function showHtmlModal(title, htmlContent) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = htmlContent;
  document.getElementById('modal').classList.remove('hidden');
}

// ── Days Since ────────────────────────────────────────────────────────
function daysSince(isoDate) {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24));
}

// ── Tab Navigation ────────────────────────────────────────────────────
function switchTab(tabName) {
  state.activeTab = tabName;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
  renderTab(tabName);
}

function renderTab(tab) {
  switch (tab) {
    case 'dashboard': renderDashboard(); break;
    case 'resumes':   renderResumes();   break;
    case 'jobs':      renderJobs();      break;
    case 'analyze':   renderAnalyze();   break;
    case 'tracker':   renderTracker();   break;
    case 'settings':  renderSettings();  break;
  }
}

// ── Search State ─────────────────────────────────────────────────────
let jobSearch     = '';
let trackerSearch = '';

// ── ID Generator ─────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

// ── Date Formatter ────────────────────────────────────────────────────
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Word Count ────────────────────────────────────────────────────────
function wordCount(text) { return (text || '').split(/\s+/).filter(Boolean).length; }

// ═════════════════════════════════════════════════════════════════════
// PDF EXTRACTION (uses pdf.js loaded in HTML)
// ═════════════════════════════════════════════════════════════════════

async function extractTextFromPDF(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        if (!window.pdfjsLib) {
          reject(new Error('PDF.js not loaded. Please ensure lib/pdf.min.js exists.'));
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');

        const typedArray = new Uint8Array(e.target.result);
        const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;

        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map(item => item.str).join(' ');
          fullText += pageText + '\n';
        }

        resolve(fullText.trim());
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('File read error'));
    reader.readAsArrayBuffer(file);
  });
}

// ═════════════════════════════════════════════════════════════════════
// LOCAL KEYWORD ANALYSIS (Free – no API call)
// ═════════════════════════════════════════════════════════════════════

const TECH_KEYWORDS = [
  // Languages
  'python','javascript','typescript','java','golang','go','rust','swift','kotlin','scala','php','ruby',
  'c++','c#','c','r','matlab','perl','bash','shell','powershell','sql','html','css','sass','less',
  // Frontend
  'react','angular','vue','vue.js','next.js','nuxt','svelte','redux','mobx','graphql','webpack','vite',
  'tailwind','bootstrap','jquery','d3.js','three.js','webgl','pwa',
  // Backend
  'node.js','express','django','flask','fastapi','spring','spring boot','rails','laravel','asp.net',
  'rest api','restful','grpc','websocket','microservices','serverless','rabbitmq','kafka',
  // Databases
  'postgresql','mysql','sqlite','mongodb','redis','elasticsearch','cassandra','dynamodb','firebase',
  'neo4j','influxdb','bigquery','snowflake','data warehouse','etl','data pipeline','data modeling',
  // DevOps / Cloud
  'docker','kubernetes','aws','amazon web services','gcp','google cloud','azure','microsoft azure',
  'terraform','ansible','jenkins','ci/cd','github actions','circleci','helm','nginx','linux','unix',
  // AI / ML
  'machine learning','deep learning','nlp','natural language processing','computer vision',
  'tensorflow','pytorch','scikit-learn','pandas','numpy','scipy','keras','huggingface',
  'llm','generative ai','openai','langchain','mlflow','data science','feature engineering',
  // Tools
  'git','github','gitlab','jira','confluence','figma','sketch','postman','swagger','grafana',
  'datadog','sentry','tableau','power bi','excel','looker','dbt',
  // Practices
  'agile','scrum','kanban','tdd','bdd','ci/cd','devops','sre','code review','pair programming',
  'unit testing','integration testing','api testing','selenium','cypress','jest','pytest',
  // Soft skills
  'leadership','communication','collaboration','problem-solving','critical thinking','time management',
  'project management','product management','stakeholder management','cross-functional','mentoring',
  // Domains
  'fintech','healthtech','saas','b2b','b2c','e-commerce','mobile','ios','android','blockchain',
  'cybersecurity','cloud computing','distributed systems','system design','architecture','api design',
  'ux','user experience','ui','a/b testing','analytics','seo','digital marketing','growth'
];

function extractKeywords(text) {
  const lower = text.toLowerCase();
  const found = new Set();
  for (const kw of TECH_KEYWORDS) {
    if (lower.includes(kw)) found.add(kw);
  }
  return [...found];
}

function getLocalMatch(resumeText, jdText) {
  const jdKws    = new Set(extractKeywords(jdText));
  const resumeKws = new Set(extractKeywords(resumeText));
  const present  = [...jdKws].filter(k => resumeKws.has(k));
  const missing  = [...jdKws].filter(k => !resumeKws.has(k));
  const score    = jdKws.size > 0 ? Math.round((present.length / jdKws.size) * 100) : 0;
  return { present, missing, score, total: jdKws.size };
}

// ═════════════════════════════════════════════════════════════════════
// AI API  (supports Google Gemini + Anthropic Claude)
// ═════════════════════════════════════════════════════════════════════

async function callAI(userMsg, systemMsg = '') {
  const { apiKey, provider, model } = state.settings;
  if (!apiKey) throw new Error('API key not set. Go to Settings to add your API key.');

  if (provider === 'gemini') {
    return callGemini(userMsg, systemMsg, apiKey, model);
  } else {
    return callClaude(userMsg, systemMsg, apiKey, model);
  }
}

async function callGemini(userMsg, systemMsg, apiKey, model) {
  const modelId = model || 'gemini-1.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: userMsg }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.2 }
  };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg }] };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gemini API error ${resp.status}`);
  }

  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callClaude(userMsg, systemMsg, apiKey, model) {
  const body = {
    model: model || 'claude-haiku-4-5',
    max_tokens: 2048,
    messages: [{ role: 'user', content: userMsg }]
  };
  if (systemMsg) body.system = systemMsg;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error?.message || `Claude API error ${resp.status}`);
  }

  const data = await resp.json();
  return data.content[0].text;
}

async function analyzeResumeVsJD(resume, job) {
  const cacheKey = `${resume.id}-${job.id}`;
  if (state.analyses[cacheKey]) {
    return { result: state.analyses[cacheKey], cached: true };
  }

  const resumeSnip = resume.text.slice(0, 4000);
  const jdSnip     = job.text.slice(0, 4000);

  const system = `You are a world-class career coach, senior recruiter, and ATS optimization specialist with 15+ years of experience helping candidates land jobs at top companies.
Your analysis is deep, specific, and immediately actionable — not generic advice.
Return ONLY valid JSON with no markdown fences, no explanation outside the JSON.`;

  const user = `Analyze this resume against the job description with expert precision.

RESUME:
${resumeSnip}

JOB DESCRIPTION (${job.title} at ${job.company}):
${jdSnip}

Return this exact JSON — be specific, concrete, and deeply useful:
{
  "match_score": <0-100 integer based on skills overlap, experience level, and role fit>,
  "match_summary": "<2 sentences: overall fit assessment and the single biggest gap>",
  "ats_score": <0-100 integer — penalize for missing keywords, poor formatting signals, lack of metrics>,
  "ats_tips": [
    "<specific ATS tip 1 — e.g. exact keyword to add from JD>",
    "<specific ATS tip 2>",
    "<specific ATS tip 3>"
  ],
  "missing_keywords": ["<exact term from JD not in resume>", "<another>", "<another>", "<another>", "<another>", "<another>", "<another>"],
  "present_keywords": ["<strong match from resume>", "<another>", "<another>", "<another>", "<another>"],
  "strengths": [
    "<specific strength with evidence from resume — e.g. '5 years Python matches JD requirement'>",
    "<specific strength 2>",
    "<specific strength 3>",
    "<specific strength 4>"
  ],
  "improvements": [
    {"type":"add","suggestion":"<very specific line to add — e.g. 'Add a bullet: Reduced API latency by 40% using Redis caching'>","reason":"<why this matters for this specific role>"},
    {"type":"reword","suggestion":"<exact current text> → <improved version with metrics/keywords>","reason":"<why>"},
    {"type":"add","suggestion":"<specific missing section or bullet>","reason":"<why>"},
    {"type":"reword","suggestion":"<specific reword>","reason":"<why>"},
    {"type":"add","suggestion":"<specific addition>","reason":"<why>"},
    {"type":"reword","suggestion":"<specific reword>","reason":"<why>"}
  ],
  "interview_questions": [
    "<highly likely behavioral question based on JD requirements>?",
    "<technical question based on skills they're testing for>?",
    "<situational question from JD responsibilities>?",
    "<question about a potential gap in the resume>?",
    "<culture/motivation question relevant to this company>?",
    "<question about a specific achievement on resume>?",
    "<question probing the biggest skill gap>?"
  ],
  "salary_insight": "<brief note on market rate for this role based on title/location if inferable, else omit>",
  "red_flags": ["<any resume red flag a recruiter would notice>", "<another if any>"]
}`;

  const raw = await callAI(user, system);

  // Extract JSON even if Claude wraps it in markdown
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response from AI. Please try again.');

  const result = JSON.parse(jsonMatch[0]);

  // Cache the result
  state.analyses[cacheKey] = result;
  await save(SK.ANALYSES, state.analyses);

  return { result, cached: false };
}

async function generateCoverLetter(resume, job) {
  const resumeSnip = resume.text.slice(0, 2500);
  const jdSnip     = job.text.slice(0, 2000);

  const system = `You are an expert cover letter writer. Write professional,
concise cover letters (3 short paragraphs, ~250 words) tailored to the specific job.
Use a warm but professional tone. Do NOT use placeholders like [Your Name] –
infer the person's name from the resume if possible, otherwise omit it.`;

  const user = `Write a tailored cover letter for this applicant.

RESUME:
${resumeSnip}

JOB (${job.title} at ${job.company}):
${jdSnip}

Write the cover letter body only (no address headers, no "Dear Hiring Manager" line needed).`;

  return callAI(user, system);
}

async function generateInterviewPrep(resume, job) {
  const resumeSnip = resume.text.slice(0, 2000);
  const jdSnip     = job.text.slice(0, 2000);

  const system = `You are an interview coach. Generate targeted interview questions and brief tips.`;

  const user = `For this candidate applying to ${job.title} at ${job.company}:

RESUME SNIPPET:
${resumeSnip}

JOB DESCRIPTION SNIPPET:
${jdSnip}

Generate 8 likely interview questions (mix of behavioral and technical) with a 1-sentence tip for each.
Return as JSON: {"questions": [{"q": "...", "tip": "..."}, ...]}`;

  const raw = await callAI(user, system);
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Invalid response');
  return JSON.parse(jsonMatch[0]);
}

// ═════════════════════════════════════════════════════════════════════
// AUTOFILL – inject form-filling script into the active tab
// ═════════════════════════════════════════════════════════════════════

async function fillApplication() {
  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}

  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    toast('Navigate to a job application page first, then click Fill.', 'error', 4000);
    return;
  }

  // Try messaging the already-injected content script first
  let filled = 0;
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'FILL_FORM' });
    if (resp && resp.success) filled = resp.count;
    else throw new Error('no content script');
  } catch (_) {
    // Content script not present — inject _injectFill directly
    const profile    = state.profile;
    const preAnswers = state.preAnswers;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: _injectFill,
        args: [profile, preAnswers]
      });
      filled = results?.[0]?.result ?? 0;
    } catch (err) {
      toast('Cannot access this page. Make sure you are on a job application tab.', 'error', 4000);
      return;
    }
  }

  if (filled > 0) toast(`✓ Filled ${filled} field${filled !== 1 ? 's' : ''}! Check the highlighted fields.`, 'success', 4000);
  else            toast('No matching fields found. Make sure your Profile is saved in Settings.', 'error', 4000);
}

// This function is serialized and runs INSIDE the web page — no chrome APIs!
function _injectFill(profile, preAnswers) {
  function getLabelText(el) {
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) return lbl.innerText || '';
      } catch (_) {}
    }
    const parent = el.closest('label');
    if (parent) return parent.innerText || '';
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref) return ref.innerText || '';
    }
    // Check previous sibling element for label-like text
    let sib = el.previousElementSibling;
    for (let i = 0; i < 3 && sib; i++) {
      const tag = sib.tagName.toLowerCase();
      if (['label','span','div','p','legend'].includes(tag) && sib.innerText) return sib.innerText;
      sib = sib.previousElementSibling;
    }
    return '';
  }

  function setNativeValue(el, value) {
    try {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter) setter.set.call(el, value);
      else el.value = value;
    } catch (_) { el.value = value; }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const fields = document.querySelectorAll(
    'input:not([type=file]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=image]),' +
    'textarea'
  );

  let filled = 0;
  for (const field of fields) {
    if (field.disabled || field.readOnly) continue;
    if ((field.value || '').trim().length > 2) continue; // Don't overwrite existing

    const labelTxt = getLabelText(field);
    const hint = [
      labelTxt,
      field.placeholder || '',
      field.name || '',
      field.id || '',
      field.getAttribute('aria-label') || '',
      field.getAttribute('data-label') || '',
      field.getAttribute('data-placeholder') || ''
    ].join(' ').toLowerCase();

    let value = '';

    // ── Personal info ──────────────────────────────────────
    if (/first.?name|given.?name|\bfname\b/i.test(hint))
      value = profile.firstName;
    else if (/last.?name|family.?name|\bsurname\b|\blname\b/i.test(hint))
      value = profile.lastName;
    else if (/\bfull.?name\b|\byour.?name\b/i.test(hint) && !/first|last|middle/i.test(hint))
      value = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    else if (/\be-?mail\b/i.test(hint))
      value = profile.email;
    else if (/\bphone\b|\bmobile\b|\btelephone\b|\bcell\b|\bcontact.?number\b/i.test(hint))
      value = profile.phone;
    else if (/linkedin/i.test(hint))
      value = profile.linkedin;
    else if (/github/i.test(hint))
      value = profile.github;
    else if (/portfolio|personal.?site|personal.?url|\bwebsite\b|\burl\b/i.test(hint) && !/linkedin|github/i.test(hint))
      value = profile.portfolio;
    else if (/\bcity\b|\btown\b/i.test(hint) && !/country/i.test(hint))
      value = profile.city;
    else if (/\bstate\b|\bprovince\b|\bregion\b/i.test(hint) && !/country/i.test(hint))
      value = profile.state;
    else if (/\bcountry\b/i.test(hint))
      value = profile.country;
    else if (/\bzip\b|\bpostal/i.test(hint))
      value = profile.zipCode;
    else if (/salary|compensation|expected.?pay|current.?pay/i.test(hint))
      value = profile.salary;
    else if (/notice.?period|availability|\bstart.?date\b|\bavailable\b/i.test(hint))
      value = profile.availability;

    // ── Pre-answered questions (textareas preferred) ────────
    else if (/cover.?letter/i.test(hint))
      value = preAnswers.coverLetter;
    else if (/why.?(do you|are you|this|role|company|position|apply|interested|want)/i.test(hint))
      value = preAnswers.whyThisRole;
    else if (/tell.?us.?about|about.?yourself|introduce.?yourself|summary|about.?you\b/i.test(hint))
      value = preAnswers.aboutMe;
    else if (/\bstrength/i.test(hint) && !/weakness/i.test(hint))
      value = preAnswers.strength;
    else if (/\bweakness|\bimprove\b|\bchallenge\b/i.test(hint))
      value = preAnswers.weakness;

    if (value && value.trim()) {
      setNativeValue(field, value.trim());
      field.style.outline = '2px solid #059669';
      field.style.backgroundColor = '#f0fdf4';
      filled++;
    }
  }
  return filled;
}

// ─── Quick mark-as-applied from Analyze tab ──────────────────────────
async function markJobAsApplied(resumeId, jobId) {
  if (!jobId) { toast('Select a job first', 'error'); return; }

  // Avoid double-adding the same job+resume as "applied"
  const exists = state.applications.find(a => a.jobId === jobId && a.status === 'applied' && a.resumeId === resumeId);
  if (exists) {
    toast('Already marked as applied with this resume', 'error', 3000);
    return;
  }

  const app = {
    id:       uid(),
    jobId,
    resumeId: resumeId || '',
    status:   'applied',
    notes:    '',
    date:     new Date().toISOString()
  };
  state.applications.push(app);
  await save(SK.APPLICATIONS, state.applications);

  const resume = state.resumes.find(r => r.id === resumeId);
  const job    = state.jobs.find(j => j.id === jobId);
  const rName  = resume ? resume.name : 'No resume linked';
  toast(`✓ Marked as Applied! Resume: "${rName}"`, 'success', 4000);
  renderDashboard();
}

// ═════════════════════════════════════════════════════════════════════
// RENDER – DASHBOARD
// ═════════════════════════════════════════════════════════════════════

function renderDashboard() {
  document.getElementById('dashResumes').textContent = state.resumes.length;
  document.getElementById('dashJobs').textContent    = state.jobs.length;
  document.getElementById('dashApps').textContent    = state.applications.length;

  // ── Analytics row ──────────────────────────────────────────────────
  const analyticsEl = document.getElementById('dashAnalytics');
  if (analyticsEl) {
    const totalApplied   = state.applications.filter(a => a.status !== 'saved').length;
    const interviews     = state.applications.filter(a => a.status === 'interview').length;
    const offers         = state.applications.filter(a => a.status === 'offer').length;
    const responseRate   = totalApplied > 0 ? Math.round((interviews + offers) / totalApplied * 100) : 0;
    const oneWeekAgo     = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek       = state.applications.filter(a => new Date(a.date).getTime() > oneWeekAgo).length;
    const needsFollowUp  = state.applications.filter(a =>
      a.status === 'applied' &&
      (Date.now() - new Date(a.date).getTime()) > 7 * 24 * 60 * 60 * 1000
    ).length;

    analyticsEl.innerHTML = `
      <div class="analytics-item">
        <div class="analytics-num" style="color:var(--primary)">${responseRate}%</div>
        <div class="analytics-label">Response Rate</div>
      </div>
      <div class="analytics-item">
        <div class="analytics-num" style="color:var(--success)">${offers}</div>
        <div class="analytics-label">Offers</div>
      </div>
      <div class="analytics-item">
        <div class="analytics-num" style="color:${needsFollowUp > 0 ? 'var(--warning)' : 'var(--text-3)'}">${needsFollowUp}</div>
        <div class="analytics-label">Follow-up</div>
      </div>
      <div class="analytics-item">
        <div class="analytics-num" style="color:var(--text-2)">${thisWeek}</div>
        <div class="analytics-label">This Week</div>
      </div>
    `;
  }

  const recentEl = document.getElementById('dashRecentApps');
  const recent   = [...state.applications].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,5);

  if (recent.length === 0) {
    recentEl.innerHTML = `<div class="empty-state">
      <p>No applications yet</p>
      <small>Add resumes & jobs, then track applications</small>
    </div>`;
    return;
  }

  recentEl.innerHTML = recent.map(app => {
    const job = state.jobs.find(j => j.id === app.jobId);
    return `<div class="item-card" style="cursor:default">
      <div class="card-title">${job ? job.title : 'Unknown Job'}</div>
      <div class="card-sub">${job ? job.company : ''} · ${fmtDate(app.date)}</div>
      <span class="kw-chip ${statusClass(app.status)}">${cap(app.status)}</span>
    </div>`;
  }).join('');
}

function statusClass(s) {
  return { saved:'neutral', applied:'neutral', interview:'neutral', offer:'present', rejected:'missing' }[s] || 'neutral';
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ═════════════════════════════════════════════════════════════════════
// RENDER – RESUMES
// ═════════════════════════════════════════════════════════════════════

function renderResumes() {
  const listEl = document.getElementById('resumeList');

  if (state.resumes.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#9ca3af" stroke-width="2"/><polyline points="14 2 14 8 20 8" stroke="#9ca3af" stroke-width="2"/></svg>
      <p>No resumes yet</p>
      <small>Upload a PDF or paste your resume text above</small>
    </div>`;
    return;
  }

  listEl.innerHTML = state.resumes.map(r => `
    <div class="item-card">
      <div class="card-title">${escHtml(r.name)}</div>
      <div class="card-sub">${wordCount(r.text)} words · Added ${fmtDate(r.date)}</div>
      <div class="card-actions">
        <button class="btn-link" data-action="view-resume" data-id="${r.id}">View</button>
        <button class="btn-link green" data-action="analyze-resume">Analyze</button>
        <button class="btn-link danger" data-action="delete-resume" data-id="${r.id}">Delete</button>
      </div>
    </div>
  `).join('');
}

window.viewResume = (id) => {
  const r = state.resumes.find(x => x.id === id);
  if (r) showModal(r.name, r.text);
};

window.deleteResume = async (id) => {
  if (!confirm('Delete this resume?')) return;
  state.resumes = state.resumes.filter(r => r.id !== id);
  await save(SK.RESUMES, state.resumes);
  renderResumes();
  toast('Resume deleted');
};

// ═════════════════════════════════════════════════════════════════════
// RENDER – JOBS
// ═════════════════════════════════════════════════════════════════════

function renderJobs() {
  const listEl = document.getElementById('jobList');

  const filtered = jobSearch
    ? state.jobs.filter(j =>
        j.title.toLowerCase().includes(jobSearch) ||
        j.company.toLowerCase().includes(jobSearch))
    : state.jobs;

  if (state.jobs.length === 0) {
    listEl.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><rect x="2" y="7" width="20" height="14" rx="2" stroke="#9ca3af" stroke-width="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="#9ca3af" stroke-width="2"/></svg>
      <p>No jobs saved yet</p>
      <small>Capture from a job listing page or add manually</small>
    </div>`;
    return;
  }

  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><p>No jobs match "${escHtml(jobSearch)}"</p></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(j => {
    const kws = extractKeywords(j.text).slice(0, 5);
    const isApplied = state.applications.some(a => a.jobId === j.id && a.status === 'applied');
    const emailHtml = j.recruiterEmail
      ? `<div class="recruiter-email">
           <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M2 7l10 7 10-7" stroke="currentColor" stroke-width="2"/></svg>
           <a href="mailto:${escHtml(j.recruiterEmail)}" target="_blank">${escHtml(j.recruiterEmail)}</a>
         </div>`
      : '';
    return `
    <div class="item-card">
      <div class="card-title">${escHtml(j.title)}</div>
      <div class="card-sub">${escHtml(j.company)} · ${fmtDate(j.date)}${j.url ? ` · <a href="${j.url}" target="_blank" style="color:var(--primary)">View</a>` : ''}</div>
      ${emailHtml}
      <div class="kw-chips" style="margin-bottom:8px">
        ${kws.map(k => `<span class="kw-chip neutral">${k}</span>`).join('')}
      </div>
      <div class="card-actions">
        <button class="btn-link" data-action="view-job" data-id="${j.id}">Full JD</button>
        <button class="btn-link green" data-action="analyze-job" data-id="${j.id}">Analyze</button>
        ${isApplied
          ? `<span style="color:var(--success);font-size:11px;font-weight:600">✓ Applied</span>`
          : `<button class="btn-link" data-action="mark-applied-job" data-id="${j.id}">Mark Applied</button>`}
        <button class="btn-link danger" data-action="delete-job" data-id="${j.id}">Delete</button>
      </div>
    </div>`;
  }).join('');
}

window.viewJob = (id) => {
  const j = state.jobs.find(x => x.id === id);
  if (j) showModal(`${j.title} – ${j.company}`, j.text);
};

window.deleteJob = async (id) => {
  if (!confirm('Delete this job?')) return;
  state.jobs = state.jobs.filter(j => j.id !== id);
  await save(SK.JOBS, state.jobs);
  renderJobs();
  toast('Job deleted');
};

window.markJobAppliedFromList = (id) => {
  const alreadyApplied = state.applications.some(a => a.jobId === id && a.status === 'applied');
  if (alreadyApplied) { toast('Already marked as applied', 'error', 2000); return; }

  const job = state.jobs.find(j => j.id === id);
  const resumeOptions = state.resumes.length
    ? state.resumes.map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join('')
    : '';

  const html = `
    <div style="margin-bottom:14px;padding:10px;background:var(--surface-2,#f3f4f6);border-radius:8px">
      <div style="font-weight:600;font-size:13px;color:var(--text-1)">${escHtml(job ? job.title : '')}</div>
      <div style="font-size:12px;color:var(--text-2);margin-top:2px">${escHtml(job ? job.company : '')}</div>
    </div>
    <label style="font-size:12px;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">
      Which resume did you apply with?
    </label>
    <select id="appliedResumeSelect" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:13px;margin-bottom:14px;background:var(--bg)">
      <option value="">— No resume / not sure —</option>
      ${resumeOptions}
    </select>
    <button class="btn-sm btn-primary" style="width:100%" data-action="confirm-mark-applied" data-job-id="${id}">
      ✓ Mark as Applied
    </button>
  `;
  showHtmlModal('📤 Mark as Applied', html);
};

window.confirmMarkApplied = async (jobId) => {
  const resumeId = (document.getElementById('appliedResumeSelect') || {}).value || '';
  const job    = state.jobs.find(j => j.id === jobId);
  const resume = state.resumes.find(r => r.id === resumeId);
  const app = { id: uid(), jobId, resumeId, status: 'applied', notes: '', date: new Date().toISOString() };
  state.applications.push(app);
  await save(SK.APPLICATIONS, state.applications);
  closeModal();
  const resumeNote = resume ? ` with "${resume.name}"` : '';
  toast(`✓ Applied to "${job ? job.title : ''}"${resumeNote}!`, 'success', 3000);
  renderJobs();
  renderDashboard();
};

window.analyzeWith = (jobId) => {
  switchTab('analyze');
  setTimeout(() => {
    const sel = document.getElementById('analyzeJob');
    if (sel) { sel.value = jobId; populateAnalyzeSelects(); }
  }, 100);
};

// ═════════════════════════════════════════════════════════════════════
// RENDER – ANALYZE
// ═════════════════════════════════════════════════════════════════════

function renderAnalyze() {
  populateAnalyzeSelects();
}

function populateAnalyzeSelects() {
  const rSel = document.getElementById('analyzeResume');
  const jSel = document.getElementById('analyzeJob');
  const rVal = rSel.value;
  const jVal = jSel.value;

  rSel.innerHTML = '<option value="">— Select a resume —</option>' +
    state.resumes.map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join('');

  jSel.innerHTML = '<option value="">— Select a job —</option>' +
    state.jobs.map(j => `<option value="${j.id}">${escHtml(j.title)} – ${escHtml(j.company)}</option>`).join('');

  if (rVal) rSel.value = rVal;
  if (jVal) jSel.value = jVal;
}

function getSelectedResumeAndJob() {
  const resumeId = document.getElementById('analyzeResume').value;
  const jobId    = document.getElementById('analyzeJob').value;
  if (!resumeId || !jobId) { toast('Please select both a resume and a job', 'error'); return null; }
  const resume = state.resumes.find(r => r.id === resumeId);
  const job    = state.jobs.find(j => j.id === jobId);
  if (!resume || !job) { toast('Resume or job not found', 'error'); return null; }
  return { resume, job };
}

// ── Local Match ───────────────────────────────────────────────────────
async function doLocalMatch() {
  const sel = getSelectedResumeAndJob();
  if (!sel) return;
  const { resume, job } = sel;
  const match = getLocalMatch(resume.text, job.text);

  const section = document.getElementById('localMatchSection');
  const content = document.getElementById('localMatchContent');
  section.classList.remove('hidden');

  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <div>
        <div class="text-bold" style="font-size:22px;color:${scoreColor(match.score)}">${match.score}%</div>
        <div class="text-sm">Keyword Match</div>
      </div>
      <div style="flex:1">
        <div class="progress-bar"><div class="progress-fill" style="width:${match.score}%;background:${scoreColor(match.score)}"></div></div>
        <div class="text-sm mt-4">${match.present.length} of ${match.total} JD keywords found in resume</div>
      </div>
    </div>

    ${match.missing.length > 0 ? `
    <div style="margin-bottom:8px">
      <div class="text-sm text-bold" style="margin-bottom:4px;color:var(--danger)">❌ Missing Keywords (${match.missing.length})</div>
      <div class="kw-chips">${match.missing.slice(0,12).map(k=>`<span class="kw-chip missing">${k}</span>`).join('')}</div>
    </div>` : ''}

    ${match.present.length > 0 ? `
    <div>
      <div class="text-sm text-bold" style="margin-bottom:4px;color:var(--success)">✓ Present Keywords (${match.present.length})</div>
      <div class="kw-chips">${match.present.slice(0,12).map(k=>`<span class="kw-chip present">${k}</span>`).join('')}</div>
    </div>` : ''}
  `;
}

// ── AI Analysis ───────────────────────────────────────────────────────
async function doAIAnalysis() {
  const sel = getSelectedResumeAndJob();
  if (!sel) return;
  const { resume, job } = sel;

  if (!state.settings.apiKey) {
    toast('API key required. Go to Settings.', 'error', 4000);
    switchTab('settings');
    return;
  }

  const cacheKey = `${resume.id}-${job.id}`;
  const loading  = document.getElementById('analyzeLoading');
  const results  = document.getElementById('analyzeResults');

  loading.classList.remove('hidden');
  results.classList.add('hidden');

  try {
    const { result, cached } = await analyzeResumeVsJD(resume, job);
    loading.classList.add('hidden');
    renderAnalysisResults(result, resume, job);
    if (cached) toast('Showing cached analysis (saved API credits)');
    else        toast('Analysis complete! ✓', 'success');
  } catch (err) {
    loading.classList.add('hidden');
    results.classList.remove('hidden');
    results.innerHTML = `<div class="result-card">
      <div class="result-card-header" style="color:var(--danger)">⚠ Error</div>
      <div class="result-card-body">${escHtml(err.message)}</div>
    </div>`;
    toast(err.message, 'error', 5000);
  }
}

function renderAnalysisResults(r, resume, job) {
  const results = document.getElementById('analyzeResults');
  results.classList.remove('hidden');

  results.innerHTML = `
    <!-- Scores -->
    <div class="result-card">
      <div class="result-card-header">📊 Match Analysis</div>
      <div class="result-card-body">
        <div class="scores-row">
          <div class="score-box match">
            <div class="score-num">${r.match_score}</div>
            <div class="score-label">Match Score</div>
            <div class="score-sub" style="font-size:10px;margin-top:4px">${r.match_summary || ''}</div>
          </div>
          <div class="score-box ats">
            <div class="score-num">${r.ats_score}</div>
            <div class="score-label">ATS Score</div>
            <div class="score-sub" style="font-size:10px;margin-top:4px">ATS-friendliness</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Keywords -->
    <div class="result-card">
      <div class="result-card-header">🔑 Keywords</div>
      <div class="result-card-body">
        ${r.missing_keywords?.length ? `
        <div style="margin-bottom:10px">
          <div class="text-sm text-bold" style="color:var(--danger);margin-bottom:5px">Missing from your resume:</div>
          <div class="kw-chips">${r.missing_keywords.map(k=>`<span class="kw-chip missing">${escHtml(k)}</span>`).join('')}</div>
        </div>` : ''}
        ${r.present_keywords?.length ? `
        <div>
          <div class="text-sm text-bold" style="color:var(--success);margin-bottom:5px">Already present:</div>
          <div class="kw-chips">${r.present_keywords.map(k=>`<span class="kw-chip present">${escHtml(k)}</span>`).join('')}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- Strengths -->
    ${r.strengths?.length ? `
    <div class="result-card">
      <div class="result-card-header">💪 Your Strengths</div>
      <div class="result-card-body">
        <ul class="strengths-list">
          ${r.strengths.map(s=>`<li class="strength-item">${escHtml(s)}</li>`).join('')}
        </ul>
      </div>
    </div>` : ''}

    <!-- Improvements -->
    ${r.improvements?.length ? `
    <div class="result-card">
      <div class="result-card-header">✏️ Resume Improvements</div>
      <div class="result-card-body">
        ${r.improvements.map(imp => `
          <div class="improvement-item">
            <div class="imp-icon ${imp.type}">${imp.type === 'add' ? '+' : imp.type === 'remove' ? '−' : '↻'}</div>
            <div class="imp-text">
              <div class="imp-suggestion">${escHtml(imp.suggestion)}</div>
              <div class="imp-reason">${escHtml(imp.reason)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- ATS Tips -->
    ${r.ats_tips?.length ? `
    <div class="result-card">
      <div class="result-card-header">🤖 ATS Tips</div>
      <div class="result-card-body">
        <ul class="strengths-list">
          ${r.ats_tips.map(t=>`<li class="strength-item" style="color:var(--text-2)">${escHtml(t)}</li>`).join('')}
        </ul>
      </div>
    </div>` : ''}

    <!-- Interview Questions -->
    ${r.interview_questions?.length ? `
    <div class="result-card">
      <div class="result-card-header">🎤 Likely Interview Questions</div>
      <div class="result-card-body">
        <ul class="iq-list">
          ${r.interview_questions.map((q,i) => `
            <li class="iq-item">
              <span class="iq-num">${i+1}</span>
              <span>${escHtml(q)}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    </div>` : ''}

    <!-- Cover Letter -->
    <div class="result-card" id="coverLetterCard">
      <div class="result-card-header">📝 Cover Letter</div>
      <div class="result-card-body">
        <div id="coverLetterContent">
          <button class="cover-letter-btn" id="btnGenCoverLetter">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z" stroke="currentColor" stroke-width="2"/><path d="M12 8v4l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            Generate Tailored Cover Letter
          </button>
          <div class="text-sm mt-4" style="text-align:center">1 API call · ~${state.settings.provider === 'gemini' ? 'Free (Gemini)' : '$0.003'}</div>
        </div>
      </div>
    </div>

    <!-- Salary & Red Flags -->
    ${r.salary_insight ? `
    <div class="result-card">
      <div class="result-card-header">💰 Salary Insight</div>
      <div class="result-card-body" style="font-size:12px;color:var(--text-2)">${escHtml(r.salary_insight)}</div>
    </div>` : ''}

    ${r.red_flags?.length ? `
    <div class="result-card">
      <div class="result-card-header" style="color:var(--danger)">⚠️ Recruiter Red Flags</div>
      <div class="result-card-body">
        <ul class="strengths-list">
          ${r.red_flags.map(f=>`<li class="strength-item" style="color:var(--danger)">
            <span style="color:var(--danger)">!</span>${escHtml(f)}
          </li>`).join('')}
        </ul>
      </div>
    </div>` : ''}

    <!-- Mark as Applied -->
    <div class="mark-applied-result-row">
      <div class="text-sm">✓ Ready to apply with <strong>${escHtml(resume.name)}</strong>?</div>
      <button class="btn-sm btn-primary" id="btnResultMarkApplied">Mark as Applied</button>
    </div>

    <!-- Re-analyze -->
    <button class="btn-sm btn-ghost" id="btnReAnalyze" style="width:100%">
      🔄 Re-analyze (clears cache, uses 1 API call)
    </button>
  `;

  // Cover letter button
  document.getElementById('btnGenCoverLetter').addEventListener('click', async () => {
    const btn = document.getElementById('btnGenCoverLetter');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      const letter = await generateCoverLetter(resume, job);
      document.getElementById('coverLetterContent').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span class="text-sm text-bold">Your Cover Letter</span>
          <button class="copy-btn" id="btnCopyCL">Copy</button>
        </div>
        <textarea class="cover-letter-text" id="coverLetterText">${escHtml(letter)}</textarea>
      `;
      document.getElementById('btnCopyCL').addEventListener('click', () => {
        const txt = document.getElementById('coverLetterText').value;
        navigator.clipboard.writeText(txt).then(() => toast('Copied to clipboard!', 'success'));
      });
      toast('Cover letter generated!', 'success');
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Generate Tailored Cover Letter';
      toast(err.message, 'error', 4000);
    }
  });

  // Mark as Applied button (inside analysis results)
  document.getElementById('btnResultMarkApplied').addEventListener('click', () => {
    markJobAsApplied(resume.id, job.id);
  });

  // Re-analyze button
  document.getElementById('btnReAnalyze').addEventListener('click', async () => {
    const cacheKey = `${resume.id}-${job.id}`;
    delete state.analyses[cacheKey];
    await save(SK.ANALYSES, state.analyses);
    await doAIAnalysis();
  });
}

function scoreColor(score) {
  if (score >= 75) return 'var(--success)';
  if (score >= 50) return 'var(--warning)';
  return 'var(--danger)';
}

// ═════════════════════════════════════════════════════════════════════
// RENDER – TRACKER
// ═════════════════════════════════════════════════════════════════════

const STATUS_CONFIG = {
  saved:     { label: '📋 Saved',     cls: 'status-saved'     },
  applied:   { label: '📤 Applied',   cls: 'status-applied'   },
  interview: { label: '🎤 Interview', cls: 'status-interview' },
  offer:     { label: '🎉 Offer',     cls: 'status-offer'     },
  rejected:  { label: '❌ Rejected',  cls: 'status-rejected'  }
};

function renderTracker() {
  const board = document.getElementById('trackerBoard');

  if (state.applications.length === 0) {
    board.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="#9ca3af" stroke-width="2"/></svg>
      <p>No applications tracked</p>
      <small>Click + to add your first application</small>
    </div>`;
    return;
  }

  board.innerHTML = Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
    let apps = state.applications.filter(a => a.status === status);
    if (trackerSearch) {
      apps = apps.filter(a => {
        const job    = state.jobs.find(j => j.id === a.jobId);
        const resume = state.resumes.find(r => r.id === a.resumeId);
        const haystack = [
          job    ? job.title    : '',
          job    ? job.company  : '',
          resume ? resume.name  : '',
          a.notes || ''
        ].join(' ').toLowerCase();
        return haystack.includes(trackerSearch);
      });
    }
    return `
    <div class="tracker-column ${cfg.cls}">
      <div class="tracker-col-header">
        <span>${cfg.label}</span>
        <span class="badge">${apps.length}</span>
      </div>
      <div class="tracker-col-body">
        ${apps.length === 0 ? '<div class="text-sm" style="text-align:center;padding:6px">Empty</div>' :
          apps.map(app => renderAppCard(app)).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderAppCard(app) {
  const job    = state.jobs.find(j => j.id === app.jobId);
  const resume = state.resumes.find(r => r.id === app.resumeId);
  const otherStatuses = Object.keys(STATUS_CONFIG).filter(s => s !== app.status);
  const noteCount = (app.stageLog || []).length;

  // Follow-up badge: shown only for "applied" status
  let followUpBadge = '';
  if (app.status === 'applied') {
    const days = daysSince(app.date);
    const color = days < 7 ? 'var(--success)' : days < 14 ? 'var(--warning)' : 'var(--danger)';
    followUpBadge = `<span class="followup-badge" style="color:${color};border-color:${color}">${days}d ago</span>`;
  }

  return `<div class="app-card">
    <div class="app-card-title">
      ${job ? escHtml(job.title) : 'Unknown Job'}
      ${followUpBadge}
    </div>
    <div class="app-card-sub">${job ? escHtml(job.company) : ''} · ${fmtDate(app.date)}</div>
    ${resume
      ? `<div class="resume-tag">
           <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="2.2"/><polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2.2"/></svg>
           ${escHtml(resume.name)}
         </div>`
      : '<div class="resume-tag" style="background:#f3f4f6;color:#9ca3af">No resume linked</div>'
    }
    <div class="app-status-actions" style="margin-top:6px">
      <button class="notes-btn" data-action="open-notes" data-id="${app.id}">
        📝 Notes${noteCount > 0 ? `<span class="notes-count">${noteCount}</span>` : ''}
      </button>
      ${otherStatuses.map(s => `
        <button class="status-btn" data-action="update-status" data-id="${app.id}" data-status="${s}">${cap(s)}</button>
      `).join('')}
      <button class="status-btn" style="color:var(--danger)" data-action="delete-app" data-id="${app.id}">✕</button>
    </div>
  </div>`;
}

window.updateAppStatus = async (id, newStatus) => {
  const app = state.applications.find(a => a.id === id);
  if (app) {
    app.status = newStatus;
    await save(SK.APPLICATIONS, state.applications);
    renderTracker();
    toast(`Moved to ${cap(newStatus)}`);
  }
};

window.deleteApp = async (id) => {
  if (!confirm('Remove this application?')) return;
  state.applications = state.applications.filter(a => a.id !== id);
  await save(SK.APPLICATIONS, state.applications);
  renderTracker();
  renderDashboard();
  toast('Application removed');
};

// ── Stage Notes Modal ─────────────────────────────────────────────────
window.openAppNotes = (appId) => {
  const app = state.applications.find(a => a.id === appId);
  if (!app) return;
  const job = state.jobs.find(j => j.id === app.jobId);
  const stageLog = app.stageLog || [];

  const logsHtml = stageLog.length > 0
    ? stageLog.slice().reverse().map(entry => `
        <div class="note-entry">
          <div class="note-date">${fmtDate(entry.date)} · <span class="note-status">${cap(entry.status)}</span></div>
          <div class="note-text">${escHtml(entry.note)}</div>
        </div>
      `).join('')
    : '<div class="text-sm" style="text-align:center;padding:12px;color:var(--text-3)">No notes yet — add your first note below.</div>';

  const modalContent = `
    <div id="notesList">${logsHtml}</div>
    <div style="margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
      <textarea id="newNoteInput" class="text-area" rows="3"
        placeholder="e.g. 'Sent follow-up email', 'Phone screen scheduled for Friday', 'Rejected via email'…"
        style="margin-bottom:6px"></textarea>
      <button class="btn-sm btn-primary" style="width:100%" data-action="add-note" data-id="${appId}">
        Add Note
      </button>
    </div>
  `;
  showHtmlModal(`📝 Notes — ${job ? escHtml(job.title) : 'Application'}`, modalContent);
};

window.addAppNote = async (appId) => {
  const app  = state.applications.find(a => a.id === appId);
  const note = (document.getElementById('newNoteInput') || {}).value || '';
  if (!app) return;
  if (!note.trim()) { toast('Note cannot be empty', 'error'); return; }

  if (!app.stageLog) app.stageLog = [];
  app.stageLog.push({ note: note.trim(), date: new Date().toISOString(), status: app.status });
  await save(SK.APPLICATIONS, state.applications);

  toast('Note added!', 'success');
  openAppNotes(appId);   // refresh modal content
  renderTracker();
};

// ═════════════════════════════════════════════════════════════════════
// RENDER – SETTINGS
// ═════════════════════════════════════════════════════════════════════

function renderSettings() {
  const { apiKey, provider, model } = state.settings;
  document.getElementById('apiKeyInput').value    = apiKey   || '';
  document.getElementById('providerSelect').value = provider || 'gemini';
  document.getElementById('modelSelect').value    = model    || 'gemini-1.5-pro';
  updateProviderHint(provider || 'gemini');

  // Profile fields
  const p = state.profile;
  document.getElementById('pFirstName').value   = p.firstName   || '';
  document.getElementById('pLastName').value    = p.lastName    || '';
  document.getElementById('pEmail').value       = p.email       || '';
  document.getElementById('pPhone').value       = p.phone       || '';
  document.getElementById('pLinkedIn').value    = p.linkedin    || '';
  document.getElementById('pGithub').value      = p.github      || '';
  document.getElementById('pPortfolio').value   = p.portfolio   || '';
  document.getElementById('pCity').value        = p.city        || '';
  document.getElementById('pState').value       = p.state       || '';
  document.getElementById('pCountry').value     = p.country     || '';
  document.getElementById('pZip').value         = p.zipCode     || '';
  document.getElementById('pSalary').value      = p.salary      || '';
  document.getElementById('pAvailability').value= p.availability|| '';

  // Pre-answers
  const pa = state.preAnswers;
  document.getElementById('paWhyRole').value    = pa.whyThisRole || '';
  document.getElementById('paAboutMe').value    = pa.aboutMe     || '';
  document.getElementById('paStrength').value   = pa.strength    || '';
  document.getElementById('paWeakness').value   = pa.weakness    || '';
  document.getElementById('paCoverLetter').value= pa.coverLetter || '';
}

function updateProviderHint(provider) {
  const hint = document.getElementById('apiKeyHint');
  const modelSel = document.getElementById('modelSelect');
  if (provider === 'gemini') {
    hint.innerHTML = 'Get your free key at <strong>aistudio.google.com</strong> → Get API Key<br/>Stored locally, never sent anywhere else.';
    // Show only Gemini models
    [...modelSel.options].forEach(o => {
      o.hidden = !o.value.startsWith('gemini');
    });
    if (!modelSel.value.startsWith('gemini')) modelSel.value = 'gemini-1.5-pro';
  } else {
    hint.innerHTML = 'Get your key at <strong>platform.claude.com</strong> → API Keys<br/>Stored locally, never sent anywhere else.';
    // Show only Claude models
    [...modelSel.options].forEach(o => {
      o.hidden = !o.value.startsWith('claude');
    });
    if (!modelSel.value.startsWith('claude')) modelSel.value = 'claude-haiku-4-5';
  }
}

// ═════════════════════════════════════════════════════════════════════
// UTILITIES
// ═════════════════════════════════════════════════════════════════════

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function updateApiStatusBadge() {
  const badge = document.getElementById('apiStatus');
  if (state.settings.apiKey) {
    badge.textContent = '✓ API Ready';
    badge.className = 'api-badge has-key';
  } else {
    badge.textContent = 'No API Key';
    badge.className = 'api-badge no-key';
  }
}

// ═════════════════════════════════════════════════════════════════════
// EVENT WIRING
// ═════════════════════════════════════════════════════════════════════

function wireEvents() {
  // ── Tab Navigation ──────────────────────────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ── Modal ────────────────────────────────────────────────────────
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', closeModal);

  // ── Dashboard quick actions ──────────────────────────────────────
  document.getElementById('qaAddResume').addEventListener('click', () => switchTab('resumes'));
  document.getElementById('qaCaptureJD').addEventListener('click', () => {
    switchTab('jobs');
    setTimeout(() => triggerCaptureFromCurrentTab(), 300);
  });
  document.getElementById('qaAnalyze').addEventListener('click', () => switchTab('analyze'));
  document.getElementById('qaFillApp').addEventListener('click', fillApplication);

  // ── Resume Upload ────────────────────────────────────────────────
  const uploadArea = document.getElementById('uploadArea');
  const fileInput  = document.getElementById('resumeFileInput');
  const btnUpload  = document.getElementById('btnUploadResume');

  btnUpload.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('click', (e) => { if (e.target !== btnUpload) fileInput.click(); });

  uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleResumeFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleResumeFile(fileInput.files[0]);
  });

  document.getElementById('btnAddResume').addEventListener('click', () => fileInput.click());

  // ── Resume Text Paste ────────────────────────────────────────────
  document.getElementById('btnSaveResumeText').addEventListener('click', async () => {
    const name = document.getElementById('resumeNameInput').value.trim();
    const text = document.getElementById('resumeTextArea').value.trim();
    if (!name) { toast('Please enter a name for this resume', 'error'); return; }
    if (text.length < 50) { toast('Resume text is too short', 'error'); return; }
    await saveResume(name, text);
    document.getElementById('resumeNameInput').value = '';
    document.getElementById('resumeTextArea').value  = '';
  });

  // ── Jobs ─────────────────────────────────────────────────────────
  document.getElementById('btnAddJob').addEventListener('click', () => {
    document.getElementById('addJobForm').classList.toggle('hidden');
  });

  document.getElementById('btnCancelJob').addEventListener('click', () => {
    document.getElementById('addJobForm').classList.add('hidden');
  });

  document.getElementById('btnSaveJob').addEventListener('click', async () => {
    const title   = document.getElementById('jobTitleInput').value.trim();
    const company = document.getElementById('jobCompanyInput').value.trim();
    const text    = document.getElementById('jobDescInput').value.trim();
    if (!title)        { toast('Job title is required', 'error'); return; }
    if (text.length < 50) { toast('Job description is too short', 'error'); return; }
    await saveJob({ title, company: company || 'Unknown', text });
    document.getElementById('jobTitleInput').value   = '';
    document.getElementById('jobCompanyInput').value = '';
    document.getElementById('jobDescInput').value    = '';
    document.getElementById('addJobForm').classList.add('hidden');
  });

  document.getElementById('btnCapturePage').addEventListener('click', triggerCaptureFromCurrentTab);

  document.getElementById('jobSearchInput').addEventListener('input', (e) => {
    jobSearch = e.target.value.toLowerCase();
    renderJobs();
  });

  // ── Tracker Search ───────────────────────────────────────────────
  document.getElementById('trackerSearchInput').addEventListener('input', (e) => {
    trackerSearch = e.target.value.toLowerCase();
    renderTracker();
  });

  // ── Analyze ──────────────────────────────────────────────────────
  document.getElementById('btnLocalMatch').addEventListener('click', doLocalMatch);
  document.getElementById('btnAIAnalyze').addEventListener('click', doAIAnalysis);

  // Show fill-apply bar when both resume + job are selected
  function updateFillApplyBar() {
    const resumeId = document.getElementById('analyzeResume').value;
    const jobId    = document.getElementById('analyzeJob').value;
    document.getElementById('fillApplyBar').style.display = (resumeId && jobId) ? 'flex' : 'none';
  }
  document.getElementById('analyzeResume').addEventListener('change', updateFillApplyBar);
  document.getElementById('analyzeJob').addEventListener('change', (e) => {
    const jobId = e.target.value;
    if (jobId && state.resumes.length > 0) {
      autoSelectBestResume(jobId); // auto-picks best resume + runs local match
    }
    updateFillApplyBar();
  });

  document.getElementById('btnFillForm').addEventListener('click', fillApplication);
  document.getElementById('btnMarkApplied').addEventListener('click', () => {
    const resumeId = document.getElementById('analyzeResume').value;
    const jobId    = document.getElementById('analyzeJob').value;
    markJobAsApplied(resumeId, jobId);
  });

  // ── Tracker: Add Application ─────────────────────────────────────
  document.getElementById('btnAddApp').addEventListener('click', () => {
    const form = document.getElementById('addAppForm');
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden')) {
      // Populate selects
      const jobSel    = document.getElementById('appJobSelect');
      const resumeSel = document.getElementById('appResumeSelect');
      jobSel.innerHTML = '<option value="">— Link a saved job —</option>' +
        state.jobs.map(j => `<option value="${j.id}">${escHtml(j.title)} – ${escHtml(j.company)}</option>`).join('');
      resumeSel.innerHTML = '<option value="">— Resume used —</option>' +
        state.resumes.map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join('');
    }
  });

  document.getElementById('btnCancelApp').addEventListener('click', () => {
    document.getElementById('addAppForm').classList.add('hidden');
  });

  document.getElementById('btnSaveApp').addEventListener('click', async () => {
    const jobId    = document.getElementById('appJobSelect').value;
    const resumeId = document.getElementById('appResumeSelect').value;
    const status   = document.getElementById('appStatusSelect').value;
    const notes    = document.getElementById('appNotes').value.trim();
    if (!jobId) { toast('Please select a job', 'error'); return; }
    const app = { id: uid(), jobId, resumeId, status, notes, date: new Date().toISOString() };
    state.applications.push(app);
    await save(SK.APPLICATIONS, state.applications);
    document.getElementById('addAppForm').classList.add('hidden');
    document.getElementById('appNotes').value = '';
    renderTracker();
    renderDashboard();
    toast('Application added!', 'success');
  });

  // ── Settings ─────────────────────────────────────────────────────
  document.getElementById('btnShowKey').addEventListener('click', () => {
    const inp = document.getElementById('apiKeyInput');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  document.getElementById('providerSelect').addEventListener('change', (e) => {
    updateProviderHint(e.target.value);
  });

  document.getElementById('btnSaveSettings').addEventListener('click', async () => {
    const apiKey   = document.getElementById('apiKeyInput').value.trim();
    const provider = document.getElementById('providerSelect').value;
    const model    = document.getElementById('modelSelect').value;
    state.settings = { apiKey, provider, model };
    await save(SK.SETTINGS, state.settings);
    updateApiStatusBadge();
    toast('Settings saved!', 'success');
  });

  document.getElementById('btnSaveProfile').addEventListener('click', async () => {
    state.profile = {
      firstName:    document.getElementById('pFirstName').value.trim(),
      lastName:     document.getElementById('pLastName').value.trim(),
      email:        document.getElementById('pEmail').value.trim(),
      phone:        document.getElementById('pPhone').value.trim(),
      linkedin:     document.getElementById('pLinkedIn').value.trim(),
      github:       document.getElementById('pGithub').value.trim(),
      portfolio:    document.getElementById('pPortfolio').value.trim(),
      city:         document.getElementById('pCity').value.trim(),
      state:        document.getElementById('pState').value.trim(),
      country:      document.getElementById('pCountry').value.trim(),
      zipCode:      document.getElementById('pZip').value.trim(),
      salary:       document.getElementById('pSalary').value.trim(),
      availability: document.getElementById('pAvailability').value.trim()
    };
    state.preAnswers = {
      whyThisRole:  document.getElementById('paWhyRole').value.trim(),
      aboutMe:      document.getElementById('paAboutMe').value.trim(),
      strength:     document.getElementById('paStrength').value.trim(),
      weakness:     document.getElementById('paWeakness').value.trim(),
      coverLetter:  document.getElementById('paCoverLetter').value.trim()
    };
    await Promise.all([
      save(SK.PROFILE, state.profile),
      save(SK.PRE_ANSWERS, state.preAnswers)
    ]);
    toast('Profile & answers saved! ✓', 'success');
  });

  document.getElementById('btnExportData').addEventListener('click', exportData);

  document.getElementById('btnClearData').addEventListener('click', async () => {
    if (!confirm('This will delete ALL resumes, jobs, and applications. Are you sure?')) return;
    state.resumes = []; state.jobs = []; state.applications = []; state.analyses = {};
    await chrome.storage.local.clear();
    await save(SK.SETTINGS, state.settings); // Keep settings
    switchTab('dashboard');
    toast('All data cleared');
  });

  // ── Delegated handlers for dynamically rendered lists ────────────

  // Resumes list
  document.getElementById('resumeList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'view-resume')   window.viewResume(id);
    if (action === 'analyze-resume') switchTab('analyze');
    if (action === 'delete-resume') window.deleteResume(id);
  });

  // Jobs list
  document.getElementById('jobList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'view-job')        window.viewJob(id);
    if (action === 'analyze-job')     window.analyzeWith(id);
    if (action === 'delete-job')      window.deleteJob(id);
    if (action === 'mark-applied-job') window.markJobAppliedFromList(id);
  });

  // Tracker board
  document.getElementById('trackerBoard').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'open-notes')    window.openAppNotes(id);
    if (action === 'update-status') window.updateAppStatus(id, btn.dataset.status);
    if (action === 'delete-app')    window.deleteApp(id);
  });

  // Modal (for Add Note and confirm-mark-applied buttons)
  document.getElementById('modal').addEventListener('click', (e) => {
    const addNote = e.target.closest('[data-action="add-note"]');
    if (addNote) window.addAppNote(addNote.dataset.id);

    const confirmApply = e.target.closest('[data-action="confirm-mark-applied"]');
    if (confirmApply) window.confirmMarkApplied(confirmApply.dataset.jobId);
  });

  // ── Listen for messages from popup / background ───────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'AUTOFILL_COMPLETE') {
      toast(`✓ Auto-filled ${msg.count} field${msg.count !== 1 ? 's' : ''} on the page!`, 'success', 4000);
    }
    if (msg.type === 'JD_FROM_CONTENT' && msg.data) {
      handleIncomingJD(msg.data);
    }
    if (msg.type === 'JD_AUTO_SAVED') {
      // Reload jobs from storage then show banner
      chrome.storage.local.get('jt_jobs').then(data => {
        state.jobs = data['jt_jobs'] || [];
        const job = state.jobs.find(j => j.id === msg.jobId);
        if (job) showJobBanner(job, msg.isNew);
      });
    }
    if (msg.type === 'NAVIGATE_TO') {
      switchTab(msg.tab);
    }
    if (msg.type === 'JOB_MARKED_APPLIED') {
      chrome.storage.local.get(SK.APPLICATIONS).then(data => {
        state.applications = data[SK.APPLICATIONS] || [];
        toast(`✓ Auto-marked as Applied: "${escHtml(msg.title)} at ${escHtml(msg.company)}"`, 'success', 5000);
        renderDashboard();
        renderTracker();
      });
    }
  });

  // ── Banner buttons ────────────────────────────────────────────────
  document.getElementById('jobBannerAnalyze').addEventListener('click', () => {
    const jobId = document.getElementById('jobBanner').dataset.jobId;
    if (!jobId) return;
    hideJobBanner();
    switchTab('analyze');
    setTimeout(() => {
      // Pre-select this job
      const jSel = document.getElementById('analyzeJob');
      if (jSel) jSel.value = jobId;
      // Pre-select best matching resume
      autoSelectBestResume(jobId);
    }, 100);
  });

  document.getElementById('jobBannerClose').addEventListener('click', hideJobBanner);
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════

async function handleResumeFile(file) {
  if (!file.name.match(/\.(pdf|txt)$/i)) {
    toast('Please upload a PDF or TXT file', 'error'); return;
  }

  const name = file.name.replace(/\.(pdf|txt)$/i, '');
  toast('Extracting text…');

  try {
    let text = '';
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      text = await extractTextFromPDF(file);
    } else {
      text = await file.text();
    }

    if (!text || text.length < 50) {
      toast('Could not extract text from PDF. Try pasting the text instead.', 'error', 5000);
      return;
    }

    await saveResume(name, text);
  } catch (err) {
    toast('Error reading file: ' + err.message, 'error', 5000);
  }
}

async function saveResume(name, text) {
  const resume = { id: uid(), name, text, date: new Date().toISOString() };
  state.resumes.unshift(resume);
  await save(SK.RESUMES, state.resumes);
  renderResumes();
  toast(`✓ Resume "${name}" saved`, 'success');
}

async function saveJob(data) {
  const job = {
    id: uid(),
    title: data.title,
    company: data.company,
    text: data.text,
    location: data.location || '',
    url: data.url || '',
    source: data.source || 'manual',
    recruiterEmail: data.recruiterEmail || '',
    date: new Date().toISOString()
  };
  state.jobs.unshift(job);
  await save(SK.JOBS, state.jobs);
  renderJobs();
  toast(`✓ Job "${data.title}" saved`, 'success');
}

async function triggerCaptureFromCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || tab.url.startsWith('chrome://')) {
      toast('Cannot capture from this page. Navigate to a job listing first.', 'error', 4000);
      return;
    }

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    }).catch(() => {});

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_JD' });

    if (response?.success && response.data?.description?.length > 50) {
      const jd = response.data;
      await saveJob({ title: jd.title, company: jd.company, text: jd.description, location: jd.location, url: jd.url, source: jd.source, recruiterEmail: jd.recruiterEmail || '' });
      if (state.jobs.length > 0) showJobBanner(state.jobs[0], true);
    } else {
      toast('No job description found on this page. Try the manual form below.', 'error', 4000);
      document.getElementById('addJobForm').classList.remove('hidden');
    }
  } catch (err) {
    toast('Could not access current tab. Use the manual form below.', 'error', 4000);
    document.getElementById('addJobForm').classList.remove('hidden');
  }
}

function handleIncomingJD(jd) {
  if (!jd.description || jd.description.length < 50) return;
  switchTab('jobs');
  saveJob({ title: jd.title, company: jd.company, text: jd.description, location: jd.location, url: jd.url, source: jd.source, recruiterEmail: jd.recruiterEmail || '' });
}

function exportData() {
  const data = {
    exported: new Date().toISOString(),
    resumes: state.resumes,
    jobs: state.jobs,
    applications: state.applications,
    profile: state.profile,
    preAnswers: state.preAnswers
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `jobtrack-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported!', 'success');
}

// ═════════════════════════════════════════════════════════════════════
// JOB AUTO-DETECT BANNER
// ═════════════════════════════════════════════════════════════════════

function showJobBanner(job, isNew) {
  const banner  = document.getElementById('jobBanner');
  const title   = document.getElementById('jobBannerTitle');
  const sub     = document.getElementById('jobBannerSub');

  banner.dataset.jobId = job.id;
  title.textContent = isNew
    ? `✨ ${job.title} at ${job.company}`
    : `📌 ${job.title} at ${job.company}`;
  sub.textContent = isNew
    ? 'Auto-saved! Click to analyze with your best resume →'
    : 'Already in your library. Click to analyze →';

  banner.classList.remove('hidden');
}

function hideJobBanner() {
  document.getElementById('jobBanner').classList.add('hidden');
}

function autoSelectBestResume(jobId) {
  if (state.resumes.length === 0) return;
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;

  // Score each resume by local keyword match — pick the best one
  let bestId    = state.resumes[0].id;
  let bestScore = -1;

  for (const resume of state.resumes) {
    const { score } = getLocalMatch(resume.text, job.text);
    if (score > bestScore) { bestScore = score; bestId = resume.id; }
  }

  const rSel = document.getElementById('analyzeResume');
  if (rSel) rSel.value = bestId;

  // Auto-run local match immediately (free)
  doLocalMatch();
}

// Check if current tab has a job page on startup
async function checkCurrentTabOnLoad() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;

    // Check if current URL matches any saved job
    const match = state.jobs.find(j => j.url && tab.url.startsWith(j.url.split('?')[0]));
    if (match) showJobBanner(match, false);
  } catch (_) {}
}

// ═════════════════════════════════════════════════════════════════════
// BOOT
// ═════════════════════════════════════════════════════════════════════

async function init() {
  await loadAll();
  wireEvents();
  updateApiStatusBadge();
  switchTab('dashboard');
  checkCurrentTabOnLoad();
}

document.addEventListener('DOMContentLoaded', init);
