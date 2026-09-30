#!/bin/sh
set -eu

# Runs before nginx's 20-envsubst script. Only a canonical DNS hostname may
# enter the nginx template; never print rejected deployment values.
invalid_host() {
    echo 'Invalid MCP_HOST: configure a lowercase DNS hostname without a port or URL.' >&2
    exit 1
}

case "${MCP_HOST:-}" in
    ''|*[!a-z0-9.-]*) invalid_host ;;
esac
if ! printf '%s\n' "$MCP_HOST" | awk '
    length($0) > 253 { exit 1 }
    {
        count = split($0, labels, ".")
        if (count < 2) exit 1
        for (i = 1; i <= count; i++) {
            if (length(labels[i]) > 63 || labels[i] !~ /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/) exit 1
        }
    }
'; then
    invalid_host
fi
