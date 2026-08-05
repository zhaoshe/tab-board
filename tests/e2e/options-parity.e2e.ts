import { test, expect } from '@playwright/test';

const PREVIEW_PATH = '/dev/options-preview.html';

test.describe('Options approved O2/A2 geometry', () => {
  test('keeps Browser storage action in the primary row and details below', async ({ page }) => {
    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${PREVIEW_PATH}?advanced=1`);
      const storage = page.locator('.options-storage-panel');
      await expect(storage).toBeVisible();

      const primary = storage.locator('.options-storage-heading-row');
      const detail = storage.locator('.options-storage-detail-row');
      await expect(primary.getByRole('button', { name: 'Choose folder' }))
        .toBeVisible();
      await expect(detail.getByRole('button')).toHaveCount(0);
      await expect(detail).toContainText('Browser storage');
      await expect(detail).toContainText(
        'Session data is stored in this Chrome profile.',
      );

      const geometry = await storage.evaluate((element) => {
        const primary = element.querySelector<HTMLElement>(
          '.options-storage-heading-row',
        )!.getBoundingClientRect();
        const detail = element.querySelector<HTMLElement>(
          '.options-storage-detail-row',
        )!.getBoundingClientRect();
        return {
          layerGap: detail.top - primary.bottom,
          documentOverflow: document.documentElement.scrollWidth
            - window.innerWidth,
          storageOverflow: element.scrollWidth - element.clientWidth,
        };
      });
      expect(geometry.layerGap).toBe(24);
      expect(geometry.documentOverflow).toBe(0);
      expect(geometry.storageOverflow).toBe(0);
    }
  });

  test('matches the polished Basic hierarchy and visual tokens', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(PREVIEW_PATH);
    await expect(page.locator('.options-page-container')).toBeVisible();

    const geometry = await page.locator('.options-page-container').evaluate(
      (container) => {
        const select = <T extends Element>(selector: string): T => {
          const element = container.querySelector<T>(selector);
          if (!element) throw new Error(`Missing Options element: ${selector}`);
          return element;
        };
        const rect = (element: Element) => {
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
          };
        };
        const numeric = (value: string) => Number.parseFloat(value);
        const header = select<HTMLElement>('.options-header');
        const title = select<HTMLElement>('h1');
        const actions = container.querySelector<HTMLElement>(
          '.options-header__actions',
        );
        const basic = select<HTMLElement>('.options-basic');
        const firstSection = select<HTMLElement>('.options-settings-section');
        const sectionHeading = select<HTMLElement>(
          '.options-settings-section__heading',
        );
        const sectionTitle = select<HTMLElement>(
          '.options-settings-section__heading h2',
        );
        const sectionDescription = container.querySelector<HTMLElement>(
          '.options-settings-section__description',
        );
        const settingLabel = select<HTMLElement>(
          '.options-settings-section .mantine-InputWrapper-label',
        );
        const settingDescription = select<HTMLElement>(
          '.options-settings-section .mantine-InputWrapper-description',
        );
        const advanced = select<HTMLElement>('.options-advanced');
        const summary = select<HTMLElement>('.options-advanced > summary');
        const containerStyle = getComputedStyle(container);
        const headerStyle = getComputedStyle(header);
        const titleStyle = getComputedStyle(title);
        const sectionStyle = getComputedStyle(firstSection);
        const sectionTitleStyle = getComputedStyle(sectionTitle);
        const sectionDescriptionStyle = sectionDescription
          ? getComputedStyle(sectionDescription)
          : null;
        const advancedStyle = getComputedStyle(advanced);
        const summaryStyle = getComputedStyle(summary);
        return {
          container: rect(container),
          containerPaddingInline: numeric(containerStyle.paddingInlineStart),
          header: rect(header),
          headerPadding: headerStyle.padding,
          headerBorderBottom: headerStyle.borderBottomWidth,
          title: {
            ...rect(title),
            fontSize: titleStyle.fontSize,
            lineHeight: titleStyle.lineHeight,
          },
          actions: actions ? rect(actions) : null,
          actionsContainStatus: Boolean(
            actions?.querySelector('.options-save-status'),
          ),
          actionsContainManager: [...(actions?.querySelectorAll('button') ?? [])]
            .some((button) => button.textContent?.trim() === 'Open Manager'),
          basicTop: rect(basic).top,
          firstSection: rect(firstSection),
          sectionPaddingBlock: numeric(sectionStyle.paddingTop),
          sectionHeading: rect(sectionHeading),
          sectionTitle: {
            ...rect(sectionTitle),
            fontSize: sectionTitleStyle.fontSize,
            lineHeight: sectionTitleStyle.lineHeight,
          },
          sectionDescription: sectionDescription && sectionDescriptionStyle
            ? {
                ...rect(sectionDescription),
                fontSize: sectionDescriptionStyle.fontSize,
                lineHeight: sectionDescriptionStyle.lineHeight,
              }
            : null,
          settingLabel: {
            fontSize: getComputedStyle(settingLabel).fontSize,
            lineHeight: getComputedStyle(settingLabel).lineHeight,
          },
          settingDescription: {
            fontSize: getComputedStyle(settingDescription).fontSize,
            lineHeight: getComputedStyle(settingDescription).lineHeight,
          },
          advanced: {
            ...rect(advanced),
            borderWidth: advancedStyle.borderTopWidth,
            borderRadius: advancedStyle.borderRadius,
          },
          summary: {
            ...rect(summary),
            padding: summaryStyle.padding,
            borderBottom: summaryStyle.borderBottomWidth,
          },
        };
      },
    );

    expect(geometry.container.width).toBe(680);
    expect(geometry.containerPaddingInline).toBe(32);
    expect(geometry.header.height).toBe(96);
    expect(geometry.headerPadding).toBe('28px 0px 24px');
    expect(geometry.headerBorderBottom).toBe('1px');
    expect(geometry.title.fontSize).toBe('24px');
    expect(geometry.title.lineHeight).toBe('32px');
    expect(geometry.actionsContainStatus).toBe(true);
    expect(geometry.actionsContainManager).toBe(true);
    expect(geometry.basicTop).toBeCloseTo(geometry.header.bottom, 1);
    expect(geometry.sectionPaddingBlock).toBe(24);
    expect(geometry.sectionTitle.fontSize).toBe('16px');
    expect(geometry.sectionTitle.lineHeight).toBe('22px');
    expect(geometry.sectionDescription?.fontSize).toBe('13px');
    expect(geometry.sectionDescription?.lineHeight).toBe('18px');
    expect(geometry.sectionDescription!.left)
      .toBeGreaterThan(geometry.sectionTitle.right);
    expect(geometry.settingLabel).toEqual({
      fontSize: '14px',
      lineHeight: '20px',
    });
    expect(geometry.settingDescription).toEqual({
      fontSize: '13px',
      lineHeight: '18px',
    });
    expect(geometry.advanced.borderWidth).toBe('0px');
    expect(geometry.advanced.borderRadius).toBe('0px');
    expect(geometry.summary.height).toBe(52);
    expect(geometry.summary.padding).toBe('0px');
    expect(geometry.summary.borderBottom).toBe('1px');
  });

  test('keeps Advanced as a flat four-row continuation', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`${PREVIEW_PATH}?advanced=1`);
    await expect(page.locator('.options-advanced-sections')).toBeVisible();

    const geometry = await page.locator('.options-advanced').evaluate(
      (advanced) => {
        const sections = advanced.querySelector<HTMLElement>(
          '.options-advanced-sections',
        );
        if (!sections) throw new Error('Advanced settings are missing.');
        const rows = [...advanced.querySelectorAll<HTMLElement>(
          '.options-advanced-row',
        )];
        const rect = (element: Element) => {
          const bounds = element.getBoundingClientRect();
          return {
            left: bounds.left,
            right: bounds.right,
            top: bounds.top,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
          };
        };
        return {
          advanced: {
            ...rect(advanced),
            borderWidth: getComputedStyle(advanced).borderTopWidth,
          },
          sections: {
            ...rect(sections),
            paddingInline: Number.parseFloat(
              getComputedStyle(sections).paddingInlineStart,
            ),
          },
          rows: rows.map((row) => ({
            ...rect(row),
            paddingBlock: Number.parseFloat(getComputedStyle(row).paddingTop),
            borderTop: getComputedStyle(row).borderTopWidth,
            title: row.querySelector('h2')?.textContent,
          })),
          nestedCards: advanced.querySelectorAll('.mantine-Card-root').length,
          nestedSectionWrappers: advanced.querySelectorAll(
            '.options-settings-section',
          ).length,
        };
      },
    );

    expect(geometry.advanced.borderWidth).toBe('0px');
    expect(geometry.sections.paddingInline).toBe(0);
    expect(geometry.rows.map(({ title }) => title)).toEqual([
      'Storage location',
      'Confirm before dangerous operations',
      'Keyboard shortcuts',
      'Reset settings',
    ]);
    expect(geometry.rows[0].borderTop).toBe('0px');
    expect(geometry.rows[0].paddingBlock).toBe(24);
    for (const row of geometry.rows.slice(1)) {
      expect(row.paddingBlock).toBe(20);
    }
    for (const row of geometry.rows) {
      expect(row.width).toBeCloseTo(616, 1);
    }
    expect(geometry.nestedCards).toBe(0);
    expect(geometry.nestedSectionWrappers).toBe(0);
  });

  test('keeps configured Local Folder context in ready and fallback states', async ({ page }) => {
    const fileUpdatedAt = '2026-08-02T14:08:32.000+08:00';
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`${PREVIEW_PATH}?advanced=1`);
    await page.waitForFunction(() => typeof (
      window as unknown as { chrome?: { storage?: { local?: unknown } } }
    ).chrome?.storage?.local === 'object');
    await expect(page.locator('.options-storage-panel')).toBeVisible();
    await page.evaluate(async (status) => {
      await chrome.storage.local.set({
        tabboardStorageConfig: status,
      });
    }, {
      configuredTarget: 'file',
      activeBackend: 'file',
      folderName: 'TabBoard',
      fallbackReason: null,
      fileUpdatedAt,
    });

    const storage = page.locator('.options-storage-panel');
    const expectedUpdatedTime = await page.evaluate((value) =>
      new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date(value)), fileUpdatedAt);
    await expect(storage).toContainText('Local folder name: TabBoard');
    await expect(storage).toContainText(`updated: ${expectedUpdatedTime}`);
    await expect(storage.getByRole('button', { name: /Use browser storage/ }))
      .toBeVisible();
    await expect(storage.getByRole('button', { name: /Change folder/ }))
      .toBeVisible();
    await expect(storage.getByRole('button', { name: /Reconnect folder/ }))
      .toHaveCount(0);
    const readyGeometry = await storage.evaluate((element) => {
      const primary = element.querySelector<HTMLElement>(
        '.options-storage-heading-row',
      )?.getBoundingClientRect();
      const detail = element.querySelector<HTMLElement>(
        '.options-storage-detail-row',
      )?.getBoundingClientRect();
      const folderMeta = element.querySelector<HTMLElement>(
        '.options-storage-folder-meta',
      );
      const folderName = folderMeta?.firstElementChild?.getBoundingClientRect();
      const updated = folderMeta?.lastElementChild?.getBoundingClientRect();
      if (!primary || !detail || !folderName || !updated) {
        throw new Error('Local folder geometry is incomplete.');
      }
      return {
        primaryBottom: primary.bottom,
        detailTop: detail.top,
        layerGap: detail.top - primary.bottom,
        folderUpdatedGap: updated.left - folderName.right,
        overflow: element.scrollWidth - element.clientWidth,
      };
    });
    expect(readyGeometry.layerGap).toBe(24);
    expect(readyGeometry.folderUpdatedGap).toBeGreaterThanOrEqual(8);
    expect(readyGeometry.overflow).toBe(0);

    await page.evaluate(async (value) => {
      await chrome.storage.local.set({
        tabboardStorageConfig: {
          configuredTarget: 'file',
          activeBackend: 'browser',
          folderName: 'TabBoard',
          fallbackReason: 'Permission to access the storage folder was denied.',
          fileUpdatedAt: value,
        },
      });
    }, fileUpdatedAt);
    const fallback = page.locator('.options-storage-panel');
    await expect(fallback).toContainText('Local folder name: TabBoard');
    await expect(fallback).toContainText(`updated: ${expectedUpdatedTime}`);
    await expect(fallback).toContainText(
      'New writes are temporarily stored in browser storage.',
    );
    await expect(fallback).toContainText(
      'Permission to access the storage folder was denied.',
    );
    await expect(fallback.getByRole('button', { name: /Reconnect folder/ }))
      .toBeVisible();
    await expect(fallback.getByRole('button', { name: /Use browser storage/ }))
      .toBeVisible();
    const fallbackActions = fallback.locator(
      '.options-storage-fallback-actions',
    );
    await expect(fallbackActions.getByRole('button')).toHaveText([
      'Reconnect folder',
      'Use browser storage',
    ]);
    await expect(
      fallback.locator(
        '.options-storage-heading-row > .mantine-Button-root',
      ),
    ).toHaveCount(0);
  });

  test('keeps a long folder name and updated time in one non-overlapping metadata line', async ({ page }) => {
    const folderName = 'A-Very-Long-Local-Folder-Name-For-Research-Archives-And-Reference-Material';
    for (const viewport of [
      { width: 1024, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`${PREVIEW_PATH}?advanced=1`);
      await expect(page.locator('.options-storage-panel')).toBeVisible();
      await page.evaluate(async ({ nextFolderName }) => {
        await chrome.storage.local.set({
          tabboardStorageConfig: {
            configuredTarget: 'file',
            activeBackend: 'file',
            folderName: nextFolderName,
            fallbackReason: null,
            fileUpdatedAt: '2026-08-02T14:08:32.000+08:00',
          },
        });
      }, { nextFolderName: folderName });

      const geometry = await page.locator(
        '.options-storage-folder-meta',
      ).evaluate((element) => {
        const name = element.firstElementChild as HTMLElement;
        const updated = element.lastElementChild as HTMLElement;
        const parent = element.getBoundingClientRect();
        const nameRect = name.getBoundingClientRect();
        const updatedRect = updated.getBoundingClientRect();
        const nameStyle = getComputedStyle(name);
        return {
          parent: {
            left: parent.left,
            right: parent.right,
          },
          name: {
            left: nameRect.left,
            right: nameRect.right,
            height: nameRect.height,
            overflow: nameStyle.overflow,
            textOverflow: nameStyle.textOverflow,
            whiteSpace: nameStyle.whiteSpace,
          },
          updated: {
            left: updatedRect.left,
            right: updatedRect.right,
            height: updatedRect.height,
          },
          overflow: element.scrollWidth - element.clientWidth,
        };
      });

      expect(geometry.name.right).toBeLessThanOrEqual(geometry.updated.left);
      expect(geometry.name.left).toBeGreaterThanOrEqual(geometry.parent.left);
      expect(geometry.updated.right).toBeLessThanOrEqual(geometry.parent.right);
      expect(geometry.name.height).toBeLessThanOrEqual(20);
      expect(geometry.updated.height).toBeLessThanOrEqual(20);
      expect(geometry.name.overflow).toBe('hidden');
      expect(geometry.name.textOverflow).toBe('ellipsis');
      expect(geometry.name.whiteSpace).toBe('nowrap');
      expect(geometry.overflow).toBe(0);
    }
  });

  test('keeps long fallback context and both recovery actions usable at 390px', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PREVIEW_PATH}?advanced=1`);
    await expect(page.locator('.options-storage-panel')).toBeVisible();
    await page.evaluate(async () => {
      await chrome.storage.local.set({
        tabboardStorageConfig: {
          configuredTarget: 'file',
          activeBackend: 'browser',
          folderName:
            'A-Very-Long-Local-Folder-Name-For-Research-Archives-And-Reference-Material',
          fallbackReason:
            'The selected folder was moved, removed, or is temporarily offline. Choose a recovery action to continue.',
          fileUpdatedAt: '2026-08-02T14:08:32.000+08:00',
        },
      });
    });

    const storage = page.locator('.options-storage-panel');
    await expect(storage).toContainText(
      'New writes are temporarily stored in browser storage.',
    );
    const actions = storage.locator('.options-storage-fallback-actions');
    await expect(actions.getByRole('button')).toHaveText([
      'Reconnect folder',
      'Use browser storage',
    ]);
    const evidence = await storage.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const actionGroup = element.querySelector<HTMLElement>(
        '.options-storage-fallback-actions',
      )!;
      const buttons = [...actionGroup.querySelectorAll<HTMLElement>('button')]
        .map((button) => {
          const buttonBounds = button.getBoundingClientRect();
          return {
            left: buttonBounds.left,
            right: buttonBounds.right,
            height: buttonBounds.height,
            width: buttonBounds.width,
          };
        });
      const folder = element.querySelector<HTMLElement>(
        '.options-storage-folder-meta > :first-child',
      )!;
      const folderBounds = folder.getBoundingClientRect();
      return {
        storage: {
          left: bounds.left,
          right: bounds.right,
        },
        buttons,
        folder: {
          height: folderBounds.height,
          overflow: getComputedStyle(folder).overflow,
          textOverflow: getComputedStyle(folder).textOverflow,
          whiteSpace: getComputedStyle(folder).whiteSpace,
        },
        documentOverflow:
          document.documentElement.scrollWidth - window.innerWidth,
        storageOverflow: element.scrollWidth - element.clientWidth,
      };
    });

    expect(evidence.folder).toEqual({
      height: 20,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
    for (const button of evidence.buttons) {
      expect(button.height).toBeGreaterThanOrEqual(44);
      expect(button.left).toBeGreaterThanOrEqual(evidence.storage.left);
      expect(button.right).toBeLessThanOrEqual(evidence.storage.right);
    }
    expect(evidence.documentOverflow).toBe(0);
    expect(evidence.storageOverflow).toBe(0);
  });
});
