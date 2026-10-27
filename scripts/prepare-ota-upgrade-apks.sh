#!/usr/bin/env bash
# Produce OLD and NEW debug APKs with the same CI debug signing key.
# Only for an isolated disposable emulator; never for public OTA publication.
set -Eeuo pipefail
: "${GITHUB_RUN_NUMBER:?GitHub Actions build number required}"
: "${RUNNER_TEMP:?GitHub Actions temporary directory required}"
[[ "${GITHUB_RUN_NUMBER}" =~ ^[0-9]+$ ]] || exit 1
work="${RUNNER_TEMP}/lanu-ota-upgrade"
mkdir -p "$work"
old_code=$((GITHUB_RUN_NUMBER * 2))
new_code=$((old_code + 1))
LANU_VERSION_CODE="$old_code" gradle assembleDebug --no-daemon
cp app/build/outputs/apk/debug/app-debug.apk "$work/old.apk"
LANU_VERSION_CODE="$new_code" gradle assembleDebug assembleDebugAndroidTest --no-daemon
cp app/build/outputs/apk/debug/app-debug.apk "$work/new.apk"
cp app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk "$work/test.apk"
for apk in old new; do
  apksigner verify --min-sdk-version 29 "$work/$apk.apk"
  identity="$(aapt dump badging "$work/$apk.apk" | grep -m1 '^package:')"
  [[ "$identity" == *"name='com.lanu.sesli'"* ]] || { echo 'Unexpected APK package'; exit 1; }
done
old_signer="$(apksigner verify --print-certs "$work/old.apk" | sed -n 's/.*Signer #1 certificate SHA-256 digest: //p' | head -1)"
new_signer="$(apksigner verify --print-certs "$work/new.apk" | sed -n 's/.*Signer #1 certificate SHA-256 digest: //p' | head -1)"
[[ "$old_signer" =~ ^[0-9a-f]{64}$ && "$new_signer" == "$old_signer" ]] || {
  echo 'CI signing certificate changed between old/new builds'; exit 1;
}
grep -q "versionCode='$old_code'" <<< "$(aapt dump badging "$work/old.apk" | grep -m1 '^package:')"
grep -q "versionCode='$new_code'" <<< "$(aapt dump badging "$work/new.apk" | grep -m1 '^package:')"
printf 'CI test APKs share signer %s, versionCode %s -> %s. Not a production OTA signature.\n' "$old_signer" "$old_code" "$new_code"
