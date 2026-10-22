<div align="center">

<img src="icons/icon.svg" width="96" alt="Stackslop logo: a purple stack, melting">

# Stackslop

Graphite-style PR links for GitHub. Copy a PR, or its whole stack, with titles and diff
stats, ready for Slack.

<img src="docs/slack.png" width="560" alt="A stack of five PRs pasted into Slack, each with a state mark, linked title, diff stat, and review note">

</div>

## Install

```sh
gh repo clone olivercederborg/stackslop ~/Developer/stackslop
gh auth token | pbcopy
```

1. Open `chrome://extensions` (or `arc://extensions`), turn on **Developer mode**, click
   **Load unpacked**, and pick the folder.
2. Paste the token into the options page that opens.

To update, run `git pull` in the folder, then click ↻ on the extension's card.

## Use

On a PR page or a Linear review, click **Copy link** or **Copy stack**, or use a shortcut:

| Shortcut | Copies |
| --- | --- |
| <kbd>C</kbd> then <kbd>P</kbd> | The PR, as a rich link with its diff stat |
| <kbd>C</kbd> then <kbd>S</kbd> | The whole stack |
| <kbd>C</kbd> then <kbd>L</kbd> | The link |
| <kbd>C</kbd> then <kbd>G</kbd> | The GitHub link |
| <kbd>C</kbd> then <kbd>T</kbd> | The title |
| <kbd>C</kbd> then <kbd>B</kbd> | The branch name |
| <kbd>C</kbd> then <kbd>C</kbd> | A `gh stack checkout` command |

On a PR page, <kbd>O</kbd> then <kbd>L</kbd> opens its Linear review.

The toolbar popup (<kbd>⌥</kbd><kbd>⇧</kbd><kbd>C</kbd>) previews the stack first.

On a Linear review, <kbd>C</kbd> on its own still opens a new issue, after a short pause.

**Linear Reviews:** set **Links point to** in the options, and links go to each PR's
Linear review instead. <kbd>C</kbd> <kbd>G</kbd> still copies the GitHub link.

A PR with a Linear review also gets a **View in Linear** tab after **Files changed**, when
the review is in a Linear workspace you're signed in to in this browser. Turn it off in the
options.

## Troubleshooting

- **"GitHub couldn't find this PR"**: add a token in the options.
- **No Copy stack button**: the PR isn't in a GitHub stack (`gh stack`).
- **Buttons gone**: GitHub changed its page. The shortcuts and popup still work, so open an issue.
