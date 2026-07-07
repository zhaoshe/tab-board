import { DEFAULT_SESSION_EXTERNAL_ACTIONS, DEFAULT_SETTINGS, SESSION_ACTION_IDS, isKnownSettingKey } from "./model.js";
import { hydrateIconButtons, iconOnlyButton, iconTextButton } from "./icons.js";
import { getState, updateState } from "./store.js";

const settingsGrid = document.querySelector("#settingsGrid");
const toastNode = document.querySelector("#toast");
const SESSION_ACTION_META = {
  add: { label: "Add item" },
  collapse: { label: "Collapse / expand" },
  copy: { label: "Copy" },
  delete: { label: "Delete" },
  lock: { label: "Lock" },
  note: { label: "Note" },
  rename: { label: "Rename" },
  restore: { label: "Restore" }
};
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
    await updateState((draft) => {
      draft.settings = { ...DEFAULT_SETTINGS };
      return draft;
    });
    toast("Settings reset");
  }
  if (button.dataset.action === "open-shortcuts") {
    await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  }
  if (button.dataset.action === "session-action-up" || button.dataset.action === "session-action-down") {
    await moveSessionAction(
      button.dataset.sessionAction,
      button.dataset.action === "session-action-up" ? -1 : 1
    );
  }
}

async function handleChange(event) {
  const sessionAction = event.target.closest("[data-session-toolbar-action]");
  if (sessionAction) {
    await toggleSessionAction(sessionAction.dataset.sessionToolbarAction, sessionAction.checked);
    return;
  }

  const target = event.target.closest("[data-setting]");
  if (!target) {
    return;
  }
  const key = target.dataset.setting;
  if (!isKnownSettingKey(key)) {
    return;
  }
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
        ["popup", "Open popup"]
      ])
    ),
    settingCard(
      "Capture",
      "Which tabs are saved",
      checkbox("closeTabsAfterSave", settings.closeTabsAfterSave, "Close tabs after saving"),
      checkbox("includePinnedTabs", settings.includePinnedTabs, "Include pinned tabs"),
      checkbox("includeChromeUrls", settings.includeChromeUrls, "Include chrome:// links"),
      checkbox("includeFileUrls", settings.includeFileUrls, "Include file:// links"),
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
      ]),
      sessionToolbarEditor(settings)
    ),
    settingCard(
      "Keyboard",
      "Chrome shortcut settings",
      iconTextButton("keyboard", "Open shortcuts", { "data-action": "open-shortcuts" }),
      iconTextButton("rotate-ccw", "Reset settings", { class: "danger", "data-action": "reset-settings" })
    )
  );
}

async function moveSessionAction(actionId, delta) {
  await updateState((draft) => {
    const order = sessionActionOrder(draft.settings);
    const index = order.indexOf(actionId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
      return draft;
    }
    const [item] = order.splice(index, 1);
    order.splice(nextIndex, 0, item);
    const external = new Set(sessionExternalActions(draft.settings));
    draft.settings.sessionActionOrder = order;
    draft.settings.sessionExternalActions = order.filter((id) => external.has(id));
    return draft;
  });
  toast("Saved");
}

async function toggleSessionAction(actionId, visible) {
  await updateState((draft) => {
    const order = sessionActionOrder(draft.settings);
    const external = new Set(sessionExternalActions(draft.settings));
    if (visible) {
      external.add(actionId);
    } else {
      external.delete(actionId);
    }
    draft.settings.sessionActionOrder = order;
    draft.settings.sessionExternalActions = order.filter((id) => external.has(id));
    return draft;
  });
  toast("Saved");
}

function sessionToolbarEditor(settings) {
  const order = sessionActionOrder(settings);
  const external = new Set(sessionExternalActions(settings));
  return h(
    "div",
    { class: "session-toolbar-editor" },
    h("p", { class: "muted" }, "Choose which session actions appear on cards. Hidden actions stay in More."),
    ...order.map((actionId, index) =>
      h(
        "div",
        { class: "toolbar-action-row" },
        h(
          "label",
          { class: "toolbar-action-check" },
          h("input", {
            type: "checkbox",
            "data-session-toolbar-action": actionId,
            checked: external.has(actionId)
          }),
          h("span", {}, SESSION_ACTION_META[actionId]?.label || actionId)
        ),
        h(
          "div",
          { class: "toolbar-action-controls" },
          iconOnlyButton("chevrons-up", "Move earlier", {
            "data-action": "session-action-up",
            "data-session-action": actionId,
            disabled: index === 0
          }),
          iconOnlyButton("chevrons-down", "Move later", {
            "data-action": "session-action-down",
            "data-session-action": actionId,
            disabled: index === order.length - 1
          })
        )
      )
    )
  );
}

function sessionActionOrder(settings) {
  const configured = Array.isArray(settings?.sessionActionOrder)
    ? settings.sessionActionOrder.map((item) => String(item))
    : [];
  return [
    ...new Set(configured.filter((item) => SESSION_ACTION_IDS.includes(item))),
    ...SESSION_ACTION_IDS.filter((item) => !configured.includes(item))
  ];
}

function sessionExternalActions(settings) {
  const order = sessionActionOrder(settings);
  const configured = Array.isArray(settings?.sessionExternalActions)
    ? settings.sessionExternalActions.map((item) => String(item))
    : [...DEFAULT_SESSION_EXTERNAL_ACTIONS];
  const external = new Set(configured.filter((item) => SESSION_ACTION_IDS.includes(item)));
  return order.filter((item) => external.has(item));
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
