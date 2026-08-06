import type { Asset, CloudService, Tag } from '@zerobias-org/schema-zerobias-zerobias-base-ts/dist/src/index.js';
import { CloudProvider } from '@zerobias-org/types-core-js';
import type { Resource, ResourceContainer } from '@zerobias-org/module-microsoft-azure-azureresourcegraph';

/**
 * Convert the ARG `tags` column ({ key: value }) to the base schema Tag document shape.
 */
function toTags(tags?: { [key: string]: string }): Tag[] | undefined {
  if (!tags) {
    return undefined;
  }
  const entries = Object.entries(tags)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value: `${value}` }));
  return entries.length > 0 ? entries : undefined;
}

/**
 * Map an Azure Resource Graph `Resources` row to the base `Asset` interface.
 *
 * Interface-targeted collection: the dataloader materializes a
 * Dynamic<Asset> concrete class at ingest, discriminated by `assetType`,
 * which carries the ARG `type` column verbatim
 * (e.g. `microsoft.compute/virtualmachines`).
 */
export function toAsset(raw: Resource): Asset {
  const output: Asset = {
    // Full ARM resource ID — globally unique and stable.
    id: raw.id,
    name: raw.name || raw.id,
    // Everything ARG returns is an Azure (virtual) resource.
    virtual: true,
    tag: toTags(raw.tags),
  };
  // assetType is a closed enum on the generated TS interface, but the
  // schema property is the Dynamic<Asset> discriminator — carry the ARG
  // `type` value through via Object.assign (same pattern as the date
  // workaround used by other collectors).
  Object.assign(output, {
    assetType: raw.type,
  });
  return output;
}

/**
 * Map an Azure Resource Graph `ResourceContainers` row (subscription,
 * resource group, or management group) to the base `CloudService`
 * interface — consistent with how the platform already types Azure
 * subscriptions (AzureSubscription extends CloudService).
 */
export function toCloudService(raw: ResourceContainer): CloudService {
  const output: CloudService = {
    id: raw.id,
    name: raw.name || raw.id,
    provider: CloudProvider.Azure,
    virtual: true,
    tag: toTags(raw.tags),
  };
  // Discriminator: ARG `type` (e.g. `microsoft.resources/subscriptions`,
  // `microsoft.resources/subscriptions/resourcegroups`,
  // `microsoft.management/managementgroups`).
  Object.assign(output, {
    assetType: raw.type,
  });
  return output;
}
