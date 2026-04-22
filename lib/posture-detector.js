const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");

// 자세 판정 임계값
const BAD_POSTURE_THRESHOLD = {
  // 코(nose) y가 어깨 중간점 y 대비 이 비율 이하이면 거북목
  noseShoulderRatio: 0.6,
  // 좌우 어깨 y좌표 차이 (픽셀 비율) — 기울어짐 감지
  shoulderTiltRatio: 0.08,
  // 귀-어깨 x좌표 차이 비율 — 전방 돌출 감지
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
    // jpeg-js returns RGBA, convert to RGB
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
    // 즉시 임시 파일 삭제 (프라이버시)
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // 무시
    }
  }
}

/**
 * 카메라 촬영 → 포즈 추정 → 자세 판정을 수행합니다.
 * @returns {Promise<{isGood: boolean, issues: string[]}>}
 */
async function captureAndAnalyze() {
  if (!detector) {
    throw new Error("detector가 초기화되지 않았습니다");
  }

  const frame = await captureFrame();
  try {
    const poses = await detector.estimatePoses(frame);
    if (!poses || poses.length === 0) {
      return { isGood: true, issues: ["포즈를 감지하지 못했습니다"] };
    }
    return evaluatePosture(poses[0].keypoints);
  } finally {
    frame.dispose();
  }
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
 * 키포인트 기반 자세 판정 알고리즘
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

  // 필수 키포인트 신뢰도 확인
  if (
    !nose || nose.score < MIN_KEYPOINT_SCORE ||
    !leftShoulder || leftShoulder.score < MIN_KEYPOINT_SCORE ||
    !rightShoulder || rightShoulder.score < MIN_KEYPOINT_SCORE
  ) {
    return { isGood: true, issues: ["키포인트 신뢰도 부족"] };
  }

  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);

  // 어깨 너비가 너무 작으면 (카메라에서 너무 멀거나 오탐)
  if (shoulderWidth < 10) {
    return { isGood: true, issues: ["어깨 간격이 너무 좁습니다"] };
  }

  // 1. 거북목 감지: 코가 어깨 중심보다 너무 앞으로 나옴
  // 이미지 좌표에서 y가 작을수록 위쪽이므로, 코-어깨 y 거리를 본다
  const noseShoulderDist = shoulderMidY - nose.y;
  const ratio = noseShoulderDist / shoulderWidth;

  if (ratio < BAD_POSTURE_THRESHOLD.noseShoulderRatio) {
    issues.push("거북목");
  }

  // 2. 기울어진 자세: 좌우 어깨 높이 차이
  const shoulderTilt =
    Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;

  if (shoulderTilt > BAD_POSTURE_THRESHOLD.shoulderTiltRatio) {
    issues.push("어깨 기울어짐");
  }

  // 3. 전방 돌출 감지: 귀가 어깨보다 앞에 위치
  const ear =
    leftEar && leftEar.score >= MIN_KEYPOINT_SCORE
      ? leftEar
      : rightEar && rightEar.score >= MIN_KEYPOINT_SCORE
        ? rightEar
        : null;

  if (ear) {
    // 이미지에서 앞으로 나옴 = 귀의 y가 어깨 중심 y에 가까움 (고개를 앞으로 내밀면)
    // 또는 x 방향으로 어깨 밖으로 벗어남 — 여기서는 y 비율로 판단
    const earShoulderForward =
      (shoulderMidY - ear.y) / shoulderWidth;

    if (earShoulderForward < BAD_POSTURE_THRESHOLD.earShoulderForwardRatio) {
      issues.push("고개 전방 돌출");
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
  evaluatePosture,
  disposeDetector,
  findKeypoint,
  BAD_POSTURE_THRESHOLD,
  MIN_KEYPOINT_SCORE,
  DEFAULT_CHECK_INTERVAL_SEC,
  CONSECUTIVE_BAD_THRESHOLD,
  CAPTURE_WIDTH,
  CAPTURE_HEIGHT,
};
