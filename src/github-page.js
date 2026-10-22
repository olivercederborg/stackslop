// Adds "Copy link" and "Copy stack" buttons to GitHub PR pages: in the header, and next
// to the merge button. A PR that Linear has linked also gets a "View in Linear" tab, and O
// then L opens it.

const LINEAR_ICON =
  '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z"></path></svg>';

// The React PR header first, then the classic one.
const TITLE_SELECTOR = 'h1[data-component="PH_Title"], .gh-header-title';
const FILES_TAB_SELECTOR = '#prs-files-anchor-tab, .tabnav-tabs a[href$="/files"]';

// Each loaded PR's Linear review URL, or null when Linear hasn't linked it or the tab is off.
const linearUrls = new Map();

const currentPrUrl = () => {
  const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(location.pathname);
  return match && `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`;
};

// Borrows the Files changed tab's classes, since GitHub's hashed class names change between builds.
const tabClasses = (element) =>
  [...element.classList].filter((name) => !name.startsWith("selected")).join(" ");

/** Keeps a "View in Linear" tab at the end of the PR tabs while the PR has a Linear review. */
const syncLinearTab = () => {
  const existing = document.querySelector(".stackslop-linear-tab");
  const linearUrl = linearUrls.get(currentPrUrl());
  const filesTab = linearUrl && document.querySelector(FILES_TAB_SELECTOR);
  if (!filesTab) return existing?.remove();

  const className = `${tabClasses(filesTab)} stackslop-linear-tab`;
  const current = existing?.href === linearUrl && existing.className === className;
  if (current && filesTab.parentElement.lastElementChild === existing) return;

  existing?.remove();
  const tab = document.createElement("a");
  tab.className = className;
  tab.href = linearUrl;
  tab.innerHTML = `${LINEAR_ICON}View in Linear`;
  const filesIcon = filesTab.querySelector("svg");
  if (filesIcon) tab.firstElementChild.setAttribute("class", tabClasses(filesIcon));
  filesTab.parentElement.append(tab);
};

linksListeners.add((url, result) => {
  if (!result.ok || linearUrls.get(url) === result.linearTabUrl) return;
  linearUrls.set(url, result.linearTabUrl);
  syncLinearTab();
});

start({
  currentPrUrl,
  onSync: syncLinearTab,
  opens: { l: { name: "Linear review", pick: (result) => result.linearUrl } },
  spots: {
    header: () => {
      // Signed in, GitHub's own header buttons sit here; sit with them at their size.
      const actions = document.querySelector('[data-component="PH_Actions"]');
      const hasGitHubButtons = [...(actions?.children ?? [])].some((child) => !child.matches(".stackslop-actions"));
      if (actions && !actions.classList.contains("d-none") && hasGitHubButtons) {
        return { parent: actions, first: true, size: "medium" };
      }
      const title = document.querySelector(TITLE_SELECTOR);
      if (!title) return null;
      // The React header keeps the "#123" next to the title, so go after it.
      const titleArea = title.closest('[data-component="TitleArea"]');
      if (titleArea) return { parent: titleArea, size: "small" };
      return { parent: title.parentElement, after: title, size: "small" };
    },
    "merge-box": () => {
      // The test id is stable; GitHub's hashed CSS module class names change between builds.
      const mergeButtons = document.querySelector(
        '[data-testid="mergebox-border-container"] [data-component="ButtonGroup"]',
      );
      return mergeButtons && { parent: mergeButtons.parentElement, after: mergeButtons, size: "medium" };
    },
  },
});
