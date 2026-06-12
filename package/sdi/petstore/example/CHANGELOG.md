# Changelog

## 2.0.0

- Rebuilt on the Gradle + zbb toolchain (`zb.typescript-collectorbot` plugin):
  one-line `build.gradle.kts`, lifecycle driven by Gradle, `test/e2e/`
  layout, exact-pinned dependencies, ESM (`"type": "module"`).
- Codegen aligned with `@zerobias-com/hub-client-codegen@2.x` and
  `@zerobias-org/types-core-js@2.x`.
- Collector logic, mappers, and idempotency contract carried over from 1.0.0-rc.1.

## 1.0.0-rc.1

- Initial release on the Lerna/npm toolchain (collectorbot reference build,
  published to pkg.zerobias.org).
