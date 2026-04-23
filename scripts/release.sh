#!/usr/bin/env bash
# 거북이경보 릴리즈 자동화 스크립트
#
# 사용법:
#   ./scripts/release.sh           # package.json의 현재 버전으로 릴리즈
#   ./scripts/release.sh v0.6.0    # 특정 태그로 릴리즈
#
# 동작:
#   1. dist/ 정리 후 mac universal(x64+arm64) 빌드
#   2. DMG를 버전 없는 이름(TurtleAlert-arm64.dmg, TurtleAlert-x64.dmg)으로 rename
#   3. 해당 태그의 GitHub Release에 자산 업로드 (기존 자산은 교체)
#
# 자산명을 버전 없이 고정하는 이유:
#   DOWNLOAD.md의 latest/download/ 링크가 매 릴리즈마다 깨지지 않게 하기 위함.

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION_FROM_PKG=$(node -p "require('./package.json').version")
TAG="${1:-v${VERSION_FROM_PKG}}"
VERSION="${TAG#v}"

ARM64_SRC="dist/TurtleAlert-${VERSION}-arm64.dmg"
X64_SRC="dist/TurtleAlert-${VERSION}.dmg"
ARM64_DEST_NAME="TurtleAlert-arm64.dmg"
X64_DEST_NAME="TurtleAlert-x64.dmg"

echo "==> 릴리즈 태그: ${TAG} (버전: ${VERSION})"

echo "==> 이전 빌드 산출물 정리"
rm -rf dist

echo "==> electron-builder 빌드 (x64 + arm64)"
npx electron-builder --mac --x64 --arm64 --publish never

if [[ ! -f "${ARM64_SRC}" || ! -f "${X64_SRC}" ]]; then
  echo "ERROR: 빌드 산출물을 찾지 못했습니다." >&2
  echo "  expected: ${ARM64_SRC}" >&2
  echo "  expected: ${X64_SRC}" >&2
  exit 1
fi

echo "==> rename용 임시 파일 생성"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT
cp "${ARM64_SRC}" "${TMP_DIR}/${ARM64_DEST_NAME}"
cp "${X64_SRC}"  "${TMP_DIR}/${X64_DEST_NAME}"

if ! gh release view "${TAG}" >/dev/null 2>&1; then
  echo "ERROR: GitHub Release ${TAG} 가 존재하지 않습니다. 먼저 생성하세요." >&2
  echo "  예: gh release create ${TAG} --title \"거북이경보 ${TAG}\" --notes \"...\"" >&2
  exit 1
fi

echo "==> 기존 자산 제거 (있다면)"
for asset in "${ARM64_DEST_NAME}" "${X64_DEST_NAME}"; do
  gh release delete-asset "${TAG}" "${asset}" --yes 2>/dev/null || true
done

echo "==> 새 자산 업로드"
gh release upload "${TAG}" \
  "${TMP_DIR}/${ARM64_DEST_NAME}" \
  "${TMP_DIR}/${X64_DEST_NAME}"

echo "==> 완료"
gh release view "${TAG}" | grep -E "^(tag|url|asset):"
