import { describe, it, expect } from "vitest";

const {
  evaluatePosture,
  findKeypoint,
  BAD_POSTURE_THRESHOLD,
  MIN_KEYPOINT_SCORE,
  CONSECUTIVE_BAD_THRESHOLD,
  CAPTURE_WIDTH,
  CAPTURE_HEIGHT,
  DEFAULT_CHECK_INTERVAL_SEC,
} = await import("../lib/posture-detector.js");

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

  // MoveNet 17 키포인트 배열 (인덱스 0~16)
  // 0: nose, 1: left_eye, 2: right_eye, 3: left_ear, 4: right_ear,
  // 5: left_shoulder, 6: right_shoulder, ... (나머지는 더미)
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
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(true);
    });

    it("should return isGood=true when right_shoulder score is low", () => {
      const kps = createKeypoints({
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.1 },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(true);
    });

    it("should return isGood=true when nose is missing", () => {
      const kps = createKeypoints();
      // nose 제거
      kps[0] = { name: "not_nose", x: 0, y: 0, score: 0.9 };
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(true);
    });

    it("should accept keypoints at exactly MIN_KEYPOINT_SCORE boundary", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 80, score: MIN_KEYPOINT_SCORE },
        left_shoulder: { name: "left_shoulder", x: 110, y: 200, score: MIN_KEYPOINT_SCORE },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: MIN_KEYPOINT_SCORE },
      });
      const result = evaluatePosture(kps);
      // 정상 자세이므로 isGood=true
      expect(result.isGood).toBe(true);
      expect(result.issues).not.toContain("키포인트 신뢰도 부족");
    });

    it("should reject keypoints just below MIN_KEYPOINT_SCORE", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 80, score: MIN_KEYPOINT_SCORE - 0.01 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("키포인트 신뢰도 부족");
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

    it("should accept shoulder width exactly 10", () => {
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 155, y: 200, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 165, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("어깨 간격이 너무 좁습니다");
    });
  });

  describe("거북목 감지", () => {
    it("should detect turtle neck when nose is too close to shoulders", () => {
      // shoulderMidY = 200, shoulderWidth = 100
      // noseShoulderDist / shoulderWidth < 0.6 이면 거북목
      // nose.y = 160 → dist = 40 → ratio = 0.4 < 0.6 → 거북목
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 160, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(false);
      expect(result.issues).toContain("거북목");
    });

    it("should not detect turtle neck when nose is high enough", () => {
      // nose.y = 80 → dist = 120 → ratio = 1.2 > 0.6 → OK
      const kps = createKeypoints();
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("거북목");
    });

    it("should detect turtle neck at exact threshold boundary", () => {
      // ratio exactly = 0.6 → NOT거북목 (< 조건이므로 경계에서는 통과)
      // shoulderWidth = 100, shoulderMidY = 200
      // dist = 0.6 * 100 = 60 → nose.y = 200 - 60 = 140
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 140, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("거북목");
    });

    it("should detect turtle neck just below threshold", () => {
      // ratio = 59.9/100 = 0.599 < 0.6 → 거북목
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 140.1, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("거북목");
    });

    it("should detect severe turtle neck when nose is at shoulder level", () => {
      // nose.y = 200 (어깨와 같은 높이) → dist = 0 → ratio = 0 < 0.6
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("거북목");
    });
  });

  describe("어깨 기울어짐 감지", () => {
    it("should detect shoulder tilt when y difference is large", () => {
      // shoulderWidth = 100, tilt threshold = 0.08
      // |leftY - rightY| / 100 > 0.08 → |diff| > 8
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 191, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("어깨 기울어짐");
    });

    it("should not detect tilt when shoulders are level", () => {
      const kps = createKeypoints();
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("어깨 기울어짐");
    });

    it("should not detect tilt at exact threshold", () => {
      // diff = 8 → ratio = 0.08 → NOT > 0.08 → pass
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 192, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("어깨 기울어짐");
    });

    it("should detect tilt just above threshold", () => {
      // diff = 8.1 → ratio = 0.081 > 0.08 → tilt
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 191.9, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("어깨 기울어짐");
    });

    it("should detect right shoulder higher too", () => {
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 200, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 189, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("어깨 기울어짐");
    });
  });

  describe("전방 돌출 감지", () => {
    it("should detect forward head when ear is too close to shoulder y", () => {
      // earShoulderForward = (shoulderMidY - ear.y) / shoulderWidth
      // threshold = 0.04 → (200 - ear.y) / 100 < 0.04 → ear.y > 196
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 197, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 197, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("고개 전방 돌출");
    });

    it("should not detect forward head in normal position", () => {
      const kps = createKeypoints();
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("고개 전방 돌출");
    });

    it("should skip forward detection when ears have low confidence", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 197, score: 0.1 },
        right_ear: { name: "right_ear", x: 175, y: 197, score: 0.1 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("고개 전방 돌출");
    });

    it("should use right ear if left ear has low confidence", () => {
      // right ear at bad position, left ear low confidence
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 197, score: 0.1 },
        right_ear: { name: "right_ear", x: 175, y: 198, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("고개 전방 돌출");
    });

    it("should use left ear if right ear has low confidence", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 198, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 80, score: 0.1 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("고개 전방 돌출");
    });

    it("should not detect at exact threshold boundary", () => {
      // (200 - ear.y) / 100 = 0.04 → NOT < 0.04 → no forward
      // ear.y = 200 - 4 = 196
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 196, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("고개 전방 돌출");
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

    it("should return isGood=false with any single issue", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 160, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("상수 값 확인", () => {
    it("should have correct threshold values", () => {
      expect(BAD_POSTURE_THRESHOLD.noseShoulderRatio).toBe(0.6);
      expect(BAD_POSTURE_THRESHOLD.shoulderTiltRatio).toBe(0.08);
      expect(BAD_POSTURE_THRESHOLD.earShoulderForwardRatio).toBe(0.04);
    });

    it("should have MIN_KEYPOINT_SCORE of 0.3", () => {
      expect(MIN_KEYPOINT_SCORE).toBe(0.3);
    });

    it("should have CONSECUTIVE_BAD_THRESHOLD of 2", () => {
      expect(CONSECUTIVE_BAD_THRESHOLD).toBe(2);
    });

    it("should have correct capture dimensions", () => {
      expect(CAPTURE_WIDTH).toBe(320);
      expect(CAPTURE_HEIGHT).toBe(240);
    });

    it("should have DEFAULT_CHECK_INTERVAL_SEC of 60", () => {
      expect(DEFAULT_CHECK_INTERVAL_SEC).toBe(60);
    });
  });
});

// ===== evaluatePosture 추가 에지 케이스 =====
describe("evaluatePosture edge cases", () => {
  it("should handle negative nose-shoulder distance (nose below shoulders)", () => {
    // nose.y > shoulderMidY → dist < 0 → ratio < 0 < 0.6 → 거북목
    const kps = createKeypoints({
      nose: { name: "nose", x: 160, y: 220, score: 0.9 },
    });
    const result = evaluatePosture(kps);
    expect(result.issues).toContain("거북목");
  });

  it("should handle very wide shoulders", () => {
    // shoulderWidth = 300, nose dist = 120, ratio = 0.4 < 0.6
    const kps = createKeypoints({
      nose: { name: "nose", x: 160, y: 80, score: 0.9 },
      left_shoulder: { name: "left_shoulder", x: 10, y: 200, score: 0.9 },
      right_shoulder: { name: "right_shoulder", x: 310, y: 200, score: 0.9 },
    });
    const result = evaluatePosture(kps);
    expect(result.issues).toContain("거북목");
  });

  it("should handle when only left ear is available with good confidence", () => {
    const kps = createKeypoints({
      left_ear: { name: "left_ear", x: 145, y: 85, score: 0.9 },
      right_ear: { name: "right_ear", x: 175, y: 85, score: 0.1 },
    });
    const result = evaluatePosture(kps);
    // left ear at y=85, shoulderMidY=200, dist=115, width=100, ratio=1.15 > 0.04 → no forward
    expect(result.issues).not.toContain("고개 전방 돌출");
  });

  it("should handle when no ears found", () => {
    const kps = createKeypoints();
    kps[3] = { name: "not_left_ear", x: 0, y: 0, score: 0.9 };
    kps[4] = { name: "not_right_ear", x: 0, y: 0, score: 0.9 };
    const result = evaluatePosture(kps);
    // 전방 돌출 검사 skip
    expect(result.issues).not.toContain("고개 전방 돌출");
  });
});
