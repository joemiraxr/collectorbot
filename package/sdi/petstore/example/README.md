# SDI Petstore Example Collector

Reference collectorbot for the SDI Petstore example integration. Collects data
from a Swagger Petstore instance via `@zerobias-org/module-sdi-petstore-example`
and shapes it into AuditgraphDB objects declared in
`@zerobias-org/schema-sdi-petstore-example`.

## Collected classes

| Schema class | Source | Notes |
|---|---|---|
| `SdiPetstorePet` | `pet.list(status=available)` | Primary producer |
| `SdiPetstoreCategory` | embedded in pets | Indirect — only when pets carry a category |
| `SdiPetstoreTag` | embedded in pets | Indirect — only when pets carry tags |
| `SdiPetstoreOrder` | `store.getOrder(id)` over seeded IDs 1–10 | No list endpoint upstream; 404s skipped |
| `SdiPetstoreUser` | `user.get('user1')` | No list/search endpoint upstream |

## Idempotency

Petstore has no organization/tenant concept; the collector uses a deterministic
synthetic `groupId` (`petstore-global`) so consecutive runs converge to the
same object set in AuditgraphDB. The e2e test asserts set-equality of collected
IDs across two consecutive runs.

## Parameters

None. `parameters.yml` declares an empty free-form `Parameters` schema.

## Development

```bash
npm install
npm run generate        # hub-generator models + hub-client codegen + postgenerate patch
npx tsc --noEmit        # type check
npx eslint src/         # lint

# Live e2e (requires a local Petstore):
docker run -d --name swagger-petstore -p 8080:8080 swaggerapi/petstore3:unstable
RUN_LIVE=1 npx mocha --exit --reporter=list 'test/e2e/**/*.ts'
# Override target: PETSTORE_BASE_URL=https://petstore3.swagger.io/api/v3

# Gradle lifecycle (validate → generate → compile → lint → test → gate):
./gradlew :sdi:petstore:example:gate    # from the repo root
```

## Known era-mixing accommodations

The paired module (`@zerobias-org/module-sdi-petstore-example@1.0.0-rc.1`) is
built on the pre-Gradle (`@auditmation/*`) stack. Until the module is rebuilt
on the current stack, this package carries two accommodations:

1. `postgenerate` patches `generated/inversify.config.ts` to import
   `HubConnectionProfile` from `@auditmation/hub-core` (what the module's
   `connect()` expects) instead of `@zerobias-org/types-core-js`.
2. `@zerobias-com/platform-sdk` is pinned to `1.1.17` to match
   `@zerobias-org/util-collector`'s exact pin and avoid a dual-install type
   clash.

Both can be removed once the module ships on the current toolchain.
