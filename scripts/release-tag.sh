#!/usr/bin/env bash
# 거북이경보 태그 릴리즈 스크립트
#
# 사용법:
#   ./scripts/release-tag.sh patch      # 0.5.0 -> 0.5.1
#   ./scripts/release-tag.sh minor      # 0.5.0 -> 0.6.0
#   ./scripts/release-tag.sh major      # 0.5.0 -> 1.0.0
#   ./scripts/release-tag.sh 0.6.0      # 명시적 버전
#
# 동작:
#   1. main 브랜치 + working tree clean 검증
#   2. package.json version bump
#   3. "chore: vX.Y.Z 릴리즈" 커밋
#   4. vX.Y.Z 태그 생성 후 main + 태그 push
#   5. 이후 CI(.github/workflows/release.yml)가 빌드 + GitHub Release 생성

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -lt 1 ]]; then
  echo "사용법: $0 <patch|minor|major|X.Y.Z>" >&2
  exit 1
fi

BUMP="$1"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "${CURRENT_BRANCH}" != "main" ]]; then
  echo "ERROR: main 브랜치에서만 실행 가능합니다 (현재: ${CURRENT_BRANCH})" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: working tree가 깨끗하지 않습니다. 먼저 커밋하세요." >&2
  git status --short >&2
  exit 1
fi

echo "==> origin/main 최신 상태 확인"
git fetch origin main --quiet
LOCAL=$(git rev-parse main)
REMOTE=$(git rev-parse origin/main)
if [[ "${LOCAL}" != "${REMOTE}" ]]; then
  echo "ERROR: 로컬 main과 origin/main이 다릅니다. pull/push 후 재시도하세요." >&2
  exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "==> 현재 버전: ${CURRENT_VERSION}"

case "${BUMP}" in
  patch|minor|major)
    NEW_VERSION=$(node -p "
      const [a,b,c] = require('./package.json').version.split('.').map(Number);
      ({patch: [a,b,c+1], minor: [a,b+1,0], major: [a+1,0,0]})['${BUMP}'].join('.')
    ")
    ;;
  [0-9]*.[0-9]*.[0-9]*)
    NEW_VERSION="${BUMP}"
    ;;
  *)
    echo "ERROR: '${BUMP}'는 유효한 인자가 아닙니다 (patch|minor|major|X.Y.Z)" >&2
    exit 1
    ;;
esac

TAG="v${NEW_VERSION}"
echo "==> 새 버전: ${NEW_VERSION} (태그: ${TAG})"

if git rev-parse "${TAG}" >/dev/null 2>&1; then
  echo "ERROR: 태그 ${TAG}가 이미 존재합니다." >&2
  exit 1
fi

read -r -p "계속하시겠습니까? [y/N] " ANSWER
if [[ "${ANSWER}" != "y" && "${ANSWER}" != "Y" ]]; then
  echo "취소됨"
  exit 0
fi

echo "==> package.json version 업데이트"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '${NEW_VERSION}';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "==> 커밋 + 태그 생성"
git add package.json
git commit -m "chore: ${TAG} 릴리즈"
git tag -a "${TAG}" -m "Release ${TAG}"

echo "==> push (main + tag)"
git push origin main
git push origin "${TAG}"

echo ""
echo "==> 완료. CI가 자동으로 빌드 + GitHub Release를 생성합니다."
echo "    진행 상황: gh run watch"
echo "    릴리즈 페이지: https://github.com/project-hh-com/turtle-alert/releases/tag/${TAG}"
