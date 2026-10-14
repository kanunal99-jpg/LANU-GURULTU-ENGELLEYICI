#!/usr/bin/env sh
# Minimal, checksum-verified Gradle bootstrap (no unreviewed binary wrapper in repo).
set -eu
VERSION=8.11.1
CHECKSUM=f397b287023acdba1e9f6fc5ea72d22dd63669d59ed4a289a29b1a76eee151c6
CACHE="${GRADLE_USER_HOME:-${HOME}/.gradle}/lanu-bootstrap"
DIST="$CACHE/gradle-$VERSION"
if [ ! -x "$DIST/bin/gradle" ]; then
    mkdir -p "$CACHE"
    ARCHIVE="$CACHE/gradle-$VERSION-bin.zip"
    curl --fail --location --retry 2 "https://services.gradle.org/distributions/gradle-$VERSION-bin.zip" -o "$ARCHIVE"
    printf '%s  %s\n' "$CHECKSUM" "$ARCHIVE" | sha256sum --check -
    unzip -q -o "$ARCHIVE" -d "$CACHE"
    rm "$ARCHIVE"
fi
exec "$DIST/bin/gradle" "$@"
