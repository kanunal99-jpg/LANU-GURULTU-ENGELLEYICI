#!/usr/bin/env bash
# Real Android package replacement on a disposable GitHub emulator.
# Seed an encrypted PIN vault and message on the old APK; do NOT clear any app
# data or uninstall. Verify original PIN and ciphertext after the new install.
set -Eeuo pipefail
: "${RUNNER_TEMP:?GitHub Actions temporary directory required}"
: "${GITHUB_RUN_NUMBER:?Build number required}"
work="${RUNNER_TEMP}/lanu-ota-upgrade"
for file in old.apk new.apk test.apk; do
  [[ -s "$work/$file" ]] || { echo "Missing $file"; exit 1; }
done
old_code=$((GITHUB_RUN_NUMBER * 2))
new_code=$((old_code + 1))
# Fresh CI emulator only. Never run this installation script against a personal
# phone; it does not install production-signed files.
[[ "${LANU_DISPOSABLE_CI_EMULATOR:-}" == "true" ]] || {
  echo 'Only explicit disposable CI emulator may run this test'; exit 1;
}
[[ "$(adb shell getprop ro.kernel.qemu | tr -d '\r')" == "1" ]] || {
  echo 'OTA synthetic test blocked on physical hardware'; exit 1;
}
check_device_version() {
  local wanted="$1"
  adb shell dumpsys package com.lanu.sesli |
    grep -m1 -E "versionCode=${wanted}([[:space:]]|$)" >/dev/null
}
instrument() {
  local phase="$1"
  local report="$work/instrument-${phase}.txt"
  adb shell am instrument -w -e otaUpgradePhase "$phase" \
    com.lanu.sesli.test/com.lanu.sesli.SmokeInstrumentation | tee "$report"
  grep -Fq 'OK (1 test)' "$report" && ! grep -Fq 'FAILURES!!!' "$report" || {
    echo "OTA ${phase} instrumentation failed"; exit 1;
  }
}
adb install -r "$work/old.apk"
adb install -r "$work/test.apk"
check_device_version "$old_code"
instrument seed
# Absolutely no adb uninstall, pm clear, app backup, or force-stop of user
# state between these installs.
adb install -r "$work/new.apk"
check_device_version "$new_code"
instrument verify
echo "PASS: Android in-place same-signer versionCode $old_code -> $new_code retained PIN, encrypted draft, preferences."
echo 'LIMIT: This isolated CI test is not a real phone or original production signing key test.'
