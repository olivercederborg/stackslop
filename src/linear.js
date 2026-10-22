// Linear has no public way to ask who is signed in to it in this browser, so this uses the
// endpoint its own web app calls, with the browser's Linear cookies.
const API = "https://client-api.linear.app/graphql";

/**
 * Returns the workspaces (as the names in their linear.app URLs) this browser is signed in
 * to, which is none when signed out. Throws when Linear doesn't give a usable answer.
 */
export const fetchLinearWorkspaces = async () => {
  const response = await fetch(API, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ availableUsers { users { organization { urlKey } } } }" }),
  });
  if (response.status === 401) return [];
  const { data } = await response.json();
  return data.availableUsers.users.map((user) => user.organization.urlKey.toLowerCase());
};

/**
 * Maps each PR number to its Linear review URL, or null when Linear has none this browser
 * can see. Empty when signed out. Throws when Linear doesn't give a usable answer.
 */
const fetchLinearReviewUrls = async ({ owner, repo }, numbers) => {
  const fields = numbers
    .map((n) => `pr${n}: pullRequestByGitHubInfo(owner: $owner, repo: $repo, number: ${n}) { appUrl }`)
    .join(" ");
  const response = await fetch(API, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query($owner: String!, $repo: String!) { ${fields} }`,
      variables: { owner, repo },
    }),
  });
  if (response.status === 401) return new Map();
  const { data } = await response.json();
  return new Map(numbers.map((n) => [n, data?.[`pr${n}`]?.appUrl ?? null]));
};

/**
 * Fills in the Linear review URL of each loaded PR that has none. Linear reviews every PR,
 * but only comments its link on PRs linked to an issue, so ask Linear for the rest.
 */
export const withLinearReviews = async (ref, { pr, stack, ...rest }) => {
  const numbers = [...new Set([pr, ...(stack?.prs ?? [])].filter((p) => !p.linearUrl).map((p) => p.number))];
  if (!numbers.length) return { pr, stack, ...rest };
  // A missing review URL only drops a link back to GitHub, so a failed lookup must not block a copy.
  const urls = await fetchLinearReviewUrls(ref, numbers).catch(() => new Map());
  const fill = (p) => ({ ...p, linearUrl: p.linearUrl ?? urls.get(p.number) ?? null });
  return { pr: fill(pr), stack: stack && { ...stack, prs: stack.prs.map(fill) }, ...rest };
};

/** The workspace a Linear URL belongs to: `https://linear.app/{workspace}/...`. */
export const linearWorkspaceOf = (url) => new URL(url).pathname.split("/")[1].toLowerCase();
