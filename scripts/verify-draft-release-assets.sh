#!/usr/bin/env bash
# Read back each unpublished release asset through authenticated REST by ID.
# Never expose an unverified draft or rely on the by-tag (draft 404) endpoint.
set -euo pipefail
release="${1:?draft release JSON required}"
dist="${2:?built assets directory required}"
output="${3:?readback directory required}"
repo="${4:?repository required}"
[[ "$repo" == "kanunal99-jpg/LANU-GURULTU-ENGELLEYICI" ]] || {
  echo "::error::Unexpected release repository"; exit 1;
}
jq -er '.draft==true and (.id|type=="number") and .id>0' "$release" | grep -qx true
mkdir -p "$output"
for filename in Lanu-Lens-2.0.10.apk SHA256SUMS.txt APK-BILGILERI.txt APK-IMZA-DURUMU.txt; do
  # Reject absent or ambiguous asset identities, even if metadata is present.
  asset_id="$(jq -er --arg name "$filename"     '[.assets[]|select(.name==$name)|.id] |
     if length==1 then .[0] else error("Missing/duplicate release asset ID") end' "$release")"
  [[ "$asset_id" =~ ^[1-9][0-9]*$ ]] || {
    echo "::error::Invalid release asset id"; exit 1;
  }
  gh api -H "Accept: application/octet-stream"     "repos/${repo}/releases/assets/${asset_id}" > "$output/$filename"
  # Assets retrieved as JSON errors, redirects, or altered binaries always fail.
  cmp "$dist/$filename" "$output/$filename"
done
(cd "$output" && sha256sum -c SHA256SUMS.txt)
echo "Four authenticated draft release assets byte-matched."
