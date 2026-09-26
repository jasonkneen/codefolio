#!/bin/sh
set -eu
codefolio_data_dir="${CODEFOLIO_DATA_DIR:-/data}"
mkdir -p "$codefolio_data_dir"
chown node:node "$codefolio_data_dir"
exec gosu node "$@"
