// The in-page buttons and shortcuts every site shares. Each site's script describes where
// its buttons go and which PR the page shows, then calls `start`.

const COPY_ICON =
  '<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path></svg>';
const svg = (paths) =>
  `<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">${paths}</svg>`;
const CHECK_ICON = svg(
  '<path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>',
);
const X_ICON = svg(
  '<path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>',
);

const CACHE_MS = 60_000;
const RETRY_MS = 2000;
const MAX_RETRIES = 3;

const cache = new Map();
// Called with each PR's URL and its freshly loaded links.
const linksListeners = new Set();

// A new token or link target changes every copy, so drop what's loaded.
chrome.storage.onChanged.addListener(() => cache.clear());

const loadLinks = (url) => {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.links;
  // Once the extension reloads, this script lives on in open tabs but can't reach it, and
  // sendMessage throws instead of rejecting.
  const links = Promise.resolve()
    .then(() => chrome.runtime.sendMessage({ type: "load-links", url }))
    .catch((error) => ({
      ok: false,
      message: chrome.runtime?.id ? error.message : "Stackslop was updated, so reload the page",
    }));
  cache.set(url, { at: Date.now(), links });
  // A failed load is worth another try right away, so don't keep it.
  links.then((result) => {
    if ((!result.ok || result.stackFailed) && cache.get(url)?.links === links) cache.delete(url);
    for (const listener of linksListeners) listener(url, result);
  });
  return links;
};

// What each kind copies, as rich HTML plus Markdown or as plain text, and its Graphite
// shortcut keys (C then the key).
const KINDS = {
  pr: { keys: ["p"], rich: true, name: "PR", pick: (result) => result.pr },
  stack: { keys: ["s"], rich: true, name: "stack", pick: (result) => result.stack },
  // Like Graphite: L links to where you review (GitHub or Linear), G always to GitHub.
  link: { keys: ["l"], name: "link", pick: (result) => result.plain.link },
  github: { keys: ["g"], name: "GitHub link", pick: (result) => result.plain.github },
  title: { keys: ["t"], name: "title", pick: (result) => result.plain.title },
  branch: { keys: ["b"], name: "branch name", pick: (result) => result.plain.branch },
  checkout: { keys: ["c"], name: "checkout command", pick: (result) => result.plain.checkout },
};

/**
 * A copy button, styled as GitHub's own, or with classes borrowed from a button on the page
 * when `look` names them, since some sites' class names change between builds.
 */
const createButton = (kind, label, look) => {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.kind = kind;
  button.setAttribute("aria-keyshortcuts", `c ${KINDS[kind].keys[0]}`);
  if (look) {
    button.className = `${look.button} stackslop-borrowed-button`;
    button.innerHTML = `<span class="${look.icon}">${COPY_ICON}</span><span></span>`;
  } else {
    button.className = "stackslop-button";
    button.innerHTML = `${COPY_ICON}<span></span>`;
  }
  button.lastChild.textContent = label;
  return button;
};

// Swaps only the icon, so the button keeps its width.
const flash = (button, outcome, message) => {
  clearTimeout(button.flashTimer);
  button.querySelector("svg").outerHTML = outcome === "copied" ? CHECK_ICON : X_ICON;
  button.dataset.outcome = outcome;
  button.title = message;
  button.flashTimer = setTimeout(() => {
    button.querySelector("svg").outerHTML = COPY_ICON;
    delete button.dataset.outcome;
    button.removeAttribute("title");
  }, 1500);
};

let toastTimer;

// Shortcuts have no button to flash, so they report in a short toast instead.
const toast = (outcome, message) => {
  const element = document.querySelector(".stackslop-toast") ?? document.createElement("div");
  element.className = "stackslop-toast";
  element.setAttribute("role", "status");
  element.dataset.outcome = outcome;
  element.innerHTML = outcome === "copied" ? CHECK_ICON : X_ICON;
  element.append(message);
  if (!element.isConnected) document.body.append(element);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.remove(), 2000);
};

/** Copies one kind of link, then calls `notify(outcome, message)`. */
const copy = (kind, links, notify) => {
  const { rich, name, pick } = KINDS[kind];
  // Handing ClipboardItem promises keeps the user activation while the PR loads.
  const payload = links.then((result) => {
    if (!result.ok) throw Object.assign(new Error(result.message), { needsToken: result.needsToken });
    const value = pick(result);
    if (!value) throw new Error("this PR isn't in a stack");
    return rich ? value : { text: value };
  });
  const blob = (type, key) => payload.then((value) => new Blob([value[key]], { type }));
  const types = { "text/plain": blob("text/plain", "text") };
  if (rich) types["text/html"] = blob("text/html", "html");

  navigator.clipboard
    .write([new ClipboardItem(types)])
    .then(() => notify("copied", `Copied ${name}`))
    .catch(async (writeError) => {
      const error = (await payload.then(() => null, (loadError) => loadError)) ?? writeError;
      if (error.needsToken) chrome.runtime.sendMessage({ type: "open-options" });
      else notify("failed", `Couldn't copy ${name}: ${error.message}`);
    });
};

const render = (url, name, spot) => {
  const container = document.createElement("span");
  container.className = "stackslop-actions";
  container.dataset.url = url;
  container.dataset.spot = name;
  container.dataset.size = spot.size;

  const prButton = createButton("pr", "Copy link", spot.look);
  const stackButton = createButton("stack", "Copy stack", spot.look);
  stackButton.hidden = true;
  container.append(prButton, stackButton);

  let links;
  let retries = 0;
  const load = () => {
    const loading = loadLinks(url);
    links = loading;
    loading.then((result) => {
      // A newer load has taken over.
      if (links !== loading) return;
      const hasStack = Boolean(result.ok && result.stack);
      if (hasStack) stackButton.lastChild.textContent = `Copy stack (${result.stack.count})`;
      stackButton.hidden = !hasStack;
      if (result.needsToken) prButton.title = "GitHub needs a token for this repo. Click to add one.";
      // GitHub's API fails now and then; without a retry the button stays gone until a reload.
      const failed = !result.ok ? !result.needsToken : result.stackFailed;
      if (failed && container.isConnected && retries < MAX_RETRIES) setTimeout(load, RETRY_MS * 2 ** retries++);
    });
  };
  load();
  container.reload = () => {
    retries = 0;
    load();
  };

  prButton.addEventListener("click", () => copy("pr", links, (...args) => flash(prButton, ...args)));
  stackButton.addEventListener("click", () => copy("stack", links, (...args) => flash(stackButton, ...args)));
  return container;
};

const isPlaced = (container, spot) => {
  if (container.parentElement !== spot.parent) return false;
  if (spot.first) return spot.parent.firstElementChild === container;
  return !spot.after || container.previousElementSibling === spot.after;
};

const mount = (container, spot) => {
  if (spot.first) spot.parent.prepend(container);
  else if (spot.after) spot.after.after(container);
  else spot.parent.append(container);
};

// Graphite's shortcuts: C, then the key a kind lists, within this window.
const SHORTCUT_WINDOW_MS = 1500;

const isTyping = (target) =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');

/** Opens the page an O shortcut names for the PR, or says why it can't. */
const open = ({ name, pick }, links) =>
  links.then((result) => {
    const target = result.ok && pick(result);
    if (target) location.assign(target);
    else toast("failed", result.ok ? `This PR has no ${name}` : `Couldn't open ${name}: ${result.message}`);
  });

/**
 * Listens for C then a kind's key on the site's PR pages, and O then a key in `opens`. The
 * first C reaches the page, unless `holdC` is set: then the page gets it only once the
 * window ends or another key follows, for sites where C alone opens something that would
 * take the next key.
 */
const listenForShortcuts = ({ currentPrUrl, holdC, opens = {} }) => {
  const windowMs = holdC ?? SHORTCUT_WINDOW_MS;
  let pressedC = 0;
  let pressedO = 0;
  let held = null;

  // Hands a held C back to the page as it was pressed.
  const release = () => {
    if (!held) return;
    const { target, init } = held;
    held = null;
    // The page has the C now, so a later key mustn't complete a shortcut with it too.
    pressedC = 0;
    clearTimeout(release.timer);
    target.dispatchEvent(new KeyboardEvent("keydown", init));
  };

  window.addEventListener(
    "keydown",
    (event) => {
      // Skips the C this handed back.
      if (!event.isTrusted || event.repeat) return;
      // Keys the shortcuts ignore still get the held C first, so the page sees keys in order.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || isTyping(event.target)) return release();

      const key = event.key.toLowerCase();
      const afterC = Date.now() - pressedC < windowMs;
      const kind = afterC && Object.keys(KINDS).find((k) => KINDS[k].keys.includes(key));
      const url = currentPrUrl();
      if (kind && url) {
        held = null;
        clearTimeout(release.timer);
        pressedC = 0;
        event.preventDefault();
        event.stopImmediatePropagation();
        copy(kind, loadLinks(url), toast);
        return;
      }
      const page = Date.now() - pressedO < SHORTCUT_WINDOW_MS && Object.hasOwn(opens, key) && opens[key];
      if (page && url) {
        pressedO = 0;
        event.preventDefault();
        event.stopImmediatePropagation();
        open(page, loadLinks(url));
        return;
      }

      release();
      pressedC = key === "c" && url ? Date.now() : 0;
      pressedO = key === "o" && url ? Date.now() : 0;
      if (!pressedC || !holdC) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      held = {
        target: event.target,
        init: { key: event.key, code: event.code, keyCode: event.keyCode, bubbles: true, cancelable: true, composed: true },
      };
      release.timer = setTimeout(release, holdC);
    },
    // Capture on window runs before the site's own key handlers.
    true,
  );
};

/**
 * Keeps the site's buttons in place as the page changes, and listens for the shortcuts.
 * `spots` map each spot's name to a function that says where its buttons go, or null when
 * the page lacks it.
 */
const start = (site) => {
  // Sites navigate without page loads and re-render parts of the page, so re-check on DOM changes.
  const sync = () => {
    const url = site.currentPrUrl();
    site.onSync?.();

    for (const [name, find] of Object.entries(site.spots)) {
      const existing = document.querySelector(`.stackslop-actions[data-spot="${name}"]`);
      const spot = url && find();
      const current = existing && spot && existing.dataset.url === url && existing.dataset.size === spot.size;
      // Only touch the DOM when something changed, or the observer would loop.
      if (current && isPlaced(existing, spot)) continue;

      if (current) mount(existing, spot);
      else {
        existing?.remove();
        if (spot) mount(render(url, name, spot), spot);
      }
    }
  };

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  sync();

  // A PR can join a stack after its page loaded, so look again when the tab comes back.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    for (const container of document.querySelectorAll(".stackslop-actions")) container.reload();
  });

  listenForShortcuts(site);
};
