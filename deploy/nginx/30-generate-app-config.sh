#!/bin/sh
set -eu

escape_js() {
  printf '%s' "${1:-}" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

API_BASE_URL_ESCAPED="$(escape_js "${EW_SIM_API_BASE_URL:-/api}")"
CESIUM_TOKEN_ESCAPED="$(escape_js "${CESIUM_ION_DEFAULT_TOKEN:-}")"

cat > /usr/share/nginx/html/app-config.js <<EOF
window.EW_SIM_CONFIG = {
  apiBaseUrl: "${API_BASE_URL_ESCAPED}",
  cesiumIonDefaultToken: "${CESIUM_TOKEN_ESCAPED}"
};
EOF
