import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = resolve(
  projectRoot,
  '.agents/optimization/task-9-runtime-contract.json',
);
const vitestJsonPath = resolve(
  projectRoot,
  '.agents/optimization/task-9-runtime-contract-vitest.json',
);

const requiredCases = [
  {
    id: 'restore-ordered-create-failed',
    file: 'src/background/service-worker.test.ts',
    fullName:
      'restore-refs outcomes reports ordered success/missing/create-failed outcomes and removes only successes',
    reason: 'Browser-free worker contract for ordered partial restore outcomes with a create failure.',
  },
  {
    id: 'capture-source-url-drift',
    file: 'src/background/service-worker.test.ts',
    fullName:
      'Task107 capture request validation does not close tabs whose URL or window changed after capture',
    reason: 'Boundary record for changed source URLs after capture commit.',
  },
  {
    id: 'capture-pinned-retention',
    file: 'src/background/service-worker.test.ts',
    fullName:
      'Task107 capture request validation stores pinned tabs but never closes them after capture',
    reason: 'Boundary record for pinned source retention after capture.',
  },
  {
    id: 'revoked-permission-fallback',
    file: 'src/shared/store/activeAdapter.test.ts',
    fullName:
      'activeAdapter runtime file reload failure degrades instead of leaving a broken file backend active',
    reason: 'Storage authority contract for revoked permission during a live file reload.',
  },
  {
    id: 'worker-preload-fallback-recovery',
    file: 'src/shared/store/activeAdapter.test.ts',
    fullName:
      'activeAdapter retries the file backend only for the persisted worker-preload fallback',
    reason: 'Adapter recovery contract for a persisted worker-preload fallback projection.',
  },
  {
    id: 'successful-reconnect',
    file: 'src/shared/store/activeAdapter.test.ts',
    fullName:
      'activeAdapter reconnects with the chosen browser copy and preserves both recovery copies',
    reason: 'Reconnect contract for the successful chosen-copy recovery path.',
  },
  {
    id: 'exact-cas-replay',
    file: 'src/shared/store/authoritativePublication.test.ts',
    fullName:
      'authoritative publication persistence outcomes resolves a response-lost category retry through exact CAS replay',
    reason: 'Publication contract for response-lost exact replay handling.',
  },
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      stdio: 'inherit',
    });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  await mkdir(dirname(reportPath), { recursive: true });
  await rm(vitestJsonPath, { force: true });

  const pattern = requiredCases.map(({ fullName }) => escapeRegex(fullName)).join('|');
  await run('npx', [
    'vitest',
    'run',
    'src/background/service-worker.test.ts',
    'src/shared/store/activeAdapter.test.ts',
    'src/shared/store/authoritativePublication.test.ts',
    '--reporter=json',
    `--outputFile=${vitestJsonPath}`,
    '--testNamePattern',
    pattern,
  ]);

  const raw = JSON.parse(await readFile(vitestJsonPath, 'utf8'));
  const assertions = raw.testResults.flatMap((suite) =>
    suite.assertionResults.map((assertion) => ({
      file: suite.name.replace(`${projectRoot}/`, ''),
      fullName: assertion.fullName,
      status: assertion.status,
      title: assertion.title,
    })));

  const matchedCases = requiredCases.map((requiredCase) => {
    const match = assertions.find((assertion) =>
      assertion.fullName === requiredCase.fullName);
    return {
      ...requiredCase,
      matched: Boolean(match),
      status: match?.status ?? 'missing',
    };
  });

  const failures = matchedCases.filter(({ matched, status }) =>
    !matched || status !== 'passed');
  if (failures.length > 0) {
    throw new Error(
      `Runtime contract verification failed: ${failures
        .map(({ id, status }) => `${id}:${status}`)
        .join(', ')}`,
    );
  }

  const output = {
    command:
      'npx vitest run src/background/service-worker.test.ts src/shared/store/activeAdapter.test.ts src/shared/store/authoritativePublication.test.ts --reporter=json --outputFile=.agents/optimization/task-9-runtime-contract-vitest.json --testNamePattern <exact-required-cases>',
    generatedAt: new Date().toISOString(),
    matchedPassedNames: matchedCases.map(({ id, file, fullName, reason }) => ({
      id,
      file,
      fullName,
      reason,
      status: 'passed',
    })),
    limitations: [
      'This record executes real worker and store contract code in Vitest with mocked browser/storage seams.',
      'It does not validate an installed Chrome extension lifecycle, unpacked extension wiring, or real browser UI.',
      'Non-matching tests are intentionally filtered out; this record proves only the named boundary cases above.',
    ],
  };
  await rm(reportPath, { force: true });
  await mkdir(dirname(reportPath), { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`Runtime contract record written to ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
