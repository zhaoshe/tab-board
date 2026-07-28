import { useEffect, type ReactNode } from 'react';

function ManagerTooltipDismissal() {
  useEffect(() => {
    const dismiss = () => {
      document.querySelectorAll<HTMLElement>('[aria-describedby]').forEach((target) => {
        target.dispatchEvent(new MouseEvent('mouseout', {
          bubbles: true,
          relatedTarget: document.body,
        }));
      });
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, []);
  return null;
}

interface ManagerFrameProps {
  dragActive: boolean;
  sidebarCollapsed: boolean;
  sidebarOverlayOpen: boolean;
  sidebarHoverSuppressed: boolean;
  openTabsDragActive: boolean;
  dragMarkerKind?: string;
  dragTargetKind?: string;
  onSidebarMouseLeave: () => void;
  header: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  dialogs?: ReactNode;
}

export function ManagerFrame({
  dragActive,
  sidebarCollapsed,
  sidebarOverlayOpen,
  sidebarHoverSuppressed,
  openTabsDragActive,
  dragMarkerKind,
  dragTargetKind,
  onSidebarMouseLeave,
  header,
  sidebar,
  main,
  dialogs,
}: ManagerFrameProps) {
  return (
    <>
      <ManagerTooltipDismissal />
      <a className="skip-link" href="#manager-main">Skip to Saved Sessions</a>
      <div
        className={[
          'manager-shell',
          dragActive && 'manager-shell--drag-active',
          sidebarCollapsed && 'manager-shell--sidebar-collapsed',
          sidebarOverlayOpen && 'manager-shell--sidebar-overlay-open',
          sidebarHoverSuppressed && 'manager-shell--sidebar-hover-suppressed',
          openTabsDragActive && 'manager-shell--open-tabs-drag-active',
        ].filter(Boolean).join(' ')}
        data-drag-marker={dragMarkerKind}
        data-drag-target={dragTargetKind}
      >
        <header
          className="manager-topbar"
          {...(sidebarOverlayOpen ? { inert: '' } : {})}
        >
          {header}
        </header>
        <aside
          className="manager-sidebar"
          id="manager-sidebar"
          aria-label="Open Tabs workspace"
          onMouseLeave={onSidebarMouseLeave}
        >
          {sidebar}
        </aside>
        <main className="manager-main" id="manager-main">
          <h1 className="visually-hidden"><span translate="no">TabBoard</span> Tab Manager</h1>
          <div
            className="manager-main-surface"
            {...(sidebarOverlayOpen ? { inert: '' } : {})}
          >
            {main}
          </div>
          {dialogs}
        </main>
      </div>
    </>
  );
}
