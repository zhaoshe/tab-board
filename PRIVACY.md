# TabBoard Privacy Policy

TabBoard stores saved tabs, workspaces, settings, and related metadata locally
in `chrome.storage.local` or in a local folder selected by the user.

TabBoard does not upload saved sessions to a TabBoard-operated service. It does
not require an account. It does not sell data, transfer saved session data to
third parties, or use saved session data for advertising.

Some browser-driven network activity is still part of how the extension works:

- Restoring a saved tab or session opens the target page in Chrome, so the
  browser may contact that site.
- Refreshing a saved tab title may reuse an already open tab or briefly open
  the saved URL in a minimized popup window so Chrome can read the final page
  title.
- When a saved favicon URL is available, TabBoard displays it with a normal
  image element, so Chrome may request that favicon from the original site or a
  Chrome-provided favicon URL.

TabBoard requests no host permissions, so it cannot read the contents of
arbitrary web pages. Saved sessions and settings still stay on your machine in
browser storage or in the local folder you selected.

Uninstalling TabBoard removes browser-managed extension storage according to
Chrome's behavior. Files in a user-selected local folder remain under the
user's control and are not deleted by the extension.

For questions, use the GitHub repository:
https://github.com/zhaoshe/tab-board
