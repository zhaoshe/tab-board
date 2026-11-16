import { assertManagerPreviewIdentity, resolvePlaywrightPreviewServer } from '../../src/dev/previewValidation';

async function globalSetup(): Promise<void> {
  const { previewURL } = resolvePlaywrightPreviewServer(process.env);
  await assertManagerPreviewIdentity(previewURL);
}

export default globalSetup;
