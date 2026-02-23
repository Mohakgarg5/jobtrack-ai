// Background Service Worker – JobTrack AI

const JT_JOBS_KEY = 'jt_jobs';

// Open side panel when the extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

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
  if (!jdData || !jdData.description || jdData.description.length < 100) return;

  const stored = await chrome.storage.local.get(JT_JOBS_KEY);
  const jobs   = stored[JT_JOBS_KEY] || [];

  // Check if this URL is already saved — strip query params so tracking tokens don't cause duplicates
  const norm = normalizeJobUrl(jdData.url);
  const alreadySaved = norm && jobs.some(j => normalizeJobUrl(j.url) === norm);

  if (alreadySaved) {
    // Already in library — just show a green badge
    const existing = jobs.find(j => normalizeJobUrl(j.url) === norm);
    setBadge(tab.id, '✓', '#059669');
    chrome.runtime.sendMessage({
      type: 'JD_AUTO_SAVED',
      jobId: existing.id,
      isNew: false
    }).catch(() => {});
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
  chrome.runtime.sendMessage({
    type: 'JD_AUTO_SAVED',
    jobId: newJob.id,
    job:   newJob,
    isNew: true
  }).catch(() => {}); // Side panel might not be open — that's fine
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
    chrome.runtime.sendMessage({ type: 'JD_AUTO_SAVED', jobId: newJob.id, isNew: true }).catch(() => {});
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
  chrome.runtime.sendMessage({
    type: 'JOB_MARKED_APPLIED', jobId: job.id, appId: newApp.id, title: job.title, company: job.company
  }).catch(() => {});
}

function setBadge(tabId, text, color) {
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// Clear badge when user leaves a job page
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId }).catch(() => {});
  }
});
