import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMachineKernel } from '../src/machine-kernel.mjs';
import { createInMemoryPersistence } from './support/in-memory-persistence.mjs';

test('kernel depends on PersistenceAdapter and does not own runtime Map state', async () => {
  const source = await readFile(new URL('../src/machine-kernel.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('new Map('), false);
  assert.throws(() => createMachineKernel(), /persistence_REQUIRED/);
  assert.doesNotThrow(() => createMachineKernel({ persistence: createInMemoryPersistence() }));
});

test('persistence sequence rejects stale concurrent writes', async () => {
  const persistence = createInMemoryPersistence();
  const kernel = createMachineKernel({ persistence, idFactory: () => 'ID', clock: () => 'now' });
  await kernel.receive({
    runId: 'RUN-1', workId: 'WORK-1', machineId: 'MACHINE-1', machineVersion: '0.1.0', domain: 'CODE',
    ingress: { systemId: 'A', surfaceType: 'STATION', surfaceId: 'A-STATION' },
    destination: { systemId: 'B', surfaceType: 'OWNER', surfaceId: 'B', ownerDomain: 'CODE' },
    transportRef: { kind: 'RAIL', linkId: 'A-B', trustBoundaryRef: 'TB' },
    requestedBy: { actorId: 'GO', authorityRef: 'AUTH', requestedAt: 'now' },
    subject: { subjectId: 'S', subjectType: 'WORK', ownerSystem: 'B', lifecycleAuthorityRef: 'OWNER' },
  });
  const run = await persistence.loadRun('RUN-1');
  await assert.rejects(() => persistence.transitionRun({ axis: 'execution', runId: 'RUN-1', expectedSequence: run.sequence + 1, toState: 'INTERPRETED', patch: {}, eventId: 'E', actorRef: 'A', at: 'now' }), /PERSISTENCE_CONFLICT/);
});
