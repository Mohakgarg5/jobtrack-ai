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

  return true;
});

async function autoSaveJD(jdData, tab) {
  if (!jdData || !jdData.description || jdData.description.length < 100) return;

  const stored = await chrome.storage.local.get(JT_JOBS_KEY);
  const jobs   = stored[JT_JOBS_KEY] || [];

  // Check if this URL is already saved — avoid duplicates
  const alreadySaved = jdData.url && jobs.some(j => j.url === jdData.url);

  if (alreadySaved) {
    // Already in library — just show a green badge
    const existing = jobs.find(j => j.url === jdData.url);
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
