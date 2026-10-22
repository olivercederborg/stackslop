// Linear has no public way to ask who is signed in to it in this browser, so this uses the
// endpoint its own web app calls, with the browser's Linear cookies.
const API = "https://client-api.linear.app/graphql";

/**
 * Asks Linear's API with the browser's Linear cookies, as the workspace user `as` when
 * given. Returns null when signed out. Throws when Linear doesn't give a usable answer.
 */
const query = async (body, as) => {
  const headers = { "Content-Type": "application/json" };
  // The cookie only says who's signed in. Like Linear's own client, these say which
  // workspace a query is for, which anything inside a workspace needs.
  if (as) Object.assign(headers, { user: as.userId, organization: as.organizationId });
  const response = await fetch(API, { method: "POST", credentials: "include", headers, body: JSON.stringify(body) });
  if (response.status === 401) return null;
  const { data, errors } = await response.json();
  if (errors) console.warn("Linear answered with errors", as?.workspace ?? "", response.status, errors);
  if (!data) throw new Error(errors?.[0]?.message ?? `Linear answered ${response.status}`);
  return data;
};

/** The workspace users this browser is signed in to Linear as, which is none when signed out. */
const fetchLinearUsers = async () => {
  const data = await query({ query: "{ availableUsers { users { id organization { id urlKey } } } }" });
  return (data?.availableUsers.users ?? []).map((user) => ({
    userId: user.id,
    organizationId: user.organization.id,
    workspace: user.organization.urlKey.toLowerCase(),
  }));
};

/**
 * Returns the workspaces (as the names in their linear.app URLs) this browser is signed in
 * to, which is none when signed out. Throws when Linear doesn't give a usable answer.
 */
export const fetchLinearWorkspaces = async () => (await fetchLinearUsers()).map((user) => user.workspace);

/**
 * Maps each PR number to its Linear review URL, or null when no workspace this browser is
 * signed in to has one. Empty when signed out.
 */
const fetchLinearReviewUrls = async ({ owner, repo }, numbers) => {
  const fields = numbers
    .map((n) => `pr${n}: pullRequestByGitHubInfo(owner: $owner, repo: $repo, number: ${n}) { appUrl }`)
    .join(" ");
  const body = { query: `query($owner: String!, $repo: String!) { ${fields} }`, variables: { owner, repo } };
  // Which workspace reviews a repo isn't known up front, so ask each one. Most people have one.
  const answers = await Promise.all(
    (await fetchLinearUsers()).map((user) =>
      query(body, user).catch((error) => {
        console.warn("Linear couldn't look up the PRs", user.workspace, error);
        return null;
      }),
    ),
  );
  return new Map(numbers.map((n) => [n, answers.map((data) => data?.[`pr${n}`]?.appUrl).find(Boolean) ?? null]));
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
