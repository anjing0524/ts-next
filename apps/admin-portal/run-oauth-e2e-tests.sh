#!/bin/bash
set -e

# Default values
HEADED_MODE=""
DEBUG_MODE=""
UI_MODE=""

# Parse command-line arguments
for arg in "$@"
do
  case $arg in
    --headed)
      HEADED_MODE="--headed"
      shift # Remove --headed from processing
      ;;
    --debug)
      DEBUG_MODE="--debug"
      shift # Remove --debug from processing
      ;;
    --ui)
      UI_MODE="--ui"
      shift # Remove --ui from processing
      ;;
  esac
done

# Run Playwright tests
playwright test tests/e2e/specs/08-oauth-third-party-client.spec.ts $HEADED_MODE $DEBUG_MODE $UI_MODE
