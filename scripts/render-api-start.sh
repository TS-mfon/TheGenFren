#!/bin/sh
set -eu

npm run build --workspace @genfren/api
npm run start --workspace @genfren/api
