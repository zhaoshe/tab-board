import { collectStats, groupMatchesQuery, isRestorableTab, normalizeState } from "./model.js";
import { hydrateIconButtons, iconOnlyButton } from "./icons.js";
import { getState } from "./store.js";

const statsNode = document.querySelector("#popupStats");
const listNode = document.querySelector("#popupSessionList");
const searchInput = document.querySelector("#popupSearch");
let state = await getState();
let query = "";

hydrateIconButtons();
render();
document.addEventListener("click", handleClick);
searchInput.addEventListener("input", () => {
  query = searchInput.value.trim();
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ziptabState) {
    state = normalizeState(changes.ziptabState.newValue);
    render();
  }
});

async function handleClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button) {
    return;
  }
  if (button.dataset.action === "capture-current-window") {
    await chrome.runtime.sendMessage({ type: "capture", mode: "current-window" });
    window.close();
  }
  if (button.dataset.action === "open-manager") {
    await chrome.runtime.sendMessage({ type: "open-manager", query });
    window.close();
  }
  if (button.dataset.action === "restore-group") {
    await chrome.runtime.sendMessage({ type: "restore-group", groupId: button.dataset.groupId });
    window.close();
  }
}

function render() {
  const stats = collectStats(state);
  statsNode.textContent = `${stats.savedTabs} saved, ${stats.groups} sessions`;
  const groups = state.groups.filter((group) => groupMatchesQuery(group, query)).slice(0, 8);
  listNode.replaceChildren();
  if (!groups.length) {
    listNode.append(h("li", { class: "empty-row" }, "No saved sessions"));
    return;
  }
  for (const group of groups) {
    const restorableCount = group.tabs.filter(isRestorableTab).length;
    listNode.append(
      h(
        "li",
        { class: "popup-row" },
        h(
          "span",
          { class: "popup-session-main" },
          h("strong", {}, group.title),
          h("small", {}, `${restorableCount} links`)
        ),
        restorableCount
          ? iconOnlyButton("rotate-ccw", "Restore session", {
              "data-action": "restore-group",
              "data-group-id": group.id
            })
          : h("span", { class: "muted" }, "Empty")
      )
    );
  }
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
