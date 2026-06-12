import {
  SdiPetstorePet,
  SdiPetstoreCategory,
  SdiPetstoreTag,
  SdiPetstoreOrder,
  SdiPetstoreUser,
} from '@zerobias-org/schema-sdi-petstore-example-ts/dist/src/index.js';
import { UnexpectedError, UUID } from '@zerobias-org/types-core-js';
import { Batch } from '@zerobias-org/util-collector';
import { injectable } from 'inversify';
import { PromisePool } from '@supercharge/promise-pool';
import { PetApi } from '@zerobias-org/module-sdi-petstore-example';
import { BaseClient } from '../generated/BaseClient.js';
import { mapPet, mapCategory, mapTag, mapOrder, mapPetstoreUser } from './Mappers.js';

// parameters.yml declares an empty (free-form) Parameters schema, so hub-generator
// does not emit a Parameters interface. Declare locally.
type Parameters = Record<string, unknown>;

@injectable()
export class CollectorSdiPetstoreExampleImpl extends BaseClient {
  private metadata: any;

  private _jobId?: UUID;

  // Petstore has no organization/tenant concept; a deterministic synthetic
  // groupId makes two consecutive collector runs converge to the same set of
  // objects in AuditgraphDB (idempotency anchor). NOT derived from any
  // Petstore API field.
  private static readonly GROUP_ID = 'petstore-global';

  // Read preview context at call time, not construction time.
  private get previewCount(): number | undefined {
    return this.context.previewMode ? this.context.previewCount : undefined;
  }

  private get jobId(): UUID {
    if (!this._jobId) {
      this._jobId = this.getJobId();
    }
    return this._jobId;
  }

  private classes = {
    pet: SdiPetstorePet,
    category: SdiPetstoreCategory,
    tag: SdiPetstoreTag,
    order: SdiPetstoreOrder,
    user: SdiPetstoreUser,
  };

  private async init(): Promise<void> {
    try {
      // BaseClient connector property is `this.example` (last segment of
      // vendor.suite.product), not `this.petstore`.
      this.metadata = await this.example.metadata();
    } catch (err) {
      this.logger.error(`Unable to get connection metadata: ${err.message}`, err);
      throw new UnexpectedError('Unable to get metadata', err);
    }
  }

  private async initBatchForClass<T extends Record<string, any>>(
    batchItemType: new (...args) => T,
    groupId?: string
  ): Promise<Batch<T>> {
    const batch: Batch<T> = new Batch<T>(
      batchItemType.name,
      this.platform,
      this.logger,
      this.jobId,
      this.metadata?.tags,
      groupId
    );
    await batch.getId();
    return batch;
  }

  private async loadPets(): Promise<void> {
    const petBatch = await this.initBatchForClass(this.classes.pet, CollectorSdiPetstoreExampleImpl.GROUP_ID);
    const categoryBatch = await this.initBatchForClass(this.classes.category, CollectorSdiPetstoreExampleImpl.GROUP_ID);
    const tagBatch = await this.initBatchForClass(this.classes.tag, CollectorSdiPetstoreExampleImpl.GROUP_ID);

    // pet.list returns Promise<Array<Pet>> (plain array, no pagination)
    const pets = await this.example.getPetApi().list(PetApi.StatusEnum.Available);
    const window = pets.slice(0, this.previewCount ?? pets.length);

    await PromisePool.for(window)
      .withConcurrency(3)
      .handleError(async (error, pet) => {
        await petBatch.error(`Error processing pet ${pet.id}`, error);
      })
      .process(async (pet) => {
        await petBatch.add(mapPet(pet));
        if (pet.category) {
          await categoryBatch.add(mapCategory(pet.category));
        }
        if (pet.tags) {
          for (const tag of pet.tags) {
            await tagBatch.add(mapTag(tag));
          }
        }
      });

    await petBatch.end();
    await categoryBatch.end();
    await tagBatch.end();
  }

  private async loadOrders(): Promise<void> {
    const orderBatch = await this.initBatchForClass(this.classes.order, CollectorSdiPetstoreExampleImpl.GROUP_ID);

    // The Petstore module exposes store.getOrder(id) and store.getInventory()
    // but no store.listOrders(). Enumerate the fixed range of well-known seeded
    // demo IDs (the Petstore demo seeds integer IDs 1..10); 404s are caught in
    // handleError and skipped.
    const seedIds = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
    const window = seedIds.slice(0, this.previewCount ?? seedIds.length);

    await PromisePool.for(window)
      .withConcurrency(3)
      .handleError(async (error, id) => {
        this.logger.debug(`Order ${id} unavailable: ${error.message}`);
      })
      .process(async (id) => {
        const order = await this.example.getStoreApi().getOrder(id);
        await orderBatch.add(mapOrder(order));
      });

    await orderBatch.end();
  }

  private async loadUser(): Promise<void> {
    const userBatch = await this.initBatchForClass(this.classes.user, CollectorSdiPetstoreExampleImpl.GROUP_ID);

    // The Petstore module exposes user.get(username) but no list/search; the
    // demo seeds well-known usernames.
    const usernames = ['user1'];

    await PromisePool.for(usernames)
      .withConcurrency(3)
      .handleError(async (error, username) => {
        this.logger.debug(`User ${username} unavailable: ${error.message}`);
      })
      .process(async (username) => {
        const u = await this.example.getUserApi().get(username);
        await userBatch.add(mapPetstoreUser(u));
      });

    await userBatch.end();
  }

  public async run(_parameters?: Parameters): Promise<any> {
    await this.init();
    await this.loadPets();
    await this.loadOrders();
    await this.loadUser();
  }
}
