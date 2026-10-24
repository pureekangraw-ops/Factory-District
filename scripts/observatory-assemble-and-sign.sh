#!/usr/bin/env bash
# Operator-side Android builder + signer. Not executable inside Factory CODE/Worker.
# The PKCS12 and its password must remain in an isolated owner signing environment.
set -euo pipefail
umask 077
fail(){ echo "APK_STATION_FAILED:$1" >&2; exit 1; }
for variable in OBSERVATORY_REPO_DIR OBSERVATORY_SOURCE_SHA OBSERVATORY_KEYSTORE_PATH OBSERVATORY_KEYSTORE_PASSWORD OBSERVATORY_SIGNED_OUTPUT; do
  test -n "$(printenv "$variable" 2>/dev/null)" || fail MISSING_SECURE_INPUT
done
expected_cert=31bf91b925558771a03bdc81d258cd4d1024a3bb48702bb08534f216e88d0624
expected_alias=ygg-observatory-release-2026
[[ "$OBSERVATORY_SOURCE_SHA" =~ ^[a-f0-9]{40}$ ]] || fail BAD_SOURCE_COMMIT
[[ -f "$OBSERVATORY_KEYSTORE_PATH" ]] || fail KEYSTORE_NOT_FOUND
[[ -d "$OBSERVATORY_REPO_DIR/android-browser" ]] || fail SOURCE_DIR_NOT_FOUND
[[ "$OBSERVATORY_SIGNED_OUTPUT" == *.apk ]] || fail BAD_OUTPUT_EXTENSION
gradle_bin=gradle
apksigner_bin=apksigner
aapt_bin=aapt
for tool in "$gradle_bin" "$apksigner_bin" "$aapt_bin" git keytool sha256sum; do
  command -v "$tool" >/dev/null 2>&1 || fail TOOL_MISSING
done
actual="$(git -C "$OBSERVATORY_REPO_DIR" rev-parse HEAD)" || fail GIT_READ_FAILED
[[ "$actual" == "$OBSERVATORY_SOURCE_SHA" ]] || fail SOURCE_DRIFT

# Preflight the existing public signer fingerprint; no private key exported.
cert_data="$(keytool -list -v -keystore "$OBSERVATORY_KEYSTORE_PATH" -storetype PKCS12 \
  -storepass:env OBSERVATORY_KEYSTORE_PASSWORD -alias "$expected_alias")" || fail KEY_UNLOCK_FAILED
formatted_cert="$(echo "$expected_cert" | sed 's/../&:/g;s/:$//')"
[[ "$(echo "$cert_data" | tr '[:upper:]' '[:lower:]')" == *"$formatted_cert"* ]] || fail OWNER_CERT_MISMATCH
unset cert_data

(
  cd "$OBSERVATORY_REPO_DIR/android-browser"
  OBSERVATORY_SOURCE_SHA="$actual" "$gradle_bin" --no-daemon :app:assembleRelease
)
unsigned="$OBSERVATORY_REPO_DIR/android-browser/app/build/outputs/apk/release/app-release-unsigned.apk"
[[ -s "$unsigned" ]] || fail UNSIGNED_APK_MISSING
badging="$("$aapt_bin" dump badging "$unsigned")" || fail AAPT_FAILED
[[ "$badging" == *"name='com.big.gobrowser' versionCode='18' versionName='0.7.2'"* ]] || fail PACKAGE_VERSION_MISMATCH
unset badging

mkdir -p "$(dirname "$OBSERVATORY_SIGNED_OUTPUT")"
tmp="$OBSERVATORY_SIGNED_OUTPUT.signing.$$"
trap 'rm -f -- "$tmp"' EXIT
"$apksigner_bin" sign --ks "$OBSERVATORY_KEYSTORE_PATH" --ks-type PKCS12 \
  --ks-key-alias "$expected_alias" \
  --ks-pass env:OBSERVATORY_KEYSTORE_PASSWORD --key-pass env:OBSERVATORY_KEYSTORE_PASSWORD \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true \
  --out "$tmp" "$unsigned"
verify_output="$("$apksigner_bin" verify --min-sdk-version 26 --print-certs --verbose "$tmp")" || fail SIGNATURE_VERIFY_FAILED
cert="$(printf '%s\n' "$verify_output" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | head -n 1 | tr '[:upper:]' '[:lower:]')"
[[ "$cert" == "$expected_cert" ]] || fail SIGNED_CERT_MISMATCH
signed_sha="$(sha256sum "$tmp" | cut -d' ' -f1)"
[[ "$signed_sha" =~ ^[a-f0-9]{64}$ ]] || fail SIGNED_DIGEST_INVALID
mv -f -- "$tmp" "$OBSERVATORY_SIGNED_OUTPUT"
printf '{"schema":"FACTORY_APK_SIGNING_RECEIPT_V1","packageName":"com.big.gobrowser","versionCode":18,"versionName":"0.7.2","sourceCommit":"%s","signerSha256":"%s","signedApkSha256":"%s","signingStatus":"SIGNED_AND_APKSIGNER_VERIFIED"}\n' \
  "$actual" "$cert" "$signed_sha" > "$OBSERVATORY_SIGNED_OUTPUT.receipt.json"
printf 'SIGNED_AND_APKSIGNER_VERIFIED\nAPK_SHA256=%s\n' "$signed_sha"
