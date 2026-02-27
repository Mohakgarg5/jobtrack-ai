/* =====================================================================
   JobTrack AI – Side Panel Main Script
   ===================================================================== */

'use strict';

// ── Storage Keys ──────────────────────────────────────────────────────
const SK = {
  RESUMES:        'jt_resumes',
  JOBS:           'jt_jobs',
  APPLICATIONS:   'jt_applications',
  ANALYSES:       'jt_analyses',
  SETTINGS:       'jt_settings',
  PROFILE:        'jt_profile',
  PRE_ANSWERS:    'jt_pre_answers',
  PROFILES:       'jt_profiles',
  ACTIVE_PROFILE: 'jt_active_profile_id'
};

// ── App State ─────────────────────────────────────────────────────────
const state = {
  resumes: [],
  jobs: [],
  applications: [],
  analyses: {},
  settings:       { apiKey: '', provider: 'gemini', model: 'gemini-2.0-flash' },
  profile:        { firstName:'', lastName:'', email:'', phone:'', linkedin:'', github:'', portfolio:'', city:'', state:'', country:'', zipCode:'', salary:'', availability:'' },
  preAnswers:     { whyThisRole:'', aboutMe:'', strength:'', weakness:'', coverLetter:'' },
  profiles:       [],
  activeProfileId: '',
  activeTab:      'dashboard'
};

// ── Load / Save ───────────────────────────────────────────────────────
async function loadAll() {
  const data = await chrome.storage.local.get(Object.values(SK));
  state.resumes      = data[SK.RESUMES]      || [];
  state.jobs         = data[SK.JOBS]         || [];
  state.applications = data[SK.APPLICATIONS] || [];
  state.analyses     = data[SK.ANALYSES]     || {};
  state.settings     = { apiKey: '', provider: 'gemini', model: 'gemini-2.0-flash', ...(data[SK.SETTINGS] || {}) };

  let profiles       = data[SK.PROFILES]       || [];
  let activeProfileId = data[SK.ACTIVE_PROFILE] || '';

  // ── Migrate old single-profile data into the profiles array ────────────────────
  if (profiles.length === 0) {
    const oldP  = { ...state.profile,    ...(data[SK.PROFILE]     || {}) };
    const oldPA = { ...state.preAnswers, ...(data[SK.PRE_ANSWERS] || {}) };
    const migrated = {
      id: 'profile_' + Date.now(),
      displayName: 'Profile 1',
      ...oldP,
      whyThisRole:  oldPA.whyThisRole  || '',
      aboutMe:      oldPA.aboutMe      || '',
      strength:     oldPA.strength     || '',
      weakness:     oldPA.weakness     || '',
      coverLetter:  oldPA.coverLetter  || ''
    };
    profiles = [migrated];
    activeProfileId = migrated.id;
    await chrome.storage.local.set({
      [SK.PROFILES]:       profiles,
      [SK.ACTIVE_PROFILE]: activeProfileId
    });
  }

  state.profiles        = profiles;
  state.activeProfileId = activeProfileId || (profiles[0] && profiles[0].id) || '';

  // ── Migrate legacy global jt_resumes into the first profile (one-time) ──
  const globalResumes = data[SK.RESUMES] || [];
  if (globalResumes.length > 0) {
    let changed = false;
    const firstP = profiles[0];
    if (firstP && !firstP.resumes) {
      firstP.resumes = globalResumes;
      changed = true;
    }
    if (changed) {
      await chrome.storage.local.set({ [SK.PROFILES]: profiles });
      await chrome.storage.local.remove(SK.RESUMES); // Remove old global key
    }
  }

  syncActiveProfileToState();
}

const save = async (key, val) => chrome.storage.local.set({ [key]: val });

// Returns only the applications belonging to the currently active profile.
// Old apps that predate profile support (no profileId) are shown on all profiles for backward compat.
function activeApps() {
  return state.applications.filter(a => !a.profileId || a.profileId === state.activeProfileId);
}

// Saves current profile's resumes back into the profiles array and persists it.
// Call this wherever you previously called save(SK.RESUMES, state.resumes).
async function saveResumes() {
  const p = state.profiles.find(x => x.id === state.activeProfileId) || state.profiles[0];
  if (!p) return;
  p.resumes = state.resumes;
  await save(SK.PROFILES, state.profiles);
}

// ── Profile helpers ───────────────────────────────────────────────────
function syncActiveProfileToState() {
  const p = state.profiles.find(x => x.id === state.activeProfileId) || state.profiles[0] || {};
  state.profile = {
    firstName:    p.firstName    || '',
    lastName:     p.lastName     || '',
    email:        p.email        || '',
    phone:        p.phone        || '',
    linkedin:     p.linkedin     || '',
    github:       p.github       || '',
    portfolio:    p.portfolio    || '',
    city:         p.city         || '',
    state:        p.state        || '',
    country:      p.country      || '',
    zipCode:      p.zipCode      || '',
    salary:       p.salary       || '',
    availability: p.availability || ''
  };
  state.preAnswers = {
    whyThisRole:  p.whyThisRole  || '',
    aboutMe:      p.aboutMe      || '',
    strength:     p.strength     || '',
    weakness:     p.weakness     || '',
    coverLetter:  p.coverLetter  || ''
  };
  // Each profile has its own resume list
  state.resumes = p.resumes || [];
  // Keep legacy keys in sync so content script autofill still works
  chrome.storage.local.set({
    [SK.PROFILE]:     state.profile,
    [SK.PRE_ANSWERS]: state.preAnswers
  });
}

function renderProfileBar() {
  const bar = document.getElementById('profileBar');
  if (state.profiles.length <= 1) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  document.getElementById('profileTabs').innerHTML = state.profiles.map(p =>
    `<button class="profile-tab-btn${p.id === state.activeProfileId ? ' active' : ''}"
             data-action="switch-profile" data-profile-id="${p.id}">
       ${escHtml(p.displayName)}
     </button>`
  ).join('');
}

async function switchActiveProfile(profileId) {
  if (profileId === state.activeProfileId) return;
  const p = state.profiles.find(x => x.id === profileId);
  if (!p) return;
  state.activeProfileId = profileId;
  await save(SK.ACTIVE_PROFILE, profileId);
  syncActiveProfileToState(); // loads this profile's resumes into state.resumes
  renderProfileBar();
  renderDashboard();
  // Re-render whichever tab is currently visible (all profile-sensitive tabs)
  const t = state.activeTab;
  if (t === 'resumes')  renderResumes();
  if (t === 'tracker')  renderTracker();
  if (t === 'jobs')     renderJobs();
  if (t === 'analyze')  {
    renderAnalyze();
    document.getElementById('localMatchSection')?.classList.add('hidden');
    document.getElementById('analyzeResults')?.classList.add('hidden');
    document.getElementById('analyzeLoading')?.classList.add('hidden');
  }
  if (t === 'settings') renderSettings();
  toast(`Switched to ${escHtml(p.displayName)}`, 'success', 2000);
}

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
// LOCAL KEYWORD ANALYSIS — ATS-Grade (Free · No API call)
// ═════════════════════════════════════════════════════════════════════

// ── Stop words: carry no discriminating signal ────────────────────────
const STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by','from',
  'up','into','through','during','before','after','above','below','between',
  'each','few','more','most','other','some','such','than','then','these','they',
  'this','those','very','will','have','has','had','was','were','been','be',
  'do','does','did','would','could','should','may','might','shall','can',
  'our','your','their','its','we','you','he','she','it','is','are','am',
  'also','just','only','even','so','too','yet','still','both','either',
  // Job-posting filler words
  'experience','years','required','preferred','minimum','strong','knowledge',
  'ability','skills','team','work','role','position','candidate','company',
  'opportunity','environment','including','related','plus','etc',
  'looking','seeking','hire','join','help','great','good','well','high','large',
  'small','new','must','build','drive','define','own','lead','manage',
  'ensure','support','partner','develop','across','within','focus','responsible',
  'proven','track','record','degree','bachelor','master','phd','certification',
  'equivalent','similar','relevant','understand','working','collaborate',
  'communicate','problem','solution','impact','create','maintain','provide',
  'implement','utilize','leverage','demonstrate','about','after','need',
  'over','should','through','under','what','when','where','which','while',
  'with','would','your','into','able','have','here','know','like','make',
  'much','only','other','their','them','there','will','also','just',
  'not','but','all','any','can','its','was','has','had','are','been',
  'being','both','could','even','from','some','than','that','them','then',
  'these','they','this','very','which','would','using','used','use'
]);

// ── Synonym / alias map ────────────────────────────────────────────────
// Normalises abbreviations → canonical form so "k8s" matches "kubernetes",
// "PM" matches "product manager", etc. Applied to both resume and JD before comparison.
// Keys must be lowercase single tokens or short phrases.
const SYNONYMS = {
  // Languages
  'js': 'javascript', 'ts': 'typescript', 'py': 'python', 'rb': 'ruby',
  'c sharp': 'c#', 'node': 'node.js', 'nodejs': 'node.js', 'node js': 'node.js',
  'reactjs': 'react', 'react.js': 'react', 'vuejs': 'vue', 'vue.js': 'vue',
  'angularjs': 'angular', 'angular.js': 'angular', 'nextjs': 'next.js',
  'golang': 'go',
  // Cloud / DevOps
  'amazon web services': 'aws', 'google cloud platform': 'gcp',
  'google cloud': 'gcp', 'microsoft azure': 'azure',
  'k8s': 'kubernetes', 'kube': 'kubernetes', 'k8': 'kubernetes',
  'docker container': 'docker',
  'ci cd': 'ci/cd', 'cicd': 'ci/cd',
  'continuous integration': 'ci/cd', 'continuous deployment': 'ci/cd',
  'continuous delivery': 'ci/cd', 'infrastructure as code': 'iac',
  'github action': 'github actions',
  // Databases
  'postgres': 'postgresql', 'mongo': 'mongodb', 'elastic': 'elasticsearch',
  // AI / ML
  'ml': 'machine learning', 'dl': 'deep learning',
  'genai': 'generative ai', 'gen ai': 'generative ai',
  'llms': 'llm', 'large language model': 'llm', 'large language models': 'llm',
  'nlp': 'natural language processing', 'cv': 'computer vision',
  'hugging face': 'huggingface', 'hf': 'huggingface',
  // Product / PM roles
  'pm': 'product manager', 'pgm': 'program manager',
  'tpm': 'technical program manager', 'apm': 'associate product manager',
  'po': 'product owner',
  'gtm': 'go-to-market', 'go to market': 'go-to-market',
  'prd': 'product requirements document',
  'mvp': 'minimum viable product', 'jtbd': 'jobs to be done',
  // Program / Project
  'pmo': 'project management office', 'pmp': 'project management professional',
  'wbs': 'work breakdown structure',
  // Metrics / Business
  'kpi': 'kpis', 'okr': 'okrs',
  'nps': 'net promoter score', 'csat': 'customer satisfaction score',
  'dau': 'daily active users', 'mau': 'monthly active users',
  'arr': 'annual recurring revenue', 'mrr': 'monthly recurring revenue',
  'ltv': 'lifetime value', 'cac': 'customer acquisition cost',
  'roi': 'return on investment',
  // Business model
  'saas': 'software as a service', 'b2b': 'business-to-business',
  'b2c': 'business-to-consumer',
  // CRM / Tools
  'sfdc': 'salesforce', 'gh': 'github', 'gl': 'gitlab',
  // Design
  'ux': 'user experience', 'ui': 'user interface',
  // Marketing
  'sem': 'search engine marketing', 'seo': 'search engine optimization',
  'cro': 'conversion rate optimization'
};

// ── Role taxonomy: each role has canonical titles + distinctive vocabulary ──
// Titles are weighted 5× more than distinctive phrases in detectRole().
// Distinctive phrases are things that ONLY appear in that role — not generic words.
const ROLE_TAXONOMY = {
  product_manager: {
    titles: [
      'product manager','product owner','head of product','director of product',
      'vp of product','vp product','chief product officer','cpo',
      'group product manager','senior product manager','associate product manager',
      'apm','product lead','product management lead'
    ],
    distinctive: [
      'product roadmap','product strategy','product vision','product discovery',
      'user stories','user research','customer discovery','go-to-market','gtm strategy',
      'product metrics','product launch','feature prioritization','product requirements',
      'prd','mvp','minimum viable product','product-market fit','north star metric',
      'product led growth','plg','product backlog','product thinking','product sense',
      'customer interviews','customer feedback','product adoption','product analytics',
      'activation rate','churn rate','nps','csat','product positioning',
      'competitive analysis','market sizing','pricing strategy','product lifecycle',
      'product operations','growth metrics','retention metrics','user acquisition',
      'product brief','jobs to be done','jtbd','product specification',
      'acceptance criteria','feature roadmap','release roadmap','beta testing',
      'product strategy','product opportunity','market opportunity','value proposition'
    ]
  },
  program_manager: {
    titles: [
      'program manager','technical program manager','tpm','project manager',
      'delivery manager','portfolio manager','pmo director','program lead',
      'program management office','pmo','project management professional','pmp',
      'project delivery manager','it project manager','engineering program manager',
      'senior program manager','associate program manager','program coordinator'
    ],
    distinctive: [
      'program management','project delivery','milestone tracking','resource allocation',
      'risk mitigation','program governance','delivery management','project timeline',
      'budget management','project planning','capacity planning','dependency management',
      'waterfall methodology','project execution','project portfolio','program roadmap',
      'project status report','escalation management','issue log','project risk register',
      'executive reporting','steering committee','project charter',
      'project scope','change management','program delivery','work breakdown structure',
      'wbs','critical path','resource leveling','earned value management',
      'project kickoff','lessons learned','project closure','schedule management',
      'cost baseline','project governance','program oversight','intake process',
      'cross-functional delivery','delivery cadence','operational excellence'
    ]
  },
  software_engineer: {
    titles: [
      'software engineer','software developer','swe','backend engineer',
      'frontend engineer','full stack engineer','fullstack engineer','full-stack engineer',
      'staff engineer','principal engineer','senior engineer','junior engineer',
      'web developer','application developer','systems engineer','platform engineer'
    ],
    distinctive: [
      'software development','system design','code review','api design',
      'software architecture','technical design','object oriented programming',
      'functional programming','design patterns','refactoring','technical debt',
      'scalability','performance optimization','debugging','unit tests',
      'test driven development','build pipelines','distributed systems',
      'low latency','high throughput','fault tolerant','production systems',
      'microservice architecture','monolith','service oriented architecture'
    ]
  },
  data_scientist: {
    titles: [
      'data scientist','ml engineer','machine learning engineer','ai engineer',
      'research scientist','applied scientist','quantitative researcher','statistician',
      'ai researcher','nlp engineer','computer vision engineer'
    ],
    distinctive: [
      'machine learning','deep learning','statistical modeling','predictive modeling',
      'feature engineering','model training','model deployment','neural networks',
      'natural language processing','computer vision','reinforcement learning',
      'hypothesis testing','regression analysis','classification model',
      'clustering','random forest','gradient boosting','transformer models',
      'model evaluation','model accuracy','precision recall','roc auc',
      'experiment design','causal inference','bayesian inference'
    ]
  },
  data_analyst: {
    titles: [
      'data analyst','business analyst','analytics engineer','bi analyst',
      'business intelligence analyst','reporting analyst','marketing analyst',
      'financial analyst','operations analyst','strategy analyst','insights analyst'
    ],
    distinctive: [
      'data analysis','business intelligence','data visualization','dashboard creation',
      'sql queries','data insights','kpi tracking','business reporting',
      'metrics analysis','ad hoc analysis','data storytelling','pivot tables',
      'looker','tableau','power bi','data studio','statistical analysis',
      'trend analysis','variance analysis','root cause analysis','business metrics'
    ]
  },
  designer: {
    titles: [
      'ux designer','ui designer','product designer','interaction designer',
      'visual designer','design lead','ux researcher','design director',
      'brand designer','graphic designer','motion designer','experience designer'
    ],
    distinctive: [
      'user experience','wireframing','prototyping','design systems',
      'usability testing','design thinking','information architecture',
      'user flows','design sprint','visual design','interaction design',
      'accessibility design','figma','sketch','adobe xd','user personas',
      'journey mapping','heuristic evaluation','design critique','design handoff'
    ]
  },
  devops: {
    titles: [
      'devops engineer','site reliability engineer','sre','platform engineer',
      'cloud engineer','infrastructure engineer','devsecops','cloud architect',
      'systems administrator','network engineer','reliability engineer'
    ],
    distinctive: [
      'continuous integration','continuous deployment','infrastructure as code',
      'container orchestration','cloud infrastructure','monitoring','observability',
      'incident management','on-call rotation','terraform','ansible',
      'helm charts','service mesh','load balancing','disaster recovery',
      'availability','reliability','latency slo','error budget','runbook'
    ]
  },
  marketing: {
    titles: [
      'marketing manager','growth manager','demand generation','brand manager',
      'content manager','digital marketing manager','marketing director',
      'performance marketing','product marketing manager','pmm','field marketing',
      'marketing lead','vp marketing','chief marketing officer','cmo'
    ],
    distinctive: [
      'marketing strategy','brand awareness','lead generation','demand generation',
      'content marketing','email marketing','social media','paid advertising',
      'sem','google ads','facebook ads','conversion rate optimization',
      'marketing qualified lead','mql','sales qualified lead','sql pipeline',
      'campaign management','marketing automation','hubspot','marketo',
      'customer acquisition cost','cac','lifetime value','ltv','attribution model',
      'brand positioning','messaging framework','go to market execution'
    ]
  },
  sales: {
    titles: [
      'account executive','sales manager','sales director','business development',
      'sales representative','account manager','customer success manager',
      'revenue manager','vp sales','chief revenue officer','cro','inside sales',
      'enterprise sales','solution engineer','sales engineer'
    ],
    distinctive: [
      'quota attainment','pipeline management','revenue generation','deal closing',
      'outbound prospecting','account management','customer retention','upselling',
      'cross-selling','sales cycle','enterprise sales','smb sales',
      'solution selling','consultative selling','annual recurring revenue','arr',
      'monthly recurring revenue','mrr','net revenue retention','nrr',
      'sales playbook','discovery call','proof of concept','procurement','rfp'
    ]
  }
};

// ── Comprehensive skills list (used for keyword display panel) ────────
const ALL_SKILLS = [
  // Languages
  'python','javascript','typescript','java','go','rust','swift','kotlin','scala',
  'php','ruby','c++','c#','matlab','perl','bash','shell','powershell',
  'sql','html','css','sass','r','dart','elixir','haskell','lua',
  // Frontend
  'react','angular','vue','next.js','nuxt','svelte','redux','mobx','graphql',
  'webpack','vite','tailwind','bootstrap','jquery','d3.js','webgl','pwa',
  'storybook','playwright','testing library',
  // Backend
  'node.js','express','django','flask','fastapi','spring boot','rails','laravel',
  'asp.net','rest api','restful','grpc','websocket','microservices','serverless',
  'rabbitmq','kafka','celery','nginx',
  // Databases
  'postgresql','mysql','sqlite','mongodb','redis','elasticsearch','cassandra',
  'dynamodb','firebase','neo4j','bigquery','snowflake','redshift',
  'data warehouse','etl','data pipeline','dbt','airflow',
  // DevOps / Cloud
  'docker','kubernetes','aws','gcp','azure','terraform','ansible','jenkins',
  'ci/cd','github actions','circleci','helm','linux','bash scripting',
  'cloudformation','datadog','grafana','prometheus','pagerduty',
  'observability','site reliability','iac',
  // AI / ML / Data Science
  'machine learning','deep learning','natural language processing','computer vision',
  'tensorflow','pytorch','scikit-learn','pandas','numpy','scipy','keras',
  'huggingface','llm','generative ai','langchain','mlflow','data science',
  'feature engineering','model deployment','mlops','rag','fine-tuning',
  'prompt engineering','openai','vertex ai',
  'statistical modeling','regression','classification','clustering',
  'time series','reinforcement learning',
  // Data Analytics / BI
  'tableau','power bi','looker','data studio','excel','analytics',
  'business intelligence','data visualization','dashboard','reporting',
  'a/b testing','mixpanel','amplitude','segment',
  // Product Management
  'product roadmap','product strategy','product vision','product discovery',
  'user stories','user research','customer discovery','go-to-market',
  'product metrics','product launch','feature prioritization','minimum viable product',
  'product requirements document','product-market fit','north star metric',
  'product led growth','product backlog','customer interviews',
  'jobs to be done','product positioning','competitive analysis','market sizing',
  'pricing strategy','product lifecycle','product analytics',
  'net promoter score','customer satisfaction score','retention metrics',
  'sprint planning','release planning','annual recurring revenue','monthly recurring revenue',
  // Program / Project Management
  'program management','project delivery','milestone tracking','resource allocation',
  'risk mitigation','program governance','delivery management','project timeline',
  'budget management','project planning','capacity planning','dependency management',
  'waterfall','project execution','project portfolio','work breakdown structure',
  'critical path','project status report','escalation management','change management',
  'earned value management','project charter','project management office',
  'project management professional',
  // Design / UX
  'user experience','user interface','wireframing','prototyping','design systems',
  'usability testing','design thinking','information architecture','user flows',
  'figma','sketch','adobe xd','journey mapping','accessibility',
  // Leadership / Process
  'leadership','team management','mentoring','stakeholder management',
  'cross-functional','executive communication','performance management',
  'agile','scrum','kanban','lean','tdd','code review','pair programming',
  'retrospective','sprint','backlog grooming','velocity',
  // Marketing / Growth
  'search engine optimization','search engine marketing','digital marketing','content marketing',
  'email marketing','social media marketing','demand generation','brand management',
  'product marketing','conversion rate optimization','google ads','facebook ads',
  'customer acquisition cost','lifetime value','marketing automation','hubspot','marketo',
  // Sales / Business
  'business development','account management','customer success','pipeline management',
  'quota attainment','revenue generation','deal closing','salesforce',
  'enterprise sales','solution selling','customer retention',
  // Tools
  'git','github','gitlab','jira','confluence','notion','slack','asana',
  'postman','swagger','sentry',
  // Domains
  'fintech','healthtech','edtech','saas','b2b','b2c','e-commerce','mobile',
  'ios','android','blockchain','cybersecurity','cloud computing',
  'distributed systems','system design','api design','platform engineering'
];

// ── Text normaliser — applies synonym expansion ────────────────────────
// Sorted by key length descending so longer aliases don't get partially replaced.
const _sortedSynonyms = Object.entries(SYNONYMS).sort((a, b) => b[0].length - a[0].length);
function normalizeText(text) {
  let t = text.toLowerCase();
  for (const [alias, canonical] of _sortedSynonyms) {
    t = t.replace(new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g'), canonical);
  }
  return t;
}

// ── JD section parser — splits required vs preferred ─────────────────
// Required keywords will be weighted 2× in the ATS score.
function parseJDSections(jdText) {
  const lines = jdText.split('\n');
  const required = [], preferred = [];
  let mode = 'required';
  for (const line of lines) {
    const ll = line.toLowerCase();
    if (/nice.to.have|preferred|bonus|plus\b|desired|ideally|optionally/i.test(ll)) mode = 'preferred';
    else if (/required|must.have|minimum|basic qualifications|responsibilities|requirements|you (must|will|have|bring)/i.test(ll)) mode = 'required';
    (mode === 'preferred' ? preferred : required).push(line);
  }
  return { required: required.join('\n'), preferred: preferred.join('\n') };
}

// ── Skill extractor — returns { skill: count } frequency map ─────────
function extractSkillFreq(text) {
  const norm = normalizeText(text);
  const freq = {};
  for (const skill of ALL_SKILLS) {
    if (skill.length < 2) continue; // skip single-char entries that cause false matches
    const ns      = normalizeText(skill);
    const escaped = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m       = norm.match(new RegExp('\\b' + escaped + '\\b', 'g'));
    if (m) freq[skill] = m.length;
  }
  return freq;
}

// ── extractKeywords — thin wrapper used by job card tags ─────────────
function extractKeywords(text) {
  return Object.keys(extractSkillFreq(text));
}

// ── Role detector ─────────────────────────────────────────────────────
function detectRole(text) {
  const norm = normalizeText(text);
  let bestRole = null, bestScore = 0;
  for (const [role, data] of Object.entries(ROLE_TAXONOMY)) {
    let score = 0;
    for (const title   of data.titles)      { if (norm.includes(title))  score += 5; }
    for (const phrase  of data.distinctive) { if (norm.includes(phrase)) score += 1; }
    if (score > bestScore) { bestScore = score; bestRole = role; }
  }
  return { role: bestRole, confidence: bestScore };
}

// ── Bigram extractor ─────────────────────────────────────────────────
function extractBigrams(text) {
  const words = normalizeText(text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const bigrams = new Set();
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i], b = words[i + 1];
    if (a.length > 2 && b.length > 2 && (!STOP_WORDS.has(a) || !STOP_WORDS.has(b))) {
      bigrams.add(a + ' ' + b);
    }
  }
  return bigrams;
}

// ── getLocalMatch — keyword display panel (present / missing lists) ───
// Uses synonym normalisation + required/preferred weighting.
// Score is weighted: required skills count 2×, preferred 1×.
function getLocalMatch(resumeText, jdText) {
  const normResume = normalizeText(resumeText);
  const { required, preferred } = parseJDSections(jdText);
  const reqFreq  = extractSkillFreq(required || jdText);
  const prefFreq = extractSkillFreq(preferred || '');

  const present = [], missing = [];
  let earned = 0, total = 0;

  // Score required skills (weight 2)
  for (const skill of Object.keys(reqFreq)) {
    const ns      = normalizeText(skill);
    const escaped = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found   = new RegExp('\\b' + escaped + '\\b').test(normResume);
    total  += 2;
    if (found) { present.push(skill); earned += 2; }
    else        { missing.push(skill); }
  }
  // Score preferred skills (weight 1) — only those not already in required
  for (const skill of Object.keys(prefFreq)) {
    if (reqFreq[skill]) continue; // already counted
    const ns      = normalizeText(skill);
    const escaped = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found   = new RegExp('\\b' + escaped + '\\b').test(normResume);
    total  += 1;
    if (found) { present.push(skill + ' ✦'); earned += 1; }
    else        { missing.push(skill + ' ✦'); }
  }

  // If no skills were found in the JD at all, fall back to a simple word-overlap score
  // so we don't show a misleading 0% on niche JDs that happen to have no ALL_SKILLS hits.
  if (total === 0) {
    const normJd  = normalizeText(jdText);
    const jdWords = [...new Set(normJd.split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.has(w)))];
    const hits    = jdWords.filter(w => normResume.includes(w)).length;
    const fallback = jdWords.length > 0 ? Math.round((hits / jdWords.length) * 100) : 50;
    return { present, missing, score: fallback, total: 0, noSkillsFound: true };
  }
  const score = Math.round((earned / total) * 100);
  return { present, missing, score, total: present.length + missing.length };
}

// ── computeResumeJobScore — ATS-grade scorer for resume auto-selection ─
//
//  Factor 1 — Role category match          (40%)
//    Detects the role the JD targets and checks if the resume targets the same.
//    Same role → 100.  Different role → 0.  Unknown → 50 (neutral).
//
//  Factor 2 — Required keyword coverage    (30%)
//    % of JD's required-section skills found in resume (with synonym expansion).
//    Required skills count 2× preferred in the denominator.
//
//  Factor 3 — Distinctive phrase coverage  (20%)
//    % of the JD role's signature phrases found in the resume.
//    Phrases chosen specifically to distinguish similar roles (PM vs PgM, etc.)
//
//  Factor 4 — Canonical role title present  (7%)
//    Does the resume explicitly contain any known title for this role?
//
//  Factor 5 — Bigram phrase overlap         (3%)
//    2-word phrase similarity; catches compound role-specific terms.
//
function computeResumeJobScore(resumeText, jdText, jobTitle) {
  const normResume = normalizeText(resumeText);
  const normJd     = normalizeText(`${jobTitle || ''} ${jdText}`);

  // Factor 1: Role category match (40%)
  const jdRole     = detectRole(normJd);
  const resumeRole = detectRole(normResume);
  let roleMatchScore;
  if (!jdRole.role || !resumeRole.role) roleMatchScore = 50;
  else if (jdRole.role === resumeRole.role)  roleMatchScore = 100;
  else                                        roleMatchScore = 0;

  // Factor 2: Required keyword coverage (30%)
  const { required } = parseJDSections(jdText);
  const reqFreq       = extractSkillFreq(required || jdText);
  const reqSkills     = Object.keys(reqFreq);
  let reqHits = 0;
  for (const skill of reqSkills) {
    const ns      = normalizeText(skill);
    const escaped = ns.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp('\\b' + escaped + '\\b').test(normResume)) reqHits++;
  }
  const reqScore = reqSkills.length > 0 ? Math.round((reqHits / reqSkills.length) * 100) : 50;

  // Factor 3: Distinctive phrase coverage (20%)
  let distinctiveScore = 50;
  if (jdRole.role && ROLE_TAXONOMY[jdRole.role]) {
    const phrases = ROLE_TAXONOMY[jdRole.role].distinctive;
    const hits    = phrases.filter(p => normResume.includes(normalizeText(p))).length;
    distinctiveScore = phrases.length > 0 ? Math.round((hits / phrases.length) * 100) : 50;
  }

  // Factor 4: Canonical role title in resume (7%)
  let titleScore = 0;
  if (jdRole.role && ROLE_TAXONOMY[jdRole.role]) {
    titleScore = ROLE_TAXONOMY[jdRole.role].titles.some(t => normResume.includes(normalizeText(t))) ? 100 : 0;
  } else {
    const tw = (jobTitle || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
                 .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    titleScore = tw.length > 0 ? Math.round(tw.filter(w => normResume.includes(w)).length / tw.length * 100) : 0;
  }

  // Factor 5: Bigram phrase overlap (3%)
  const jdBigrams  = [...extractBigrams(jdText)].filter(bg => {
    const [a, b] = bg.split(' ');
    return !STOP_WORDS.has(a) && !STOP_WORDS.has(b);
  });
  const bigramHits  = jdBigrams.filter(bg => normResume.includes(bg)).length;
  const bigramScore = jdBigrams.length > 0 ? Math.round((bigramHits / jdBigrams.length) * 100) : 0;

  return (
    roleMatchScore   * 0.40 +
    reqScore         * 0.30 +
    distinctiveScore * 0.20 +
    titleScore       * 0.07 +
    bigramScore      * 0.03
  );
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
  const modelId = model || 'gemini-2.0-flash';
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
    model: model || 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
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
  // Return text even if truncated — callers decide how to handle
  return (data.content[0]?.text || '') + (data.stop_reason === 'max_tokens' ? '\n__TRUNCATED__' : '');
}

async function analyzeResumeVsJD(resume, job) {
  const cacheKey = `${resume.id}-${job.id}`;
  if (state.analyses[cacheKey]) {
    return { result: state.analyses[cacheKey], cached: true };
  }

  const resumeSnip = resume.text.slice(0, 8000);
  const jdSnip     = job.text.slice(0, 8000);

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
  const resumeSnip = resume.text.slice(0, 6000);
  const jdSnip     = job.text.slice(0, 6000);

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
  const resumeSnip = resume.text.slice(0, 6000);
  const jdSnip     = job.text.slice(0, 6000);

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
  const exists = activeApps().find(a => a.jobId === jobId && a.status === 'applied' && a.resumeId === resumeId);
  if (exists) {
    toast('Already marked as applied with this resume', 'error', 3000);
    return;
  }

  const app = {
    id:        uid(),
    jobId,
    resumeId:  resumeId || '',
    status:    'applied',
    notes:     '',
    profileId: state.activeProfileId,
    date:      new Date().toISOString()
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
  const _apps = activeApps();
  document.getElementById('dashApps').textContent    = _apps.length;

  // ── Analytics row ──────────────────────────────────────────────────
  const analyticsEl = document.getElementById('dashAnalytics');
  if (analyticsEl) {
    const totalApplied   = _apps.filter(a => a.status !== 'saved').length;
    const interviews     = _apps.filter(a => a.status === 'interview').length;
    const offers         = _apps.filter(a => a.status === 'offer').length;
    const responseRate   = totalApplied > 0 ? Math.round((interviews + offers) / totalApplied * 100) : 0;
    const oneWeekAgo     = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const thisWeek       = _apps.filter(a => new Date(a.date).getTime() > oneWeekAgo).length;
    const needsFollowUp  = _apps.filter(a =>
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
  const recent   = [..._apps].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,5);

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

  // Show which profile's resumes are being shown when there are multiple profiles
  const activeP = state.profiles.find(x => x.id === state.activeProfileId) || state.profiles[0];
  const profileBadge = state.profiles.length > 1 && activeP
    ? `<div style="font-size:11px;color:#6b7280;margin-bottom:8px">Showing resumes for <strong>${escHtml(activeP.displayName)}</strong></div>`
    : '';

  if (state.resumes.length === 0) {
    listEl.innerHTML = profileBadge + `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#9ca3af" stroke-width="2"/><polyline points="14 2 14 8 20 8" stroke="#9ca3af" stroke-width="2"/></svg>
      <p>No resumes for ${escHtml(activeP ? activeP.displayName : 'this profile')}</p>
      <small>Upload a PDF or paste resume text above</small>
    </div>`;
    return;
  }

  listEl.innerHTML = profileBadge + state.resumes.map(r => `
    <div class="item-card">
      <div class="card-title">${escHtml(r.name)}</div>
      <div class="card-sub">${wordCount(r.text)} words · Added ${fmtDate(r.date)}</div>
      <div class="card-actions">
        <button class="btn-link" data-action="view-resume" data-id="${r.id}">View</button>
        <button class="btn-link" data-action="download-resume-pdf" data-id="${r.id}">PDF</button>
        <button class="btn-link" data-action="download-resume" data-id="${r.id}">.txt</button>
        <button class="btn-link" data-action="attach-resume" data-id="${r.id}" title="Inject this resume into the file upload field on the active job page">📎 Attach</button>
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
  await saveResumes();
  renderResumes();
  toast('Resume deleted');
};

function triggerTextDownload(text, filename) {
  // Use chrome.downloads API — the only reliable download method in MV3 extension pages
  const dataUrl = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
  chrome.downloads.download({ url: dataUrl, filename });
}

window.downloadResume = (id) => {
  const r = state.resumes.find(x => x.id === id);
  if (!r) return;
  const filename = r.name.replace(/[^a-zA-Z0-9 _\-–]/g, '').trim() + '.txt';
  triggerTextDownload(r.text, filename);
  toast(`Downloaded "${r.name}"`, 'success', 3000);
};

window.downloadResumePdf = (id) => {
  const r = state.resumes.find(x => x.id === id);
  if (!r) return;
  const activeP = state.profiles.find(x => x.id === state.activeProfileId) || state.profiles[0] || {};
  const profileLinks = { linkedin: activeP.linkedin, portfolio: activeP.portfolio, github: activeP.github, email: activeP.email };
  const html = resumeTextToHtml(r.text, r.name, profileLinks);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) toast('Allow popups for this extension to open PDF', 'error', 4000);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

// ── Generate a formatted PDF from resume text ─────────────────────────
function textToPdf(text) {
  const PW = 612, PH = 792;
  const MX = 50;                    // left/right margin
  const CW = PW - 2 * MX;          // content width = 512pt
  const TOP = 748, BOT = 52;        // usable y range

  // Helvetica average char width factor (pts per pt of font size)
  const CWR = 0.556, CWB = 0.600;
  const tw = (s, fs, bold) => s.length * fs * (bold ? CWB : CWR);

  // Escape PDF string: handle special chars + common Unicode
  const pesc = s => (s || '')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/\u2018|\u2019/g, "'").replace(/\u201C|\u201D/g, '"')
    .replace(/[^\x20-\x7E]/g, ' ');

  // Word-wrap a string to fit maxPts width
  function wrapLine(str, fs, bold, maxPts) {
    const max = Math.floor(maxPts / (fs * (bold ? CWB : CWR)));
    if (str.length <= max) return [str];
    const out = [], words = str.split(' ');
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (t.length <= max) { cur = t; }
      else { if (cur) out.push(cur); cur = w.slice(0, max); }
    }
    if (cur) out.push(cur);
    return out.length ? out : [str.slice(0, max)];
  }

  // Date pattern (month YYYY – month YYYY | Present)
  const DP = '((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+\\d{4}' +
             '\\s*[\\u2013\\-]\\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+)?(?:\\d{4}|Present))';
  function extractDate(line) {
    let m = line.match(new RegExp('^(.+?)\\s+' + DP + '\\s*$', 'i'));
    if (m) return { left: m[1].trim(), date: m[2].trim() };
    m = line.match(new RegExp('^(.+?)\\s*\\|\\s*' + DP + '\\s*$', 'i'));
    if (m) return { left: m[1].trim(), date: m[2].trim() };
    return null;
  }

  // ── Parse resume text into typed render items ──────────────────────
  const raw = text.split('\n').map(l => l.trim());
  const items = [];
  let i = 0;
  while (i < raw.length && !raw[i]) i++;

  // Name + contact header
  if (i < raw.length) {
    const first = raw[i];
    if (first.includes('|')) {
      const pi = first.indexOf('|');
      const namePart = first.slice(0, pi).trim();
      const rest     = first.slice(pi + 1).trim();
      if (namePart && !namePart.includes('@') && !/\+?\d[\d\s\-()]{5,}/.test(namePart)) {
        items.push({ type: 'name',    text: namePart });
        items.push({ type: 'contact', text: rest });
      } else {
        items.push({ type: 'contact', text: first });
      }
    } else {
      items.push({ type: 'name', text: first });
      i++;
      while (i < raw.length && !raw[i]) i++;
      if (i < raw.length &&
          (raw[i].includes('|') || raw[i].includes('@') || /\+?\d[\d\s\-()]{5,}/.test(raw[i]))) {
        items.push({ type: 'contact', text: raw[i] });
      } else { i--; }
    }
    i++;
  }

  for (; i < raw.length; i++) {
    const line = raw[i];
    if (!line) { items.push({ type: 'gap' }); continue; }
    // ALL-CAPS section heading
    if (/^[A-Z][A-Z\s&\/\-]{2,}$/.test(line) && !/\d/.test(line) &&
        !line.includes('|') && !/^[•\-\*]/.test(line)) {
      items.push({ type: 'section', text: line.trim() }); continue;
    }
    // Bullet
    if (/^[•\-\*]\s/.test(line)) {
      items.push({ type: 'bullet', text: line.replace(/^[•\-\*]\s*/, '').trim() }); continue;
    }
    // Entry with date
    const ed = extractDate(line);
    if (ed) { items.push({ type: 'entry', left: ed.left, date: ed.date }); continue; }
    // Regular / subtitle text
    items.push({ type: 'text', text: line });
  }

  // ── Render items → PDF drawing commands ────────────────────────────
  const BLUE = [0.18, 0.46, 0.71];
  const pages = [];
  let cmds = [], y = TOP;

  function newPage() {
    if (cmds.length) pages.push(cmds);
    cmds = []; y = TOP;
  }
  function need(h) { if (y - h < BOT) newPage(); }

  // Absolute-position text element (saves/restores colour state)
  function txt(str, x, yy, fs, bold, rgb) {
    const [r, g, b] = rgb || [0, 0, 0];
    cmds.push(`q ${r} ${g} ${b} rg BT ${bold?'/F2':'/F1'} ${fs} Tf 1 0 0 1 ${x.toFixed(1)} ${yy.toFixed(1)} Tm (${pesc(str)}) Tj ET Q\n`);
  }
  // Horizontal rule
  function rule(yy, rgb) {
    const [r, g, b] = rgb || [0, 0, 0];
    cmds.push(`q 0.5 w ${r} ${g} ${b} RG ${MX} ${yy.toFixed(1)} m ${PW-MX} ${yy.toFixed(1)} l S Q\n`);
  }

  let prevType = '';
  for (const item of items) {

    if (item.type === 'name') {
      const fs = 18, lh = 26;
      need(lh);
      const x = Math.max(MX, (PW - tw(item.text, fs, true)) / 2);
      txt(item.text, x, y, fs, true);
      y -= lh;

    } else if (item.type === 'contact') {
      const fs = 10, lh = 15;
      const line = item.text.split(/\s*\|\s*/).map(t => t.trim()).filter(Boolean).join('  |  ');
      const wrapped = wrapLine(line, fs, false, CW);
      need(wrapped.length * lh + 4);
      for (const wl of wrapped) {
        const x = Math.max(MX, (PW - tw(wl, fs, false)) / 2);
        txt(wl, x, y, fs, false, [0.25, 0.25, 0.25]);
        y -= lh;
      }
      y -= 4;

    } else if (item.type === 'gap') {
      y -= 4;

    } else if (item.type === 'section') {
      const fs = 11, lh = 20;
      need(lh + 8);
      y -= 6;
      txt(item.text, MX, y, fs, true, BLUE);
      rule(y - 2, BLUE);
      y -= lh;

    } else if (item.type === 'entry') {
      const fs = 10.5, lh = 15;
      const dateFS = 9.5;
      const dateW = tw(item.date, dateFS, false);
      const dx = PW - MX - dateW;
      const leftLines = wrapLine(item.left, fs, true, dx - MX - 8);
      need(lh * leftLines.length);
      txt(leftLines[0], MX, y, fs, true);
      txt(item.date, dx, y, dateFS, false, [0.4, 0.4, 0.4]);
      y -= lh;
      for (let k = 1; k < leftLines.length; k++) {
        need(lh); txt(leftLines[k], MX, y, fs, true); y -= lh;
      }

    } else if (item.type === 'bullet') {
      const fs = 10.5, lh = 14;
      const indentX = MX + 14;
      const wrapped = wrapLine(item.text, fs, false, CW - 14);
      need(lh);
      for (let k = 0; k < wrapped.length; k++) {
        if (k > 0 && y - lh < BOT) newPage();
        if (k === 0) txt('-', MX + 2, y, fs, false);
        txt(wrapped[k], indentX, y, fs, false);
        y -= lh;
      }

    } else if (item.type === 'text') {
      // Subtitle line (immediately after an entry): slightly smaller + gray
      const isSubtitle = prevType === 'entry';
      const fs = isSubtitle ? 10 : 10.5, lh = 14;
      const color = isSubtitle ? [0.25, 0.25, 0.25] : [0, 0, 0];
      const wrapped = wrapLine(item.text, fs, false, CW);
      for (const wl of wrapped) {
        need(lh);
        txt(wl, MX + (isSubtitle ? 2 : 0), y, fs, false, color);
        y -= lh;
      }
    }

    prevType = item.type;
  }

  if (cmds.length) pages.push(cmds);
  if (!pages.length) pages.push([]);

  // ── Assemble PDF objects ────────────────────────────────────────────
  // IDs: 1=Catalog, 2=Pages, 3..2+nP=Page, 3+nP..2+2nP=Content, 3+2nP=F1(reg), 4+2nP=F2(bold)
  const nP = pages.length;
  const FP = 3, FC = FP + nP, FT1 = FC + nP, FT2 = FT1 + 1, TOTAL = FT2;

  const obj = {};
  obj[1] = `<< /Type /Catalog /Pages 2 0 R >>\n`;
  obj[2] = `<< /Type /Pages /Kids [${Array.from({length:nP},(_,p)=>`${FP+p} 0 R`).join(' ')}] /Count ${nP} >>\n`;
  for (let p = 0; p < nP; p++) {
    obj[FP+p] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}]\n` +
                `   /Contents ${FC+p} 0 R /Resources << /Font << /F1 ${FT1} 0 R /F2 ${FT2} 0 R >> >> >>\n`;
    const s = pages[p].join('');
    obj[FC+p] = `<< /Length ${s.length} >>\nstream\n${s}endstream\n`;
  }
  obj[FT1] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\n`;
  obj[FT2] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\n`;

  // Build body with byte-accurate xref offsets
  const hdr = '%PDF-1.4\n';
  let off = hdr.length;
  const offsets = {}, parts = [];
  for (let n = 1; n <= TOTAL; n++) {
    offsets[n] = off;
    const s = `${n} 0 obj\n${obj[n]}endobj\n`;
    parts.push(s); off += s.length;
  }
  const body = parts.join('');
  const xref = `xref\n0 ${TOTAL+1}\n0000000000 65535 f \n` +
    Array.from({length: TOTAL}, (_, k) => offsets[k+1].toString().padStart(10,'0') + ' 00000 n \n').join('');
  return hdr + body + xref +
    `trailer\n<< /Size ${TOTAL+1} /Root 1 0 R >>\nstartxref\n${hdr.length+body.length}\n%%EOF\n`;
}

// ── Attach resume to file input on the active job page ────────────────
async function attachResumeToPage(id) {
  const r = state.resumes.find(x => x.id === id);
  if (!r) return;

  // Build a clean filename as .pdf — accepted universally by job sites
  const activeP = state.profiles.find(x => x.id === state.activeProfileId) || state.profiles[0] || {};
  const firstName = (activeP.firstName || 'Resume').replace(/[^a-zA-Z0-9]/g, '');
  const cleanName = r.name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim().replace(/\s+/g, '_');
  const filename  = `${firstName}_Resume_${cleanName}.pdf`;

  // Generate PDF in sidepanel context, then pass the string to the page
  const pdfContent = textToPdf(r.text);

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { toast('No active tab found', 'error'); return; }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (pdf, fname) => {
        // Find all file inputs; prefer ones hinting at resume/CV upload
        const inputs = [...document.querySelectorAll('input[type="file"]')];
        if (inputs.length === 0) return { ok: false, msg: 'No file upload field found on this page' };

        const target = inputs.find(inp => {
          const hint = [inp.getAttribute('aria-label'), inp.id, inp.name,
                        inp.getAttribute('data-testid'), inp.getAttribute('placeholder')]
            .filter(Boolean).join(' ').toLowerCase();
          return /resume|cv|upload|document|attach/i.test(hint);
        }) || inputs[0];

        // Create a PDF File — universally accepted by job sites
        const blob = new Blob([pdf], { type: 'application/pdf' });
        const file = new File([blob], fname, { type: 'application/pdf' });
        const dt   = new DataTransfer();
        dt.items.add(file);
        target.files = dt.files;
        target.dispatchEvent(new Event('change', { bubbles: true }));
        target.dispatchEvent(new Event('input',  { bubbles: true }));

        // Scroll the input into view so user can confirm
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return { ok: true };
      },
      args: [pdfContent, filename]
    });

    const res = results?.[0]?.result;
    if (res?.ok) {
      toast(`📎 "${r.name}" attached to upload field`, 'success', 3500);
    } else {
      toast(res?.msg || 'Could not attach — try downloading the PDF instead', 'error', 4000);
    }
  } catch (err) {
    toast('Attach failed: ' + (err.message || 'unknown error'), 'error', 4000);
  }
}

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
    const isApplied = activeApps().some(a => a.jobId === j.id && a.status === 'applied');
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
  const alreadyApplied = activeApps().some(a => a.jobId === id && a.status === 'applied');
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

window.confirmResumeForApp = async (appId) => {
  const resumeId = (document.getElementById('autoApplyResumeSelect') || {}).value || '';
  const app = state.applications.find(a => a.id === appId);
  if (app && resumeId) {
    app.resumeId = resumeId;
    await save(SK.APPLICATIONS, state.applications);
    const resume = state.resumes.find(r => r.id === resumeId);
    toast(`Resume "${resume ? resume.name : ''}" linked!`, 'success', 2000);
    renderTracker();
    renderDashboard();
  }
  closeModal();
};

window.confirmMarkApplied = async (jobId) => {
  const resumeId = (document.getElementById('appliedResumeSelect') || {}).value || '';
  const job    = state.jobs.find(j => j.id === jobId);
  const resume = state.resumes.find(r => r.id === resumeId);
  const app = { id: uid(), jobId, resumeId, status: 'applied', notes: '', profileId: state.activeProfileId, date: new Date().toISOString() };
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
    if (sel) { sel.value = jobId; populateAnalyzeSelects(); autoSelectBestResume(jobId); }
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

  // Restore job selection only (not resume — resume is always auto-picked below)
  if (jVal && jSel.querySelector(`option[value="${jVal}"]`)) jSel.value = jVal;

  // Always auto-select the best matching resume for whatever job is selected
  if (jSel.value) {
    autoSelectBestResume(jSel.value);
  }
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

  const showTailorBtn = match.score < 80 && state.settings.apiKey;
  const tailorHtml = showTailorBtn ? `
    <div style="margin-top:12px;padding:10px 12px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div>
        <div class="text-sm text-bold" style="color:#7c3aed">Match below 80%</div>
        <div style="font-size:11px;color:#6b7280">AI can tailor your resume to better fit this JD</div>
      </div>
      <button class="btn-sm btn-primary" id="btnTailorResume" style="background:#7c3aed;white-space:nowrap;flex-shrink:0">✨ Tailor Resume</button>
    </div>` : '';

  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
      <div>
        <div class="text-bold" style="font-size:22px;color:${scoreColor(match.score)}">${match.score}%</div>
        <div class="text-sm">ATS Match</div>
      </div>
      <div style="flex:1">
        <div class="progress-bar"><div class="progress-fill" style="width:${match.score}%;background:${scoreColor(match.score)}"></div></div>
        <div class="text-sm mt-4">${match.noSkillsFound ? 'Estimated from word overlap (no structured skills detected in JD)' : `${match.present.length} of ${match.total} JD keywords found in resume`}</div>
      </div>
    </div>

    ${match.missing.length > 0 ? `
    <div style="margin-bottom:8px">
      <div class="text-sm text-bold" style="margin-bottom:4px;color:var(--danger)">❌ Missing Keywords (${match.missing.length})</div>
      <div class="kw-chips">${match.missing.slice(0,15).map(k=>`<span class="kw-chip missing">${escHtml(k)}</span>`).join('')}</div>
    </div>` : ''}

    ${match.present.length > 0 ? `
    <div>
      <div class="text-sm text-bold" style="margin-bottom:4px;color:var(--success)">✓ Present Keywords (${match.present.length})</div>
      <div class="kw-chips">${match.present.slice(0,15).map(k=>`<span class="kw-chip present">${escHtml(k)}</span>`).join('')}</div>
    </div>` : ''}

    ${tailorHtml}
  `;

  if (showTailorBtn) {
    document.getElementById('btnTailorResume').addEventListener('click', () => tailorResumeForJob(resume, job));
  }
}

// ── Resume Text → Print-ready HTML ────────────────────────────────────
function resumeTextToHtml(text, title, links) {
  links = links || {};
  const BLUE = '#2E75B6';

  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function makeLink(href, label) {
    if (!href) return esc(label);
    const h = /^https?:\/\//i.test(href) ? href : 'https://' + href;
    return `<a href="${esc(h)}">${esc(label)}</a>`;
  }

  function renderContact(line) {
    return line.split(/\s*\|\s*/).map(p => {
      const t = p.trim();
      if (/^linkedin$/i.test(t))  return makeLink(links.linkedin, 'LinkedIn');
      if (/^portfolio$/i.test(t)) return makeLink(links.portfolio || 'https://www.mohakgarg.com', 'Portfolio');
      if (/^github$/i.test(t))    return makeLink(links.github, 'GitHub');
      if (t.includes('@'))        return `<a href="mailto:${esc(t)}">${esc(t)}</a>`;
      if (/^https?:\/\//i.test(t)) return `<a href="${esc(t)}">${esc(t)}</a>`;
      return esc(t);
    }).join(' | ');
  }

  // Date range pattern (reused in multiple places)
  const D = `((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+\\d{4}\\s*[–\\-]\\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+)?\\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\s+\\d{4}\\s*[–\\-]\\s*Present)`;

  // Extract date from end of line — after spaces OR after last pipe
  function extractDate(line) {
    let m = line.match(new RegExp(`^(.*?)\\s+${D}\\s*$`, 'i'));
    if (m) return { left: m[1].trim(), date: m[2].trim() };
    m = line.match(new RegExp(`^(.*?)\\s*\\|\\s*${D}\\s*$`, 'i'));
    if (m) return { left: m[1].trim(), date: m[2].trim() };
    return null;
  }

  // Parse an education line that may have all fields pipe-separated:
  // "University, City | Degree | Month YYYY – Month YYYY | GPA: X"
  function parseEduLine(line) {
    const parts = line.split(/\s*\|\s*/);
    let institution = '', degParts = [], date = '', gpa = '';
    const dateRe = new RegExp(`^${D}$`, 'i');
    parts.forEach((p, idx) => {
      if (dateRe.test(p.trim())) { date = p.trim(); return; }
      if (/^gpa/i.test(p.trim()))  { gpa = p.trim(); return; }
      if (idx === 0) institution = p.trim();
      else degParts.push(p.trim());
    });
    // Remove any GPA that ended up in degParts
    const degStr = degParts.filter(d => !/^gpa/i.test(d)).join(' | ');
    const gpaFinal = gpa || degParts.find(d => /^gpa/i.test(d)) || '';
    return { institution, degree: degStr, date, gpa: gpaFinal };
  }

  const lines = text.split('\n').map(l => l.trim());
  let body = '';
  let section = '';
  let prevType = 'heading';
  let i = 0;
  while (i < lines.length && !lines[i]) i++;

  // ── Header: Name + Contact ──────────────────────────────────────────
  if (i < lines.length) {
    const first = lines[i];
    if (first.includes('|')) {
      // "NAME | phone | email | ..." all on one line
      const pipeIdx = first.indexOf('|');
      const namePart = first.slice(0, pipeIdx).trim();
      const rest = first.slice(pipeIdx + 1).trim();
      if (namePart && !namePart.includes('@') && !/\+?\d[\d\s\-()]{5,}/.test(namePart)) {
        body += `<div class="name">${esc(namePart)}</div>`;
        body += `<div class="contact">${renderContact(rest)}</div>`;
      } else {
        body += `<div class="contact">${renderContact(first)}</div>`;
      }
    } else {
      body += `<div class="name">${esc(first)}</div>`;
      i++;
      while (i < lines.length && !lines[i]) i++;
      if (i < lines.length && (lines[i].includes('|') || lines[i].includes('@') || /\+?\d[\d\s\-()]{5,}/.test(lines[i]))) {
        body += `<div class="contact">${renderContact(lines[i])}</div>`;
      }
    }
    i++;
  }

  // ── Body ────────────────────────────────────────────────────────────
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Section heading: ALL CAPS, no digits, no pipe, no bullet
    if (/^[A-Z][A-Z\s&\/\-]{2,}$/.test(line) && !/\d/.test(line) && !line.includes('|') && !/^[•\-\*]/.test(line)) {
      section = line.trim();
      prevType = 'heading';
      body += `<div class="sh">${esc(line)}</div>`;
      continue;
    }

    // Bullet
    if (/^[•\-\*]\s/.test(line)) {
      prevType = 'bullet';
      body += `<div class="bul">${esc(line.replace(/^[•\-\*]\s*/, ''))}</div>`;
      continue;
    }

    // ── EDUCATION section: handle all formats ──
    if (section === 'EDUCATION') {
      // Does the line contain a date anywhere?
      const hasDate = new RegExp(D, 'i').test(line);
      if (hasDate || (line.includes('|') && /university|institute|college|school/i.test(line))) {
        const edu = parseEduLine(line);
        if (edu.institution) {
          prevType = 'entry';
          body += `<div class="er"><span>${esc(edu.institution)}</span><span class="dt">${esc(edu.date)}</span></div>`;
          const degLine = [edu.degree, edu.gpa].filter(Boolean).join(' | ');
          if (degLine) body += `<div class="deg">${esc(degLine)}</div>`;
          continue;
        }
      }
      // Standalone degree/GPA line
      if (/master|bachelor|phd|doctor|gpa|technology|engineering|science|arts/i.test(line)) {
        prevType = 'degree';
        body += `<div class="deg">${esc(line)}</div>`;
        continue;
      }
    }

    // Skill category: "Label: items" — label ≤ 45 chars, no sentence punctuation
    const ci = line.indexOf(':');
    if (ci > 0 && ci <= 45 && !/[.,!?]/.test(line.slice(0, ci)) && !line.slice(0, ci).includes('|') && line.slice(ci + 1).trim()) {
      prevType = 'skill';
      body += `<div class="sk"><strong>${esc(line.slice(0, ci))}:</strong> ${esc(line.slice(ci + 1).trim())}</div>`;
      continue;
    }

    // Entry header: line with date at end (job roles, edu fallback)
    const dated = extractDate(line);
    if (dated) {
      prevType = 'entry';
      body += `<div class="er"><span>${esc(dated.left)}</span><span class="dt">${esc(dated.date)}</span></div>`;
      continue;
    }

    // PROJECTS: title only on first line after heading or after bullets; rest are paragraphs
    if (/PROJECT/i.test(section)) {
      if (prevType === 'heading' || prevType === 'bullet') {
        prevType = 'project-title';
        body += `<div class="pn">${esc(line)}</div>`;
      } else {
        prevType = 'para';
        body += `<div class="pa">${esc(line)}</div>`;
      }
      continue;
    }

    prevType = 'para';
    body += `<div class="pa">${esc(line)}</div>`;
  }

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${esc(title)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Calibri,Arial,sans-serif;font-size:9.5pt;color:#000;background:#fff;padding:.4in .5in;width:8.5in}
a{color:#1155CC;text-decoration:underline}
.name{text-align:center;font-size:14pt;font-weight:700;letter-spacing:0.5px;margin-bottom:4px}
.contact{text-align:center;font-size:9pt;margin-bottom:8px}
.sh{color:${BLUE};font-weight:700;font-size:10pt;border-bottom:1.5px solid ${BLUE};margin-top:10px;margin-bottom:4px;padding-bottom:1px}
.er{display:flex;justify-content:space-between;align-items:baseline;font-weight:700;font-size:9.5pt;margin-top:6px;margin-bottom:2px}
.er span:first-child{flex:1;margin-right:8px}
.dt{font-weight:400;font-style:italic;font-size:9pt;white-space:nowrap}
.deg{font-style:italic;font-size:9pt;margin-bottom:2px;margin-top:2px}
.bul{font-size:9pt;line-height:1.42;margin-bottom:2px;padding-left:14px;text-indent:-9px;text-align:justify}
.bul::before{content:"• "}
.sk{font-size:9pt;line-height:1.42;margin-bottom:3px;text-align:justify}
.pn{font-weight:700;font-size:9.5pt;margin-top:6px;margin-bottom:2px}
.pa{font-size:9pt;line-height:1.42;margin-bottom:2px;text-align:justify}
@media print{@page{size:letter;margin:0}body{padding:.4in .5in;width:8.5in}}
</style>
<script>
window.addEventListener('load',function(){
  var body=document.body;
  var max=800; // aggressive target — ensures single page even after reflow differences
  // Pass 1: apply zoom based on initial scrollHeight
  var h=body.scrollHeight;
  if(h>max) body.style.zoom=(max/h).toFixed(4);
  // Pass 2: after reflow, check again — if still over, also reduce font size
  setTimeout(function(){
    var h2=body.scrollHeight;
    if(h2>max){
      // Zoom alone didn't fully work — reduce base font size as second lever
      var ratio=max/h2;
      var fs=parseFloat(window.getComputedStyle(body).fontSize)||12.67;
      body.style.fontSize=(fs*ratio).toFixed(2)+'px';
    }
    // Pass 3: final check, then print
    setTimeout(function(){
      var h3=body.scrollHeight;
      if(h3>max) body.style.zoom=((parseFloat(body.style.zoom)||1)*(max/h3)).toFixed(4);
      setTimeout(window.print,400);
    },150);
  },200);
});
<\/script>
</head><body>${body}</body></html>`;
}

// ── Tailor Resume ─────────────────────────────────────────────────────
async function tailorResumeForJob(resume, job) {
  const btn = document.getElementById('btnTailorResume');
  if (btn) { btn.disabled = true; btn.textContent = '✨ Tailoring…'; }

  try {
    const activeP = state.profiles.find(x => x.id === state.activeProfileId) || state.profiles[0] || {};
    const candidateName = [activeP.firstName, activeP.lastName].filter(Boolean).join(' ') || 'Candidate';

    // Validate resume has enough content before calling AI
    if (!resume.text || resume.text.trim().length < 200) {
      toast('Resume text is too short to tailor. Please upload a more complete resume.', 'error', 5000);
      return;
    }

    // Normalize PDF-extracted text: collapse multiple spaces, fix line breaks
    const cleanResumeText = resume.text
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')   // collapse runs of spaces/tabs to single space
      .replace(/\n{3,}/g, '\n\n')   // max one blank line between sections
      .trim();

    // Detect role type BEFORE building systemMsg (used inside the template)
    const jdRole = detectRole((job.title || '') + ' ' + job.text.slice(0, 400));
    const isPmRole = jdRole.role === 'product_manager' || jdRole.role === 'program_manager';

    const systemMsg = `You are an expert resume writer specializing in ATS optimization. Tailor the given resume to match the job description as closely as possible.

REQUIRED OUTPUT FORMAT — follow this exactly:

Line 1: Full name only (e.g. MOHAK GARG)
Line 2: phone | email | LinkedIn | Portfolio

SECTION HEADING

For Work Experience jobs:
Job Title | Company Name | City, Country | Month YYYY – Month YYYY
• bullet point
• bullet point

For Education entries:
University Name, City, State | Month YYYY – Month YYYY
Degree | GPA: X.X/Y.Y

For Skills:
Category: skill1 | skill2 | skill3

For Projects:
Project Name
• bullet point describing what was done
• bullet point describing results

STRICT RULES — never break these:
- ONE PAGE ONLY — HARD LIMIT: The entire resume MUST fit on one printed page. Never overflow onto page 2. When in doubt, CUT content — shorter is better than two pages.
- WORD COUNT: Target 540–580 words total. Count every word including skills. Do NOT exceed 580 words under any circumstances.
- SECTION SIZE LIMITS (strictly enforce):
  • Professional Summary: EXACTLY 3 lines — no more
  • Work Experience: most recent role = 6 bullets; older roles = 3–4 bullets
  • Skills: keep ONLY the exact same category names as the original — do NOT add new categories. Up to 2 lines per category.
  • Projects: 3 bullets per project
  • Education: keep as-is
- Keep EVERY section that exists in the original (do not remove any section)
- Keep every company name, date range, location, school, degree, GPA exactly as given
- Keep contact info (name, email, phone, links) completely untouched
- Never invent or change any number, metric, or percentage
- Never fabricate a new work experience bullet, company, or project not in the original
- Add missing JD keywords ONLY inside existing Skills categories — do not create new categories
- All project descriptions must use • bullet points (never plain paragraphs)
- No markdown, no code fences, no commentary before or after the resume

PROFESSIONAL SUMMARY RULES (critical — read carefully):
- The summary describes who the CANDIDATE IS based on their actual experience — NEVER describe them as an Intern even if the target role is an internship
- NEVER write phrases like "seeking [role] roles" or "looking for" — describe their experience and value, not their job search
- If the target job title contains "Intern", write the summary as if applying as an experienced professional: "Product Manager with 3 years..." NOT "Product Management Intern with..."
- 3 lines max. Mirror JD language. Start with the candidate's strongest relevant identity.

JOB TITLE NORMALIZATION (apply to Work Experience titles only):
- Look at the TARGET ROLE. Map every Work Experience title to the closest standard title in that domain.
- TARGET ROLE MAPPING RULES:
  • If target role is Product Management (even Intern) → use "Product Manager" in Work Experience (not Intern)
  • If target role is Program Management → use "Program Manager"
  • If target role is Project Management → use "Project Manager"
  • If target role is Software / Engineering → keep engineering titles as-is
- NEVER add Intern, Trainee, Associate, or Junior to Work Experience titles unless that exact word is in the ORIGINAL title for that role
- Never invent seniority (do not add Senior/Lead/Director if not in the original)
- Keep company name, dates, location on the same line — only the title word(s) change

WHAT TO IMPROVE:
- PRIORITY 1: Inject every keyword from the MISSING KEYWORDS list — weave into existing bullets where natural; otherwise add to Skills section
- Weave additional keywords from the JD naturally into existing bullets
- Rewrite the Professional Summary to mirror the JD's language — 3 lines, candidate-as-experienced-professional
- Reorder skills to put JD-matching ones first
- Upgrade weak action verbs while keeping all facts identical
- Within each role, reorder bullets so most JD-relevant appear first

` + (isPmRole ? `
BULLET POINT STRUCTURE — PM ROLES — MANDATORY:

EVERY Work Experience bullet MUST make THREE things painfully obvious to the reader:
  1. PROBLEM — what user/business problem existed (state it explicitly, don't hint at it)
  2. PRODUCT DECISION — the specific product or process decision YOU made
  3. MEASURABLE OUTCOME — a concrete number, %, time saved, or strong qualifier

STRUCTURE: Write as ONE sentence using this spine:
  "[Discovered/Found/Noticed] [explicit problem with data/context]; [product decision you took], [measurable outcome]"

Use a semicolon ";" to cleanly separate the problem from the action. No em dash "—".
Max 180 characters per bullet. Never invent numbers.

ABSOLUTELY FORBIDDEN opening verbs (they hide the problem):
  Launched, Built, Created, Developed, Led, Managed, Tracked, Established, Implemented,
  Delivered, Translated, Improved, Increased, Worked, Utilized, Leveraged, Facilitated

APPROVED problem-surfacing openers:
  Identified that..., Discovered that..., Found that..., Noticed that..., Recognized that...,
  Diagnosed..., Observed that..., Uncovered that..., Detected that...

TRANSFORMATION EXAMPLES — showing explicit vs implicit:

✗ IMPLICIT: "Improved sprint delivery from 65% to 85% completion rate"
✓ EXPLICIT: "Identified that 35% of sprint stories had no acceptance criteria, causing team to miss 65% completion; restructured grooming with 8-person team to add DoD for every story, recovering delivery to 85%"

✗ IMPLICIT: "Replaced manual workflows with self-serve submissions platform for 50+ users"
✓ EXPLICIT: "Discovered clients spent 20+ hrs/week on manual data entry with no self-serve option; designed and shipped submissions platform for 50+ users across 5 departments, eliminating the overhead entirely"

✗ IMPLICIT: "Surfaced feature adoption gaps via Tableau dashboards, raising satisfaction 25%"
✓ EXPLICIT: "Found that 60% of premium features had <10% adoption due to poor discoverability; built Tableau and Mixpanel dashboards to surface gaps, driving prioritization changes that raised satisfaction 25%"

✗ IMPLICIT: "Unblocked roadmap clarity for 40+ user stories by introducing value-complexity scoring"
✓ EXPLICIT: "Noticed roadmap had 40+ unranked stories causing stakeholder misalignment on priorities; introduced value-complexity scoring framework, cutting planning debates by 30% and achieving consensus in 2 sessions"` : `
BULLET POINT STRUCTURE (Work Experience):
- Start each bullet with a strong action verb (e.g. Built, Designed, Reduced, Automated, Delivered)
- Format: [Action verb] + [what you built/did] + [measurable result]
- Include a metric or qualifier in every bullet where the original has one
- Max 160 chars per bullet. One sentence, no sub-bullets`);

    // Compute missing keywords so the AI knows exactly what to inject
    const localMatch = getLocalMatch(cleanResumeText, job.text);
    const missingKws = localMatch.missing
      .map(k => k.replace(/\s*✦$/, '').trim())  // strip preferred marker
      .filter(Boolean);

    const missingSection = missingKws.length > 0
      ? `\n⚠️ CRITICAL — MISSING KEYWORDS (every single one MUST appear verbatim in your output) ⚠️\nSearch the JD for these terms and embed each one naturally into a bullet or Skill line. If no bullet fits, add it to Skills. Do NOT skip any:\n${missingKws.map(k => `• ${k}`).join('\n')}\n`
      : '';

    const userMsg = `Candidate: ${candidateName}
Role: ${job.title || ''} at ${job.company || ''}
${missingSection}
--- RESUME ---
${cleanResumeText}

--- JOB DESCRIPTION ---
${job.text.slice(0, 12000)}

${missingKws.length > 0 ? `FINAL REMINDER — before you finish, verify every keyword below appears in your output (exact phrase):\n${missingKws.map(k => `  ✓ ${k}`).join('\n')}` : ''}`;

    let tailored = await callAI(userMsg, systemMsg);

    // ── Post-process AI output ─────────────────────────────────────────
    // 1. Check if model hit output token limit
    const wasTruncated = tailored.endsWith('\n__TRUNCATED__');
    if (wasTruncated) tailored = tailored.slice(0, -'\n__TRUNCATED__'.length);

    // 2. Strip markdown code fences if the model wrapped the output
    tailored = tailored.replace(/^```[\w]*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

    // 3. Strip common preamble lines ("Here is your tailored resume:", etc.)
    const preambleRe = /^(here is|here's|below is|sure[,!]?|certainly[,!]?|of course[,!]?|i've tailored|i have tailored|tailored resume:|your tailored resume[:\-]?)[^\n]*\n/i;
    tailored = tailored.replace(preambleRe, '').trim();

    // 4. Hard fail only if basically nothing came back
    if (!tailored || tailored.length < 100) {
      throw new Error('AI returned an empty response. Check your API key and try again.');
    }

    // 5. Force-inject any JD keywords still absent from the tailored resume into Skills section.
    //    Catches two cases: (a) AI failed to inject originally-missing keywords,
    //    (b) AI accidentally dropped keywords that existed in the original resume.
    {
      const postMatch = getLocalMatch(tailored, job.text);
      const stillMissing = postMatch.missing
        .map(k => k.replace(/\s*✦$/, '').trim())
        .filter(Boolean);

      if (stillMissing.length > 0) {
        const tLines = tailored.split('\n');
        // Find all skill lines (format: "Category: items") and pick the shortest to append to
        const skillLineIdxs = [];
        for (let li = 0; li < tLines.length; li++) {
          const ci = tLines[li].indexOf(':');
          if (ci > 0 && ci <= 45 && !/[.,!?]/.test(tLines[li].slice(0, ci))
              && !tLines[li].slice(0, ci).includes('|') && tLines[li].slice(ci + 1).trim()) {
            skillLineIdxs.push(li);
          }
        }
        if (skillLineIdxs.length > 0) {
          // Prefer the shortest skill line to keep line lengths balanced
          const targetIdx = skillLineIdxs.reduce((best, li) =>
            tLines[li].length < tLines[best].length ? li : best, skillLineIdxs[0]);
          tLines[targetIdx] += ' | ' + stillMissing.join(' | ');
          tailored = tLines.join('\n');
        }
      }
    }

    // Name for the saved resume: "FirstName_Resume_Position_Company"
    const firstName = (activeP.firstName || 'Resume').replace(/[^a-zA-Z0-9]/g, '');
    const toStudlyCase = s => s.replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    const positionPart = toStudlyCase(job.title   || 'Role')   .slice(0, 30);
    const companyPart  = toStudlyCase(job.company || 'Company').slice(0, 25);
    const suggestedName = `${firstName}_Resume_${positionPart}_${companyPart}`;

    // Show preview modal with save + download options
    const escapedText = escHtml(tailored);
    showHtmlModal('✨ Tailored Resume Preview', `
      ${wasTruncated ? `<div style="margin-bottom:10px;padding:8px 10px;background:#fff3cd;border:1px solid #ffc107;border-radius:6px;font-size:12px;color:#856404">⚠️ The model hit its output limit — resume may be cut off. Consider switching to <strong>Claude Sonnet 4.6</strong> for longer resumes.</div>` : ''}
      <div style="margin-bottom:10px;font-size:12px;color:#6b7280">
        Review the tailored version below. Keywords were injected and bullets were strengthened — all your facts, companies, and dates are preserved exactly.
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px">Save as:</label>
        <input id="tailoredResumeName" class="input" value="${escHtml(suggestedName)}" style="width:100%;box-sizing:border-box" />
      </div>
      <div id="tailoredResumePreview" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:12px;max-height:280px;overflow-y:auto;white-space:pre-wrap;font-size:11px;font-family:monospace;line-height:1.5">${escapedText}</div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn-primary" data-action="save-tailored-resume" style="flex:1">💾 Save</button>
        <button class="btn-primary" data-action="download-tailored-pdf" style="flex:1">📄 Download PDF</button>
        <button class="btn-ghost" data-action="download-tailored-resume" style="flex:1">📥 .txt</button>
        <button class="btn-ghost" data-action="close-modal-btn" style="flex:1">Discard</button>
      </div>
    `);

    window.saveTailoredResume = async () => {
      const name = (document.getElementById('tailoredResumeName') || {}).value?.trim() || suggestedName;
      await saveResume(name, tailored);
      closeModal();
      toast(`✓ "${name}" saved to your resumes`, 'success', 4000);
      // Only refresh local match if both dropdowns are already selected (avoid spurious error toast)
      const rSel = document.getElementById('analyzeResume');
      const jSel = document.getElementById('analyzeJob');
      if (rSel?.value && jSel?.value) doLocalMatch();
    };

    window.downloadTailoredResume = () => {
      const name = (document.getElementById('tailoredResumeName') || {}).value?.trim() || suggestedName;
      const filename = name.replace(/[^a-zA-Z0-9 _\-–]/g, '').trim() + '.txt';
      triggerTextDownload(tailored, filename);
      toast('Resume downloaded!', 'success', 3000);
    };

    window.downloadTailoredPdf = () => {
      const name = (document.getElementById('tailoredResumeName') || {}).value?.trim() || suggestedName;
      const profileLinks = { linkedin: activeP.linkedin, portfolio: activeP.portfolio, github: activeP.github, email: activeP.email };
      const html = resumeTextToHtml(tailored, name, profileLinks);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const win  = window.open(url, '_blank');
      if (!win) { toast('Allow popups for this extension to download PDF', 'error', 4000); }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

  } catch (err) {
    toast('Tailoring failed: ' + err.message, 'error', 5000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✨ Tailor Resume'; }
  }
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
  const profileApps = activeApps();

  if (profileApps.length === 0) {
    board.innerHTML = `<div class="empty-state">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" stroke="#9ca3af" stroke-width="2"/></svg>
      <p>No applications tracked</p>
      <small>Click + to add your first application</small>
    </div>`;
    return;
  }

  board.innerHTML = Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
    let apps = profileApps.filter(a => a.status === status);
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
  // Active profile name
  const activeP = state.profiles.find(x => x.id === state.activeProfileId) || state.profiles[0] || {};
  const pDN = document.getElementById('pDisplayName');
  if (pDN) pDN.value = activeP.displayName || '';
  const addBtn = document.getElementById('btnAddProfile');
  if (addBtn) addBtn.style.display = state.profiles.length >= 2 ? 'none' : '';

  document.getElementById('apiKeyInput').value    = apiKey   || '';
  document.getElementById('providerSelect').value = provider || 'gemini';
  document.getElementById('modelSelect').value    = model    || 'gemini-2.0-flash';
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
    if (!modelSel.value.startsWith('gemini')) modelSel.value = 'gemini-2.0-flash';
  } else {
    hint.innerHTML = 'Get your key at <strong>platform.claude.com</strong> → API Keys<br/>Stored locally, never sent anywhere else.';
    // Show only Claude models
    [...modelSel.options].forEach(o => {
      o.hidden = !o.value.startsWith('claude');
    });
    if (!modelSel.value.startsWith('claude')) modelSel.value = 'claude-haiku-4-5-20251001';
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
    const app = { id: uid(), jobId, resumeId, status, notes, profileId: state.activeProfileId, date: new Date().toISOString() };
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
    const activeP = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
    if (!activeP) return;
    const g = id => (document.getElementById(id) || {}).value?.trim() || '';
    activeP.displayName  = g('pDisplayName')  || activeP.displayName;
    activeP.firstName    = g('pFirstName');
    activeP.lastName     = g('pLastName');
    activeP.email        = g('pEmail');
    activeP.phone        = g('pPhone');
    activeP.linkedin     = g('pLinkedIn');
    activeP.github       = g('pGithub');
    activeP.portfolio    = g('pPortfolio');
    activeP.city         = g('pCity');
    activeP.state        = g('pState');
    activeP.country      = g('pCountry');
    activeP.zipCode      = g('pZip');
    activeP.salary       = g('pSalary');
    activeP.availability = g('pAvailability');
    activeP.whyThisRole  = g('paWhyRole');
    activeP.aboutMe      = g('paAboutMe');
    activeP.strength     = g('paStrength');
    activeP.weakness     = g('paWeakness');
    activeP.coverLetter  = g('paCoverLetter');
    await save(SK.PROFILES, state.profiles);
    syncActiveProfileToState();
    renderProfileBar();
    toast('Profile & answers saved! ✓', 'success');
  });

  document.getElementById('btnAddProfile').addEventListener('click', async () => {
    if (state.profiles.length >= 2) { toast('Maximum 2 profiles supported', 'error', 2000); return; }
    const newP = {
      id: 'profile_' + Date.now(), displayName: 'Profile 2',
      firstName: '', lastName: '', email: '', phone: '',
      linkedin: '', github: '', portfolio: '',
      city: '', state: '', country: '', zipCode: '',
      salary: '', availability: '',
      whyThisRole: '', aboutMe: '', strength: '', weakness: '', coverLetter: '',
      resumes: []
    };
    state.profiles.push(newP);
    state.activeProfileId = newP.id;
    await chrome.storage.local.set({ [SK.PROFILES]: state.profiles, [SK.ACTIVE_PROFILE]: newP.id });
    syncActiveProfileToState();
    renderProfileBar();
    renderSettings();
    toast('Profile 2 created! Fill in the details below and save.', 'success', 4000);
  });

  document.getElementById('btnExportData').addEventListener('click', exportData);

  document.getElementById('btnClearData').addEventListener('click', async () => {
    if (!confirm('This will delete ALL resumes, jobs, and applications. Are you sure?')) return;
    state.resumes = []; state.jobs = []; state.applications = []; state.analyses = {};
    // Clear resumes from every profile before wiping storage
    state.profiles.forEach(p => { p.resumes = []; });
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
    if (action === 'view-resume')         window.viewResume(id);
    if (action === 'download-resume-pdf') window.downloadResumePdf(id);
    if (action === 'download-resume')     window.downloadResume(id);
    if (action === 'attach-resume')       attachResumeToPage(id);
    if (action === 'analyze-resume')      switchTab('analyze');
    if (action === 'delete-resume')       window.deleteResume(id);
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

  // Profile bar switching
  document.getElementById('profileBar').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="switch-profile"]');
    if (btn) switchActiveProfile(btn.dataset.profileId);
  });

  // Modal (for Add Note, confirm-mark-applied, confirm-resume-for-app)
  document.getElementById('modal').addEventListener('click', (e) => {
    const addNote = e.target.closest('[data-action="add-note"]');
    if (addNote) window.addAppNote(addNote.dataset.id);

    const confirmApply = e.target.closest('[data-action="confirm-mark-applied"]');
    if (confirmApply) window.confirmMarkApplied(confirmApply.dataset.jobId);

    const confirmResume = e.target.closest('[data-action="confirm-resume-for-app"]');
    if (confirmResume) window.confirmResumeForApp(confirmResume.dataset.appId);

    const closeBtn = e.target.closest('[data-action="close-modal-btn"]');
    if (closeBtn) closeModal();

    const saveTailored = e.target.closest('[data-action="save-tailored-resume"]');
    if (saveTailored) window.saveTailoredResume?.();

    const dlTailored = e.target.closest('[data-action="download-tailored-resume"]');
    if (dlTailored) window.downloadTailoredResume?.();

    const dlPdf = e.target.closest('[data-action="download-tailored-pdf"]');
    if (dlPdf) window.downloadTailoredPdf?.();
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
      chrome.storage.local.get(SK.JOBS).then(data => {
        state.jobs = data[SK.JOBS] || [];
        if (state.activeTab === 'jobs') renderJobs(); // keep jobs list fresh
        const job = state.jobs.find(j => j.id === msg.jobId);
        if (job) showJobBanner(job, msg.isNew);
      });
    }
    if (msg.type === 'NAVIGATE_TO') {
      switchTab(msg.tab);
    }
    if (msg.type === 'JOB_MARKED_APPLIED') {
      chrome.storage.local.get(SK.APPLICATIONS).then(async data => {
        state.applications = data[SK.APPLICATIONS] || [];
        // Stamp the active profileId on the app that was just created by the service worker
        // (service worker has no knowledge of which profile is active)
        const app = state.applications.find(a => a.id === msg.appId);
        if (app && !app.profileId) {
          app.profileId = state.activeProfileId;
          await save(SK.APPLICATIONS, state.applications);
        }
        renderDashboard();
        renderTracker();

        // Show resume picker so the user can link which resume they applied with
        const job = state.jobs.find(j => j.id === msg.jobId);
        const resumeOptions = state.resumes.length
          ? state.resumes.map(r => `<option value="${r.id}">${escHtml(r.name)}</option>`).join('')
          : '';
        showHtmlModal('📤 Application Recorded', `
          <div style="margin-bottom:12px;padding:10px;background:var(--success-light);border-radius:8px;border-left:3px solid var(--success)">
            <div style="font-weight:700;font-size:12px;color:var(--success);margin-bottom:2px">✓ Marked as Applied!</div>
            <div style="font-weight:600;font-size:13px">${escHtml(job ? job.title : msg.title)}</div>
            <div style="font-size:12px;color:var(--text-2)">${escHtml(job ? job.company : msg.company)}</div>
          </div>
          <label style="font-size:12px;font-weight:600;color:var(--text-2);display:block;margin-bottom:6px">
            Which resume did you apply with?
          </label>
          <select id="autoApplyResumeSelect" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-size:13px;margin-bottom:14px;background:var(--bg)">
            <option value="">— Skip / No resume —</option>
            ${resumeOptions}
          </select>
          <div style="display:flex;gap:8px">
            <button class="btn-sm btn-primary" style="flex:1" data-action="confirm-resume-for-app" data-app-id="${msg.appId}">Save</button>
            <button class="btn-sm btn-ghost" style="flex:1" data-action="close-modal-btn">Skip</button>
          </div>
        `);
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
  await saveResumes();
  renderResumes();
  toast(`✓ Resume "${name}" saved`, 'success');
}

// Strip query params + trailing slash for URL comparison
function normalizeJobUrl(url) {
  if (!url) return '';
  try { return new URL(url).origin + new URL(url).pathname.replace(/\/$/, ''); }
  catch { return url.split('?')[0].split('#')[0].replace(/\/$/, ''); }
}

async function saveJob(data) {
  // Dedup by URL (ignoring query params / tracking tokens)
  if (data.url) {
    const norm = normalizeJobUrl(data.url);
    const existing = state.jobs.find(j => j.url && normalizeJobUrl(j.url) === norm);
    if (existing) {
      // Update stored text if the new capture is longer (e.g. first capture was empty)
      if (data.text && data.text.length > (existing.text || '').length) {
        existing.text = data.text;
        if (data.title)    existing.title    = data.title;
        if (data.company)  existing.company  = data.company;
        if (data.location) existing.location = data.location;
        await save(SK.JOBS, state.jobs);
        // Invalidate stale analyses cached against the old (empty) JD text
        const staleKeys = Object.keys(state.analyses).filter(k => k.endsWith('-' + existing.id));
        if (staleKeys.length) {
          staleKeys.forEach(k => delete state.analyses[k]);
          await save(SK.ANALYSES, state.analyses);
        }
      }
      toast('Already in your library', '', 2500);
      return existing;
    }
  }

  // Fallback dedup by title + company (for jobs captured without a URL)
  if (data.title && data.company && data.company !== 'Unknown') {
    const tLow = data.title.toLowerCase().trim();
    const cLow = data.company.toLowerCase().trim();
    const existing = state.jobs.find(j =>
      j.title.toLowerCase().trim() === tLow &&
      j.company.toLowerCase().trim() === cLow
    );
    if (existing) {
      toast('Already in your library', '', 2500);
      return existing;
    }
  }

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
  return job;
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

  // Score each resume using the same keyword match shown in the UI
  let bestId    = state.resumes[0].id;
  let bestScore = -1;

  for (const resume of state.resumes) {
    const { score } = getLocalMatch(resume.text || '', job.text || '');
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
  renderProfileBar();
  switchTab('dashboard');
  checkCurrentTabOnLoad();
}

document.addEventListener('DOMContentLoaded', init);
