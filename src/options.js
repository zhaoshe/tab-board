import { DEFAULT_SETTINGS } from "./model.js";
import { getState, updateState } from "./store.js";

const settingsGrid = document.querySelector("#settingsGrid");
const toastNode = document.querySelector("#toast");
let state = await getState();

render();
document.addEventListener("change", handleChange);
document.addEventListener("click", handleClick);

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
  if (button.dataset.action === "open-manager") {
    await chrome.runtime.sendMessage({ type: "open-manager" });
  }
  if (button.dataset.action === "reset-settings") {
    await updateState((draft) => {
      draft.settings = { ...DEFAULT_SETTINGS };
      return draft;
    });
    toast("Settings reset");
  }
  if (button.dataset.action === "open-shortcuts") {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  }
}

async function handleChange(event) {
  const target = event.target.closest("[data-setting]");
  if (!target) {
    return;
  }
  const key = target.dataset.setting;
  const value = target.type === "checkbox" ? target.checked : target.value;
  await updateState((draft) => {
    draft.settings[key] = value;
    return draft;
  });
  toast("Saved");
}

function render() {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  document.documentElement.dataset.theme = settings.theme === "system" ? "" : settings.theme;
  settingsGrid.replaceChildren(
    settingCard(
      "Toolbar",
      "Extension button behavior",
      radioGroup("actionClick", settings.actionClick, [
        ["store", "Save current window"],
        ["popup", "Open quick popup"]
      ])
    ),
    settingCard(
      "Capture",
      "Which tabs are saved",
      checkbox("closeTabsAfterSave", settings.closeTabsAfterSave, "Close tabs after saving"),
      checkbox("includePinnedTabs", settings.includePinnedTabs, "Include pinned tabs"),
      checkbox("dedupeOnSave", settings.dedupeOnSave, "Skip URLs already saved"),
      checkbox("openManagerAfterSave", settings.openManagerAfterSave, "Open ZipTab after saving")
    ),
    settingCard(
      "Restore",
      "How saved tabs return",
      checkbox("deleteRestoredTabs", settings.deleteRestoredTabs, "Remove records after restore"),
      checkbox("restoreGroupsInNewWindow", settings.restoreGroupsInNewWindow, "Restore groups in a new window"),
      checkbox("restoreNextToCurrent", settings.restoreNextToCurrent, "Restore next to active tab"),
      checkbox("focusRestoredTabs", settings.focusRestoredTabs, "Focus first restored tab")
    ),
    settingCard(
      "Interface",
      "Display preferences",
      checkbox("showFavicons", settings.showFavicons, "Show favicons"),
      checkbox("confirmDestructive", settings.confirmDestructive, "Confirm destructive actions"),
      radioGroup("theme", settings.theme, [
        ["system", "System"],
        ["light", "Light"],
        ["dark", "Dark"]
      ])
    ),
    settingCard(
      "Keyboard",
      "Chrome shortcut settings",
      h("button", { type: "button", "data-action": "open-shortcuts" }, "Open shortcuts"),
      h("button", { type: "button", class: "danger", "data-action": "reset-settings" }, "Reset settings")
    )
  );
}

function settingCard(title, subtitle, ...children) {
  return h(
    "section",
    { class: "settings-card" },
    h("div", {}, h("h2", {}, title), h("p", { class: "muted" }, subtitle)),
    h("div", { class: "settings-controls" }, ...children)
  );
}

function checkbox(key, checked, label) {
  return h(
    "label",
    { class: "check-row" },
    h("input", { type: "checkbox", "data-setting": key, checked }),
    h("span", {}, label)
  );
}

function radioGroup(key, current, options) {
  return h(
    "div",
    { class: "segmented" },
    ...options.map(([value, label]) =>
      h(
        "label",
        { class: current === value ? "active" : "" },
        h("input", { type: "radio", name: key, value, "data-setting": key, checked: current === value }),
        h("span", {}, label)
      )
    )
  );
}

function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add("visible");
  setTimeout(() => toastNode.classList.remove("visible"), 1500);
}

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) {
      continue;
    }
    if (key === "class") {
      node.className = value;
    } else if (key === "checked") {
      node.checked = Boolean(value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
