import { describe, it, expect } from "vitest";

const {
  evaluatePosture,
  findKeypoint,
  POSTURE_THRESHOLD,
  MIN_KEYPOINT_SCORE,
  CONSECUTIVE_BAD_THRESHOLD,
  DEFAULT_CHECK_INTERVAL_SEC,
} = require("../lib/posture-detector.js");

// ===== 테스트 헬퍼 =====

/**
 * 기본 키포인트 세트를 생성합니다. 정상 자세 기준.
 * 어깨 너비 100, 코는 어깨 위쪽에 위치.
 */
function createKeypoints(overrides = {}) {
  const defaults = {
    nose: { name: "nose", x: 160, y: 80, score: 0.9 },
    left_ear: { name: "left_ear", x: 145, y: 85, score: 0.9 },
    right_ear: { name: "right_ear", x: 175, y: 85, score: 0.9 },
    left_shoulder: { name: "left_shoulder", x: 110, y: 200, score: 0.9 },
    right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
  };

  const merged = { ...defaults, ...overrides };

  return [
    merged.nose,
    { name: "left_eye", x: 155, y: 78, score: 0.8 },
    { name: "right_eye", x: 165, y: 78, score: 0.8 },
    merged.left_ear,
    merged.right_ear,
    merged.left_shoulder,
    merged.right_shoulder,
    { name: "left_elbow", x: 100, y: 280, score: 0.5 },
    { name: "right_elbow", x: 220, y: 280, score: 0.5 },
    { name: "left_wrist", x: 95, y: 350, score: 0.4 },
    { name: "right_wrist", x: 225, y: 350, score: 0.4 },
    { name: "left_hip", x: 130, y: 380, score: 0.6 },
    { name: "right_hip", x: 190, y: 380, score: 0.6 },
    { name: "left_knee", x: 125, y: 480, score: 0.5 },
    { name: "right_knee", x: 195, y: 480, score: 0.5 },
    { name: "left_ankle", x: 120, y: 570, score: 0.4 },
    { name: "right_ankle", x: 200, y: 570, score: 0.4 },
  ];
}

// ===== findKeypoint =====
describe("findKeypoint", () => {
  it("should return keypoint by name", () => {
    const kps = [{ name: "nose", x: 1, y: 2, score: 0.9 }];
    expect(findKeypoint(kps, "nose")).toEqual({ name: "nose", x: 1, y: 2, score: 0.9 });
  });

  it("should return undefined for missing keypoint", () => {
    const kps = [{ name: "nose", x: 1, y: 2, score: 0.9 }];
    expect(findKeypoint(kps, "left_shoulder")).toBeUndefined();
  });

  it("should return undefined for empty array", () => {
    expect(findKeypoint([], "nose")).toBeUndefined();
  });
});

// ===== evaluatePosture =====
describe("evaluatePosture", () => {
  describe("정상 자세", () => {
    it("should return isGood=true for good posture", () => {
      const result = evaluatePosture(createKeypoints());
      expect(result.isGood).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("키포인트 신뢰도 부족", () => {
    it("should return isGood=true when nose score is low", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 80, score: 0.1 },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(true);
      expect(result.issues).toContain("키포인트 신뢰도 부족");
    });

    it("should return isGood=true when left_shoulder score is low", () => {
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 200, score: 0.1 },
      });
      expect(evaluatePosture(kps).isGood).toBe(true);
    });

    it("should return isGood=true when right_shoulder score is low", () => {
      const kps = createKeypoints({
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.1 },
      });
      expect(evaluatePosture(kps).isGood).toBe(true);
    });

    it("should return isGood=true when nose is missing", () => {
      const kps = createKeypoints();
      kps[0] = { name: "not_nose", x: 0, y: 0, score: 0.9 };
      expect(evaluatePosture(kps).isGood).toBe(true);
    });

    it("should accept keypoints at exactly MIN_KEYPOINT_SCORE boundary", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 80, score: MIN_KEYPOINT_SCORE },
        left_shoulder: { name: "left_shoulder", x: 110, y: 200, score: MIN_KEYPOINT_SCORE },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: MIN_KEYPOINT_SCORE },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(true);
      expect(result.issues).not.toContain("키포인트 신뢰도 부족");
    });

    it("should reject keypoints just below MIN_KEYPOINT_SCORE", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 80, score: MIN_KEYPOINT_SCORE - 0.01 },
      });
      expect(evaluatePosture(kps).issues).toContain("키포인트 신뢰도 부족");
    });
  });

  describe("어깨 간격이 너무 좁음", () => {
    it("should return isGood=true when shoulder width < 10", () => {
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 155, y: 200, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 160, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(true);
      expect(result.issues).toContain("어깨 간격이 너무 좁습니다");
    });
  });

  describe("거북목 감지", () => {
    it("should detect turtle neck when nose is close to shoulders", () => {
      // shoulderMidY=200, shoulderWidth=100
      // nose.y=160 → ratio = (200-160)/100 = 0.4 < 0.55
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 160, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("거북목");
    });

    it("should not detect turtle neck in normal position", () => {
      // nose.y=80 → ratio = (200-80)/100 = 1.2 > 0.55
      expect(evaluatePosture(createKeypoints()).issues).not.toContain("거북목");
    });

    it("should detect severe turtle neck at shoulder level", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 200, score: 0.9 },
      });
      expect(evaluatePosture(kps).issues).toContain("거북목");
    });
  });

  describe("구부정한 자세 감지", () => {
    it("should detect slouch between slouch and turtle threshold", () => {
      // ratio = (200-135)/100 = 0.65 → < 0.70 (slouch) but > 0.55 (turtle)
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 135, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("구부정한 자세");
      expect(result.issues).not.toContain("거북목");
    });

    it("should not show slouch when turtle neck is detected", () => {
      // ratio = 0.4 < 0.55 → 거북목
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 160, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("거북목");
      expect(result.issues).not.toContain("구부정한 자세");
    });

    it("should not detect slouch in normal position", () => {
      expect(evaluatePosture(createKeypoints()).issues).not.toContain("구부정한 자세");
    });
  });

  describe("어깨 기울어짐 감지", () => {
    it("should detect shoulder tilt", () => {
      // |191-200|/100 = 0.09 > 0.08
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 191, score: 0.9 },
      });
      expect(evaluatePosture(kps).issues).toContain("어깨 기울어짐");
    });

    it("should not detect when shoulders are level", () => {
      expect(evaluatePosture(createKeypoints()).issues).not.toContain("어깨 기울어짐");
    });

    it("should not detect at exact threshold", () => {
      // |192-200|/100 = 0.08, NOT > 0.08
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 192, score: 0.9 },
      });
      expect(evaluatePosture(kps).issues).not.toContain("어깨 기울어짐");
    });
  });

  describe("고개 회전 감지", () => {
    it("should detect head rotation when ear confidence differs", () => {
      // |0.9 - 0.3| = 0.6 > 0.45
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 85, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 85, score: 0.3 },
      });
      expect(evaluatePosture(kps).issues).toContain("고개 회전");
    });

    it("should not detect when both ears have similar confidence", () => {
      expect(evaluatePosture(createKeypoints()).issues).not.toContain("고개 회전");
    });
  });

  describe("고개 기울어짐 감지", () => {
    it("should detect when ear y difference is large", () => {
      // |75-95|/100 = 0.2 > 0.08
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 75, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 95, score: 0.9 },
      });
      expect(evaluatePosture(kps).issues).toContain("고개 기울어짐");
    });

    it("should not detect when ears are level", () => {
      expect(evaluatePosture(createKeypoints()).issues).not.toContain("고개 기울어짐");
    });

    it("should skip when ears have low confidence", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 75, score: 0.1 },
        right_ear: { name: "right_ear", x: 175, y: 95, score: 0.1 },
      });
      expect(evaluatePosture(kps).issues).not.toContain("고개 기울어짐");
    });
  });

  describe("한쪽으로 기울어짐 감지", () => {
    it("should detect when nose is off center", () => {
      // |180-160|/100 = 0.2 > 0.12
      const kps = createKeypoints({
        nose: { name: "nose", x: 180, y: 80, score: 0.9 },
      });
      expect(evaluatePosture(kps).issues).toContain("한쪽으로 기울어짐");
    });

    it("should not detect when nose is centered", () => {
      expect(evaluatePosture(createKeypoints()).issues).not.toContain("한쪽으로 기울어짐");
    });
  });

  describe("고개 전방 돌출 감지", () => {
    it("should detect when ear is close to shoulder height", () => {
      // (200-197)/100 = 0.03 < 0.15
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 197, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 197, score: 0.9 },
      });
      expect(evaluatePosture(kps).issues).toContain("고개 전방 돌출");
    });

    it("should not detect in normal position", () => {
      expect(evaluatePosture(createKeypoints()).issues).not.toContain("고개 전방 돌출");
    });

    it("should skip when ears have low confidence", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 197, score: 0.1 },
        right_ear: { name: "right_ear", x: 175, y: 197, score: 0.1 },
      });
      expect(evaluatePosture(kps).issues).not.toContain("고개 전방 돌출");
    });

    it("should use right ear if left ear has low confidence", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 85, score: 0.1 },
        right_ear: { name: "right_ear", x: 175, y: 198, score: 0.9 },
      });
      expect(evaluatePosture(kps).issues).toContain("고개 전방 돌출");
    });
  });

  describe("복합 자세 문제", () => {
    it("should detect multiple issues simultaneously", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 160, score: 0.9 },
        left_shoulder: { name: "left_shoulder", x: 110, y: 190, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
        left_ear: { name: "left_ear", x: 145, y: 198, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 198, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(false);
      expect(result.issues).toContain("거북목");
      expect(result.issues).toContain("어깨 기울어짐");
      expect(result.issues).toContain("고개 전방 돌출");
    });
  });
});

// ===== 에지 케이스 =====
describe("evaluatePosture edge cases", () => {
  it("should handle nose below shoulders", () => {
    const kps = createKeypoints({
      nose: { name: "nose", x: 160, y: 220, score: 0.9 },
    });
    expect(evaluatePosture(kps).issues).toContain("거북목");
  });

  it("should handle when no ears found", () => {
    const kps = createKeypoints();
    kps[3] = { name: "not_left_ear", x: 0, y: 0, score: 0.9 };
    kps[4] = { name: "not_right_ear", x: 0, y: 0, score: 0.9 };
    const result = evaluatePosture(kps);
    expect(result.issues).not.toContain("고개 전방 돌출");
    expect(result.issues).not.toContain("고개 회전");
    expect(result.issues).not.toContain("고개 기울어짐");
  });

  it("should handle missing left_shoulder", () => {
    const kps = createKeypoints();
    kps[5] = { name: "not_shoulder", x: 110, y: 200, score: 0.9 };
    expect(evaluatePosture(kps).issues).toContain("키포인트 신뢰도 부족");
  });

  it("should handle missing right_shoulder", () => {
    const kps = createKeypoints();
    kps[6] = { name: "not_shoulder", x: 210, y: 200, score: 0.9 };
    expect(evaluatePosture(kps).issues).toContain("키포인트 신뢰도 부족");
  });
});

// ===== 상수 값 확인 =====
describe("상수 값 확인", () => {
  it("should have correct posture threshold values", () => {
    expect(POSTURE_THRESHOLD.noseShoulderRatio).toBe(0.55);
    expect(POSTURE_THRESHOLD.shoulderTiltRatio).toBe(0.08);
    expect(POSTURE_THRESHOLD.earForwardRatio).toBe(0.15);
    expect(POSTURE_THRESHOLD.headRotationConfidenceDiff).toBe(0.45);
    expect(POSTURE_THRESHOLD.headTiltRatio).toBe(0.08);
    expect(POSTURE_THRESHOLD.noseCenterOffset).toBe(0.12);
    expect(POSTURE_THRESHOLD.slouchRatio).toBe(0.70);
  });

  it("should have MIN_KEYPOINT_SCORE of 0.3", () => {
    expect(MIN_KEYPOINT_SCORE).toBe(0.3);
  });

  it("should have CONSECUTIVE_BAD_THRESHOLD of 2", () => {
    expect(CONSECUTIVE_BAD_THRESHOLD).toBe(2);
  });

  it("should have DEFAULT_CHECK_INTERVAL_SEC of 40", () => {
    expect(DEFAULT_CHECK_INTERVAL_SEC).toBe(40);
  });
});
