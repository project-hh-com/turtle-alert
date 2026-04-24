/**
 * TensorFlow.js / 카메라 의존 함수
 * 외부 하드웨어·라이브러리에 의존하므로 단위 테스트 불가 → 커버리지 제외 대상
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { getImagesnapPath } = require("./imagesnap-path");

const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 240;

let detector = null;
let tf = null;
let poseDetection = null;

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
    try {
      const logPath = path.join(os.tmpdir(), "turtle-alert-error.log");
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] initDetector failed\n${err && err.stack ? err.stack : String(err)}\n\n`,
      );
    } catch (_) { /* ignore */ }
    detector = null;
    return false;
  }
}

async function captureFrame() {
  const tmpFile = path.join(
    os.tmpdir(),
    `turtle-posture-${Date.now()}.jpg`
  );

  await new Promise((resolve, reject) => {
    execFile(
      getImagesnapPath(),
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

async function captureAndAnalyze() {
  if (!detector) {
    throw new Error("detector가 초기화되지 않았습니다");
  }

  const { evaluatePosture } = require("./posture-detector");
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

async function disposeDetector() {
  if (detector) {
    detector.dispose();
    detector = null;
  }
}

module.exports = {
  initDetector,
  captureAndAnalyze,
  disposeDetector,
};
