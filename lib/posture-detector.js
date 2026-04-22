// 표준 자세 절대 임계값 — 카메라 위치/사람에 관계없이 적용
const POSTURE_THRESHOLD = {
  // 코-어깨 비율: 이 값 미만이면 거북목 (코가 어깨 높이에 가까움)
  noseShoulderRatio: 0.55,
  // 어깨 기울기: 이 값 초과하면 어깨 기울어짐
  shoulderTiltRatio: 0.08,
  // 귀-어깨 전방 비율: 이 값 미만이면 고개 전방 돌출
  earForwardRatio: 0.15,
  // 좌우 귀 신뢰도 차이: 이 값 초과하면 고개 회전
  headRotationConfidenceDiff: 0.45,
  // 좌우 귀 y 차이 비율: 이 값 초과하면 고개 기울어짐
  headTiltRatio: 0.08,
  // 코 중심 이탈 비율: 이 값 초과하면 한쪽으로 기울어짐
  noseCenterOffset: 0.12,
  // 구부정 판정 비율: 거북목 임계값보다 높지만 정상보다 낮은 구간
  slouchRatio: 0.70,
};

// 최소 키포인트 신뢰도
const MIN_KEYPOINT_SCORE = 0.3;

// 체크 간격 (초)
const DEFAULT_CHECK_INTERVAL_SEC = 40;

// 연속 나쁜 자세 감지 횟수
const CONSECUTIVE_BAD_THRESHOLD = 2;

/**
 * 키포인트 배열에서 이름으로 찾습니다.
 * @param {Array} keypoints
 * @param {string} name
 * @returns {{x: number, y: number, score: number} | undefined}
 */
function findKeypoint(keypoints, name) {
  return keypoints.find((kp) => kp.name === name);
}

/**
 * 키포인트 기반 자세 판정 — 표준 절대 기준
 * @param {Array<{name: string, x: number, y: number, score: number}>} keypoints
 * @returns {{isGood: boolean, issues: string[]}}
 */
function evaluatePosture(keypoints) {
  const issues = [];

  const nose = findKeypoint(keypoints, "nose");
  const leftShoulder = findKeypoint(keypoints, "left_shoulder");
  const rightShoulder = findKeypoint(keypoints, "right_shoulder");
  const leftEar = findKeypoint(keypoints, "left_ear");
  const rightEar = findKeypoint(keypoints, "right_ear");

  if (
    !nose || nose.score < MIN_KEYPOINT_SCORE ||
    !leftShoulder || leftShoulder.score < MIN_KEYPOINT_SCORE ||
    !rightShoulder || rightShoulder.score < MIN_KEYPOINT_SCORE
  ) {
    return { isGood: true, issues: ["키포인트 신뢰도 부족"] };
  }

  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

  if (shoulderWidth < 10) {
    return { isGood: true, issues: ["어깨 간격이 너무 좁습니다"] };
  }

  const noseShoulderDist = shoulderMidY - nose.y;
  const noseShoulderRatio = noseShoulderDist / shoulderWidth;
  const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;

  // 1. 거북목: 코가 어깨 높이에 너무 가까움
  if (noseShoulderRatio < POSTURE_THRESHOLD.noseShoulderRatio) {
    issues.push("거북목");
  }

  // 2. 구부정한 자세: 거북목 미만이지만 정상보다 낮음
  if (noseShoulderRatio < POSTURE_THRESHOLD.slouchRatio && !issues.includes("거북목")) {
    issues.push("구부정한 자세");
  }

  // 3. 어깨 기울어짐
  if (shoulderTilt > POSTURE_THRESHOLD.shoulderTiltRatio) {
    issues.push("어깨 기울어짐");
  }

  // 4. 고개 회전: 좌우 귀 신뢰도 차이
  if (leftEar && rightEar) {
    const confidenceDiff = Math.abs(leftEar.score - rightEar.score);
    if (confidenceDiff > POSTURE_THRESHOLD.headRotationConfidenceDiff) {
      issues.push("고개 회전");
    }
  }

  // 5. 고개 기울어짐: 좌우 귀 y좌표 차이
  if (leftEar && leftEar.score >= MIN_KEYPOINT_SCORE &&
      rightEar && rightEar.score >= MIN_KEYPOINT_SCORE) {
    const earTilt = Math.abs(leftEar.y - rightEar.y) / shoulderWidth;
    if (earTilt > POSTURE_THRESHOLD.headTiltRatio) {
      issues.push("고개 기울어짐");
    }
  }

  // 6. 한쪽으로 기울어짐: 코가 어깨 중심에서 벗어남
  const noseOffset = Math.abs(nose.x - shoulderMidX) / shoulderWidth;
  if (noseOffset > POSTURE_THRESHOLD.noseCenterOffset) {
    issues.push("한쪽으로 기울어짐");
  }

  // 7. 고개 전방 돌출: 귀가 어깨 높이에 가까움
  const ear = (leftEar && leftEar.score >= MIN_KEYPOINT_SCORE) ? leftEar
    : (rightEar && rightEar.score >= MIN_KEYPOINT_SCORE) ? rightEar
      : null;
  if (ear) {
    const earForward = (shoulderMidY - ear.y) / shoulderWidth;
    if (earForward < POSTURE_THRESHOLD.earForwardRatio) {
      issues.push("고개 전방 돌출");
    }
  }

  return {
    isGood: issues.length === 0,
    issues,
  };
}

module.exports = {
  evaluatePosture,
  findKeypoint,
  POSTURE_THRESHOLD,
  MIN_KEYPOINT_SCORE,
  DEFAULT_CHECK_INTERVAL_SEC,
  CONSECUTIVE_BAD_THRESHOLD,
};
