# @zerobias-org/collectorbot-microsoft-azure-azureresourcegraph

## Description

Collector bot for **Azure Resource Graph** (ARG). Performs tenant-wide Azure
asset inventory by querying the ARG `Resources` and `ResourceContainers`
tables through `@zerobias-org/module-microsoft-azure-azureresourcegraph`
(POST `https://management.azure.com/providers/Microsoft.ResourceGraph/resources`,
api-version `2024-04-01`, cursor paging via `$skipToken`).

## Data Collected

Interface-targeted collection against
`@zerobias-org/schema-zerobias-zerobias-base` — no vendor schema package
exists yet; the dataloader materializes `Dynamic<Interface>` concrete
classes at ingest from the discriminator carried on each object:

- **Asset** — one per row of the ARG `Resources` table (VMs, storage
  accounts, key vaults, ...). Discriminator `assetType` carries the ARG
  `type` column verbatim (e.g. `microsoft.compute/virtualmachines`).
- **CloudService** — one per row of the ARG `ResourceContainers` table
  (subscriptions, resource groups, management groups). Consistent with the
  platform's existing `AzureSubscription extends CloudService` typing.
  Discriminator `assetType` carries the ARG `type` column
  (e.g. `microsoft.resources/subscriptions`).

Concrete schema classes are deferred until the data shape stabilizes
(`schema/package/microsoft/azure/azureresourcegraph/`).

## Required Permissions

- Azure RBAC **Reader** role for the service principal, at subscription or
  management-group scope. ARG silently returns no rows for unreadable
  objects; if nothing at all is readable the collector logs a warning and
  collects nothing.

## Configuration

Connection is handled by the module's connection profile (`directoryId`,
`clientId`, `clientSecret`). Optional parameters:

- `subscriptionIds` (optional): limit collection to these subscriptions
- `managementGroupIds` (optional): limit collection to these management groups

Omit both to collect at tenant scope (everything readable).

## GroupId Strategy

The system identifier is the Azure AD tenant ID, extracted from the first
readable row (ARG has no metadata endpoint):

- Tenant scope: `${tenantId}`
- Scoped runs append the sorted scope, e.g. `${tenantId}-sub:<ids>` /
  `${tenantId}-mg:<ids>`, so differently-scoped pipelines never delete
  each other's data.

Asset vs CloudService sets are additionally isolated by class.

## Development

```bash
zbb build        # gradle lifecycle: validate -> generate -> lint -> compile
zbb testDirect   # e2e (skips without a live hub target)
zbb gate         # full gate incl. dataloader validation
```
