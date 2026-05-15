#!/bin/bash
# NightFlow 모바일 빌드 스크립트
# 사용법: ./scripts/build-mobile.sh [android|ios|all]

set -e

PLATFORM=${1:-all}

echo "🌙 NightFlow 모바일 빌드 시작..."

# Remote URL 방식이라 npm build 불필요
# cap sync만 실행 (네이티브 플러그인 동기화)
echo "🔄 네이티브 플러그인 동기화..."
npx cap sync

if [ "$PLATFORM" = "android" ] || [ "$PLATFORM" = "all" ]; then
  echo "🤖 Android 빌드 열기..."
  npx cap open android
fi

if [ "$PLATFORM" = "ios" ] || [ "$PLATFORM" = "all" ]; then
  echo "🍎 iOS 빌드 열기..."
  npx cap open ios
fi

echo "✅ 완료! Android Studio / Xcode에서 빌드를 진행하세요."
