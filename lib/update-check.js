/**
 * GitHub Releases 에서 최신 버전 정보를 조회하고 현재 버전과 비교한다.
 *
 * 자동 설치는 하지 않는다 (코드 서명 없이 electron-updater 를 쓰기 어렵고,
 * 개인 배포 수준이라 풀 자동 업데이트의 복잡도가 이득보다 크다).
 * 새 버전이 있으면 트레이 메뉴에 안내 항목을 띄우고 릴리즈 페이지로 보낸다.
 */

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/project-hh-com/turtle-alert/releases/latest";
const RELEASE_PAGE_URL =
  "https://github.com/project-hh-com/turtle-alert/releases/latest";
const FETCH_TIMEOUT_MS = 10 * 1000;

/**
 * 'vX.Y.Z' 또는 'X.Y.Z' 문자열을 [X, Y, Z] 숫자 배열로 변환. 실패 시 null.
 * @param {string} raw
 * @returns {number[] | null}
 */
function parseSemver(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/^v/i, "");
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * latest 가 current 보다 엄격히 높으면 true. 파싱 실패 시 false.
 * @param {string} latest
 * @param {string} current
 * @returns {boolean}
 */
function isNewer(latest, current) {
  const a = parseSemver(latest);
  const b = parseSemver(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

async function fetchLatestRelease() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(LATEST_RELEASE_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "turtle-alert-update-check",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!json || typeof json.tag_name !== "string") return null;
    return { tagName: json.tag_name, htmlUrl: json.html_url || RELEASE_PAGE_URL };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 앱 시작 시 1회 최신 버전을 확인한다.
 *
 * 주기 폴링은 하지 않는다 — 메뉴바 앱은 한 번 띄워두고 며칠씩 사용하는 패턴이 많아
 * 주기 폴링이 실익보다 복잡도(타이머 관리, 슬립/복귀 이슈, 테스트 부담)가 크다.
 * 사용자는 앱을 재시작할 때만 업데이트 여부를 확인하면 충분하다.
 *
 * @param {object} deps
 * @param {() => string} deps.getCurrentVersion - app.getVersion
 * @param {(latestTag: string, releaseUrl: string) => void} deps.onUpdateAvailable
 *   - 새 버전이 있을 때 1회 호출 (알림 표시 등)
 * @param {(latestTag: string | null, releaseUrl: string | null) => void} [deps.onCheck]
 *   - 확인 후 결과를 전달 (트레이 메뉴 리렌더링 등). 실패 시 (null, null)
 */
async function checkForUpdateOnce({ getCurrentVersion, onUpdateAvailable, onCheck }) {
  const latest = await fetchLatestRelease();

  if (!latest) {
    if (onCheck) onCheck(null, null);
    return;
  }

  const current = getCurrentVersion();
  const hasUpdate = isNewer(latest.tagName, current);

  if (onCheck) onCheck(hasUpdate ? latest.tagName : null, hasUpdate ? latest.htmlUrl : null);

  if (hasUpdate) {
    onUpdateAvailable(latest.tagName, latest.htmlUrl);
  }
}

module.exports = {
  parseSemver,
  isNewer,
  fetchLatestRelease,
  checkForUpdateOnce,
  LATEST_RELEASE_URL,
  RELEASE_PAGE_URL,
};
