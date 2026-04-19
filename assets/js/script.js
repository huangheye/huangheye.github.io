const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[data-panel]'));
const validTabs = new Set(tabs.map((tab) => tab.dataset.tab));
const panelVideos = Array.from(document.querySelectorAll('[data-panel] video'));
const publicationItems = Array.from(
  document.querySelectorAll('#panel-publications .pub-list .pub-entry')
);
const placeholderLinks = Array.from(document.querySelectorAll('[data-placeholder-link]'));
const prospectiveForm = document.querySelector('#prospective-form');
const prospectiveFormStatus = document.querySelector('#prospective-form-status');
const prospectiveSubmitButton = prospectiveForm?.querySelector('button[type="submit"]');
const MAX_CV_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function isPdfFile(file) {
  if (!(file instanceof File)) {
    return false;
  }

  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return mime === 'application/pdf' || name.endsWith('.pdf');
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : '';

      if (!base64) {
        reject(new Error('Failed to encode file.'));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file.'));
    };

    reader.readAsDataURL(file);
  });
}

function setProspectiveFormStatus(message, state = '') {
  if (!prospectiveFormStatus) {
    return;
  }

  prospectiveFormStatus.textContent = message;
  prospectiveFormStatus.dataset.state = state;
}

function createPublicationActionLink(item, type) {
  const config = {
    paper: {
      url: item.dataset.paperUrl?.trim(),
      label: 'Paper',
      icon: 'icon-paper',
    },
    project: {
      url: item.dataset.projectUrl?.trim(),
      label: 'Project',
      icon: 'icon-homepage',
    },
    code: {
      url: item.dataset.codeUrl?.trim(),
      label: 'Code',
      icon: 'icon-code',
    },
  }[type];
  const url = config?.url || '';
  const label = config?.label || type;
  const icon = config?.icon || 'icon-paper';
  const element = url ? document.createElement('a') : document.createElement('span');

  element.className = 'pub-action-link';

  if (url) {
    element.href = url;
    element.target = '_blank';
    element.rel = 'noreferrer';
    element.setAttribute('aria-label', `${label} link`);
  } else {
    element.classList.add('is-placeholder');
    element.setAttribute('aria-label', `${label} link placeholder`);
  }

  element.innerHTML = `
    <svg class="pub-action-icon" viewBox="0 0 24 24" aria-hidden="true">
      <use href="#${icon}"></use>
    </svg>
    <span>${label}</span>
  `;

  return element;
}

function renderPublicationLinks() {
  publicationItems.forEach((item) => {
    const linkHost = item.querySelector('.pub-entry-body') || item;

    if (linkHost.querySelector('.pub-action-links')) {
      return;
    }

    const linkTypes = ['paper', 'project', 'code'].filter((type) => {
      if (type === 'paper') {
        return item.dataset.paperUrl?.trim();
      }

      if (type === 'project') {
        return item.dataset.projectUrl?.trim();
      }

      return item.dataset.codeUrl?.trim();
    });

    if (!linkTypes.length) {
      return;
    }

    const links = document.createElement('div');
    links.className = 'pub-action-links';
    links.append(...linkTypes.map((type) => createPublicationActionLink(item, type)));
    linkHost.append(links);
  });
}

async function submitProspectiveForm(event) {
  event.preventDefault();

  if (!prospectiveForm) {
    return;
  }

  if (!prospectiveForm.reportValidity()) {
    return;
  }

  const endpoint = prospectiveForm.dataset.endpoint?.trim() || '';

  if (!endpoint) {
    setProspectiveFormStatus(
      'Form backend is not configured yet. Add the deployed Google Apps Script URL to the form data-endpoint attribute in index.html.',
      'error'
    );
    return;
  }

  const formData = new FormData(prospectiveForm);
  const honeypot = String(formData.get('website') || '').trim();
  const cvFile = formData.get('cvFile');

  if (honeypot) {
    prospectiveForm.reset();
    setProspectiveFormStatus('Submitted successfully.', 'success');
    return;
  }

  if (!(cvFile instanceof File) || !cvFile.size) {
    setProspectiveFormStatus('Please upload your CV as a PDF file.', 'error');
    return;
  }

  if (!isPdfFile(cvFile)) {
    setProspectiveFormStatus('Please upload a PDF file for the CV.', 'error');
    return;
  }

  if (cvFile.size > MAX_CV_FILE_SIZE_BYTES) {
    setProspectiveFormStatus('The CV must be a PDF no larger than 5 MB.', 'error');
    return;
  }

  const payload = {
    submittedAt: new Date().toISOString(),
    pageUrl: window.location.href,
  };

  for (const [key, value] of formData.entries()) {
    if (key === 'website' || key === 'cvFile') {
      continue;
    }

    const normalizedValue = String(value).trim();

    if (!normalizedValue) {
      continue;
    }

    payload[key] = normalizedValue;
  }

  if (prospectiveSubmitButton instanceof HTMLButtonElement) {
    prospectiveSubmitButton.disabled = true;
  }

  setProspectiveFormStatus('Submitting inquiry...', '');

  try {
    payload.cvFilename = cvFile.name;
    payload.cvMimeType = cvFile.type || 'application/pdf';
    payload.cvBase64 = await readFileAsBase64(cvFile);

    await fetch(endpoint, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    prospectiveForm.reset();
    setProspectiveFormStatus('Inquiry submitted successfully.', 'success');
  } catch (_) {
    setProspectiveFormStatus(
      'Submission failed. Please try again, or contact the lab directly by email.',
      'error'
    );
  } finally {
    if (prospectiveSubmitButton instanceof HTMLButtonElement) {
      prospectiveSubmitButton.disabled = false;
    }
  }
}

function getVideoStart(video) {
  const value = Number.parseFloat(video.dataset.start || '0');
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function seekVideoToStart(video) {
  const start = getVideoStart(video);

  if (!start) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const applyStart = () => {
      try {
        if (Math.abs(video.currentTime - start) > 0.2) {
          video.currentTime = start;
        }
      } catch (_) {}

      resolve();
    };

    if (video.readyState >= 1) {
      applyStart();
      return;
    }

    video.addEventListener('loadedmetadata', applyStart, { once: true });
  });
}

function syncPanelVideos(activeTabName) {
  panelVideos.forEach((video) => {
    const panel = video.closest('[data-panel]');
    const shouldPlay =
      panel &&
      panel.dataset.panel === activeTabName &&
      !panel.hidden &&
      !document.hidden;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    if (shouldPlay) {
      seekVideoToStart(video).then(() => {
        const refreshedPanel = video.closest('[data-panel]');
        const stillVisible =
          refreshedPanel &&
          refreshedPanel.dataset.panel === activeTabName &&
          !refreshedPanel.hidden &&
          !document.hidden;

        if (!stillVisible) {
          return;
        }

        const playPromise = video.play();

        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {});
        }
      });

      return;
    }

    video.pause();
  });
}

panelVideos.forEach((video) => {
  video.addEventListener('ended', () => {
    const start = getVideoStart(video);

    if (!start) {
      return;
    }

    try {
      video.currentTime = start;
    } catch (_) {}

    const panel = video.closest('[data-panel]');
    const isVisible = panel && !panel.hidden && !document.hidden;

    if (isVisible) {
      const playPromise = video.play();

      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  });
});

placeholderLinks.forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
  });
});

renderPublicationLinks();

if (prospectiveForm) {
  prospectiveForm.addEventListener('submit', submitProspectiveForm);
}

function activateTab(tabName, updateHash = true) {
  if (!validTabs.has(tabName)) {
    return;
  }

  tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.setAttribute('aria-selected', String(isActive));
    tab.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.hidden = !isActive;
    panel.classList.toggle('is-active', isActive);
  });

  if (updateHash) {
    history.replaceState(null, '', `#${tabName}`);
  }

  requestAnimationFrame(() => {
    syncPanelVideos(tabName);
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    activateTab(tab.dataset.tab);
  });

  tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }

    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const nextIndex = (index + direction + tabs.length) % tabs.length;
    tabs[nextIndex].focus();
    activateTab(tabs[nextIndex].dataset.tab);
  });
});

window.addEventListener('hashchange', () => {
  const hashTab = window.location.hash.replace('#', '');
  activateTab(validTabs.has(hashTab) ? hashTab : 'home', false);
});

document.addEventListener('visibilitychange', () => {
  const activeTab = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true')?.dataset.tab || 'home';
  syncPanelVideos(activeTab);
});

syncPublicationView();
activateTab(window.location.hash.replace('#', '') || 'home', false);
