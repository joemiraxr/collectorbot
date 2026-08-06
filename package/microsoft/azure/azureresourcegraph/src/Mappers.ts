import type {
  AzureResourceGraphManagementGroup,
  AzureResourceGraphResource,
  AzureResourceGraphResourceGroup,
  AzureResourceGraphSubscription,
  Tag,
} from '@zerobias-org/schema-microsoft-azure-azureresourcegraph-ts/dist/index.js';
import { CloudProvider } from '@zerobias-org/types-core-js';
import type { Resource, ResourceContainer } from '@zerobias-org/module-microsoft-azure-azureresourcegraph';

/** ARG `type` values for the three ResourceContainers row kinds. */
export const CONTAINER_TYPE_SUBSCRIPTION = 'microsoft.resources/subscriptions';
export const CONTAINER_TYPE_RESOURCE_GROUP = 'microsoft.resources/subscriptions/resourcegroups';
export const CONTAINER_TYPE_MANAGEMENT_GROUP = 'microsoft.management/managementgroups';

/**
 * Convert the ARG `tags` column ({ key: value }) to the schema Tag document shape.
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
 * Map an Azure Resource Graph `Resources` row to the concrete
 * `AzureResourceGraphResource` class (extends `AzureInventoryItem`).
 *
 * Link values are the ARM IDs of the container objects collected in the
 * same run, so the dataloader can resolve them:
 * - `subscription`   -> `/subscriptions/<subscriptionId>` (= the subscription container row's `id`)
 * - `resourceGroup`  -> the resource-ID prefix up to `/providers/` (= the resource-group container row's `id`)
 * - `resourceProvider` / `resourceType` -> derived from the ARG `type` column;
 *   both targets are `shared: true` suite classes.
 */
export function toResource(raw: Resource): AzureResourceGraphResource {
  const providersIdx = raw.id.toLowerCase().indexOf('/providers/');
  const resourceGroupId = providersIdx > 0 && raw.resourceGroup
    ? raw.id.substring(0, providersIdx)
    : undefined;
  const output: AzureResourceGraphResource = {
    // Full ARM resource ID — globally unique and stable.
    id: raw.id,
    name: raw.name || raw.id,
    // Concrete-class targeting: assetType is the inherited InventoryItem
    // property (field asset.type) and carries the ARG `type` verbatim —
    // the old closed-enum Object.assign workaround is gone with Asset.
    assetType: raw.type,
    region: raw.location,
    kind: raw.kind,
    managedBy: raw.managedBy,
    tag: toTags(raw.tags),
    subscription: raw.subscriptionId ? `/subscriptions/${raw.subscriptionId}` : undefined,
    resourceGroup: resourceGroupId,
    resourceProvider: raw.type.split('/')[0],
    resourceType: raw.type,
  };
  return output;
}

/**
 * Map a `ResourceContainers` subscription row to `AzureResourceGraphSubscription`
 * (extends `AzureSubscription` extends `CloudService`).
 */
export function toSubscription(raw: ResourceContainer): AzureResourceGraphSubscription {
  const output: AzureResourceGraphSubscription = {
    id: raw.id,
    name: raw.name || raw.id,
    provider: CloudProvider.Azure,
    tag: toTags(raw.tags),
  };
  // Subscription state arrives in the untyped ARG `properties` bag as e.g.
  // "Enabled"; the schema enum wants ALL_CAPS. Assigned loosely because the
  // bag is untyped end-to-end.
  const state = (raw.properties as { state?: string } | undefined)?.state;
  if (state) {
    Object.assign(output, { state: state.toUpperCase() });
  }
  return output;
}

/**
 * Map a `ResourceContainers` resource-group row to `AzureResourceGraphResourceGroup`
 * (extends `AzureResourceGroup`).
 */
export function toResourceGroup(raw: ResourceContainer): AzureResourceGraphResourceGroup {
  const output: AzureResourceGraphResourceGroup = {
    id: raw.id,
    name: raw.name || raw.id,
    region: raw.location,
    subscription: raw.subscriptionId ? `/subscriptions/${raw.subscriptionId}` : undefined,
    tag: toTags(raw.tags),
  };
  return output;
}

/**
 * Map a `ResourceContainers` management-group row to
 * `AzureResourceGraphManagementGroup` (bare class — no suite parent exists
 * for management groups yet; links to tenant/subscriptions are a suite-level
 * decision, see the schema package README).
 */
export function toManagementGroup(raw: ResourceContainer): AzureResourceGraphManagementGroup {
  const output: AzureResourceGraphManagementGroup = {
    id: raw.id,
    name: raw.name || raw.id,
    tag: toTags(raw.tags),
  };
  return output;
}
