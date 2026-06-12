/* eslint-disable */
//
// Live e2e test for CollectorSdiPetstoreExampleImpl.
//
// Strategy: bypass the hub indirection by instantiating the collector directly
// with PetstoreImpl (the module's direct connector) cast to PetstoreHubImpl.
// Both implement the same Petstore producer surface (getPetApi/getStoreApi/
// getUserApi), so the contract is identical at the type level; only the
// hub-routing layer (production-only) is not exercised.
//
// Batch capture: a recording PlatformApiClient mock implements only the
// surface util-collector's Batch<T> calls (isConnected + getBatchApi()); each
// addBatchItem captures the payload's `.id` into a Map<className, Set<id>>.
// Idempotency proof: two consecutive runs against the same upstream produce
// the same set of IDs per class.
//
// Target: defaults to a local Petstore container
// (docker run -d --name swagger-petstore -p 8080:8080 swaggerapi/petstore3:unstable);
// override via PETSTORE_BASE_URL. The before() probe fails loud on non-2xx —
// no fabricated success states, no silent fallback.
//

import { expect } from 'chai';
import 'reflect-metadata';
import { PetstoreImpl } from '@zerobias-org/module-sdi-petstore-example';
import type { PetstoreHubImpl } from '@zerobias-org/module-sdi-petstore-example';
import { ConnectionProfile } from '@zerobias-org/module-sdi-petstore-example';
import { HubClientContext } from '@zerobias-com/hub-client';
import { UUID, URL } from '@zerobias-org/types-core-js';
import { CollectorSdiPetstoreExampleImpl } from '../../src/CollectorSdiPetstoreExampleImpl.js';

const RUN_LIVE = process.env.RUN_LIVE === '1';
const PETSTORE = process.env.PETSTORE_BASE_URL || 'http://localhost:8080/api/v3';

// ---------------------------------------------------------------------------
// Recording PlatformApiClient mock — captures Batch<T>.add() calls keyed by
// createBatch's className.
// ---------------------------------------------------------------------------
class RecordingPlatform {
  public readonly recorded = new Map<string, Set<string>>();
  private nextBatchId = 1;
  private idToClassName = new Map<string, string>();

  isConnected(): boolean {
    return true;
  }

  getBatchApi(): any {
    return {
      createBatch: async (newBatch: { className: string }) => {
        const batchId = `synthetic-batch-${this.nextBatchId++}`;
        this.idToClassName.set(batchId, newBatch.className);
        if (!this.recorded.has(newBatch.className)) {
          this.recorded.set(newBatch.className, new Set<string>());
        }
        return { id: batchId };
      },
      addBatchItem: async (batchId: string, item: any) => {
        const className = this.idToClassName.get(batchId);
        if (!className) return;
        const set = this.recorded.get(className)!;
        // payload.id is always a string (mapper coerces via `${raw.id ?? ''}`)
        const id = item?.payload?.id;
        if (typeof id === 'string' && id.length > 0) {
          set.add(id);
        }
      },
      addBatchItems: async (batchId: string, items: any[]) => {
        const className = this.idToClassName.get(batchId);
        if (!className) return;
        const set = this.recorded.get(className)!;
        for (const item of items) {
          const id = item?.payload?.id;
          if (typeof id === 'string' && id.length > 0) {
            set.add(id);
          }
        }
      },
      createBatchLog: async (_batchId: string, _log: any) => {},
      markDeleted: async (_batchId: string, _externalId: string) => {},
      endBatch: async (_batchId: string) => {},
    };
  }

  isConnect(): boolean { return true; }
  async connect(_profile: any): Promise<void> {}
  async disconnect(): Promise<void> {}
}

// Synthetic HubClientContext (bypasses getContextFromEnv()). None of the
// synthetic UUIDs flow to outbound HTTP — they only populate batch metadata
// which lives in the recorder.
function makeSyntheticContext(): HubClientContext {
  return new HubClientContext(
    new UUID('00000000-0000-4000-8000-000000000001'),  // jobId
    new UUID('00000000-0000-4000-8000-000000000002'),  // pipelineId
    HubClientContext.BatchModeEnum.Full,                // batchMode
    'test-api-key',                                     // apiKey (not used by PetstoreImpl)
    new URL('https://hub.example.invalid'),             // server (not used here)
    new UUID('00000000-0000-4000-8000-000000000003'),  // orgId
    false,                                              // previewMode
    {},                                                 // moduleTargets
  );
}

async function buildCollector(): Promise<{ collector: CollectorSdiPetstoreExampleImpl, recorder: RecordingPlatform }> {
  const petstore = new PetstoreImpl();

  // PetstoreClient hardcodes the public demo URL in its constructor; override
  // the instance's baseUrl BEFORE connect() (axios captures it inside connect).
  (petstore as any).client.baseUrl = PETSTORE;
  await petstore.connect(ConnectionProfile.newInstance({ apiKey: 'test-key' }));

  const recorder = new RecordingPlatform();
  const context = makeSyntheticContext();

  const collector = new CollectorSdiPetstoreExampleImpl(
    context,
    petstore as unknown as PetstoreHubImpl,
    recorder as any,
  );

  return { collector, recorder };
}

(RUN_LIVE ? describe : describe.skip)('CollectorSdiPetstoreExampleIT (live)', function () {
  this.timeout(1_200_000);

  before(async function () {
    if (!RUN_LIVE) return;
    // Fail loud if Petstore is unreachable; do NOT fabricate success states.
    let probe: Response;
    try {
      probe = await fetch(`${PETSTORE}/pet/findByStatus?status=available`);
    } catch (err: any) {
      throw new Error(
        `Petstore unreachable at ${PETSTORE} (network error: ${err?.message ?? err}). ` +
        `If target is local: verify 'docker ps' shows swagger-petstore running ` +
        `(docker run -d --name swagger-petstore -p 8080:8080 swaggerapi/petstore3:unstable).`
      );
    }
    if (!probe.ok) {
      throw new Error(`Petstore unreachable at ${PETSTORE} (status ${probe.status}).`);
    }
  });

  let firstRunIds: Map<string, Set<string>>;

  it('first run: collector populates AuditgraphDB', async () => {
    const { collector, recorder } = await buildCollector();
    await collector.run();

    firstRunIds = new Map();
    for (const [k, v] of recorder.recorded.entries()) {
      firstRunIds.set(k, new Set(v));
    }

    // Pet, Order, User are producer-driven and must be non-empty. Category and
    // Tag are populated indirectly by loadPets only if pet records carry them —
    // seeded data may legitimately omit them, so no assertion there.
    // eslint-disable-next-line no-console
    console.log('CARDINALITY:', JSON.stringify({
      Pet: firstRunIds.get('SdiPetstorePet')?.size ?? 0,
      Category: firstRunIds.get('SdiPetstoreCategory')?.size ?? 0,
      Tag: firstRunIds.get('SdiPetstoreTag')?.size ?? 0,
      Order: firstRunIds.get('SdiPetstoreOrder')?.size ?? 0,
      User: firstRunIds.get('SdiPetstoreUser')?.size ?? 0,
    }));
    expect(firstRunIds.get('SdiPetstorePet')?.size, 'no Pet records collected').to.be.greaterThan(0);
    expect(firstRunIds.get('SdiPetstoreOrder')?.size, 'no Order records collected').to.be.greaterThan(0);
    expect(firstRunIds.get('SdiPetstoreUser')?.size, 'no User records collected').to.be.greaterThan(0);
  });

  it('second run: produces zero new objects (idempotency)', async () => {
    const { collector, recorder } = await buildCollector();
    await collector.run();
    const secondRunIds = recorder.recorded;

    // Set-equality per class: run2 has no new IDs AND no missing IDs vs run1.
    for (const [className, firstSet] of firstRunIds.entries()) {
      const secondSet = secondRunIds.get(className) ?? new Set<string>();
      expect(
        [...secondSet].sort(),
        `Idempotency violated for ${className}: run2 differs from run1`
      ).to.deep.equal([...firstSet].sort());
    }
  });
});
