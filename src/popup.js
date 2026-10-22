import { formatPrs, formatStack, stackNote } from "./format.js";
import { GitHubError, fetchPrWithStack, parsePrUrl } from "./github.js";
import { withLinearReviews } from "./linear.js";

const status = document.getElementById("status");
const preview = document.getElementById("preview");
const actions = document.getElementById("actions");
const copyPrButton = document.getElementById("copy-pr");
const copyStackButton = document.getElementById("copy-stack");

const showStatus = (message, { optionsLink = false } = {}) => {
  status.textContent = message;
  status.classList.toggle("error", optionsLink);
  if (optionsLink) {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "Add a GitHub token";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });
    status.append(" ", link);
  }
  status.hidden = false;
};

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const renderRow = (pr, { current, note }) => {
  const row = element("li", `row state-${pr.state}${current ? " current" : ""}`);
  const title = element("span", "title");
  title.append(element("span", "number", `#${pr.number}`), ` ${pr.title}`);
  title.title = pr.title;
  const diff = element("span", "diff");
  diff.append(element("span", "additions", `+${pr.additions}`), element("span", "deletions", `−${pr.deletions}`));
  row.append(element("span", "dot"), title);
  if (note) row.append(element("span", `note note-${note.replace(" ", "-")}`, note));
  row.append(diff);
  return row;
};

const renderPreview = (pr, stack) => {
  const rows = stack
    ? stack.prs.map((stackPr) => renderRow(stackPr, { current: stackPr.number === pr.number, note: stackNote(stackPr) }))
    : [renderRow(pr, {})];
  if (stack) {
    const trunk = element("li", "row trunk");
    trunk.append(element("span", "dot"), element("span", "branch", stack.trunk));
    rows.push(trunk);
  }
  preview.classList.toggle("is-stack", Boolean(stack));
  preview.replaceChildren(...rows);
  preview.hidden = false;
};

let copied = false;

const copy = async ({ html, text }, button) => {
  if (copied) return;
  copied = true;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      }),
    ]);
  } catch (error) {
    copied = false;
    showStatus(`Couldn't copy: ${error.message}`);
    return;
  }
  button.classList.add("copied");
  button.firstElementChild.textContent = "Copied";
  setTimeout(() => window.close(), 600);
};

const activeTabUrl = async () => {
  // `?url=` lets the popup be opened as a page for testing.
  const override = new URLSearchParams(location.search).get("url");
  if (override) return override;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url;
};

const main = async () => {
  const ref = parsePrUrl(await activeTabUrl());
  if (!ref) {
    showStatus("Open a GitHub pull request to copy its link.");
    return;
  }

  const { token, linkTarget } = await chrome.storage.local.get(["token", "linkTarget"]);
  const loaded = await fetchPrWithStack(ref, token);
  const { pr, stack } = linkTarget === "linear" ? await withLinearReviews(ref, loaded) : loaded;

  const hasStack = stack !== null;
  renderPreview(pr, stack);
  status.hidden = true;
  actions.hidden = false;
  copyStackButton.hidden = !hasStack;
  if (hasStack) copyStackButton.firstElementChild.textContent = `Copy stack of ${stack.prs.length}`;

  const copyPr = () => copy(formatPrs([pr], linkTarget), copyPrButton);
  const copyStack = () => copy(formatStack(stack, linkTarget), copyStackButton);
  copyPrButton.addEventListener("click", copyPr);
  copyStackButton.addEventListener("click", copyStack);
  document.addEventListener("keydown", (event) => {
    // A focused button handles its own Enter through the click listener.
    if (event.target instanceof HTMLButtonElement) return;
    const key = event.key.toLowerCase();
    if (key === "enter" || key === "p") copyPr();
    if (hasStack && key === "s") copyStack();
  });
};

main().catch((error) => {
  if (error instanceof GitHubError && [401, 403, 404].includes(error.status)) {
    showStatus("GitHub couldn't find this PR. Private repos need a token.", { optionsLink: true });
    return;
  }
  showStatus(`Couldn't load the PR: ${error.message}`);
});
