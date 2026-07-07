const SVG_NS = "http://www.w3.org/2000/svg";
const TOOLTIP_DELAY_MS = 620;
const tooltipDocuments = new WeakSet();

const ICONS = {
  archive: [
    ["path", { d: "M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" }],
    ["path", { d: "M1 3h22v5H1z" }],
    ["path", { d: "M10 12h4" }]
  ],
  "archive-restore": [
    ["path", { d: "M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" }],
    ["path", { d: "M1 3h22v5H1z" }],
    ["path", { d: "M9 15h6" }],
    ["path", { d: "M12 12v6" }],
    ["path", { d: "m9 15 3-3 3 3" }]
  ],
  "chevrons-down": [
    ["path", { d: "m7 6 5 5 5-5" }],
    ["path", { d: "m7 13 5 5 5-5" }]
  ],
  "chevrons-up": [
    ["path", { d: "m7 11 5-5 5 5" }],
    ["path", { d: "m7 18 5-5 5 5" }]
  ],
  copy: [
    ["rect", { x: "9", y: "9", width: "13", height: "13", rx: "2" }],
    ["path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" }]
  ],
  download: [
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
    ["path", { d: "M7 10l5 5 5-5" }],
    ["path", { d: "M12 15V3" }]
  ],
  "edit-3": [
    ["path", { d: "M12 20h9" }],
    ["path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" }]
  ],
  "external-link": [
    ["path", { d: "M15 3h6v6" }],
    ["path", { d: "M10 14 21 3" }],
    ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }]
  ],
  eye: [
    ["path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" }],
    ["circle", { cx: "12", cy: "12", r: "3" }]
  ],
  "eye-off": [
    ["path", { d: "M3 3l18 18" }],
    ["path", { d: "M10.6 10.6a3 3 0 0 0 4 4" }],
    ["path", { d: "M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a18 18 0 0 1-3 4.2" }],
    ["path", { d: "M6.6 6.6C3.7 8.6 2 12 2 12s3.5 8 10 8a10.8 10.8 0 0 0 4.2-.8" }]
  ],
  "file-text": [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M14 2v6h6" }],
    ["path", { d: "M16 13H8" }],
    ["path", { d: "M16 17H8" }],
    ["path", { d: "M10 9H8" }]
  ],
  filter: [
    ["path", { d: "M22 3H2l8 9.5V19l4 2v-8.5Z" }]
  ],
  "folder-plus": [
    ["path", { d: "M12 10v6" }],
    ["path", { d: "M9 13h6" }],
    ["path", { d: "M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v1" }],
    ["path", { d: "M3 7h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" }]
  ],
  focus: [
    ["circle", { cx: "12", cy: "12", r: "3" }],
    ["path", { d: "M12 2v3" }],
    ["path", { d: "M12 19v3" }],
    ["path", { d: "M2 12h3" }],
    ["path", { d: "M19 12h3" }],
    ["path", { d: "M4.9 4.9 7 7" }],
    ["path", { d: "M17 17l2.1 2.1" }],
    ["path", { d: "M19.1 4.9 17 7" }],
    ["path", { d: "M7 17l-2.1 2.1" }]
  ],
  import: [
    ["path", { d: "M12 3v12" }],
    ["path", { d: "m7 8 5-5 5 5" }],
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }]
  ],
  keyboard: [
    ["rect", { x: "2", y: "5", width: "20", height: "14", rx: "2" }],
    ["path", { d: "M6 9h.01" }],
    ["path", { d: "M10 9h.01" }],
    ["path", { d: "M14 9h.01" }],
    ["path", { d: "M18 9h.01" }],
    ["path", { d: "M8 13h8" }]
  ],
  layers: [
    ["path", { d: "m12 2 9 5-9 5-9-5Z" }],
    ["path", { d: "m3 12 9 5 9-5" }],
    ["path", { d: "m3 17 9 5 9-5" }]
  ],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.1 0l-2 2a5 5 0 0 0 7.1 7.1l1.1-1.1" }]
  ],
  "list-plus": [
    ["path", { d: "M8 6h11" }],
    ["path", { d: "M8 12h8" }],
    ["path", { d: "M8 18h5" }],
    ["path", { d: "M3 6h.01" }],
    ["path", { d: "M3 12h.01" }],
    ["path", { d: "M3 18h.01" }],
    ["path", { d: "M18 16v6" }],
    ["path", { d: "M15 19h6" }]
  ],
  lock: [
    ["rect", { x: "4", y: "11", width: "16", height: "10", rx: "2" }],
    ["path", { d: "M8 11V7a4 4 0 0 1 8 0v4" }]
  ],
  "more-horizontal": [
    ["circle", { cx: "5", cy: "12", r: "1" }],
    ["circle", { cx: "12", cy: "12", r: "1" }],
    ["circle", { cx: "19", cy: "12", r: "1" }]
  ],
  plus: [
    ["path", { d: "M12 5v14" }],
    ["path", { d: "M5 12h14" }]
  ],
  "refresh-cw": [
    ["path", { d: "M3 12a9 9 0 0 1 15.7-6L21 8" }],
    ["path", { d: "M21 3v5h-5" }],
    ["path", { d: "M21 12a9 9 0 0 1-15.7 6L3 16" }],
    ["path", { d: "M3 21v-5h5" }]
  ],
  "rotate-ccw": [
    ["path", { d: "M3 2v6h6" }],
    ["path", { d: "M3.5 13A8.5 8.5 0 1 0 6 6.5L3 8" }]
  ],
  search: [
    ["circle", { cx: "11", cy: "11", r: "8" }],
    ["path", { d: "m21 21-4.3-4.3" }]
  ],
  settings: [
    ["path", { d: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" }],
    ["path", { d: "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" }]
  ],
  share: [
    ["circle", { cx: "18", cy: "5", r: "3" }],
    ["circle", { cx: "6", cy: "12", r: "3" }],
    ["circle", { cx: "18", cy: "19", r: "3" }],
    ["path", { d: "m8.6 13.5 6.8 4" }],
    ["path", { d: "m15.4 6.5-6.8 4" }]
  ],
  star: [
    ["path", { d: "m12 2 3.1 6.3 6.9 1-5 4.8 1.2 6.9-6.2-3.3L5.8 21 7 14.1 2 9.3l6.9-1Z" }]
  ],
  "sticky-note": [
    ["path", { d: "M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" }],
    ["path", { d: "M16 3v5h5" }]
  ],
  "square-check": [
    ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }],
    ["path", { d: "m9 12 2 2 4-5" }]
  ],
  "trash-2": [
    ["path", { d: "M3 6h18" }],
    ["path", { d: "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }],
    ["path", { d: "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" }],
    ["path", { d: "M10 11v6" }],
    ["path", { d: "M14 11v6" }]
  ],
  unlock: [
    ["rect", { x: "4", y: "11", width: "16", height: "10", rx: "2" }],
    ["path", { d: "M8 11V7a4 4 0 0 1 7.6-1.8" }]
  ],
  upload: [
    ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }],
    ["path", { d: "M17 8 12 3 7 8" }],
    ["path", { d: "M12 3v12" }]
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }]
  ]
};

export function createIcon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "button-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  for (const [tag, attrs] of ICONS[name] || ICONS["more-horizontal"]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
    }
    svg.append(node);
  }
  return svg;
}

export function hydrateIconButtons(root = document) {
  for (const node of root.querySelectorAll("[data-icon]")) {
    if (node.dataset.iconHydrated === "true") {
      continue;
    }
    const label = node.getAttribute("aria-label") || node.getAttribute("title") || node.textContent.trim();
    const showText = node.hasAttribute("data-icon-text");
    const isSummary = node.tagName.toLowerCase() === "summary";
    node.setAttribute("aria-label", label);
    node.removeAttribute("title");
    node.classList.add(showText ? "icon-text-button" : isSummary ? "icon-summary" : "icon-button");
    if (!showText && !node.dataset.tooltip) {
      node.dataset.tooltip = label;
    }
    node.replaceChildren(createIcon(node.dataset.icon));
    if (showText) {
      node.append(labelSpan(label));
    }
    node.dataset.iconHydrated = "true";
  }
  installTooltips(root.ownerDocument || (root.body ? root : document));
}

export function installTooltips(doc = document) {
  if (!doc.body || tooltipDocuments.has(doc)) {
    return;
  }
  tooltipDocuments.add(doc);

  const tooltip = doc.createElement("div");
  tooltip.className = "app-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  doc.body.append(tooltip);

  let activeTarget = null;
  let showTimer = 0;
  let hideTimer = 0;

  const clearTimers = () => {
    if (showTimer) {
      doc.defaultView.clearTimeout(showTimer);
      showTimer = 0;
    }
    if (hideTimer) {
      doc.defaultView.clearTimeout(hideTimer);
      hideTimer = 0;
    }
  };

  const tooltipTarget = (target) => {
    if (!target?.closest) {
      return null;
    }
    const node = target.closest("[data-tooltip]");
    if (!node || node.disabled || node.getAttribute("aria-disabled") === "true") {
      return null;
    }
    return node;
  };

  const scheduleShow = (target) => {
    const label = target.dataset.tooltip?.trim();
    if (!label) {
      return;
    }
    clearTimers();
    activeTarget = target;
    showTimer = doc.defaultView.setTimeout(() => showTooltip(target, label), TOOLTIP_DELAY_MS);
  };

  const hideTooltip = () => {
    clearTimers();
    activeTarget = null;
    tooltip.classList.remove("visible");
    hideTimer = doc.defaultView.setTimeout(() => {
      if (!tooltip.classList.contains("visible")) {
        tooltip.hidden = true;
      }
    }, 140);
  };

  const showTooltip = (target, label) => {
    if (activeTarget !== target || !doc.body.contains(target)) {
      return;
    }
    tooltip.textContent = label;
    tooltip.hidden = false;
    tooltip.classList.remove("visible");
    positionTooltip(doc, tooltip, target);
    doc.defaultView.requestAnimationFrame(() => {
      if (activeTarget === target) {
        tooltip.classList.add("visible");
      }
    });
  };

  doc.addEventListener("mouseover", (event) => {
    const target = tooltipTarget(event.target);
    if (!target || target === activeTarget || target.contains(event.relatedTarget)) {
      return;
    }
    scheduleShow(target);
  });

  doc.addEventListener("mouseout", (event) => {
    const target = tooltipTarget(event.target);
    if (!target || target.contains(event.relatedTarget)) {
      return;
    }
    hideTooltip();
  });

  doc.addEventListener("focusin", (event) => {
    const target = tooltipTarget(event.target);
    if (target) {
      scheduleShow(target);
    }
  });

  doc.addEventListener("focusout", (event) => {
    if (tooltipTarget(event.target)) {
      hideTooltip();
    }
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideTooltip();
    }
  });

  doc.defaultView.addEventListener("resize", hideTooltip);
  doc.addEventListener(
    "scroll",
    () => {
      if (!tooltip.hidden && activeTarget) {
        positionTooltip(doc, tooltip, activeTarget);
      }
    },
    true
  );
}

export function iconOnlyButton(name, label, attrs = {}) {
  const button = document.createElement("button");
  setAttributes(button, {
    type: "button",
    ...attrs,
    class: joinClasses("icon-button", attrs.class),
    "aria-label": attrs["aria-label"] || label,
    "data-tooltip": attrs["data-tooltip"] || label
  });
  button.append(createIcon(name));
  return button;
}

export function iconTextButton(name, label, attrs = {}) {
  const button = document.createElement("button");
  setAttributes(button, {
    type: "button",
    ...attrs,
    class: joinClasses("icon-text-button", attrs.class),
    "aria-label": attrs["aria-label"] || label
  });
  button.append(createIcon(name), labelSpan(label));
  return button;
}

export function iconSummary(name, label, attrs = {}) {
  const summary = document.createElement("summary");
  setAttributes(summary, {
    role: "button",
    ...attrs,
    class: joinClasses("icon-summary", attrs.class),
    "aria-label": attrs["aria-label"] || label,
    "data-tooltip": attrs["data-tooltip"] || label
  });
  summary.append(createIcon(name), labelSpan(label, "visually-hidden"));
  return summary;
}

function labelSpan(label, className = "button-label") {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = label;
  return span;
}

function positionTooltip(doc, tooltip, target) {
  const win = doc.defaultView;
  const rect = target.getBoundingClientRect();
  const gap = 10;
  const margin = 8;
  const center = rect.left + rect.width / 2;

  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  tooltip.dataset.placement = "top";
  const tipRect = tooltip.getBoundingClientRect();

  const viewportWidth = win.innerWidth;
  const viewportHeight = win.innerHeight;
  const placement =
    rect.top >= tipRect.height + gap + margin || rect.top > viewportHeight - rect.bottom ? "top" : "bottom";
  const rawTop = placement === "top" ? rect.top - tipRect.height - gap : rect.bottom + gap;
  const left = clamp(center - tipRect.width / 2, margin, viewportWidth - tipRect.width - margin);
  const top = clamp(rawTop, margin, viewportHeight - tipRect.height - margin);

  tooltip.dataset.placement = placement;
  tooltip.style.left = `${Math.round(left)}px`;
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.setProperty("--tooltip-arrow-x", `${Math.round(center - left)}px`);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function setAttributes(node, attrs) {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value === null || value === undefined) {
      continue;
    }
    if (key === "class") {
      node.className = value;
    } else if (key === "dataset") {
      Object.assign(node.dataset, value);
    } else {
      node.setAttribute(key, String(value));
    }
  }
}

function joinClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}
