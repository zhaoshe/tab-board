import { DEFAULT_SETTINGS, isKnownSettingKey } from "./model.js";
import { formatSettingsSavedMessage } from "./feedback-copy.js";
import { hydrateIconButtons, iconTextButton } from "./icons.js";
import { buildSettingsSections } from "./options-view.js";
import { getState, updateState } from "./store.js";

const advancedSettingsGrid = document.querySelector("#advancedSettingsGrid");
const basicSettingsGrid = document.querySelector("#basicSettingsGrid");
const toastNode = document.querySelector("#toast");
let state = await getState();

hydrateIconButtons();
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
    await updateState((draft) => ({ ...draft, settings: { ...DEFAULT_SETTINGS } }));
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
  if (!isKnownSettingKey(key)) {
    return;
  }
  const value = target.type === "checkbox" ? target.checked : target.value;
  await updateState((draft) => ({
    ...draft,
    settings: { ...draft.settings, [key]: value }
  }));
  toast(formatSettingsSavedMessage());
}

function render() {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const sections = buildSettingsSections();
  const basicKeys = settingKeySet(sections.basic);
  document.documentElement.dataset.theme = settings.theme === "system" ? "" : settings.theme;

  basicSettingsGrid.replaceChildren(
    settingCard(
      "Toolbar",
      "Extension button behavior",
      ...settingControls(basicKeys, [
        {
          key: "actionClick",
          control: radioGroup("actionClick", settings.actionClick, [
            ["store", "Save current window"],
            ["popup", "Open popup"]
          ])
        }
      ])
    ),
    settingCard(
      "Capture",
      "Daily save behavior",
      ...settingControls(basicKeys, [
        { key: "closeTabsAfterSave", control: checkbox("closeTabsAfterSave", settings.closeTabsAfterSave, "Close tabs after saving") },
        { key: "openManagerAfterSave", control: checkbox("openManagerAfterSave", settings.openManagerAfterSave, "Open ZipTab after saving") },
        { key: "dedupeOnSave", control: checkbox("dedupeOnSave", settings.dedupeOnSave, "Deduplicate tabs during capture") }
      ])
    ),
    settingCard(
      "Restore",
      "How saved tabs return",
      ...settingControls(basicKeys, [
        { key: "deleteRestoredTabs", control: checkbox("deleteRestoredTabs", settings.deleteRestoredTabs, "Remove records after restore") },
        {
          key: "restoreGroupsInNewWindow",
          control: checkbox("restoreGroupsInNewWindow", settings.restoreGroupsInNewWindow, "Restore groups in a new window")
        },
        { key: "restoreNextToCurrent", control: checkbox("restoreNextToCurrent", settings.restoreNextToCurrent, "Restore next to active tab") },
        { key: "focusRestoredTabs", control: checkbox("focusRestoredTabs", settings.focusRestoredTabs, "Focus first restored tab") }
      ])
    ),
    settingCard(
      "Appearance",
      "Theme preference",
      ...settingControls(basicKeys, [
        {
          key: "theme",
          control: radioGroup("theme", settings.theme, [
            ["system", "System"],
            ["light", "Light"],
            ["dark", "Dark"]
          ])
        }
      ])
    )
  );

  advancedSettingsGrid.replaceChildren(
    settingCard(
      "Keyboard",
      "Chrome shortcut settings",
      iconTextButton("keyboard", "Open shortcuts", { "data-action": "open-shortcuts" }),
      iconTextButton("rotate-ccw", "Reset settings", { class: "danger", "data-action": "reset-settings" })
    )
  );
}

function settingKeySet(items) {
  return new Set(items.map((item) => item.key));
}

function settingControls(keys, controls) {
  return controls.filter((item) => keys.has(item.key)).map((item) => item.control);
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
    } else if (key === "value") {
      node.value = String(value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
