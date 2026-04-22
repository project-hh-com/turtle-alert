// 기준 자세 대비 편차 임계값
const DEVIATION_THRESHOLD = {
  noseShoulderRatioDrop: 0.15,
  shoulderTiltIncrease: 0.05,
  headRotationConfidenceDiff: 0.4,
  shoulderWidthIncrease: 0.25,
  headTiltIncrease: 0.06,
  noseCenterOffset: 0.08,
  slouchRatioDrop: 0.10,
  earForwardRatioDrop: 0.15,
};

// 절대 임계값 (캘리브레이션 없을 때 폴백)
const BAD_POSTURE_THRESHOLD = {
  noseShoulderRatio: 0.6,
  shoulderTiltRatio: 0.08,
  earShoulderForwardRatio: 0.04,
};

// 최소 키포인트 신뢰도
const MIN_KEYPOINT_SCORE = 0.3;

// 체크 간격 (초)
const DEFAULT_CHECK_INTERVAL_SEC = 60;

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
 * 여러 프레임의 키포인트를 평균 내어 기준 자세 데이터를 생성합니다.
 * @param {Array<Array<{name: string, x: number, y: number, score: number}>>} framesList
 * @returns {object|null} baseline 객체 또는 유효하지 않으면 null
 */
function calibrate(framesList) {
  if (!framesList || framesList.length === 0) return null;

  const keypointNames = [
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder",
  ];

  const averaged = {};
  for (const name of keypointNames) {
    let sumX = 0, sumY = 0, sumScore = 0, count = 0;
    for (const frame of framesList) {
      const kp = findKeypoint(frame, name);
      if (kp && kp.score >= MIN_KEYPOINT_SCORE) {
        sumX += kp.x;
        sumY += kp.y;
        sumScore += kp.score;
        count++;
      }
    }
    if (count > 0) {
      averaged[name] = {
        x: sumX / count,
        y: sumY / count,
        score: sumScore / count,
      };
    }
  }

  if (!averaged.nose || !averaged.left_shoulder || !averaged.right_shoulder) {
    return null;
  }

  const shoulderMidY = (averaged.left_shoulder.y + averaged.right_shoulder.y) / 2;
  const shoulderMidX = (averaged.left_shoulder.x + averaged.right_shoulder.x) / 2;
  const shoulderWidth = Math.abs(averaged.left_shoulder.x - averaged.right_shoulder.x);

  if (shoulderWidth < 10) return null;

  const noseShoulderRatio = (shoulderMidY - averaged.nose.y) / shoulderWidth;
  const shoulderTiltRatio = Math.abs(averaged.left_shoulder.y - averaged.right_shoulder.y) / shoulderWidth;
  const noseCenterOffset = (averaged.nose.x - shoulderMidX) / shoulderWidth;

  let earYDiffRatio = 0;
  if (averaged.left_ear && averaged.right_ear) {
    earYDiffRatio = Math.abs(averaged.left_ear.y - averaged.right_ear.y) / shoulderWidth;
  }

  let earConfidenceDiff = 0;
  {
    let sumDiff = 0, diffCount = 0;
    for (const frame of framesList) {
      const le = findKeypoint(frame, "left_ear");
      const re = findKeypoint(frame, "right_ear");
      if (le && re) {
        sumDiff += Math.abs(le.score - re.score);
        diffCount++;
      }
    }
    if (diffCount > 0) {
      earConfidenceDiff = sumDiff / diffCount;
    }
  }

  let earForwardRatio = null;
  const ear = averaged.left_ear || averaged.right_ear;
  if (ear) {
    earForwardRatio = (shoulderMidY - ear.y) / shoulderWidth;
  }

  return {
    keypoints: averaged,
    noseShoulderRatio,
    shoulderTiltRatio,
    shoulderWidth,
    shoulderMidX,
    shoulderMidY,
    noseCenterOffset,
    earYDiffRatio,
    earConfidenceDiff,
    earForwardRatio,
    timestamp: Date.now(),
  };
}

/**
 * 키포인트 기반 자세 판정 알고리즘
 * @param {Array<{name: string, x: number, y: number, score: number}>} keypoints
 * @param {object|null} baseline - calibrate()로 생성된 기준 데이터 (없으면 절대 임계값 사용)
 * @returns {{isGood: boolean, issues: string[]}}
 */
function evaluatePosture(keypoints, baseline) {
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
  const currentNoseShoulderRatio = noseShoulderDist / shoulderWidth;
  const currentShoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;

  if (baseline) {
    if (baseline.noseShoulderRatio - currentNoseShoulderRatio > DEVIATION_THRESHOLD.noseShoulderRatioDrop) {
      issues.push("거북목");
    }

    if (currentShoulderTilt - baseline.shoulderTiltRatio > DEVIATION_THRESHOLD.shoulderTiltIncrease) {
      issues.push("어깨 기울어짐");
    }

    if (leftEar && rightEar) {
      const confidenceDiff = Math.abs(leftEar.score - rightEar.score);
      const baselineConfDiff = baseline.earConfidenceDiff || 0;
      if (confidenceDiff - baselineConfDiff > DEVIATION_THRESHOLD.headRotationConfidenceDiff) {
        issues.push("고개 회전");
      }
    }

    if (baseline.shoulderWidth > 0) {
      const widthIncrease = (shoulderWidth - baseline.shoulderWidth) / baseline.shoulderWidth;
      if (widthIncrease > DEVIATION_THRESHOLD.shoulderWidthIncrease) {
        issues.push("화면에 너무 가까움");
      }
    }

    if (leftEar && leftEar.score >= MIN_KEYPOINT_SCORE &&
        rightEar && rightEar.score >= MIN_KEYPOINT_SCORE) {
      const currentEarYDiff = Math.abs(leftEar.y - rightEar.y) / shoulderWidth;
      if (currentEarYDiff - baseline.earYDiffRatio > DEVIATION_THRESHOLD.headTiltIncrease) {
        issues.push("고개 기울어짐");
      }
    }

    const currentNoseOffset = (nose.x - shoulderMidX) / shoulderWidth;
    if (Math.abs(currentNoseOffset - baseline.noseCenterOffset) > DEVIATION_THRESHOLD.noseCenterOffset) {
      issues.push("한쪽으로 기울어짐");
    }

    const ratioDrop = baseline.noseShoulderRatio - currentNoseShoulderRatio;
    if (ratioDrop > DEVIATION_THRESHOLD.slouchRatioDrop && !issues.includes("거북목")) {
      issues.push("구부정한 자세");
    }

    if (baseline.earForwardRatio !== null) {
      const ear = (leftEar && leftEar.score >= MIN_KEYPOINT_SCORE) ? leftEar
        : (rightEar && rightEar.score >= MIN_KEYPOINT_SCORE) ? rightEar
          : null;
      if (ear) {
        const currentEarForward = (shoulderMidY - ear.y) / shoulderWidth;
        if (baseline.earForwardRatio - currentEarForward > DEVIATION_THRESHOLD.earForwardRatioDrop) {
          issues.push("고개 전방 돌출");
        }
      }
    }
  } else {
    if (currentNoseShoulderRatio < BAD_POSTURE_THRESHOLD.noseShoulderRatio) {
      issues.push("거북목");
    }

    if (currentShoulderTilt > BAD_POSTURE_THRESHOLD.shoulderTiltRatio) {
      issues.push("어깨 기울어짐");
    }

    const ear = (leftEar && leftEar.score >= MIN_KEYPOINT_SCORE) ? leftEar
      : (rightEar && rightEar.score >= MIN_KEYPOINT_SCORE) ? rightEar
        : null;
    if (ear) {
      const earShoulderForward = (shoulderMidY - ear.y) / shoulderWidth;
      if (earShoulderForward < BAD_POSTURE_THRESHOLD.earShoulderForwardRatio) {
        issues.push("고개 전방 돌출");
      }
    }
  }

  return {
    isGood: issues.length === 0,
    issues,
  };
}

module.exports = {
  evaluatePosture,
  calibrate,
  findKeypoint,
  BAD_POSTURE_THRESHOLD,
  DEVIATION_THRESHOLD,
  MIN_KEYPOINT_SCORE,
  DEFAULT_CHECK_INTERVAL_SEC,
  CONSECUTIVE_BAD_THRESHOLD,
};
