#!/usr/bin/env bash
# READ-ONLY existing-install OTA preflight. Never installs/uninstalls or reads user data.
set -Eeuo pipefail
umask 077
export LC_ALL=C
if [[ $# -ne 1 ]]; then
  echo 'Usage: scripts/verify-installed-ota-compatibility.sh signed-new.apk' >&2
  exit 2
fi
apk="$1"
[[ -f "$apk" && ! -L "$apk" && -s "$apk" ]] || { echo 'Missing/unsafe candidate APK' >&2; exit 1; }
for tool in adb aapt apksigner sha256sum mktemp sed grep tr stat; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing required tool: $tool" >&2; exit 1; }
done
[[ $(stat -c%s "$apk") -le 167772160 ]] || { echo 'APK exceeds 160 MiB' >&2; exit 1; }
package='com.lanu.sesli'
extract_identity() {
  local badging
  badging="$(aapt dump badging "$1")" || return 1
  local line
  line="$(printf '%s\n' "$badging" | grep -m1 '^package:')" || return 1
  [[ "$line" =~ name=\'([^\']+)\' ]] || return 1
  local name="${BASH_REMATCH[1]}"
  [[ "$line" =~ versionCode=\'([0-9]+)\' ]] || return 1
  local code="${BASH_REMATCH[1]}"
  [[ "$name" == "$package" && "$code" =~ ^[1-9][0-9]*$ ]] || return 1
  printf '%s\n' "$code"
}
extract_signer() {
  local report
  report="$(apksigner verify --print-certs "$1")" || return 1
  local digests
  digests="$(printf '%s\n' "$report" | sed -nE 's/^Signer #[0-9]+ certificate SHA-256 digest: *([0-9a-fA-F:]+).*$/\1/p' | tr -d ':' | tr '[:upper:]' '[:lower:]')"
  [[ "$digests" =~ ^[0-9a-f]{64}$ ]] || return 1
  printf '%s\n' "$digests"
}
# Check the intended new artifact is valid on both requested Android API levels.
apksigner verify --min-sdk-version 29 "$apk" >/dev/null || { echo 'APK signature invalid for Android 10' >&2; exit 1; }
apksigner verify --min-sdk-version 35 "$apk" >/dev/null || { echo 'APK signature invalid for Android 15' >&2; exit 1; }
new_code="$(extract_identity "$apk")" || { echo 'Invalid candidate package identity' >&2; exit 1; }
new_cert="$(extract_signer "$apk")" || { echo 'Candidate has invalid or multiple signers' >&2; exit 1; }
pinned="$(printf '%s' "${LANU_RELEASE_CERT_SHA256:-}" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
if [[ -n "$pinned" && ( ! "$pinned" =~ ^[0-9a-f]{64}$ || "$new_cert" != "$pinned" ) ]]; then
  echo 'Candidate does not match configured production certificate pin' >&2; exit 1
fi
adb get-state >/dev/null || { echo 'Exactly one authorized ADB device required' >&2; exit 1; }
paths="$(adb shell pm path "$package" | tr -d '\r')" || { echo 'Cannot inspect installed package path' >&2; exit 1; }
# Select one exact base APK, never external storage or private app data.
base="$(printf '%s\n' "$paths" | sed -n 's/^package:\(.*\/base\.apk\)$/\1/p')"
[[ "$base" == /* && "$base" != *$'\n'* ]] || { echo 'Installed base APK not found or ambiguous' >&2; exit 1; }
case "$base" in
  /data/app/*|/mnt/expand/*) ;;
  *) echo 'Unexpected Android installed package location' >&2; exit 1 ;;
esac
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
adb pull "$base" "$tmp/installed.apk" >/dev/null || {
  echo 'ADB cannot read installed APK without elevated privileges; no data changed' >&2
  exit 1
}
old_code="$(extract_identity "$tmp/installed.apk")" || { echo 'Installed package cannot be verified' >&2; exit 1; }
old_cert="$(extract_signer "$tmp/installed.apk")" || { echo 'Installed signing certificate unavailable' >&2; exit 1; }
if (( new_code <= old_code )); then
  echo 'FAIL: New APK versionCode is not higher than installed versionCode' >&2; exit 1
fi
if [[ "$new_cert" != "$old_cert" ]]; then
  echo 'FAIL: Installed and candidate APK signing certificates DIFFER. Do not uninstall; preserve app data.' >&2
  echo "installed certificate SHA-256: $old_cert" >&2
  echo "candidate certificate SHA-256: $new_cert" >&2
  exit 1
fi
printf 'PASS: %s, versionCode %s -> %s, same Android signing certificate: %s\n' "$package" "$old_code" "$new_code" "$new_cert"
printf '%s\n' 'READ-ONLY PRECHECK ONLY: a real in-app install and post-update data-preservation test are still required.'
