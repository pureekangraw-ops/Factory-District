# Factory — Observatory APK assembly + owner-signing station (WORK v0.1)

## Objective

Give the Factory a future Android-specific station that can build `com.big.gobrowser` from a pinned source commit, sign with the owner's established identity, and return an APK + immutable receipt. This is **not** a claim that the current Factory Dynamic Worker can build Android APKs.

First requested target:

| Field | Expected |
| --- | --- |
| Repository | `pureekangraw-ops/ygph-metropolis` |
| Source commit | `a4f52400bdcf708608a1aa0eadbd0c32cdcab513` |
| Version | `0.7.2` / `versionCode 18` |
| Android package | `com.big.gobrowser` |
| Owner signer certificate SHA-256 | `31bf91b925558771a03bdc81d258cd4d1024a3bb48702bb08534f216e88d0624` |

The existing owner-kept PKCS12 key is stored privately in Google Drive. The matching `0.7.1` signed Release APK and public signing manifest are also in Drive. The certificate of the private-key entry was independently read and its **public fingerprint** matched the signed `0.7.1` manifest. This **does not** prove the installed owner's phone package certificate has been checked. No new signer identity should be generated for an existing-app upgrade.

## What Factory actually executed now

- GO Direct `factory_direct_status`: `CONNECTED / READY / AUTHENTICATED` with `CODE=BOUNDED_EDGE_JS`, `VISUAL=STATIC_CARD_PNG`, `LOGIC=DWARF_TRAINING_ONLY`.
- GO Direct CODE job: `GOJOB-e0aed3ef18d618d3a32d0e95feb98891`
- Immutable request ID: `52bd18a9-6e12-45f3-91bc-8387803d10d4`
- Factory receipt: `receipt-ed091444-bceb-4abe-a877-0f7e670ca776`
- Actual sandbox output: JavaScript Worker serving the public `0.7.2` release identity contract with 2 HTTP assertions.
- Factory receipt/readback and exact source artifact bytes SHA-256 `bccf7d4f40dc39d8993557c25850d2f642a817c67ce8fe56d3db3b40928fa4ac` matched.

This test is **real Factory execution**, not APK assembly, signing or a production deployment.

## Already-built Android artifact (external)

GitHub Actions unsigned Release `0.7.2`, source `a4f52400bdcf708608a1aa0eadbd0c32cdcab513`:
- Build run: https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40066560455
- Artifact: https://github.com/pureekangraw-ops/ygph-metropolis/actions/runs/40066560455/artifacts/12549413564

This is **unsigned**; do not report it as an installable update. The current Factory runner cannot retrieve arbitrary GitHub binaries or execute Gradle/apksigner.

## Station design — no secrets in Factory Worker

1. **Factory ingress** accepts a typed owner-approved Android Build Work, exact source commit, package, version, public signer certificate SHA-256 and idempotency key; does not accept key bytes/passwords.
2. **Assembly adapter** runs in an authorized Android SDK/Gradle environment, checks out exact source SHA and produces a primary Release variant. Archive identity, unsigned digest and source SHA are recorded.
3. **Isolated owner signing adapter** receives the unsigned bytes and owner-held PKCS12 through a restricted private boundary. A dedicated signing operator runs `scripts/observatory-assemble-and-sign.sh` (or equivalent controlled runner). No key material or password is returned to Factory, stored in Factory R2, uploaded to GitHub or embedded in logs.
4. **Verification** invokes official Android `apksigner verify --min-sdk-version 26 --print-certs`, checks expected `com.big.gobrowser`, higher versionCode and same public signer fingerprint. On mismatch, fail closed without publication.
5. **Delivery** returns the APK only after signed SHA-256 and signer receipt are independently checked. A durable Factory artifact pointer and result receipt record public identity, never credentials. User-controlled installation and map-data preservation remain separate.

`src/apk-station-contract.mjs` checks strict typed public handoff and receipt fields; `scripts/observatory-assemble-and-sign.sh` is the *external* secured-machine implementation. Neither is currently wired to the Factory CODE/PIXIE production registry: a dedicated provider/binding and key-access authorization are required. Until then, mark `APK_ASSEMBLY_PROVIDER = NOT_CONFIGURED` and `SIGNED_APK = NOT_PRODUCED`.

## Work completion boundaries

- Factory GO Direct CODE execution and actual artifact/readback: **VERIFIED**.
- Assembly script/source and pure contract tests: **BUILT**.
- External Android signing runner/provider configured and invoked by Factory: **NOT_CONFIGURED**.
- APK `0.7.2` signed with the owner's private key: **NOT_YET_PRODUCED**.
- Android owner-phone installed signer equality and on-device upgrade: **UNKNOWN**.

Never reuse CI ephemeral debug signer, replace the existing 0.7.1 app, uninstall, clear owner GOVIEW data, or silently change the certificate identity to make an APK pass.
