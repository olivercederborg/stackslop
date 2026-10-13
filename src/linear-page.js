// Adds "Copy link" and "Copy stack" buttons to Linear review pages, before the PR chip in
// the header, and the same shortcuts as on GitHub.

// Linear labels the header's PR chip "{owner}/{repo}#{number}, pull request actions". It
// renders the chip twice, with one copy hidden.
const PR_CHIP_SELECTOR = 'button[aria-label$=", pull request actions"]';

const currentPrUrl = () => {
  if (!/^\/[^/]+\/review\//.test(location.pathname)) return null;
  const label = document.querySelector(PR_CHIP_SELECTOR)?.getAttribute("aria-label");
  const match = /^([^/\s]+)\/([^#\s]+)#(\d+),/.exec(label ?? "");
  return match && `https://github.com/${match[1]}/${match[2]}/pull/${match[3]}`;
};

start({
  currentPrUrl,
  // C alone opens Linear's new issue form, which would swallow the next key.
  holdC: 750,
  spots: {
    header: () => {
      const chip = [...document.querySelectorAll(PR_CHIP_SELECTOR)].find((button) => button.offsetWidth);
      // The chip sits in the group with the header's own Copy URL button.
      let group = chip?.parentElement;
      while (group && !group.querySelector('button[aria-label="Copy URL"]')) group = group.parentElement;
      if (!group) return null;
      // Linear's class names change between builds, so borrow the chip's, to match it in both themes.
      const look = { button: chip.className, icon: chip.querySelector("span")?.className ?? "" };
      return { parent: group, first: true, size: "linear", look };
    },
  },
});
