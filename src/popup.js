import { collectStats, isRestorableTab, itemTypeLabel, tabMatchesQuery } from "./model.js";
import { getState } from "./store.js";

const statsNode = document.querySelector("#popupStats");
const listNode = document.querySelector("#popupQuickList");
const searchInput = document.querySelector("#popupSearch");
let state = await getState();
let query = "";

render();
document.addEventListener("click", handleClick);
searchInput.addEventListener("input", () => {
  query = searchInput.value.trim();
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.ziptabState) {
    state = changes.ziptabState.newValue;
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
  if (button.dataset.action === "restore-tab") {
    await chrome.runtime.sendMessage({
      type: "restore-tab",
      source: "quick",
      groupId: "",
      tabId: button.dataset.tabId
    });
    window.close();
  }
}

function render() {
  const stats = collectStats(state);
  statsNode.textContent = `${stats.savedTabs} saved, ${stats.quickTabs} quick`;
  const quickTabs = state.quickList.filter((tab) => tabMatchesQuery(tab, query)).slice(0, 20);
  listNode.replaceChildren();
  if (!quickTabs.length) {
    listNode.append(h("li", { class: "empty-row" }, "No quick tabs"));
    return;
  }
  for (const tab of quickTabs) {
    const canOpen = isRestorableTab(tab);
    listNode.append(
      h(
        "li",
        { class: "popup-row" },
        canOpen && tab.favIconUrl
          ? h("img", { class: "favicon", src: tab.favIconUrl, alt: "" })
          : h("span", { class: "favicon fallback" }, ""),
        h("span", {}, tab.title),
        canOpen
          ? h("button", { type: "button", "data-action": "restore-tab", "data-tab-id": tab.id }, "Open")
          : h("span", { class: "muted" }, itemTypeLabel(tab.itemType))
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
