const OPEN_DELAY_MS = 180;
const CLOSE_DELAY_MS = 120;
let triggerCounter = 0;

/**
 * Installs one document-level interactive info popover.
 * @param {{ document?: Document, renderContent: (trigger: HTMLElement) => Node | null }} options
 * @returns {{ hide: (options?: { restoreFocus?: boolean }) => Promise<void>, destroy: () => void }}
 */
export function installManagerInfoPopover({ document: doc = document, renderContent } = {}) {
  if (!doc?.body || typeof renderContent !== "function") {
    throw new Error("A document and popover renderer are required");
  }

  const win = doc.defaultView;
  const popover = doc.createElement("wa-popover");
  popover.className = "manager-info-popover";
  popover.placement = "right-start";
  popover.distance = 10;
  popover.withoutArrow = false;
  doc.body.append(popover);

  let activeTrigger = null;
  let openTimer = 0;
  let closeTimer = 0;

  const clearOpenTimer = () => {
    if (openTimer) {
      win.clearTimeout(openTimer);
      openTimer = 0;
    }
  };

  const clearCloseTimer = () => {
    if (closeTimer) {
      win.clearTimeout(closeTimer);
      closeTimer = 0;
    }
  };

  const syncClosedState = () => {
    activeTrigger?.setAttribute("aria-expanded", "false");
    activeTrigger = null;
  };

  const showNow = async (trigger) => {
    clearOpenTimer();
    clearCloseTimer();
    const content = renderContent(trigger);
    if (!content || !trigger.isConnected) {
      return;
    }
    if (!trigger.id) {
      triggerCounter += 1;
      trigger.id = `ziptab-info-trigger-${triggerCounter}`;
    }
    if (activeTrigger && activeTrigger !== trigger) {
      activeTrigger.setAttribute("aria-expanded", "false");
    }
    activeTrigger = trigger;
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "true");
    popover.for = trigger.id;
    popover.replaceChildren(content);
    await popover.show();
  };

  const scheduleShow = (trigger, delay = OPEN_DELAY_MS) => {
    clearOpenTimer();
    clearCloseTimer();
    openTimer = win.setTimeout(() => void showNow(trigger), delay);
  };

  const hide = async ({ restoreFocus = false } = {}) => {
    clearOpenTimer();
    clearCloseTimer();
    const trigger = activeTrigger;
    syncClosedState();
    await popover.hide();
    if (restoreFocus && trigger?.isConnected) {
      trigger.focus();
    }
  };

  const scheduleHide = () => {
    clearCloseTimer();
    closeTimer = win.setTimeout(() => void hide(), CLOSE_DELAY_MS);
  };

  const infoTrigger = (target) => target?.closest?.("[data-info-popover]") || null;

  const handleMouseOver = (event) => {
    const trigger = infoTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget)) {
      return;
    }
    scheduleShow(trigger);
  };

  const handleMouseOut = (event) => {
    const trigger = infoTrigger(event.target);
    if (!trigger || trigger.contains(event.relatedTarget) || popover.contains(event.relatedTarget)) {
      return;
    }
    scheduleHide();
  };

  const handleFocusIn = (event) => {
    const trigger = infoTrigger(event.target);
    if (trigger) {
      scheduleShow(trigger, 0);
    }
  };

  const handleFocusOut = (event) => {
    if (infoTrigger(event.target) && !popover.contains(event.relatedTarget)) {
      scheduleHide();
    }
  };

  const handleClick = (event) => {
    const trigger = infoTrigger(event.target);
    if (trigger) {
      void showNow(trigger);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape" && activeTrigger) {
      event.stopPropagation();
      void hide({ restoreFocus: true });
    }
  };

  const handleViewportChange = () => {
    if (activeTrigger) {
      void hide();
    }
  };

  const handleDragStart = () => void hide();
  const handlePopoverEnter = () => clearCloseTimer();
  const handlePopoverLeave = () => scheduleHide();
  const handleAfterHide = () => syncClosedState();

  doc.addEventListener("mouseover", handleMouseOver);
  doc.addEventListener("mouseout", handleMouseOut);
  doc.addEventListener("focusin", handleFocusIn);
  doc.addEventListener("focusout", handleFocusOut);
  doc.addEventListener("click", handleClick);
  doc.addEventListener("keydown", handleKeyDown);
  doc.addEventListener("dragstart", handleDragStart, true);
  doc.addEventListener("scroll", handleViewportChange, true);
  win.addEventListener("resize", handleViewportChange);
  popover.addEventListener("mouseenter", handlePopoverEnter);
  popover.addEventListener("mouseleave", handlePopoverLeave);
  popover.addEventListener("wa-after-hide", handleAfterHide);

  return {
    hide,
    destroy() {
      clearOpenTimer();
      clearCloseTimer();
      doc.removeEventListener("mouseover", handleMouseOver);
      doc.removeEventListener("mouseout", handleMouseOut);
      doc.removeEventListener("focusin", handleFocusIn);
      doc.removeEventListener("focusout", handleFocusOut);
      doc.removeEventListener("click", handleClick);
      doc.removeEventListener("keydown", handleKeyDown);
      doc.removeEventListener("dragstart", handleDragStart, true);
      doc.removeEventListener("scroll", handleViewportChange, true);
      win.removeEventListener("resize", handleViewportChange);
      popover.remove();
    }
  };
}
