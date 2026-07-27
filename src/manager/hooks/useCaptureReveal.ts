import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Group } from '../../shared/model';
import { useTabBoardStore } from '../../shared/store/useTabBoardStore';
import {
  sameCaptureCategorySnapshot,
  sameCaptureFilterSnapshot,
  shouldKeepPendingCaptureTarget,
  shouldRevealCapture,
  type CaptureCategorySnapshot,
  type CaptureFilterSnapshot,
} from '../core/capture';
import type { CategoryFilter } from '../core/selectors';
import type { ManagerPageStateController } from './useManagerPageState';
import type { CaptureCompletion } from './useOpenTabsRuntime';

interface UseCaptureRevealInput {
  activeWorkspaceId: string;
  groups: Group[];
  selectedCategory: CategoryFilter;
  showBin: boolean;
  searchQuery: string;
  tabFilterUrl: string | null;
  pageState: ManagerPageStateController;
  showSuccess: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
}

type HighlightOwnership = {
  groupId: string;
  workspaceId: string;
  categorySnapshot: CaptureCategorySnapshot | null;
  filterSnapshot: CaptureFilterSnapshot | null;
};

function replaceUrlParams(params: URLSearchParams): void {
  const query = params.toString();
  window.history.replaceState(
    window.history.state,
    document.title,
    `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
  );
}

export function useCaptureReveal({
  activeWorkspaceId,
  groups,
  selectedCategory,
  showBin,
  searchQuery,
  tabFilterUrl,
  pageState,
  showSuccess,
  showInfo,
  showError,
}: UseCaptureRevealInput) {
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);
  const [highlightOwnership, setHighlightOwnership] = useState<HighlightOwnership | null>(null);
  const [pendingTargetGroupId, setPendingTargetGroupId] = useState<string | null>(null);
  const [pendingTargetWorkspaceId, setPendingTargetWorkspaceId] = useState<string | null>(null);
  const [pendingTargetCategorySnapshot, setPendingTargetCategorySnapshot] =
    useState<CaptureCategorySnapshot | null>(null);
  const [pendingTargetFilterSnapshot, setPendingTargetFilterSnapshot] =
    useState<CaptureFilterSnapshot | null>(null);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentCategorySnapshot = useMemo<CaptureCategorySnapshot>(() => ({
    showBin,
    category: selectedCategory,
  }), [selectedCategory, showBin]);
  const currentCategorySnapshotRef = useRef(currentCategorySnapshot);
  currentCategorySnapshotRef.current = currentCategorySnapshot;

  const clearCaptureHighlight = useCallback(() => {
    setHighlightedGroupId(null);
    setHighlightOwnership(null);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }
  }, []);

  const handleCaptureCompleted = useCallback((detail: CaptureCompletion | null) => {
    if (!detail) return;
    if (!detail.committed || !detail.reconciled) {
      showError(
        detail.message,
        detail.committed ? 'Capture saved' : 'Capture failed',
      );
      return;
    }
    const storedTabs = detail.result?.storedTabs ?? 0;
    showSuccess(
      `${storedTabs} tab${storedTabs === 1 ? '' : 's'} saved successfully`,
      'Tabs saved',
    );
    if (!detail.selectionCurrent) return;
    const createdGroupId = detail.createdGroupIds[0];
    const currentWorkspaceId = useTabBoardStore.getState().activeWorkspaceId;
    if (!createdGroupId || !detail.activeWorkspaceId) return;
    if (currentWorkspaceId !== detail.sourceWorkspaceId) return;
    if (!shouldRevealCapture({
      sourceWorkspaceId: detail.sourceWorkspaceId,
      activeWorkspaceId: detail.activeWorkspaceId,
      createdGroupIds: detail.createdGroupIds,
    })) return;
    if (!detail.filterCurrent) return;
    if (!detail.categorySnapshot || !sameCaptureCategorySnapshot(
      detail.categorySnapshot,
      currentCategorySnapshotRef.current,
    )) return;

    pageState.replace({ category: 'inbox', view: 'board' });
    setPendingTargetWorkspaceId(detail.sourceWorkspaceId);
    setPendingTargetGroupId(createdGroupId);
    setPendingTargetCategorySnapshot(detail.targetCategorySnapshot);
    setPendingTargetFilterSnapshot(detail.targetFilterSnapshot);
  }, [pageState, showError, showSuccess]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetGroupId = params.get('targetGroupId');
    if (targetGroupId) {
      const currentState = useTabBoardStore.getState();
      const targetGroup = currentState.groups.find(({ id }) => id === targetGroupId);
      if (targetGroup && targetGroup.workspaceId === currentState.activeWorkspaceId) {
        pageState.setQuery('');
        let targetCategory: CategoryFilter = 'inbox';
        if (targetGroup.archived) targetCategory = 'archive';
        else if (targetGroup.starred) targetCategory = 'saved';
        else if (targetGroup.folderId) targetCategory = `folder:${targetGroup.folderId}`;
        pageState.replace({ category: targetCategory, view: 'board' });
        setPendingTargetWorkspaceId(targetGroup.workspaceId);
        setPendingTargetGroupId(targetGroupId);
      } else {
        params.delete('targetGroupId');
        replaceUrlParams(params);
      }
    }

    const savedCount = Number.parseInt(params.get('saved') || '', 10);
    const duplicateCount = Number.parseInt(params.get('duplicates') || '', 10);
    if (Number.isFinite(savedCount) && savedCount > 0) {
      showSuccess(
        `${savedCount} tab${savedCount === 1 ? '' : 's'} saved successfully`,
        'Tabs saved',
      );
    }
    if (Number.isFinite(duplicateCount) && duplicateCount > 0) {
      showInfo(
        `Removed ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`,
        'Duplicates cleaned',
      );
    }

    const feedback = params.get('feedback');
    if (feedback) {
      const [type, value] = feedback.split(':');
      const count = Number.parseInt(value, 10);
      if (type === 'stored' && Number.isFinite(count)) {
        showSuccess(`${count} tab${count === 1 ? '' : 's'} saved successfully`, 'Tabs saved');
      } else if (type === 'deduped' && Number.isFinite(count)) {
        showInfo(`Removed ${count} duplicate${count === 1 ? '' : 's'}`, 'Duplicates cleaned');
      } else if (type === 'restored' && Number.isFinite(count)) {
        showSuccess(`${count} tab${count === 1 ? '' : 's'} restored`, 'Tabs restored');
      }
    }

    const feedbackKeys = ['saved', 'duplicates', 'feedback'];
    if (feedbackKeys.some((key) => params.has(key))) {
      feedbackKeys.forEach((key) => params.delete(key));
      replaceUrlParams(params);
    }
  }, [pageState, showInfo, showSuccess]);

  useEffect(() => {
    if (!pendingTargetGroupId) return;
    const clearPendingTarget = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('targetGroupId') === pendingTargetGroupId) {
        params.delete('targetGroupId');
        replaceUrlParams(params);
      }
      setPendingTargetGroupId(null);
      setPendingTargetWorkspaceId(null);
      setPendingTargetCategorySnapshot(null);
      setPendingTargetFilterSnapshot(null);
    };
    if (!pendingTargetWorkspaceId || activeWorkspaceId !== pendingTargetWorkspaceId) {
      clearPendingTarget();
      return;
    }
    const targetGroupExists = useTabBoardStore.getState().groups.some(
      ({ id }) => id === pendingTargetGroupId,
    );
    if (!shouldKeepPendingCaptureTarget({
      targetCategorySnapshot: pendingTargetCategorySnapshot,
      currentCategorySnapshot,
      targetFilterSnapshot: pendingTargetFilterSnapshot,
      currentFilterSnapshot: { searchQuery, tabFilterUrl },
      targetGroupExists,
      elementFound: true,
    })) {
      clearPendingTarget();
      return;
    }
    const element = document.getElementById(`session-card-${pendingTargetGroupId}`);
    if (!element) return;
    element.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
      block: 'center',
    });
    setHighlightedGroupId(pendingTargetGroupId);
    setHighlightOwnership({
      groupId: pendingTargetGroupId,
      workspaceId: pendingTargetWorkspaceId,
      categorySnapshot: pendingTargetCategorySnapshot ?? currentCategorySnapshot,
      filterSnapshot: pendingTargetFilterSnapshot ?? { searchQuery, tabFilterUrl },
    });
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedGroupId(null);
      setHighlightOwnership(null);
      highlightTimeoutRef.current = null;
    }, 3000);
    clearPendingTarget();
  }, [
    activeWorkspaceId,
    currentCategorySnapshot,
    pendingTargetCategorySnapshot,
    pendingTargetFilterSnapshot,
    pendingTargetGroupId,
    pendingTargetWorkspaceId,
    searchQuery,
    tabFilterUrl,
  ]);

  useEffect(() => () => {
    if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!highlightOwnership) return;
    const targetGroupExists = useTabBoardStore.getState().groups.some(
      ({ id }) => id === highlightOwnership.groupId,
    );
    const currentFilterSnapshot: CaptureFilterSnapshot = {
      searchQuery,
      tabFilterUrl,
    };
    const categoryMatches = !highlightOwnership.categorySnapshot
      || sameCaptureCategorySnapshot(
        highlightOwnership.categorySnapshot,
        currentCategorySnapshot,
      );
    const filterMatches = !highlightOwnership.filterSnapshot
      || sameCaptureFilterSnapshot(
        highlightOwnership.filterSnapshot,
        currentFilterSnapshot,
      );
    const targetStillValid = shouldKeepPendingCaptureTarget({
      targetCategorySnapshot: highlightOwnership.categorySnapshot,
      currentCategorySnapshot,
      targetFilterSnapshot: highlightOwnership.filterSnapshot,
      currentFilterSnapshot,
      targetGroupExists,
      elementFound: true,
    });
    if (
      activeWorkspaceId !== highlightOwnership.workspaceId
      || !categoryMatches
      || !filterMatches
      || !targetGroupExists
      || !targetStillValid
    ) {
      clearCaptureHighlight();
    }
  }, [
    activeWorkspaceId,
    clearCaptureHighlight,
    currentCategorySnapshot,
    groups,
    highlightOwnership,
    searchQuery,
    selectedCategory,
    showBin,
    tabFilterUrl,
  ]);

  return { highlightedGroupId, handleCaptureCompleted };
}
