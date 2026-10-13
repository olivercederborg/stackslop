// Linear has no public way to ask who is signed in to it in this browser, so this uses the
// endpoint its own web app calls, with the browser's Linear cookies.
const API = "https://client-api.linear.app/graphql";
const TIMEOUT_MS = 5000;

/**
 * Returns the workspaces (as the names in their linear.app URLs) this browser is signed in
 * to, which is none when signed out. Throws when Linear doesn't give a usable answer.
 */
export const fetchLinearWorkspaces = async () => {
  const response = await fetch(API, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ availableUsers { users { organization { urlKey previousUrlKeys } } } }" }),
    // Linear stalling must count as no answer, or the tab would never show.
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401) return [];
  const { data } = await response.json();
  // A renamed workspace keeps its old name in the review links Linear posted before.
  return data.availableUsers.users
    .flatMap(({ organization }) => [organization.urlKey, ...(organization.previousUrlKeys ?? [])])
    .map((urlKey) => urlKey.toLowerCase());
};

/** The workspace a Linear URL belongs to: `https://linear.app/{workspace}/...`. */
export const linearWorkspaceOf = (url) => new URL(url).pathname.split("/")[1].toLowerCase();
