const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panels = Array.from(document.querySelectorAll('[data-panel]'));
const validTabs = new Set(tabs.map((tab) => tab.dataset.tab));
const panelVideos = Array.from(document.querySelectorAll('[data-panel] video'));
const publicationItems = Array.from(
  document.querySelectorAll('#panel-publications .pub-list .pub-entry')
);
const placeholderLinks = Array.from(document.querySelectorAll('[data-placeholder-link]'));

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

    const note = linkHost.querySelector('.pub-entry-note');

    if (note) {
      note.append(links);
      return;
    }

    linkHost.append(links);
  });
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

activateTab(window.location.hash.replace('#', '') || 'home', false);
