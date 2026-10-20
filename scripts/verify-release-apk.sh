#!/usr/bin/env bash
set -euo pipefail
apk="${1:?APK required}";mode="${2:?DEBUG or PRODUCTION required}"
code="${3:?Version code required}";version="${4:?Version name required}"
if [[ ! -s "$apk" || ! "$code" =~ ^[1-9][0-9]*$ ||
      ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ||
      ! "$mode" =~ ^(DEBUG|PRODUCTION)$ ]]; then
  echo "::error::Invalid release artifact inputs";exit 1
fi
certs="$(apksigner verify --print-certs "$apk")"
signer_count="$(printf '%s\n' "$certs" | grep -Ec 'Signer #[0-9]+ certificate SHA-256 digest:' || true)"
if [[ "$signer_count" != "1" ]]; then
  echo "::error::Expected exactly one APK signer";exit 1
fi
actual="$(printf '%s\n' "$certs" | sed -n 's/.*Signer #1 certificate SHA-256 digest: //p' | head -1 | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
if [[ ! "$actual" =~ ^[a-f0-9]{64}$ ]];then echo "::error::APK certificate fingerprint unavailable";exit 1;fi
if [[ "$mode" == "PRODUCTION" ]];then
  expected="$(printf '%s' "${LANU_RELEASE_CERT_SHA256:-}" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
  if [[ ! "$expected" =~ ^[a-f0-9]{64}$ || "$actual" != "$expected" ]];then
    echo "::error::Actual APK production signing certificate differs from pinned fingerprint";exit 1
  fi
fi
badging="$(aapt dump badging "$apk")"
pkg="$(printf '%s\n' "$badging" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -1)"
version_code="$(printf '%s\n' "$badging" | sed -n "s/^package: .*versionCode='\([0-9]*\)'.*/\1/p" | head -1)"
version_name="$(printf '%s\n' "$badging" | sed -n "s/^package: .*versionName='\([^']*\)'.*/\1/p" | head -1)"
if [[ "$pkg" != "com.lanu.sesli" || "$version_code" != "$code" || "$version_name" != "$version" ]];then
  echo "::error::APK binary package or version does not match the release";exit 1
fi
printf '%s\n' "SIGNING_MODE=$mode" "APK_PACKAGE=$pkg" "APK_VERSION_CODE=$version_code" \
  "APK_VERSION_NAME=$version_name" "APK_CERT_SHA256=$actual"
if [[ "$mode" == "DEBUG" ]];then
  printf '%s\n' "OTA_COMPATIBLE=NO" "NOTE=Debug signed test build; not a guaranteed data-preserving production update"
else
  printf '%s\n' "OTA_COMPATIBLE=SIGNER_ONLY" "NOTE=Signing pin verified; live OTA/feed/phone acceptance separately required"
fi
