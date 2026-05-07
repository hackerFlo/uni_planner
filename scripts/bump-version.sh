#!/usr/bin/env bash
# Usage: scripts/bump-version.sh <new-version>   e.g. 1.0.1
# Bumps the version in all four places that must stay in lockstep:
#   package.json, client/package.json, server/package.json,
#   and client/src/constants/changelog.js (CURRENT_VERSION).
# After running this, prepend a CHANGELOG entry, commit, then tag:
#   git tag -a v<version> -m "Release v<version>" && git push origin v<version>
set -euo pipefail

v="${1:?usage: scripts/bump-version.sh X.Y.Z}"

# Validate semver format
if ! [[ "$v" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be X.Y.Z (e.g. 1.0.1)" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Update the three package.json files
for f in package.json client/package.json server/package.json; do
  node -e "
    const fs = require('fs');
    const path = require('path');
    const file = path.join('$ROOT', '$f');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.version = '$v';
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  "
  echo "  Updated $f"
done

# Update CURRENT_VERSION in changelog.js
CHANGELOG="$ROOT/client/src/constants/changelog.js"
sed -i.bak -E "s/(export const CURRENT_VERSION = ')[^']+(';)/\1$v\2/" "$CHANGELOG"
rm "${CHANGELOG}.bak"
echo "  Updated client/src/constants/changelog.js"

echo ""
echo "Bumped to v$v in 4 files."
echo "Next steps:"
echo "  1. Prepend a new CHANGELOG entry in client/src/constants/changelog.js"
echo "  2. git add -p && git commit -m 'chore: release v$v'"
echo "  3. git tag -a v$v -m 'Release v$v'"
echo "  4. git push && git push origin v$v"
echo "  5. gh release create v$v --title 'v$v' --notes '...'"
