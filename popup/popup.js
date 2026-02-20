// Popup Script – JobTrack AI

const STORAGE_KEYS = {
  RESUMES: 'jt_resumes',
  JOBS: 'jt_jobs',
  APPLICATIONS: 'jt_applications'
};

async function loadStats() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.RESUMES,
    STORAGE_KEYS.JOBS,
    STORAGE_KEYS.APPLICATIONS
  ]);

  document.getElementById('statResumes').textContent =
    (data[STORAGE_KEYS.RESUMES] || []).length;
  document.getElementById('statJobs').textContent =
    (data[STORAGE_KEYS.JOBS] || []).length;

  const apps = data[STORAGE_KEYS.APPLICATIONS] || [];
  const applied = apps.filter(a => a.status !== 'saved').length;
  document.getElementById('statApps').textContent = applied;
}

function showStatus(msg, type = 'info', duration = 3000) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = `status-msg ${type}`;
  setTimeout(() => { el.className = 'status-msg hidden'; }, duration);
}

// Open side panel
document.getElementById('btnOpenPanel').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.sidePanel.open({ windowId: tab.windowId });
  window.close();
});

// Capture JD from current page
document.getElementById('btnCaptureJD').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  showStatus('Capturing job description…', 'info');

  try {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/content.js']
    }).catch(() => {}); // Already injected – ignore error

    // Ask content script to capture
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_JD' });

    if (response && response.success && response.data) {
      const jd = response.data;

      if (!jd.description || jd.description.length < 50) {
        showStatus('No job description found on this page.', 'error');
        return;
      }

      // Save to storage
      const stored = await chrome.storage.local.get(STORAGE_KEYS.JOBS);
      const jobs = stored[STORAGE_KEYS.JOBS] || [];

      const newJob = {
        id: 'job_' + Date.now(),
        title: jd.title,
        company: jd.company,
        location: jd.location,
        text: jd.description,
        url: jd.url,
        source: jd.source,
        date: new Date().toISOString(),
        keywords: []
      };

      jobs.unshift(newJob);
      await chrome.storage.local.set({ [STORAGE_KEYS.JOBS]: jobs });

      showStatus(`✓ Captured: ${jd.title}`, 'success');
      await loadStats();

      // Try to open side panel and navigate to jobs tab
      await chrome.sidePanel.open({ windowId: tab.windowId });
      chrome.runtime.sendMessage({
        type: 'NAVIGATE_TO',
        tab: 'jobs'
      }).catch(() => {});
    } else {
      showStatus('Could not capture JD from this page.', 'error');
    }
  } catch (err) {
    showStatus('Error: ' + (err.message || 'Try opening the side panel instead.'), 'error');
  }
});

// Load stats on open
loadStats();
