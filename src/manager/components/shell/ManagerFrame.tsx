import type { ReactNode } from 'react';
import type { SidebarDisclosureState } from '../../hooks/useSidebarDisclosure';

interface ManagerFrameProps {
  dragActive: boolean;
  sidebarState: SidebarDisclosureState;
  openTabsDragActive: boolean;
  dragMarkerKind?: string;
  dragTargetKind?: string;
  onSidebarPointerIntent: (active: boolean) => void;
  onSidebarFocusIntent: (
    active: boolean,
    options?: { cancelPending?: boolean },
  ) => void;
  header: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  dialogs?: ReactNode;
}

export function ManagerFrame({
  dragActive,
  sidebarState,
  openTabsDragActive,
  dragMarkerKind,
  dragTargetKind,
  onSidebarPointerIntent,
  onSidebarFocusIntent,
  header,
  sidebar,
  main,
  dialogs,
}: ManagerFrameProps) {
  const sidebarCollapsed = sidebarState !== 'pinned';
  const drawerOpen = sidebarState === 'drawer';

  return (
    <>
      <a className="skip-link" href="#manager-main">Skip to Saved Sessions</a>
      <div
        className={[
          'manager-shell',
          dragActive && 'manager-shell--drag-active',
          sidebarCollapsed && 'manager-shell--sidebar-collapsed',
          sidebarState !== 'collapsed' && `manager-shell--sidebar-${sidebarState}`,
          openTabsDragActive && 'manager-shell--open-tabs-drag-active',
        ].filter(Boolean).join(' ')}
        data-drag-marker={dragMarkerKind}
        data-drag-target={dragTargetKind}
      >
        <header
          className="manager-topbar"
          {...(drawerOpen ? { inert: '' } : {})}
        >
          {header}
        </header>
        <aside
          className="manager-sidebar"
          id="manager-sidebar"
          aria-label="Open Tabs workspace"
          onMouseEnter={() => onSidebarPointerIntent(true)}
          onMouseLeave={() => onSidebarPointerIntent(false)}
          onFocus={(event) => {
            const focusesExpand = Boolean((
              event.target as HTMLElement
            ).closest('.manager-open-tabs-context-expand'));
            if (focusesExpand) {
              onSidebarFocusIntent(false, { cancelPending: true });
            } else {
              onSidebarFocusIntent(true);
            }
          }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              onSidebarFocusIntent(false);
            }
          }}
        >
          {sidebar}
        </aside>
        <main className="manager-main" id="manager-main">
          <h1 className="visually-hidden"><span translate="no">TabBoard</span> Tab Manager</h1>
          <div
            className="manager-main-surface"
            {...(drawerOpen ? { inert: '' } : {})}
          >
            {main}
          </div>
          {dialogs}
        </main>
      </div>
    </>
  );
}
