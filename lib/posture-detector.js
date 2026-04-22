const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

// 기준 자세 대비 편차 임계값
const DEVIATION_THRESHOLD = {
  // 코-어깨 비율이 기준보다 이만큼 떨어지면 거북목
  noseShoulderRatioDrop: 0.15,
  // 어깨 기울기 비율이 기준보다 이만큼 증가하면 기울어짐
  shoulderTiltIncrease: 0.05,
  // 좌우 귀 신뢰도 차이 — 고개 회전 감지
  headRotationConfidenceDiff: 0.4,
  // 어깨 너비 증가 비율 — 화면에 너무 가까움
  shoulderWidthIncrease: 0.25,
  // 귀 y좌표 차이 비율 증가 — 고개 기울어짐
  headTiltIncrease: 0.06,
  // 코 중심 이탈 비율 — 한쪽으로 기울어짐
  noseCenterOffset: 0.08,
  // 코-어깨 비율 감소 — 구부정한 자세 (거북목보다 낮은 임계)
  slouchRatioDrop: 0.10,
  // 귀-어깨 전방 비율 감소 — 고개 전방 돌출
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

// 연속 나쁜 자세 감지 횟수 — 이 횟수 이상이면 알림 발송
const CONSECUTIVE_BAD_THRESHOLD = 2;

// imagesnap 캡처 해상도
const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 240;

// 캘리브레이션 프레임 수
const CALIBRATION_FRAME_COUNT = 5;

let detector = null;
let tf = null;
let poseDetection = null;

/**
 * TensorFlow.js 및 MoveNet 모델을 로드합니다.
 * @returns {Promise<boolean>} 로드 성공 여부
 */
/* v8 ignore start — tfjs 외부 의존성, 단위 테스트 불가 */
async function initDetector() {
  if (detector) return true;

  try {
    tf = require("@tensorflow/tfjs");
    poseDetection = require("@tensorflow-models/pose-detection");

    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
      }
    );
    return true;
  } catch (err) {
    console.error("posture-detector: 모델 로드 실패", err.message);
    detector = null;
    return false;
  }
}

/**
 * imagesnap으로 임시 파일에 촬영 후 텐서로 변환합니다.
 * @returns {Promise<import('@tensorflow/tfjs-node').Tensor3D>}
 */
async function captureFrame() {
  const tmpFile = path.join(
    os.tmpdir(),
    `turtle-posture-${Date.now()}.jpg`
  );

  await new Promise((resolve, reject) => {
    execFile(
      "imagesnap",
      ["-q", "-w", "0.5", tmpFile],
      { timeout: 10000 },
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  try {
    const imageBuffer = fs.readFileSync(tmpFile);
    const jpeg = require("jpeg-js");
    const { data, width, height } = jpeg.decode(imageBuffer, { useTArray: true });
    const rgbData = new Uint8Array(width * height * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgbData[j] = data[i];
      rgbData[j + 1] = data[i + 1];
      rgbData[j + 2] = data[i + 2];
    }
    const decoded = tf.tensor3d(rgbData, [height, width, 3]);
    const resized = tf.image.resizeBilinear(decoded, [
      CAPTURE_HEIGHT,
      CAPTURE_WIDTH,
    ]);
    decoded.dispose();
    return resized;
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // 무시
    }
  }
}

/**
 * 카메라 촬영 → 포즈 추정 → 자세 판정을 수행합니다.
 * @param {object|null} baseline - 캘리브레이션 기준 데이터
 * @returns {Promise<{isGood: boolean, issues: string[]}>}
 */
async function captureAndAnalyze(baseline) {
  if (!detector) {
    throw new Error("detector가 초기화되지 않았습니다");
  }

  const frame = await captureFrame();
  try {
    const poses = await detector.estimatePoses(frame);
    if (!poses || poses.length === 0) {
      return { isGood: true, issues: ["포즈를 감지하지 못했습니다"] };
    }
    return evaluatePosture(poses[0].keypoints, baseline);
  } finally {
    frame.dispose();
  }
}

/**
 * 캘리브레이션용 프레임을 수집합니다.
 * @returns {Promise<Array<Array<{name: string, x: number, y: number, score: number}>>>}
 */
async function captureCalibrationFrames() {
  if (!detector) {
    throw new Error("detector가 초기화되지 않았습니다");
  }

  const frames = [];
  for (let i = 0; i < CALIBRATION_FRAME_COUNT; i++) {
    const frame = await captureFrame();
    try {
      const poses = await detector.estimatePoses(frame);
      if (poses && poses.length > 0) {
        frames.push(poses[0].keypoints);
      }
    } finally {
      frame.dispose();
    }
    if (i < CALIBRATION_FRAME_COUNT - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return frames;
}

/* v8 ignore stop */

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

  // 각 키포인트별 평균 계산
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

  // 필수 키포인트 확인
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

  // 귀 y좌표 차이 비율
  let earYDiffRatio = 0;
  if (averaged.left_ear && averaged.right_ear) {
    earYDiffRatio = Math.abs(averaged.left_ear.y - averaged.right_ear.y) / shoulderWidth;
  }

  // 귀 신뢰도 차이 (고개 회전 기준선) — 원본 프레임에서 계산 (MIN_KEYPOINT_SCORE 필터 전)
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

  // 귀-어깨 전방 비율
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

  // 필수 키포인트 신뢰도 확인
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
    // === 캘리브레이션 기반 판정 ===

    // 1. 거북목: 코-어깨 비율이 기준보다 크게 감소
    if (baseline.noseShoulderRatio - currentNoseShoulderRatio > DEVIATION_THRESHOLD.noseShoulderRatioDrop) {
      issues.push("거북목");
    }

    // 2. 어깨 기울어짐: 기울기가 기준보다 증가
    if (currentShoulderTilt - baseline.shoulderTiltRatio > DEVIATION_THRESHOLD.shoulderTiltIncrease) {
      issues.push("어깨 기울어짐");
    }

    // 3. 고개 회전: 좌우 귀 신뢰도 차이가 기준 대비 증가
    if (leftEar && rightEar) {
      const confidenceDiff = Math.abs(leftEar.score - rightEar.score);
      const baselineConfDiff = baseline.earConfidenceDiff || 0;
      if (confidenceDiff - baselineConfDiff > DEVIATION_THRESHOLD.headRotationConfidenceDiff) {
        issues.push("고개 회전");
      }
    }

    // 4. 화면에 너무 가까움: 어깨 너비 증가
    if (baseline.shoulderWidth > 0) {
      const widthIncrease = (shoulderWidth - baseline.shoulderWidth) / baseline.shoulderWidth;
      if (widthIncrease > DEVIATION_THRESHOLD.shoulderWidthIncrease) {
        issues.push("화면에 너무 가까움");
      }
    }

    // 5. 고개 기울어짐: 좌우 귀 y좌표 차이 증가
    if (leftEar && leftEar.score >= MIN_KEYPOINT_SCORE &&
        rightEar && rightEar.score >= MIN_KEYPOINT_SCORE) {
      const currentEarYDiff = Math.abs(leftEar.y - rightEar.y) / shoulderWidth;
      if (currentEarYDiff - baseline.earYDiffRatio > DEVIATION_THRESHOLD.headTiltIncrease) {
        issues.push("고개 기울어짐");
      }
    }

    // 6. 한쪽으로 기울어짐: 코 중심 이탈
    const currentNoseOffset = (nose.x - shoulderMidX) / shoulderWidth;
    if (Math.abs(currentNoseOffset - baseline.noseCenterOffset) > DEVIATION_THRESHOLD.noseCenterOffset) {
      issues.push("한쪽으로 기울어짐");
    }

    // 7. 구부정한 자세: 코-어깨 비율 소폭 감소 (거북목 미만)
    const ratioDrop = baseline.noseShoulderRatio - currentNoseShoulderRatio;
    if (ratioDrop > DEVIATION_THRESHOLD.slouchRatioDrop && !issues.includes("거북목")) {
      issues.push("구부정한 자세");
    }

    // 8. 고개 전방 돌출: 귀-어깨 비율 감소
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
    // === 폴백: 절대 임계값 판정 (캘리브레이션 없음) ===

    // 1. 거북목
    if (currentNoseShoulderRatio < BAD_POSTURE_THRESHOLD.noseShoulderRatio) {
      issues.push("거북목");
    }

    // 2. 어깨 기울어짐
    if (currentShoulderTilt > BAD_POSTURE_THRESHOLD.shoulderTiltRatio) {
      issues.push("어깨 기울어짐");
    }

    // 3. 고개 전방 돌출
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

/* v8 ignore start — tfjs 외부 의존성, 단위 테스트 불가 */
/**
 * detector 리소스를 해제합니다.
 */
async function disposeDetector() {
  if (detector) {
    detector.dispose();
    detector = null;
  }
}

/* v8 ignore stop */

module.exports = {
  initDetector,
  captureAndAnalyze,
  captureCalibrationFrames,
  evaluatePosture,
  calibrate,
  disposeDetector,
  findKeypoint,
  BAD_POSTURE_THRESHOLD,
  DEVIATION_THRESHOLD,
  MIN_KEYPOINT_SCORE,
  DEFAULT_CHECK_INTERVAL_SEC,
  CONSECUTIVE_BAD_THRESHOLD,
  CAPTURE_WIDTH,
  CAPTURE_HEIGHT,
  CALIBRATION_FRAME_COUNT,
};
