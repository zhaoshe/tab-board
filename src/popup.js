import { collectStats, normalizeState } from "./model.js";
import { hydrateIconButtons, iconOnlyButton, iconTextButton } from "./icons.js";
import { buildPopupViewModel } from "./popup-view.js";
import { getState } from "./store.js";

const actionsNode = document.querySelector("#popupActions");
const feedbackNode = document.querySelector("#popupFeedback");
const statsNode = document.querySelector("#popupStats");
const listNode = document.querySelector("#popupSessionList");
const searchInput = document.querySelector("#popupSearch");
let state = await getState();
let query = "";
let duplicateTabCount = 0;
let dedupeReady = false;

hydrateIconButtons();
render();
void loadDuplicateCount();
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
      await sendRuntime({ type: "capture", mode: "current-window" });
      window.close();
    } else if (button.dataset.action === "open-manager") {
      await sendRuntime({ type: "open-manager", query });
      window.close();
    } else if (button.dataset.action === "dedupe-current-window") {
      await sendRuntime({ type: "dedupe-window" });
      window.close();
    } else if (button.dataset.action === "open-options") {
      await sendRuntime({ type: "open-options" });
      window.close();
    } else if (button.dataset.action === "restore-group") {
      await sendRuntime({ type: "restore-group", groupId: button.dataset.groupId });
      window.close();
    } else if (button.dataset.action === "delete-group") {
      if (!confirm("Delete this session?")) {
        return;
      }
      await sendRuntime({ type: "delete-group", groupId: button.dataset.groupId });
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

async function loadDuplicateCount() {
  dedupeReady = false;
  render();
  try {
    const result = await sendRuntime({ type: "count-window-duplicates" });
    duplicateTabCount = Number(result.duplicateTabCount || 0);
  } catch {
    duplicateTabCount = 0;
  } finally {
    dedupeReady = true;
    render();
  }
}

function render() {
  const stats = collectStats(state);
  const model = buildPopupViewModel({ groups: state.groups, query, duplicateTabCount, dedupeReady });
  statsNode.textContent = `${stats.savedTabs} saved, ${stats.groups} sessions`;
  feedbackNode.textContent = "";
  actionsNode.replaceChildren(...model.quickActions.map(renderQuickAction));
  listNode.replaceChildren();

  if (!model.groups.length) {
    listNode.append(h("li", { class: "empty-row" }, model.emptyMessage));
    return;
  }

  for (const group of model.groups) {
    listNode.append(renderGroupRow(group));
  }
}

function renderQuickAction(action) {
  return iconTextButton(action.icon, action.label, {
    class: `popup-quick-action ${action.id === "save" ? "primary" : ""}`,
    "data-action": action.action,
    disabled: action.disabled
  });
}

function renderGroupRow(group) {
  return h(
    "li",
    { class: "popup-row", tabindex: "0" },
    h(
      "span",
      { class: "popup-session-main" },
      h("strong", {}, group.title),
      h("small", {}, `${group.restorableCount} link${group.restorableCount === 1 ? "" : "s"}`)
    ),
    h(
      "span",
      { class: "popup-row-actions" },
      group.actions.includes("restore")
        ? iconOnlyButton("external-link", "Restore session", {
            "data-action": "restore-group",
            "data-group-id": group.id
          })
        : null,
      iconOnlyButton("trash-2", "Delete session", {
        class: "danger",
        "data-action": "delete-group",
        "data-group-id": group.id
      })
    ),
    renderPreview(group.previewTabs)
  );
}

function renderPreview(tabs) {
  if (!tabs.length) {
    return null;
  }
  return h(
    "div",
    { class: "popup-preview", role: "tooltip" },
    h("div", { class: "popup-preview-title" }, "Tabs"),
    ...tabs.map((tab) =>
      h(
        "div",
        { class: "popup-preview-tab" },
        tab.favIconUrl ? h("img", { src: tab.favIconUrl, alt: "" }) : h("span", { class: "popup-preview-favicon" }),
        h("span", {}, tab.title)
      )
    )
  );
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
    if (child === null || child === undefined) {
      continue;
    }
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
