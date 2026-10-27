#!/usr/bin/env bash
# Read-only acceptance gate for a previously built, PRIVATE source-repo
# production APK. Must finish before GH_TOKEN is switched to public publisher.
# No publishing, installing, secrets output or user-data access happens here.
set -Eeuo pipefail
export LC_ALL=C
: "${OTA_PROMOTE_TAG:?Require exact private release tag}"
: "${OTA_PROMOTE_DIR:?Require downloaded private release assets directory}"
: "${OTA_ACCEPTED_SHA256:?Require exact SHA256 supplied at manual dispatch}"
: "${LANU_OTA_DEVICE_ACCEPTED_APK_SHA256:?Require owner-approved device acceptance hash}"
: "${LANU_RELEASE_CERT_SHA256:?Require original installed production certificate pin}"
: "${GITHUB_REPOSITORY:?Require source repository identity}"
[[ "$GITHUB_REPOSITORY" == "kanunal99-jpg/LANU-GURULTU-ENGELLEYICI" ]] || {
  echo 'Unexpected source repository' >&2; exit 1;
}
[[ "$OTA_PROMOTE_TAG" =~ ^v([0-9]+\.[0-9]+\.[0-9]+)-build([1-9][0-9]*)$ ]] || {
  echo 'Invalid release tag' >&2; exit 1;
}
version="${BASH_REMATCH[1]}"
code="${BASH_REMATCH[2]}"
expected="$(printf '%s' "$OTA_ACCEPTED_SHA256" | tr '[:upper:]' '[:lower:]')"
approved="$(printf '%s' "$LANU_OTA_DEVICE_ACCEPTED_APK_SHA256" | tr '[:upper:]' '[:lower:]')"
pin="$(printf '%s' "$LANU_RELEASE_CERT_SHA256" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
[[ "$expected" =~ ^[0-9a-f]{64}$ && "$approved" == "$expected" ]] || {
  echo 'The candidate SHA256 was not explicitly approved for physical-device OTA acceptance' >&2; exit 1;
}
[[ "$pin" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid production certificate pin' >&2; exit 1; }
apk="$OTA_PROMOTE_DIR/Lanu-Lens-2.0.10.apk"
proof="$OTA_PROMOTE_DIR/APK-IMZA-DURUMU.txt"
sumfile="$OTA_PROMOTE_DIR/SHA256SUMS.txt"
[[ -f "$apk" && ! -L "$apk" && -s "$apk" && -f "$proof" && -f "$sumfile" ]] || {
  echo 'Required private release assets absent or unsafe' >&2; exit 1;
}
[[ "$(stat -c%s "$apk")" -ge 1024 && "$(stat -c%s "$apk")" -le 167772160 ]] || {
  echo 'APK exceeds configured size limits' >&2; exit 1;
}
actual="$(sha256sum "$apk" | cut -d' ' -f1)"
[[ "$actual" == "$approved" ]] || { echo 'APK bytes do not match physical-device accepted SHA256' >&2; exit 1; }
[[ "$(wc -l < "$sumfile")" -eq 1 ]] && grep -Fxq "$actual  Lanu-Lens-2.0.10.apk" "$sumfile" || {
  echo 'Private release SHA256SUMS disagrees with downloaded APK' >&2; exit 1;
}
for expected_line in "SIGNING_MODE=PRODUCTION" "OTA_COMPATIBLE=SIGNER_ONLY" \
    "APK_PACKAGE=com.lanu.sesli" "APK_VERSION_CODE=$code" \
    "APK_VERSION_NAME=$version" "APK_CERT_SHA256=$pin"; do
  grep -Fxq "$expected_line" "$proof" || {
    echo 'Private release production signing report not matching accepted APK' >&2; exit 1;
  }
done
# Independently inspect the actual downloaded binary; a text evidence file
# alone is never enough to authorize OTA.
apksigner verify --min-sdk-version 29 "$apk" >/dev/null
apksigner verify --min-sdk-version 35 "$apk" >/dev/null
report="$(LANU_RELEASE_CERT_SHA256="$pin" bash scripts/verify-release-apk.sh \
  "$apk" PRODUCTION "$code" "$version")" || {
  echo 'Downloaded APK package/version/production signature verification failed' >&2; exit 1;
}
grep -Fxq "APK_CERT_SHA256=$pin" <<< "$report" || {
  echo 'Production signature verification changed' >&2; exit 1;
}
echo "ACCEPTED: production APK $OTA_PROMOTE_TAG exactly matches SHA256 and physical-device approval."
echo 'Approval represents the operator acceptance record; this script does not itself test hardware.'
