// Content Script – JobTrack AI
// Extracts job descriptions from 30+ job sites + generic fallback

(function () {
  'use strict';

  const hostname = window.location.hostname;

  function extractJobData() {
    let title = '';
    let company = '';
    let description = '';
    let location = '';

    // ── Try JSON-LD structured data first (works on many modern sites) ────
    const jsonLd = extractFromJsonLd();
    if (jsonLd.title) title = jsonLd.title;
    if (jsonLd.company) company = jsonLd.company;
    if (jsonLd.description) description = jsonLd.description;
    if (jsonLd.location) location = jsonLd.location;

    // ── LinkedIn ─────────────────────────────────────────────────────────
    if (hostname.includes('linkedin.com')) {
      title = title || getTextFromSelectors([
        '.job-details-jobs-unified-top-card__job-title h1',
        '.jobs-unified-top-card__job-title',
        'h1.t-24'
      ]);
      company = company || getTextFromSelectors([
        '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a',
        '.topcard__org-name-link'
      ]);
      location = location || getTextFromSelectors([
        '.job-details-jobs-unified-top-card__bullet',
        '.jobs-unified-top-card__workplace-type'
      ]);
      description = description || getTextFromSelectors([
        '.jobs-description__content .jobs-box__html-content',
        '.jobs-description-content__text',
        '#job-details'
      ]);
    }

    // ── Indeed ───────────────────────────────────────────────────────────
    else if (hostname.includes('indeed.com')) {
      title = title || getTextFromSelectors([
        '[data-testid="jobsearch-JobInfoHeader-title"]',
        'h1.jobsearch-JobInfoHeader-title',
        '.jobsearch-JobInfoHeader h1'
      ]);
      company = company || getTextFromSelectors([
        '[data-testid="inlineHeader-companyName"] a',
        '.jobsearch-InlineCompanyRating-companyHeader a'
      ]);
      location = location || getTextFromSelectors([
        '[data-testid="job-location"]',
        '.jobsearch-JobInfoHeader-subtitle .jobsearch-JobInfoHeader-text'
      ]);
      description = description || getTextFromSelectors([
        '#jobDescriptionText',
        '.jobsearch-jobDescriptionText'
      ]);
    }

    // ── Workday ──────────────────────────────────────────────────────────
    else if (hostname.includes('myworkdayjobs.com') || hostname.includes('myworkday.com')) {
      title = title || getTextFromSelectors([
        '[data-automation-id="jobPostingHeader"] h2',
        '[data-automation-id="jobPostingHeader"]',
        '.css-1hf19u2',
        'h2[data-automation-id]'
      ]);
      // Company name from subdomain: adobe.wd5.myworkdayjobs.com → Adobe
      if (!company) {
        const sub = hostname.split('.')[0];
        company = sub.charAt(0).toUpperCase() + sub.slice(1);
      }
      location = location || getTextFromSelectors([
        '[data-automation-id="locations"]',
        '[data-automation-id="job-posting-location"]'
      ]);
      description = description || getTextFromSelectors([
        '[data-automation-id="jobPostingDescription"]',
        '.css-cygeeu',
        '[data-automation-id="job-posting-details"]',
        '[data-automation-id="jobPostingSection"]'
      ]);
      // Workday may load lazily — grab all visible text within the job section
      if (!description) {
        const main = document.querySelector('[data-automation-id="job-details"]') ||
                     document.querySelector('main') ||
                     document.querySelector('[role="main"]');
        if (main) description = main.innerText;
      }
    }

    // ── Greenhouse ───────────────────────────────────────────────────────
    else if (hostname.includes('greenhouse.io')) {
      title = title || getTextFromSelectors([
        'h1.app-title',
        '.job-post h1',
        'h1'
      ]);
      company = company || getTextFromSelectors([
        '.company-name',
        '.header-wrapper .company-name'
      ]);
      location = location || getTextFromSelectors(['.location', '.job-post .location']);
      description = description || getTextFromSelectors([
        '#content',
        '.job-post-content',
        '.section-wrapper'
      ]);
    }

    // ── Lever ────────────────────────────────────────────────────────────
    else if (hostname.includes('lever.co')) {
      title = title || getTextFromSelectors([
        '.posting-headline h2',
        'h2.posting-name'
      ]);
      company = company || getTextFromSelectors([
        '.posting-headline .company-name',
        '#main .main-header-text h3 a'
      ]);
      location = location || getTextFromSelectors(['.sort-by-commitment .location', '.posting-categories .location']);
      description = description || getTextFromSelectors([
        '.section-wrapper',
        '.posting-content',
        '#content'
      ]);
    }

    // ── Glassdoor ────────────────────────────────────────────────────────
    else if (hostname.includes('glassdoor.com')) {
      title = title || getTextFromSelectors([
        '[data-test="job-title"]',
        '.job-title',
        'h1[data-test="job-link"]'
      ]);
      company = company || getTextFromSelectors([
        '[data-test="employer-name"]',
        '.employer-name'
      ]);
      location = location || getTextFromSelectors([
        '[data-test="job-location"]',
        '.location'
      ]);
      description = description || getTextFromSelectors([
        '.jobDescriptionContent',
        '[data-test="description"]',
        '#JobDescriptionContainer'
      ]);
    }

    // ── Naukri ───────────────────────────────────────────────────────────
    else if (hostname.includes('naukri.com')) {
      title = title || getTextFromSelectors(['.jd-header-title', 'h1.jd-header-title']);
      company = company || getTextFromSelectors(['.jd-header-comp-name a', '.comp-name a']);
      location = location || getTextFromSelectors(['.location-container span', '.location']);
      description = description || getTextFromSelectors(['.job-desc', '#job_description', '.dang-inner-html']);
    }

    // ── Workable ─────────────────────────────────────────────────────────
    else if (hostname.includes('workable.com')) {
      title = title || getTextFromSelectors([
        'h1.job-title',
        '[data-ui="job-title"]',
        '.job-header h1'
      ]);
      company = company || getTextFromSelectors([
        '.company-name',
        '[data-ui="company-name"]',
        '.job-header .company'
      ]);
      location = location || getTextFromSelectors([
        '.job-location',
        '[data-ui="job-location"]'
      ]);
      description = description || getTextFromSelectors([
        '.job-description',
        '[data-ui="job-description"]',
        '#job-description'
      ]);
    }

    // ── SmartRecruiters ──────────────────────────────────────────────────
    else if (hostname.includes('smartrecruiters.com')) {
      title = title || getTextFromSelectors([
        'h1[itemprop="title"]',
        '.job-title h1',
        'h1.job-title'
      ]);
      company = company || getTextFromSelectors([
        '[itemprop="hiringOrganization"] [itemprop="name"]',
        '.company-name',
        'span.company'
      ]);
      location = location || getTextFromSelectors([
        '[itemprop="jobLocation"]',
        '.job-location'
      ]);
      description = description || getTextFromSelectors([
        '[itemprop="description"]',
        '.job-sections',
        '#job-description'
      ]);
    }

    // ── Ashby ────────────────────────────────────────────────────────────
    else if (hostname.includes('ashbyhq.com')) {
      title = title || getTextFromSelectors([
        'h1.ashby-job-posting-heading',
        'h1[class*="jobTitle"]',
        '.job-posting h1',
        'h1'
      ]);
      company = company || getTextFromSelectors([
        '.ashby-job-posting-company-name',
        '[class*="companyName"]',
        'h2[class*="company"]'
      ]);
      location = location || getTextFromSelectors([
        '[class*="location"]',
        '.ashby-job-posting-location'
      ]);
      description = description || getTextFromSelectors([
        '.ashby-job-posting-description',
        '[class*="jobDescription"]',
        '[class*="description"]'
      ]);
    }

    // ── BambooHR ─────────────────────────────────────────────────────────
    else if (hostname.includes('bamboohr.com')) {
      title = title || getTextFromSelectors([
        'h1.fab-Heading',
        '.BambooHR-ATS-Jobs-Item h1',
        'h1[data-testid="job-title"]',
        'h2.BambooHR-ATS-Jobs-Item-Title',
        '.header-section h1'
      ]);
      company = company || (() => {
        const sub = hostname.split('.')[0];
        return sub.charAt(0).toUpperCase() + sub.slice(1);
      })();
      description = description || getTextFromSelectors([
        '.BambooHR-ATS-Jobs-Description',
        '[class*="Description"]',
        '#BambooHR-ATS-board-description',
        '.fa-Content'
      ]);
    }

    // ── Breezy HR ────────────────────────────────────────────────────────
    else if (hostname.includes('breezy.hr')) {
      title = title || getTextFromSelectors([
        'h1.details-title',
        'h1[class*="title"]',
        '.position-info h1'
      ]);
      company = company || getTextFromSelectors([
        '.company-name',
        'header .company'
      ]);
      location = location || getTextFromSelectors(['.location', '.details-location']);
      description = description || getTextFromSelectors([
        '.description',
        'section.description',
        '[class*="description"]'
      ]);
    }

    // ── ZipRecruiter ─────────────────────────────────────────────────────
    else if (hostname.includes('ziprecruiter.com')) {
      title = title || getTextFromSelectors([
        'h1[class*="jobTitle"]',
        '.job_title h1',
        'h1.title'
      ]);
      company = company || getTextFromSelectors([
        'a[data-tracking-label="job-employer-name"]',
        '.t_company_name',
        '.hiring_company_text'
      ]);
      location = location || getTextFromSelectors([
        '[class*="location"]',
        '.t_address'
      ]);
      description = description || getTextFromSelectors([
        '[class*="jobDescription"]',
        '.job_description',
        '#job_description',
        '[data-testid="job-description"]'
      ]);
    }

    // ── Monster ──────────────────────────────────────────────────────────
    else if (hostname.includes('monster.com')) {
      title = title || getTextFromSelectors([
        'h1[class*="title"]',
        '.job-title',
        'h1.Details--title'
      ]);
      company = company || getTextFromSelectors([
        '.company',
        '[class*="company-name"]'
      ]);
      location = location || getTextFromSelectors(['.location', '[class*="location"]']);
      description = description || getTextFromSelectors([
        '#JobDescription',
        '.job-description',
        '[class*="description"]'
      ]);
    }

    // ── Dice ─────────────────────────────────────────────────────────────
    else if (hostname.includes('dice.com')) {
      title = title || getTextFromSelectors([
        'h1[data-testid="jobTitle"]',
        'h1.jobTitle',
        'h1[class*="title"]'
      ]);
      company = company || getTextFromSelectors([
        '[data-testid="companyNameLink"]',
        '.company-name',
        'a[class*="company"]'
      ]);
      location = location || getTextFromSelectors(['[data-testid="job-location"]', '.location']);
      description = description || getTextFromSelectors([
        '[data-testid="jobDescription"]',
        '.job-description',
        '#jobDescription'
      ]);
    }

    // ── We Work Remotely ─────────────────────────────────────────────────
    else if (hostname.includes('weworkremotely.com')) {
      title = title || getTextFromSelectors([
        'h1.listing-header__title',
        'h1[class*="title"]',
        '.job-header h1'
      ]);
      company = company || getTextFromSelectors([
        '.company-card--company-title',
        'span.company-name',
        '.listing-header__company-name'
      ]);
      description = description || getTextFromSelectors([
        '.listing-container--main',
        '.job-listing-container',
        '#job-listing-show-container'
      ]);
    }

    // ── Remote.co ────────────────────────────────────────────────────────
    else if (hostname.includes('remote.co')) {
      title = title || getTextFromSelectors([
        'h1.job_title',
        'h1[class*="title"]'
      ]);
      company = company || getTextFromSelectors(['.company_name', '[class*="company"]']);
      description = description || getTextFromSelectors([
        '.job_description',
        '[class*="description"]'
      ]);
    }

    // ── Remotive ─────────────────────────────────────────────────────────
    else if (hostname.includes('remotive.com')) {
      title = title || getTextFromSelectors([
        'h1.top-card__title',
        'h1[class*="title"]'
      ]);
      company = company || getTextFromSelectors([
        '.top-card__company-name',
        '[class*="company"]'
      ]);
      description = description || getTextFromSelectors([
        '.job-description',
        '[class*="description"]',
        '.content'
      ]);
    }

    // ── Jobvite ──────────────────────────────────────────────────────────
    else if (hostname.includes('jobvite.com')) {
      title = title || getTextFromSelectors([
        'h1.jv-header',
        'h1[class*="job"]',
        '.careers-overview h1'
      ]);
      company = company || getTextFromSelectors(['.jv-company-name', '[class*="company"]']);
      location = location || getTextFromSelectors(['.jv-location', '.job-location']);
      description = description || getTextFromSelectors([
        '.jv-job-detail-description',
        '.job-description-content',
        '[class*="description"]'
      ]);
    }

    // ── iCIMS ────────────────────────────────────────────────────────────
    else if (hostname.includes('icims.com')) {
      title = title || getTextFromSelectors([
        'h1.iCIMS_Header',
        '.iCIMS_JobTitle',
        'h1[class*="title"]'
      ]);
      company = company || getTextFromSelectors([
        '.iCIMS_CompanyName',
        '[class*="company"]'
      ]);
      description = description || getTextFromSelectors([
        '.iCIMS_JobContent',
        '#iCIMS_Content_iFrame',
        '[class*="jobContent"]',
        '[id*="jobContent"]'
      ]);
    }

    // ── Taleo ────────────────────────────────────────────────────────────
    else if (hostname.includes('taleo.net')) {
      title = title || getTextFromSelectors([
        'span#requisitionDescriptionInterface\\.reqTitleLinkAction\\.row1',
        '.jobtitle',
        'h1[id*="title"]'
      ]);
      description = description || getTextFromSelectors([
        '#requisitionDescriptionInterface\\.ID163\\.row1',
        '[id*="externalDescription"]',
        '.reqDescription',
        '#externalDescription'
      ]);
    }

    // ── SuccessFactors ───────────────────────────────────────────────────
    else if (hostname.includes('successfactors.com')) {
      title = title || getTextFromSelectors([
        'h1[class*="jobTitle"]',
        '.jobTitle',
        '[data-automation="job-title"]'
      ]);
      company = company || getTextFromSelectors([
        '[data-automation="company-name"]',
        '.companyName'
      ]);
      description = description || getTextFromSelectors([
        '[data-automation="job-description"]',
        '.jobDescription',
        '#jobPostingDescription'
      ]);
    }

    // ── SimplyHired ──────────────────────────────────────────────────────
    else if (hostname.includes('simplyhired.com')) {
      title = title || getTextFromSelectors([
        'h1[data-testid="viewJobTitle"]',
        'h1.viewjob-jobTitle'
      ]);
      company = company || getTextFromSelectors([
        '[data-testid="viewJobCompanyName"]',
        'span.viewjob-labelWithIcon'
      ]);
      description = description || getTextFromSelectors([
        '[data-testid="viewJobBodyJobFullDescriptionContent"]',
        '.viewjob-jobDescription'
      ]);
    }

    // ── Google Careers ───────────────────────────────────────────────────
    else if (hostname.includes('careers.google.com')) {
      title = title || getTextFromSelectors([
        'h2.p6n-hero__title',
        '.gc-job-detail-head h1',
        'h1[class*="title"]'
      ]);
      company = company || 'Google';
      location = location || getTextFromSelectors([
        '.gc-job-detail-meta .geo',
        '[class*="location"]'
      ]);
      description = description || getTextFromSelectors([
        '.gc-job-detail-description',
        '[class*="description"]',
        'section.job-description'
      ]);
    }

    // ── Apple Jobs ───────────────────────────────────────────────────────
    else if (hostname.includes('jobs.apple.com')) {
      title = title || getTextFromSelectors([
        'h1.jd__header--title',
        '.jd__header h1',
        'h1[class*="title"]'
      ]);
      company = company || 'Apple';
      location = location || getTextFromSelectors(['.jd__sub--location', '[class*="location"]']);
      description = description || getTextFromSelectors([
        '.jd__main-content',
        '#jd-job-summary',
        '[class*="description"]'
      ]);
    }

    // ── Amazon Jobs ──────────────────────────────────────────────────────
    else if (hostname.includes('amazon.jobs')) {
      title = title || getTextFromSelectors([
        'h1.title',
        '.job-detail-title h1',
        'h1[class*="title"]'
      ]);
      company = company || 'Amazon';
      location = location || getTextFromSelectors([
        '.location-and-date li:first-child',
        '[class*="location"]'
      ]);
      description = description || getTextFromSelectors([
        '.job-detail-description',
        '[class*="description"]',
        '#job-detail'
      ]);
    }

    // ── Wellfound / AngelList ────────────────────────────────────────────
    else if (hostname.includes('wellfound.com') || hostname.includes('angel.co')) {
      title = title || getTextFromSelectors([
        'h1[class*="title"]',
        '.job-listing-header h1',
        'h1[data-test="job-title"]'
      ]);
      company = company || getTextFromSelectors([
        '[class*="companyName"]',
        '.company-name',
        'a[class*="company"]'
      ]);
      location = location || getTextFromSelectors(['[class*="location"]', '.location-tag']);
      description = description || getTextFromSelectors([
        '[class*="description"]',
        '.job-description',
        '[data-test="job-description"]'
      ]);
    }

    // ── Work at a Startup (YC) ───────────────────────────────────────────
    else if (hostname.includes('workatastartup.com')) {
      title = title || getTextFromSelectors([
        'h1.company-name',
        '.job-header h1',
        'h1[class*="title"]'
      ]);
      company = company || getTextFromSelectors([
        '.company-name',
        '[class*="company"]'
      ]);
      description = description || getTextFromSelectors([
        '.job-description',
        '[class*="description"]',
        'section.description'
      ]);
    }

    // ── Rippling ─────────────────────────────────────────────────────────
    else if (hostname.includes('rippling.com') || hostname.includes('rippling-ats.com')) {
      title = title || getTextFromSelectors([
        'h1[class*="title"]',
        '.job-details h1',
        'h1.header'
      ]);
      company = company || getTextFromSelectors(['[class*="company"]', '.company-name']);
      description = description || getTextFromSelectors([
        '[class*="description"]',
        '.job-description',
        '.requirements'
      ]);
    }

    // ── Freshteam ────────────────────────────────────────────────────────
    else if (hostname.includes('freshteam.com')) {
      title = title || getTextFromSelectors([
        '.job-details-container h1',
        'h1[class*="title"]',
        'h1.jobTitle'
      ]);
      company = company || (() => {
        const sub = hostname.split('.')[0];
        return sub.charAt(0).toUpperCase() + sub.slice(1);
      })();
      description = description || getTextFromSelectors([
        '.job-description',
        '[class*="description"]',
        '.jobDescription'
      ]);
    }

    // ── Recruitee ────────────────────────────────────────────────────────
    else if (hostname.includes('recruitee.com')) {
      title = title || getTextFromSelectors([
        'h1.job-title',
        'h1[class*="title"]'
      ]);
      company = company || getTextFromSelectors([
        '.company-name',
        '[class*="company"]'
      ]);
      description = description || getTextFromSelectors([
        '.job-description',
        '[class*="description"]'
      ]);
    }

    // ── PinpointHQ ───────────────────────────────────────────────────────
    else if (hostname.includes('pinpointhq.com')) {
      title = title || getTextFromSelectors(['h1.job-title', 'h1[class*="title"]']);
      company = company || getTextFromSelectors(['[class*="company"]']);
      description = description || getTextFromSelectors([
        '.job-description',
        '[class*="description"]',
        'main'
      ]);
    }

    // ── Otta ─────────────────────────────────────────────────────────────
    else if (hostname.includes('otta.com')) {
      title = title || getTextFromSelectors([
        'h1[class*="title"]',
        '.job-description h1'
      ]);
      company = company || getTextFromSelectors(['[class*="company"]', '.company-name']);
      description = description || getTextFromSelectors([
        '[class*="description"]',
        '.job-role-description',
        'section[class*="role"]'
      ]);
    }

    // ── Startup.jobs ─────────────────────────────────────────────────────
    else if (hostname.includes('startup.jobs')) {
      title = title || getTextFromSelectors(['h1.job-title', 'h1[class*="title"]']);
      company = company || getTextFromSelectors(['.company-name', '[class*="company"]']);
      description = description || getTextFromSelectors([
        '.job-description',
        '[class*="description"]'
      ]);
    }

    // ── BuiltIn network ──────────────────────────────────────────────────
    else if (hostname.includes('builtin')) {
      title = title || getTextFromSelectors([
        'h1[class*="title"]',
        '.job-info h1',
        'h1.view-job-title'
      ]);
      company = company || getTextFromSelectors([
        '.company-title',
        '[class*="company-name"]',
        'a[class*="company"]'
      ]);
      location = location || getTextFromSelectors(['[class*="location"]', '.job-location']);
      description = description || getTextFromSelectors([
        '[class*="description"]',
        '.job-description',
        '[id*="description"]'
      ]);
    }

    // ── Generic fallback with multiple strategies ─────────────────────────
    if (!description) {
      description = genericExtractDescription();
    }
    if (!title) {
      title = genericExtractTitle();
    }
    if (!company) {
      company = extractCompanyFromDomain();
    }

    return {
      title:          cleanText(title)       || 'Untitled Job',
      company:        cleanText(company)     || extractCompanyFromDomain(),
      location:       cleanText(location),
      description:    cleanText(description),
      recruiterEmail: extractRecruiterEmail(),
      url:            window.location.href,
      source:         hostname.replace('www.', '').split('.')[0],
      capturedAt:     new Date().toISOString()
    };
  }

  // ── JSON-LD structured data (schema.org/JobPosting) ────────────────────
  function extractFromJsonLd() {
    const result = { title: '', company: '', description: '', location: '' };
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let data;
        try { data = JSON.parse(script.textContent); } catch { continue; }
        // Handle arrays of schemas
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'JobPosting') {
            result.title       = item.title || '';
            result.company     = (item.hiringOrganization && item.hiringOrganization.name) || '';
            result.description = item.description ? stripHtml(item.description) : '';
            const loc = item.jobLocation;
            if (loc) {
              if (typeof loc === 'string') result.location = loc;
              else if (loc.address) {
                result.location = [
                  loc.address.addressLocality,
                  loc.address.addressRegion,
                  loc.address.addressCountry
                ].filter(Boolean).join(', ');
              }
            }
            if (result.description) return result;
          }
        }
      }
    } catch {}
    return result;
  }

  // ── Generic description extraction strategies ───────────────────────────
  function genericExtractDescription() {
    // Strategy 1: Common class/id patterns
    const desc = getTextFromSelectors([
      '[class*="job-description"]',
      '[class*="jobDescription"]',
      '[class*="job_description"]',
      '[id*="job-description"]',
      '[id*="jobDescription"]',
      '[id*="job_description"]',
      '[class*="jd-"]',
      '[class*="posting-content"]',
      '[class*="job-detail"]',
      '[class*="jobDetail"]',
      '[class*="job-content"]',
      '[class*="jobContent"]',
      '[class*="position-description"]',
      '[class*="requirements"]',
      '[data-testid*="description"]',
      '[data-automation*="description"]',
      'section.description',
      'div.description',
      'article.job',
      'article',
      'main'
    ]);
    if (desc && desc.length > 100) return desc;

    // Strategy 2: Find the largest text block that looks like a job description
    const candidates = document.querySelectorAll('div, section, article');
    let best = '';
    for (const el of candidates) {
      const text = el.innerText || '';
      // Must contain job-related keywords and be substantial
      if (text.length > best.length && text.length < 20000 &&
          /responsibilities|qualifications|requirements|experience|skills|about the role|what you.ll do/i.test(text)) {
        // Make sure we pick a leaf-ish element (not full page body)
        const childDivs = el.querySelectorAll('div, section');
        if (childDivs.length < 50) {
          best = text;
        }
      }
    }
    return best;
  }

  function genericExtractTitle() {
    // Try the page's h1 first
    const h1 = document.querySelector('h1');
    if (h1 && h1.innerText && h1.innerText.trim().length > 2) {
      return h1.innerText.trim();
    }
    // Fall back to page title (strip after common separators)
    return document.title.split(/[|–\-—]/)[0].trim();
  }

  // ── Helper utilities ────────────────────────────────────────────────────
  function getTextFromSelectors(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 10) {
          return el.innerText.trim();
        }
      } catch {}
    }
    return '';
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.innerText || '';
  }

  function cleanText(text) {
    if (!text) return '';
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractCompanyFromDomain() {
    // 1. og:site_name meta tag (most reliable for company career portals)
    const ogSite = document.querySelector('meta[property="og:site_name"]');
    if (ogSite && ogSite.content && ogSite.content.trim().length > 1) return ogSite.content.trim();

    // 2. Page title — if pattern is "Job Title | Company Name" or "Job Title – Company Name"
    const titleParts = document.title.split(/[|–\-—]/);
    if (titleParts.length >= 2) {
      const candidate = titleParts[titleParts.length - 1].trim();
      // Reject generic words that aren't company names
      if (candidate.length > 2 && !/careers|jobs|job board|recruiting|apply|hiring/i.test(candidate)) {
        return candidate;
      }
    }

    // 3. Fall back to hostname
    const clean = hostname.replace('www.', '').replace('jobs.', '').replace('careers.', '');
    const parts = clean.split('.');
    const name = parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // ── Recruiter email extraction ───────────────────────────────────────
  function extractRecruiterEmail() {
    const systemPattern = /noreply|no-reply|donotreply|notifications|unsubscribe|bounce|mailer-daemon|postmaster|placeholder|example\.com/i;
    const emailRegex = /[\w.+-]+@[\w-]+\.[\w.]{2,}/g;

    // Priority 1: mailto: links (most reliable, intentionally clickable)
    const mailtoLinks = document.querySelectorAll('a[href^="mailto:"]');
    for (const link of mailtoLinks) {
      const email = link.href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
      if (email && email.includes('@') && !systemPattern.test(email)) {
        return email;
      }
    }

    // Priority 2: text near recruiter-context words
    try {
      const allText = document.body ? document.body.innerText : '';
      if (/recruiter|hiring manager|contact.*email|email.*question|reach out|email us/i.test(allText)) {
        const matches = allText.match(emailRegex) || [];
        for (const email of matches) {
          if (!systemPattern.test(email)) return email.toLowerCase();
        }
      }
    } catch (_) {}

    return '';
  }

  // ── Send job data to background ─────────────────────────────────────────
  function sendJobData(data) {
    if (!data.description || data.description.length < 50) return;
    chrome.runtime.sendMessage({
      type: 'JD_CAPTURED',
      data: data
    }).catch(() => {});
  }

  // Run extraction after a delay to let dynamic content load
  setTimeout(() => {
    const jobData = extractJobData();
    if (jobData.description && jobData.description.length > 100) {
      sendJobData(jobData);
    }
  }, 2000);

  // ── Auto-fill helpers ────────────────────────────────────────────────────

  function getFieldHint(el) {
    let labelText = '';
    if (el.id) {
      try {
        const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lbl) labelText = lbl.innerText || '';
      } catch (_) {}
    }
    if (!labelText) {
      const parent = el.closest('label');
      if (parent) labelText = parent.innerText || '';
    }
    if (!labelText) {
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ref = document.getElementById(labelledBy);
        if (ref) labelText = ref.innerText || '';
      }
    }
    if (!labelText) {
      let sib = el.previousElementSibling;
      for (let i = 0; i < 3 && sib; i++) {
        const tag = sib.tagName.toLowerCase();
        if (['label','span','div','p','legend'].includes(tag) && sib.innerText) {
          labelText = sib.innerText; break;
        }
        sib = sib.previousElementSibling;
      }
    }
    return [
      labelText,
      el.placeholder || '',
      el.name || '',
      el.id || '',
      el.getAttribute('aria-label') || '',
      el.getAttribute('data-label') || '',
      el.getAttribute('data-placeholder') || ''
    ].join(' ').toLowerCase();
  }

  function getValueForHint(hint, profile, preAnswers) {
    if (/first.?name|given.?name|\bfname\b/i.test(hint))
      return profile.firstName || '';
    if (/last.?name|family.?name|\bsurname\b|\blname\b/i.test(hint))
      return profile.lastName || '';
    if (/\bfull.?name\b|\byour.?name\b/i.test(hint) && !/first|last|middle/i.test(hint))
      return [profile.firstName, profile.lastName].filter(Boolean).join(' ');
    if (/\be-?mail\b/i.test(hint))
      return profile.email || '';
    if (/\bphone\b|\bmobile\b|\btelephone\b|\bcell\b|\bcontact.?number\b/i.test(hint))
      return profile.phone || '';
    if (/linkedin/i.test(hint))
      return profile.linkedin || '';
    if (/github/i.test(hint))
      return profile.github || '';
    if (/portfolio|personal.?site|personal.?url|\bwebsite\b|\burl\b/i.test(hint) && !/linkedin|github/i.test(hint))
      return profile.portfolio || '';
    if (/\bcity\b|\btown\b/i.test(hint) && !/country/i.test(hint))
      return profile.city || '';
    if (/\bstate\b|\bprovince\b|\bregion\b/i.test(hint) && !/country/i.test(hint))
      return profile.state || '';
    if (/\bcountry\b/i.test(hint))
      return profile.country || '';
    if (/\bzip\b|\bpostal/i.test(hint))
      return profile.zipCode || '';
    if (/salary|compensation|expected.?pay|current.?pay/i.test(hint))
      return profile.salary || '';
    if (/notice.?period|availability|\bstart.?date\b|\bavailable\b/i.test(hint))
      return profile.availability || '';
    if (/cover.?letter/i.test(hint))
      return (preAnswers && preAnswers.coverLetter) || '';
    if (/why.?(do you|are you|this|role|company|position|apply|interested|want)/i.test(hint))
      return (preAnswers && preAnswers.whyThisRole) || '';
    if (/tell.?us.?about|about.?yourself|introduce.?yourself|summary|about.?you\b/i.test(hint))
      return (preAnswers && preAnswers.aboutMe) || '';
    if (/\bstrength/i.test(hint) && !/weakness/i.test(hint))
      return (preAnswers && preAnswers.strength) || '';
    if (/\bweakness|\bimprove\b|\bchallenge\b/i.test(hint))
      return (preAnswers && preAnswers.weakness) || '';
    return '';
  }

  function setFieldValue(el, value) {
    try {
      const proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter) setter.set.call(el, value);
      else el.value = value;
    } catch (_) { el.value = value; }
    el.dispatchEvent(new Event('input',  { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function tryAutoFill() {
    const fields = document.querySelectorAll(
      'input:not([type=file]):not([type=submit]):not([type=button])' +
      ':not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=image]),' +
      'textarea'
    );

    if (fields.length < 3) return 0;

    // Collect all hints to determine if this page is an application form
    const allHints = [...fields].map(f => getFieldHint(f)).join(' ');
    const isAppForm = /first.?name|last.?name|e-?mail|\bphone\b|\blinkedin\b|cover.?letter|upload.?resume/i
      .test(allHints);
    if (!isAppForm) return 0;

    const data = await chrome.storage.local.get(['jt_profile', 'jt_pre_answers']);
    const profile    = data['jt_profile']    || {};
    const preAnswers = data['jt_pre_answers'] || {};

    // Don't fill if profile isn't set up
    if (!profile.firstName && !profile.email) return 0;

    let filled = 0;
    for (const field of fields) {
      if (field.disabled || field.readOnly) continue;
      if ((field.value || '').trim().length > 2) continue; // skip pre-filled

      const hint  = getFieldHint(field);
      const value = getValueForHint(hint, profile, preAnswers);

      if (value && value.trim()) {
        setFieldValue(field, value.trim());
        field.style.outline         = '2px solid #059669';
        field.style.backgroundColor = '#f0fdf4';
        filled++;
      }
    }
    return filled;
  }

  // Auto-fill on page load — runs after dynamic content settles
  setTimeout(async () => {
    try {
      const filled = await tryAutoFill();
      if (filled > 0) {
        chrome.runtime.sendMessage({
          type: 'AUTOFILL_COMPLETE',
          count: filled
        }).catch(() => {});
      }
    } catch (_) {}
  }, 2500);

  // Listen for explicit capture requests from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CAPTURE_JD') {
      const data = extractJobData();
      sendResponse({ success: true, data });
    }
    if (message.type === 'FILL_FORM') {
      tryAutoFill()
        .then(count => sendResponse({ success: true, count }))
        .catch(() => sendResponse({ success: false, count: 0 }));
      return true; // async response
    }
    return true;
  });
})();
