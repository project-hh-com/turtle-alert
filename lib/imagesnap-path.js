const fs = require("fs");
const path = require("path");

let cachedPath;

/**
 * imagesnap 바이너리 경로를 반환합니다.
 * 우선순위:
 *   1. 앱 번들에 포함된 바이너리 (process.resourcesPath/vendor/imagesnap)
 *   2. 개발 모드일 때 vendor/imagesnap
 *   3. 시스템 PATH의 imagesnap
 * @returns {string}
 */
function getImagesnapPath() {
  if (cachedPath) return cachedPath;

  if (process.env.TURTLE_IMAGESNAP_PATH) {
    cachedPath = process.env.TURTLE_IMAGESNAP_PATH;
    return cachedPath;
  }

  if (process.env.TURTLE_DISABLE_BUNDLED_IMAGESNAP === "1") {
    cachedPath = "imagesnap";
    return cachedPath;
  }

  const candidates = [];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "vendor", "imagesnap"));
  }
  candidates.push(path.join(__dirname, "..", "vendor", "imagesnap"));

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      cachedPath = candidate;
      return cachedPath;
    } catch (_err) {
      // 다음 후보로
    }
  }

  cachedPath = "imagesnap";
  return cachedPath;
}

function _resetCacheForTests() {
  cachedPath = undefined;
}

module.exports = { getImagesnapPath, _resetCacheForTests };
