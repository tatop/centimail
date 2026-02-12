#!/bin/bash

echo "Starting unified web app on http://localhost:3000..."
cd web || exit 1
bun run dev
