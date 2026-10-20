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
# Require exactly one signer: matching only Signer #1 is insufficient if the
# binary carries another signer. Reject malformed or unsigned APKs early.
signers="$(apksigner verify --print-certs "${OTA_APK}")"
signer_count="$(printf '%s\n' "${signers}" | grep -Ec 'Signer #[0-9]+ certificate SHA-256 digest:' || true)"
if [[ "${signer_count}" != "1" ]]; then
  echo "::error::Expected exactly one Android signing certificate; refusing OTA publication"
  exit 1
fi
# A filename/tag is untrusted; inspect the actual compiled APK identity.
badging="$(aapt dump badging "${OTA_APK}")"
pkg="$(printf '%s\n' "${badging}" | sed -n "s/^package: name='\\([^']*\\)'.*/\\1/p" | head -1)"
actual_code="$(printf '%s\n' "${badging}" | sed -n "s/^package: .*versionCode='\\([0-9]*\\)'.*/\\1/p" | head -1)"
actual_version="$(printf '%s\n' "${badging}" | sed -n "s/^package: .*versionName='\\([^']*\\)'.*/\\1/p" | head -1)"
if [[ "${pkg}" != "com.lanu.sesli" || "${actual_code}" != "${GITHUB_RUN_NUMBER}" || "${actual_version}" != "${OTA_VERSION}" ]]; then
  echo "::error::APK package, versionCode or versionName mismatch; refusing OTA publication"
  exit 1
fi
# Fail closed on public manifest API outages or permission errors. Only a
# genuine GitHub 404 can mean an uninitialized binary-only repository.
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT
old_sha=""
if gh api "repos/${repo}/contents/latest.json?ref=main" > "${workdir}/previous.json" 2> "${workdir}/lookup.err"; then
  old_sha="$(jq -er '.sha | select(type=="string" and length > 10)' "${workdir}/previous.json")"
  old_b64="$(jq -er '.content | select(type=="string")' "${workdir}/previous.json" | tr -d '\n')"
  old_code="$(printf '%s' "${old_b64}" | base64 -d | jq -er '.versionCode | select(type=="number" and . > 0)')"
  if [[ ! "${old_code}" =~ ^[0-9]+$ ]] || (( old_code >= GITHUB_RUN_NUMBER )); then
    echo "::error::OTA latest.json is malformed or already newer; refusing rollback"
    exit 1
  fi
elif grep -Eq 'HTTP 404|HTTP 404[)]|Not Found [(]HTTP 404[)]' "${workdir}/lookup.err"; then
  echo "::notice::First public manifest publication; latest.json does not exist yet."
else
  echo "::error::Cannot verify previous public OTA manifest (auth/network/API error); refusing publication."
  exit 1
fi

filename="$(basename "${OTA_APK}")"
tag="v${OTA_VERSION}-build${GITHUB_RUN_NUMBER}"
checksum="$(sha256sum "${OTA_APK}" | awk '{print $1}')"
bytes="$(stat -c%s "${OTA_APK}")"
[[ "${bytes}" -ge 1024 && "${bytes}" -le 167772160 ]] || exit 1
# Do not treat GitHub auth/rate-limit/5xx failure as a missing release tag.
# Only an explicit tag 404 permits publication.
if gh api "repos/${repo}/releases/tags/${tag}" > "${workdir}/tag.json" 2> "${workdir}/tag.err"; then
  echo "::error::Public tag already exists; do not silently replace a released APK"
  exit 1
elif grep -Eq 'HTTP 404|HTTP 404[)]|Not Found [(]HTTP 404[)]' "${workdir}/tag.err"; then
  echo "::notice::Public release tag is available."
else
  echo "::error::Cannot verify public release tag (auth/network/API error); refusing publication."
  exit 1
fi
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
