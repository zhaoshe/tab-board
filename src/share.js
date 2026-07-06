import { groupsToText, isRestorableTab, itemTypeLabel, normalizeState } from "./model.js";

const content = document.querySelector("#shareContent");
const toastNode = document.querySelector("#toast");
const groups = readGroups();

render();
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  if (button.dataset.action === "copy") {
    await navigator.clipboard.writeText(groupsToText(groups));
    toast("Copied");
  }
  if (button.dataset.action === "download") {
    downloadStandaloneHtml();
  }
});

function readGroups() {
  try {
    const raw = decodeURIComponent(escape(atob(location.hash.slice(1))));
    return normalizeState({ groups: JSON.parse(raw) }).groups;
  } catch {
    return [];
  }
}

function render() {
  content.replaceChildren();
  if (!groups.length) {
    content.append(h("div", { class: "empty-state" }, h("h2", {}, "No tabs")));
    return;
  }
  for (const group of groups) {
    const article = h("article", { class: "share-group" }, h("h2", {}, group.title));
    if (group.note) {
      article.append(h("p", { class: "muted" }, group.note));
    }
    const list = h("ul", {});
    for (const tab of group.tabs) {
      list.append(
        isRestorableTab(tab)
          ? h(
              "li",
              {},
              h("a", { href: tab.url, target: "_blank", rel: "noreferrer" }, tab.title),
              h("span", {}, tab.url)
            )
          : h("li", {}, h("strong", {}, itemTypeLabel(tab.itemType)), h("span", {}, tab.note || tab.title))
      );
    }
    article.append(list);
    content.append(article);
  }
}

function downloadStandaloneHtml() {
  const body = groups
    .map(
      (group) => `<section>
  <h2>${escapeHtml(group.title)}</h2>
  <ul>
${group.tabs.map(standaloneItemHtml).join("\n")}
  </ul>
</section>`
    )
    .join("\n");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ZipTab Shared Tabs</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 32px; color: #17201f; }
    main { max-width: 900px; margin: 0 auto; }
    section { border: 1px solid #cfd8d3; border-radius: 8px; padding: 16px; margin: 12px 0; }
    li { margin: 10px 0; }
    a { color: #2f6f64; font-weight: 700; }
    small { color: #65736e; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <main>
    <h1>Shared Tabs</h1>
${body}
  </main>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: "ziptab-share.html" });
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function standaloneItemHtml(tab) {
  if (isRestorableTab(tab)) {
    return `    <li><a href="${escapeHtml(tab.url)}">${escapeHtml(tab.title)}</a><br><small>${escapeHtml(tab.url)}</small></li>`;
  }
  return `    <li><strong>${escapeHtml(itemTypeLabel(tab.itemType))}</strong><br><small>${escapeHtml(tab.note || tab.title)}</small></li>`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("visible");
  setTimeout(() => toastNode.classList.remove("visible"), 1600);
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) {
      continue;
    }
    if (key === "class") {
      node.className = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
