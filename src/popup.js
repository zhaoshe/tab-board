import { collectStats, normalizeState } from "./model.js";
import { formatRestoreFeedback, formatSaveFeedback } from "./feedback-copy.js";
import { hydrateIconButtons, iconOnlyButton } from "./icons.js";
import { buildPopupViewModel } from "./popup-view.js";
import { getState } from "./store.js";

const feedbackNode = document.querySelector("#popupFeedback");
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

  try {
    if (button.dataset.action === "capture-current-window") {
      const result = await sendRuntime({ type: "capture", mode: "current-window" });
      feedbackNode.textContent = formatSaveFeedback(result.storedTabs || 0);
      window.close();
    }
    if (button.dataset.action === "open-manager") {
      await sendRuntime({ type: "open-manager", query });
      window.close();
    }
    if (button.dataset.action === "restore-group") {
      const result = await sendRuntime({ type: "restore-group", groupId: button.dataset.groupId });
      feedbackNode.textContent = formatRestoreFeedback({ restored: result.restoredTabs || 0 });
      window.close();
    }
  } catch (error) {
    feedbackNode.textContent = error?.message || String(error);
  }
}

async function sendRuntime(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "Chrome runtime call failed");
  }
  return response.result || {};
}

function render() {
  const stats = collectStats(state);
  const model = buildPopupViewModel({ groups: state.groups, query });
  statsNode.textContent = `${stats.savedTabs} saved, ${stats.groups} sessions`;
  feedbackNode.textContent = "";
  listNode.replaceChildren();

  if (!model.groups.length) {
    listNode.append(h("li", { class: "empty-row" }, model.emptyMessage));
    return;
  }

  for (const group of model.groups) {
    listNode.append(
      h(
        "li",
        { class: "popup-row" },
        h(
          "span",
          { class: "popup-session-main" },
          h("strong", {}, group.title),
          h("small", {}, `${group.restorableCount} links`)
        ),
        group.restorableCount
          ? iconOnlyButton("rotate-ccw", "Restore session", {
              "data-action": "restore-group",
              "data-group-id": group.id
            })
          : h("span", { class: "muted" }, "No links")
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
