#!/usr/bin/env bash
# Publishes a verified, release-signed APK to a separate PUBLIC binary-only
# repository, and updates latest.json LAST. Never publish the private source.
set -euo pipefail
: "${GH_TOKEN:?A scoped LANU_OTA_PUBLISH_TOKEN is required}"
: "${GITHUB_REPOSITORY_OWNER:?Missing owner}"
: "${GITHUB_RUN_NUMBER:?Missing build number}"
: "${OTA_APK:?Missing signed APK path}"
: "${OTA_VERSION:?Missing version}"
: "${LANU_OTA_MANIFEST_URL:?Missing app manifest address}"
: "${LANU_RELEASE_CERT_SHA256:?Missing pinned Android signing certificate fingerprint}"
repo="${GITHUB_REPOSITORY_OWNER}/LANU-LENS-OTA"
feed="https://raw.githubusercontent.com/${repo}/main/latest.json"
[[ "${LANU_OTA_MANIFEST_URL}" == "${feed}" ]] || { echo "::error::Manifest URL does not match binary-only repository"; exit 1; }
[[ "${GITHUB_REPOSITORY_OWNER}" == "kanunal99-jpg" ]] || { echo "::error::Unexpected publishing owner"; exit 1; }
[[ "${GITHUB_RUN_NUMBER}" =~ ^[0-9]+$ ]] || exit 1
[[ "${OTA_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || exit 1
[[ -s "${OTA_APK}" ]] || exit 1
[[ "$(gh repo view "${repo}" --json visibility --jq '.visibility')" == "PUBLIC" ]] || {
  echo "::error::Create LANU-LENS-OTA as a PUBLIC repository first; never publish the private source repository"
  exit 1
}
actual_cert="$(apksigner verify --print-certs "${OTA_APK}" | sed -n 's/.*Signer #1 certificate SHA-256 digest: //p' | head -1 | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
expected_cert="$(printf '%s' "${LANU_RELEASE_CERT_SHA256}" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
if [[ ! "${expected_cert}" =~ ^[0-9a-f]{64}$ || "${actual_cert}" != "${expected_cert}" ]]; then
  echo "::error::Android release signature does not match pinned fingerprint; refusing OTA publication"
  exit 1
fi
# Fail closed before uploading if the already-advertised manifest is newer.
old_sha="$(gh api "repos/${repo}/contents/latest.json?ref=main" --jq .sha 2>/dev/null || true)"
if [[ -n "${old_sha}" ]]; then
  old_b64="$(gh api "repos/${repo}/contents/latest.json?ref=main" --jq .content | tr -d '\n')"
  old_code="$(printf '%s' "${old_b64}" | base64 -d | jq -er '.versionCode | select(type=="number")' || true)"
  if [[ ! "${old_code}" =~ ^[0-9]+$ ]] || (( old_code >= GITHUB_RUN_NUMBER )); then
    echo "::error::OTA latest.json is malformed or already newer; refusing rollback"
    exit 1
  fi
fi

filename="$(basename "${OTA_APK}")"
tag="v${OTA_VERSION}-build${GITHUB_RUN_NUMBER}"
checksum="$(sha256sum "${OTA_APK}" | awk '{print $1}')"
bytes="$(stat -c%s "${OTA_APK}")"
[[ "${bytes}" -ge 1024 && "${bytes}" -le 167772160 ]] || exit 1
if gh release view "${tag}" --repo "${repo}" >/dev/null 2>&1; then
  echo "::error::Public tag already exists; do not silently replace a released APK"
  exit 1
fi
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT
printf '%s  %s\n' "${checksum}" "${filename}" > "${workdir}/SHA256SUMS.txt"
gh release create "${tag}" "${OTA_APK}" "${workdir}/SHA256SUMS.txt" \
  --repo "${repo}" --title "Lanu Lens ${OTA_VERSION}" \
  --notes "Android imzası doğrulanmış LANU Lens OTA paketi. Kurulum için kullanıcı onayı gerekir."
# Download back through the PUBLIC release and compare bytes before updating
# latest.json: consumers never see a manifest pointing to a missing/bad APK.
mkdir -p "${workdir}/verify"
gh release download "${tag}" --repo "${repo}" --pattern "${filename}" --dir "${workdir}/verify"
printf '%s  %s\n' "${checksum}" "${workdir}/verify/${filename}" | sha256sum -c -
url="https://github.com/${repo}/releases/download/${tag}/${filename}"
jq -cn \
  --argjson schema 1 \
  --argjson versionCode "${GITHUB_RUN_NUMBER}" \
  --arg versionName "${OTA_VERSION}" \
  --arg apkUrl "${url}" \
  --arg sha256 "${checksum}" \
  --argjson sizeBytes "${bytes}" \
  '{schema:$schema,versionCode:$versionCode,versionName:$versionName,apkUrl:$apkUrl,sha256:$sha256,sizeBytes:$sizeBytes}' > "${workdir}/latest.json"
encoded="$(base64 -w0 "${workdir}/latest.json")"
args=(-X PUT "repos/${repo}/contents/latest.json" -f "message=release: ${tag} verified OTA" \
      -f "branch=main" -f "content=${encoded}")
if [[ -n "${old_sha}" ]]; then args+=(-f "sha=${old_sha}"); fi
gh api "${args[@]}" --jq '.content.path' | grep -x latest.json
echo "Published verified public OTA release ${tag}; latest.json promoted."
