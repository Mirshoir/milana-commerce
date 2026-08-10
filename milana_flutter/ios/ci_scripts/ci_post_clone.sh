#!/bin/sh

set -eu

FLUTTER_VERSION="3.44.1"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
IOS_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$(dirname "$IOS_DIR")"
DEFINES_PATH="$APP_DIR/firebase/mobile-dart-defines.env"
CI_ROOT="${CI_WORKSPACE_PATH:-$APP_DIR}"
FLUTTER_SDK="$CI_ROOT/.flutter-sdk-$FLUTTER_VERSION"

if ! command -v flutter >/dev/null 2>&1; then
  if [ ! -x "$FLUTTER_SDK/bin/flutter" ]; then
    git clone \
      --branch "$FLUTTER_VERSION" \
      --depth 1 \
      https://github.com/flutter/flutter.git \
      "$FLUTTER_SDK"
  fi
  PATH="$FLUTTER_SDK/bin:$PATH"
  export PATH
fi

if ! command -v pod >/dev/null 2>&1; then
  brew install cocoapods
fi

if [ -z "${MOBILE_DART_DEFINES_BASE64:-}" ]; then
  echo "MOBILE_DART_DEFINES_BASE64 is required for production Xcode Cloud builds." >&2
  exit 1
fi

mkdir -p "$APP_DIR/firebase"
printf '%s' "$MOBILE_DART_DEFINES_BASE64" | base64 -D > "$DEFINES_PATH"
chmod 600 "$DEFINES_PATH"

cd "$APP_DIR"
flutter config --no-analytics
flutter precache --ios
flutter pub get
flutter build ios \
  --release \
  --config-only \
  --no-codesign \
  --dart-define-from-file="$DEFINES_PATH"

cd "$IOS_DIR"
pod install
