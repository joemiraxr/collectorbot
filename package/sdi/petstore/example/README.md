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

## Build status & the upstream module blocker

Locally green: `tsc --noEmit`, `eslint src/`, and the live e2e test all pass,
and the `/review-collector` validator suite passes.

The Gradle `gate` does **not** pass yet, and the cause is upstream, not in
this package. The paired module
(`@zerobias-org/module-sdi-petstore-example@1.0.0-rc.1`) is the old pre-Gradle
(`@auditmation/*`) build. It transitively pins `axios@^0.27.2` (via
`@auditmation/types-core-js`), whereas the v2 toolchain — and the Gradle
plugin's own generated `run.ts` / `inversify.config.ts` — assume `axios@1.x`
and the v2 `@zerobias-org/types-core-js` shapes. The Gradle plugin owns
codegen, so the npm-script accommodations below do not survive its regenerate
step:

1. `postgenerate` patches `generated/inversify.config.ts` to import
   `HubConnectionProfile` from `@auditmation/hub-core` — only effective for a
   bare `npm run build`, not the Gradle build (which regenerates the file).
2. `@zerobias-com/platform-sdk` pinned to `1.1.17` and `@auditmation/hub-core`
   pinned to `4.7.5` to match the installed transitive set.

**To make the gate pass, rebuild `module-sdi-petstore-example` on the v2
(Gradle + zbb) toolchain first** — that removes `axios@0.27` and the
`HubConnectionProfile`/`URL` type clashes at the source. Once the v2 module is
published, drop the two accommodations above and the `@auditmation/hub-core`
dependency, then re-run the gate.
