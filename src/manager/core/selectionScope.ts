export type SelectionScope =
  | { kind: 'open-tabs'; windowId: number }
  | { kind: 'saved-tabs'; groupId: string }
  | null;

export type SelectionScopeAction =
  | { type: 'enter-open-tabs'; windowId: number }
  | { type: 'enter-saved-tabs'; groupId: string }
  | { type: 'exit' };

export interface SelectionScopeTransition {
  scope: SelectionScope;
  clearedScope: SelectionScope;
}

export function shouldExitForSidebarCollapse(
  scope: SelectionScope,
  wasCollapsed: boolean,
  collapsed: boolean,
): boolean {
  return scope !== null && !wasCollapsed && collapsed;
}

export function shouldExitForOpenTabsSource(
  scope: SelectionScope,
  selectedWindowId: number | null,
): boolean {
  return scope?.kind === 'open-tabs'
    && scope.windowId !== selectedWindowId;
}

function sameScope(left: SelectionScope, right: SelectionScope): boolean {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === 'open-tabs' && right.kind === 'open-tabs') {
    return left.windowId === right.windowId;
  }
  return left.kind === 'saved-tabs'
    && right.kind === 'saved-tabs'
    && left.groupId === right.groupId;
}

export function reduceSelectionScope(
  scope: SelectionScope,
  action: SelectionScopeAction,
): SelectionScopeTransition {
  const nextScope: SelectionScope = action.type === 'enter-open-tabs'
    ? { kind: 'open-tabs', windowId: action.windowId }
    : action.type === 'enter-saved-tabs'
      ? { kind: 'saved-tabs', groupId: action.groupId }
      : null;

  if (sameScope(scope, nextScope)) {
    return { scope, clearedScope: null };
  }
  return { scope: nextScope, clearedScope: scope };
}
