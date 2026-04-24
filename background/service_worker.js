// Background Service Worker – JobTrack AI

const JT_JOBS_KEY = 'jt_jobs';

// Open side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

function safeNotify(msg) {
  try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch (_) {}
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDEPANEL') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
    sendResponse({ success: true });
  }

  if (message.type === 'JD_CAPTURED') {
    autoSaveJD(message.data, sender.tab);
    sendResponse({ success: true });
  }

  if (message.type === 'APPLY_CLICKED') {
    handleApplyClick(message.data, sender.tab);
    sendResponse({ success: true });
  }

  return true;
});

function normalizeJobUrl(url) {
  if (!url) return '';
  try { return new URL(url).origin + new URL(url).pathname.replace(/\/$/, ''); }
  catch { return url.split('?')[0].split('#')[0].replace(/\/$/, ''); }
}

async function autoSaveJD(jdData, tab) {
  if (!jdData || !jdData.description || jdData.description.length < 50) return;

  const stored = await chrome.storage.local.get(JT_JOBS_KEY);
  const jobs   = stored[JT_JOBS_KEY] || [];

  // Check if this URL is already saved — strip query params so tracking tokens don't cause duplicates
  const norm = normalizeJobUrl(jdData.url);
  const alreadySaved = norm && jobs.some(j => normalizeJobUrl(j.url) === norm);

  if (alreadySaved) {
    const existing = jobs.find(j => normalizeJobUrl(j.url) === norm);
    // Independent per-field upgrade logic. Each field only accepts a new value
    // if (a) the new value is valid AND (b) the old value is either missing/junk
    // or, for description, shorter than the new. Tying fields together (the old
    // approach) meant a bad-title re-capture could overwrite a good description
    // with shorter junk, and a bad-company re-capture couldn't fix the company
    // unless the description also grew.
    const GENERIC_TITLE = /search all jobs|jobs at linkedin/i;
    const newDescLen = (jdData.description || '').length;
    const oldDescLen = (existing.text || '').length;
    const isBadTitle = !existing.title || existing.title === 'Untitled Job' || GENERIC_TITLE.test(existing.title);
    const isBadCompany = !existing.company || existing.company === 'Unknown Company' || existing.company === '';
    const newTitleGood = jdData.title && jdData.title !== 'Untitled Job' && !GENERIC_TITLE.test(jdData.title);
    const newCompanyGood = jdData.company && jdData.company !== 'Unknown Company' && jdData.company !== '';

    let textChanged = false;
    let anyChanged = false;
    if (newDescLen > oldDescLen && jdData.description) {
      existing.text = jdData.description;
      textChanged = true;
      anyChanged = true;
    }
    if (isBadTitle && newTitleGood) { existing.title = jdData.title; anyChanged = true; }
    if (isBadCompany && newCompanyGood) { existing.company = jdData.company; anyChanged = true; }
    if (jdData.location && !existing.location) { existing.location = jdData.location; anyChanged = true; }

    if (anyChanged) {
      await chrome.storage.local.set({ [JT_JOBS_KEY]: jobs });
      // Only invalidate cached analyses when the JD text itself changed —
      // title/company upgrades don't affect keyword/match analysis.
      if (textChanged) {
        const analysesStore = await chrome.storage.local.get('jt_analyses');
        const analyses = analysesStore['jt_analyses'] || {};
        const staleKeys = Object.keys(analyses).filter(k => k.endsWith('-' + existing.id));
        if (staleKeys.length) {
          staleKeys.forEach(k => delete analyses[k]);
          await chrome.storage.local.set({ jt_analyses: analyses });
        }
      }
      safeNotify({ type: 'JD_AUTO_SAVED', jobId: existing.id, job: existing, isNew: false });
    }
    if (tab && tab.id != null) setBadge(tab.id, '✓', '#059669');
    return;
  }

  // Save new job
  const newJob = {
    id: 'job_' + Date.now(),
    title:   jdData.title   || 'Untitled Job',
    company: jdData.company || 'Unknown Company',
    location: jdData.location || '',
    text:    jdData.description,
    url:     jdData.url    || '',
    source:  jdData.source || 'auto',
    date:    new Date().toISOString()
  };

  jobs.unshift(newJob);
  await chrome.storage.local.set({ [JT_JOBS_KEY]: jobs });

  // Badge: purple = new job saved
  setBadge(tab.id, 'JD', '#4f46e5');

  // Notify side panel if open
  safeNotify({ type: 'JD_AUTO_SAVED', jobId: newJob.id, job: newJob, isNew: true });
}

async function handleApplyClick(data, tab) {
  if (!data?.url) return;

  const stored = await chrome.storage.local.get(['jt_jobs', 'jt_applications']);
  let jobs               = stored['jt_jobs']         || [];
  const applications     = stored['jt_applications'] || [];

  // Match saved job by URL (ignore query params and hash)
  const clickedNorm = normalizeJobUrl(data.url);
  let job = jobs.find(j => {
    if (!j.url) return false;
    const savedNorm = normalizeJobUrl(j.url);
    return savedNorm === clickedNorm || clickedNorm.startsWith(savedNorm) || savedNorm.startsWith(clickedNorm);
  });

  // Job not in library — auto-capture from click data if available
  if (!job && data.jobData?.description?.length > 50) {
    const newJob = {
      id:             'job_' + Date.now(),
      title:          data.jobData.title    || 'Untitled Job',
      company:        data.jobData.company  || 'Unknown Company',
      location:       data.jobData.location || '',
      text:           data.jobData.description,
      url:            data.url,
      source:         data.jobData.source   || 'auto',
      recruiterEmail: data.jobData.recruiterEmail || '',
      date:           new Date().toISOString()
    };
    jobs.unshift(newJob);
    await chrome.storage.local.set({ jt_jobs: jobs });
    job = newJob;
    setBadge(tab.id, 'JD', '#4f46e5');
    safeNotify({ type: 'JD_AUTO_SAVED', jobId: newJob.id, isNew: true });
  }

  if (!job) return; // No JD available — can't mark

  // Avoid duplicates
  const alreadyApplied = applications.find(a => a.jobId === job.id && a.status === 'applied');
  if (alreadyApplied) return;

  const newApp = {
    id: 'app_' + Date.now(), jobId: job.id, resumeId: '',
    status: 'applied', notes: '', date: new Date().toISOString()
  };
  applications.push(newApp);
  await chrome.storage.local.set({ jt_applications: applications });

  setBadge(tab.id, '✓', '#059669');
  safeNotify({ type: 'JOB_MARKED_APPLIED', jobId: job.id, appId: newApp.id, title: job.title, company: job.company });
}

function setBadge(tabId, text, color) {
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ color, tabId }).catch(() => {});
}

// ── LinkedIn auto-capture ─────────────────────────────────────────────────────
// Two listeners feed into triggerLinkedInCapture:
//   1. tabs.onUpdated — full page loads (user pastes URL, opens new tab)
//   2. webNavigation.onHistoryStateUpdated — SPA pushState (user clicks job card)
// Both fire for a single SPA navigation on Chrome MV3, so we dedupe per
// (tabId + currentJobId) with an in-flight map to avoid duplicate saves.
const _jtInFlight = new Map(); // key: `${tabId}:${currentJobId}` → expiry ts

function _jtInFlightKey(tabId, url) {
  const m = /[?&]currentJobId=(\d+)/.exec(url);
  return m ? `${tabId}:${m[1]}` : null;
}

async function triggerLinkedInCapture(tabId, url) {
  const key = _jtInFlightKey(tabId, url);
  if (!key) return; // no currentJobId = nothing to capture
  const now = Date.now();
  const expiry = _jtInFlight.get(key);
  if (expiry && expiry > now) return;
  _jtInFlight.set(key, now + 12000); // 12s debounce window

  const isSlowPage = url.includes('f_C=') || url.includes('originToLandingJobPostings=') || url.includes('f_E=');
  const waitMs = isSlowPage ? 6000 : 3500;
  await new Promise(r => setTimeout(r, waitMs));
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] }).catch(() => {});
    const response = await chrome.tabs.sendMessage(tabId, { type: 'CAPTURE_JD' });
    if (response?.success && response.data?.description?.length > 50) {
      await autoSaveJD(response.data, { id: tabId, url });
    }
  } catch (_) {}
}

// Sweep expired entries periodically so the map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of _jtInFlight) if (exp <= now) _jtInFlight.delete(k);
}, 60000);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
    return;
  }
  if (changeInfo.status === 'complete') {
    const url = tab.url || '';
    if (url.includes('linkedin.com/jobs') && url.includes('currentJobId=')) {
      triggerLinkedInCapture(tabId, url);
    }
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  const url = details.url || '';
  if (!url.includes('linkedin.com/jobs')) return;
  if (!url.includes('currentJobId=')) return;
  triggerLinkedInCapture(details.tabId, url);
});
