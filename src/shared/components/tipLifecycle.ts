type TipOwner = object;

let owner: TipOwner | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let closeOwner: (() => void) | null = null;

function clearCurrent(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  closeOwner?.();
  closeOwner = null;
  owner = null;
}

export function claimTip(
  nextOwner: TipOwner,
  delay: number,
  open: () => void,
  close: () => void,
): void {
  clearCurrent();
  owner = nextOwner;
  closeOwner = close;
  if (delay <= 0) {
    open();
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    if (owner === nextOwner) open();
  }, delay);
}

export function releaseTip(currentOwner: TipOwner): void {
  if (owner === currentOwner) clearCurrent();
}

export function resetTipLifecycleForTests(): void {
  clearCurrent();
}
