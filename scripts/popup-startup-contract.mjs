function modulePreloads(html) {
  return [...html.matchAll(
    /<link\b[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g,
  )].map((match) => match[1]);
}

export function assertPopupStartupBuild({ sourceHtml, builtHtml }) {
  if (!sourceHtml.includes('data-popup-boot-shell')) {
    throw new Error('Popup source is missing the static boot shell.');
  }
  if (!builtHtml.includes('data-popup-boot-shell')) {
    throw new Error('Built Popup is missing the static boot shell.');
  }

  const forbidden = modulePreloads(builtHtml).find((path) =>
    /(?:useTabBoardStore|activeAdapter)-/i.test(path));
  if (forbidden) {
    throw new Error(`Built Popup preloads forbidden startup dependency: ${forbidden}`);
  }
}

export function assertPopupStartupSample(sample) {
  if (sample.stateReadCount !== 0) {
    throw new Error('Popup startup must not read canonical state.');
  }
  if (sample.projectionReadCount !== 1) {
    throw new Error('Popup startup must read the settings projection exactly once.');
  }
  if (sample.tabQueryCount !== 1) {
    throw new Error('Popup startup must query current-window tabs exactly once.');
  }

  const overlaps = sample.projectionReadStartMs <= sample.tabQueryEndMs
    && sample.tabQueryStartMs <= sample.projectionReadEndMs;
  if (!overlaps) {
    throw new Error('Popup settings projection and tab query must overlap.');
  }
}
