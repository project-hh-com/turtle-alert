import { describe, it, expect, beforeEach } from "vitest";

const {
  evaluatePosture,
  findKeypoint,
  calibrate,
  BAD_POSTURE_THRESHOLD,
  DEVIATION_THRESHOLD,
  MIN_KEYPOINT_SCORE,
  CONSECUTIVE_BAD_THRESHOLD,
  CAPTURE_WIDTH,
  CAPTURE_HEIGHT,
  DEFAULT_CHECK_INTERVAL_SEC,
  CALIBRATION_FRAME_COUNT,
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

/**
 * 기본 키포인트로 baseline을 생성합니다.
 */
function createBaseline(overrides = {}) {
  const frames = [createKeypoints()];
  const base = calibrate(frames);
  return { ...base, ...overrides };
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

// ===== calibrate =====
describe("calibrate", () => {
  it("should return baseline from single frame", () => {
    const frames = [createKeypoints()];
    const result = calibrate(frames);
    expect(result).not.toBeNull();
    expect(result.shoulderWidth).toBe(100);
    expect(result.noseShoulderRatio).toBeCloseTo(1.2);
    expect(result.shoulderTiltRatio).toBe(0);
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("should average multiple frames", () => {
    const frame1 = createKeypoints({ nose: { name: "nose", x: 160, y: 80, score: 0.9 } });
    const frame2 = createKeypoints({ nose: { name: "nose", x: 160, y: 90, score: 0.9 } });
    const result = calibrate([frame1, frame2]);
    // 평균 nose.y = 85, shoulderMidY = 200, dist = 115, width = 100
    expect(result.noseShoulderRatio).toBeCloseTo(1.15);
  });

  it("should return null for empty frames", () => {
    expect(calibrate([])).toBeNull();
    expect(calibrate(null)).toBeNull();
  });

  it("should return null when missing required keypoints", () => {
    const badFrame = [{ name: "nose", x: 160, y: 80, score: 0.9 }];
    expect(calibrate([badFrame])).toBeNull();
  });

  it("should skip low confidence keypoints in averaging", () => {
    const frame1 = createKeypoints({ nose: { name: "nose", x: 160, y: 80, score: 0.9 } });
    const frame2 = createKeypoints({ nose: { name: "nose", x: 160, y: 200, score: 0.1 } });
    const result = calibrate([frame1, frame2]);
    // frame2의 nose는 score가 낮아 제외, frame1만 사용
    expect(result.noseShoulderRatio).toBeCloseTo(1.2);
  });

  it("should return null when shoulder width is too narrow", () => {
    const frame = createKeypoints({
      left_shoulder: { name: "left_shoulder", x: 155, y: 200, score: 0.9 },
      right_shoulder: { name: "right_shoulder", x: 160, y: 200, score: 0.9 },
    });
    expect(calibrate([frame])).toBeNull();
  });

  it("should compute earYDiffRatio", () => {
    const frame = createKeypoints({
      left_ear: { name: "left_ear", x: 145, y: 80, score: 0.9 },
      right_ear: { name: "right_ear", x: 175, y: 90, score: 0.9 },
    });
    const result = calibrate([frame]);
    expect(result.earYDiffRatio).toBeCloseTo(0.1);
  });

  it("should compute noseCenterOffset", () => {
    const frame = createKeypoints({
      nose: { name: "nose", x: 170, y: 80, score: 0.9 },
    });
    const result = calibrate([frame]);
    // shoulderMidX = 160, offset = (170-160)/100 = 0.1
    expect(result.noseCenterOffset).toBeCloseTo(0.1);
  });

  it("should compute earForwardRatio", () => {
    const result = createBaseline();
    // ear.y = 85, shoulderMidY = 200, width = 100 → ratio = 1.15
    expect(result.earForwardRatio).toBeCloseTo(1.15);
  });
});

// ===== evaluatePosture (폴백 — baseline 없음) =====
describe("evaluatePosture (no baseline / fallback)", () => {
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
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 160, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.isGood).toBe(false);
      expect(result.issues).toContain("거북목");
    });

    it("should not detect turtle neck when nose is high enough", () => {
      const result = evaluatePosture(createKeypoints());
      expect(result.issues).not.toContain("거북목");
    });

    it("should detect turtle neck at exact threshold boundary", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 140, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("거북목");
    });

    it("should detect turtle neck just below threshold", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 140.1, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("거북목");
    });

    it("should detect severe turtle neck when nose is at shoulder level", () => {
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("거북목");
    });
  });

  describe("어깨 기울어짐 감지", () => {
    it("should detect shoulder tilt when y difference is large", () => {
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 191, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("어깨 기울어짐");
    });

    it("should not detect tilt when shoulders are level", () => {
      const result = evaluatePosture(createKeypoints());
      expect(result.issues).not.toContain("어깨 기울어짐");
    });

    it("should not detect tilt at exact threshold", () => {
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 192, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).not.toContain("어깨 기울어짐");
    });

    it("should detect tilt just above threshold", () => {
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
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 197, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 197, score: 0.9 },
      });
      const result = evaluatePosture(kps);
      expect(result.issues).toContain("고개 전방 돌출");
    });

    it("should not detect forward head in normal position", () => {
      const result = evaluatePosture(createKeypoints());
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
});

// ===== evaluatePosture (캘리브레이션 기반) =====
describe("evaluatePosture (with baseline)", () => {
  let baseline;
  beforeEach(() => {
    baseline = createBaseline();
  });

  describe("정상 자세", () => {
    it("should return isGood=true for same posture as baseline", () => {
      const result = evaluatePosture(createKeypoints(), baseline);
      expect(result.isGood).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe("거북목 감지 (편차 기반)", () => {
    it("should detect turtle neck when ratio drops more than threshold", () => {
      // baseline ratio = 1.2, threshold drop = 0.15
      // nose.y = 80 + 16 = 96 → ratio = (200-96)/100 = 1.04, drop = 0.16 > 0.15
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 96, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("거북목");
    });

    it("should not detect when ratio drop is within threshold", () => {
      // nose.y = 90 → ratio = 1.1, drop = 0.1 < 0.15
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 90, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).not.toContain("거북목");
    });
  });

  describe("어깨 기울어짐 감지 (편차 기반)", () => {
    it("should detect when tilt increases beyond threshold", () => {
      // baseline tilt = 0, threshold increase = 0.05
      // |191 - 200| / 100 = 0.09, increase = 0.09 > 0.05
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 191, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("어깨 기울어짐");
    });

    it("should not detect small tilt within threshold", () => {
      // |197 - 200| / 100 = 0.03 < 0.05
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 110, y: 197, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).not.toContain("어깨 기울어짐");
    });
  });

  describe("고개 회전 감지", () => {
    it("should detect head rotation when ear confidence differs", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 85, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 85, score: 0.3 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("고개 회전");
    });

    it("should not detect when both ears have similar confidence", () => {
      const result = evaluatePosture(createKeypoints(), baseline);
      expect(result.issues).not.toContain("고개 회전");
    });

    it("should detect when right ear is more confident than left", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 85, score: 0.3 },
        right_ear: { name: "right_ear", x: 175, y: 85, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("고개 회전");
    });
  });

  describe("화면에 너무 가까움 감지", () => {
    it("should detect when shoulder width increases significantly", () => {
      // baseline width = 100, threshold = 0.25
      // new width: |85 - 215| = 130, increase = 0.3 > 0.25
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 85, y: 200, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 215, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("화면에 너무 가까움");
    });

    it("should not detect when width increase is small", () => {
      // width: |100 - 220| = 120, increase = 0.2 < 0.25
      const kps = createKeypoints({
        left_shoulder: { name: "left_shoulder", x: 100, y: 200, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 220, y: 200, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).not.toContain("화면에 너무 가까움");
    });
  });

  describe("고개 기울어짐 감지", () => {
    it("should detect when ear y difference increases", () => {
      // baseline earYDiffRatio = 0 (ears at same height)
      // current: |75 - 95| / 100 = 0.2, increase = 0.2 > 0.06
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 75, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 95, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("고개 기울어짐");
    });

    it("should not detect when ears are level", () => {
      const result = evaluatePosture(createKeypoints(), baseline);
      expect(result.issues).not.toContain("고개 기울어짐");
    });

    it("should skip when ears have low confidence", () => {
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 75, score: 0.1 },
        right_ear: { name: "right_ear", x: 175, y: 95, score: 0.1 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).not.toContain("고개 기울어짐");
    });
  });

  describe("한쪽으로 기울어짐 감지", () => {
    it("should detect when nose shifts sideways", () => {
      // baseline noseCenterOffset = 0
      // nose at x=170, shoulderMidX=160, width=100 → offset = 0.1
      // deviation = |0.1 - 0| = 0.1 > 0.08
      const kps = createKeypoints({
        nose: { name: "nose", x: 170, y: 80, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("한쪽으로 기울어짐");
    });

    it("should not detect when nose is centered", () => {
      const result = evaluatePosture(createKeypoints(), baseline);
      expect(result.issues).not.toContain("한쪽으로 기울어짐");
    });

    it("should detect shift to left side", () => {
      // nose at x=150, offset = (150-160)/100 = -0.1, |deviation| = 0.1 > 0.08
      const kps = createKeypoints({
        nose: { name: "nose", x: 150, y: 80, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("한쪽으로 기울어짐");
    });
  });

  describe("구부정한 자세 감지", () => {
    it("should detect slouch when ratio drops moderately", () => {
      // baseline ratio = 1.2, slouch threshold = 0.10
      // nose.y = 91 → ratio = (200-91)/100 = 1.09, drop = 0.11 > 0.10
      // but drop < 0.15 so no 거북목
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 91, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("구부정한 자세");
      expect(result.issues).not.toContain("거북목");
    });

    it("should not show slouch when turtle neck is detected", () => {
      // drop > 0.15 → 거북목 detected, 구부정한 자세 should not duplicate
      const kps = createKeypoints({
        nose: { name: "nose", x: 160, y: 96, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("거북목");
      expect(result.issues).not.toContain("구부정한 자세");
    });

    it("should not detect when posture is normal", () => {
      const result = evaluatePosture(createKeypoints(), baseline);
      expect(result.issues).not.toContain("구부정한 자세");
    });
  });

  describe("고개 전방 돌출 감지 (편차 기반)", () => {
    it("should detect when ear forward ratio drops significantly", () => {
      // baseline earForwardRatio ≈ 1.15
      // ear at y=185 → forward = (200-185)/100 = 0.15, drop = 1.0 > 0.15
      const kps = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 185, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 185, score: 0.9 },
      });
      const result = evaluatePosture(kps, baseline);
      expect(result.issues).toContain("고개 전방 돌출");
    });

    it("should not detect in normal position", () => {
      const result = evaluatePosture(createKeypoints(), baseline);
      expect(result.issues).not.toContain("고개 전방 돌출");
    });
  });

  describe("서브모니터 대각선 카메라 시나리오", () => {
    it("should not false-positive when calibrated from diagonal angle", () => {
      // 대각선 카메라: 한쪽 귀 안 보이고 어깨 비대칭 — 이게 baseline
      const diagonalFrame = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 85, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 85, score: 0.2 },
        left_shoulder: { name: "left_shoulder", x: 110, y: 195, score: 0.9 },
        right_shoulder: { name: "right_shoulder", x: 210, y: 205, score: 0.9 },
      });
      const diagonalBaseline = calibrate([diagonalFrame]);

      // 같은 각도에서 같은 자세 → 문제 없어야 함
      const result = evaluatePosture(diagonalFrame, diagonalBaseline);
      expect(result.isGood).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it("should detect deviation even from diagonal baseline", () => {
      const diagonalFrame = createKeypoints({
        left_ear: { name: "left_ear", x: 145, y: 85, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 85, score: 0.2 },
      });
      const diagonalBaseline = calibrate([diagonalFrame]);

      // 이 상태에서 구부정해짐
      const slouched = createKeypoints({
        nose: { name: "nose", x: 160, y: 91, score: 0.9 },
        left_ear: { name: "left_ear", x: 145, y: 96, score: 0.9 },
        right_ear: { name: "right_ear", x: 175, y: 96, score: 0.2 },
      });
      const result = evaluatePosture(slouched, diagonalBaseline);
      expect(result.isGood).toBe(false);
    });
  });
});

// ===== evaluatePosture 추가 에지 케이스 =====
describe("evaluatePosture edge cases", () => {
  it("should handle negative nose-shoulder distance (nose below shoulders)", () => {
    const kps = createKeypoints({
      nose: { name: "nose", x: 160, y: 220, score: 0.9 },
    });
    const result = evaluatePosture(kps);
    expect(result.issues).toContain("거북목");
  });

  it("should handle very wide shoulders", () => {
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
    expect(result.issues).not.toContain("고개 전방 돌출");
  });

  it("should handle when no ears found", () => {
    const kps = createKeypoints();
    kps[3] = { name: "not_left_ear", x: 0, y: 0, score: 0.9 };
    kps[4] = { name: "not_right_ear", x: 0, y: 0, score: 0.9 };
    const result = evaluatePosture(kps);
    expect(result.issues).not.toContain("고개 전방 돌출");
  });
});

// ===== calibrate 추가 에지 케이스 =====
describe("calibrate edge cases", () => {
  it("should handle frames where ear keypoints are missing", () => {
    const frame = createKeypoints();
    // 귀 키포인트 제거
    frame[3] = { name: "not_left_ear", x: 0, y: 0, score: 0.9 };
    frame[4] = { name: "not_right_ear", x: 0, y: 0, score: 0.9 };
    const result = calibrate([frame]);
    expect(result).not.toBeNull();
    expect(result.earYDiffRatio).toBe(0);
    expect(result.earConfidenceDiff).toBe(0);
    expect(result.earForwardRatio).toBeNull();
  });

  it("should use right ear for earForwardRatio when left ear is missing", () => {
    const frame = createKeypoints({
      left_ear: { name: "left_ear", x: 145, y: 85, score: 0.1 },
      right_ear: { name: "right_ear", x: 175, y: 90, score: 0.9 },
    });
    const result = calibrate([frame]);
    // left_ear excluded (score < 0.3), right_ear used
    expect(result.earForwardRatio).toBeCloseTo((200 - 90) / 100);
  });

  it("should compute earYDiffRatio when only one ear in averaged but both exist raw", () => {
    const frame = createKeypoints({
      left_ear: { name: "left_ear", x: 145, y: 80, score: 0.9 },
      right_ear: { name: "right_ear", x: 175, y: 85, score: 0.1 },
    });
    const result = calibrate([frame]);
    // right_ear excluded from averaged → earYDiffRatio = 0 (only one ear)
    expect(result.earYDiffRatio).toBe(0);
    // but earConfidenceDiff uses raw → |0.9 - 0.1| = 0.8
    expect(result.earConfidenceDiff).toBeCloseTo(0.8);
  });

  it("should handle frame with no ears at all in raw data", () => {
    const frame = createKeypoints();
    frame[3] = { name: "not_ear", x: 0, y: 0, score: 0.9 };
    frame[4] = { name: "not_ear", x: 0, y: 0, score: 0.9 };
    const result = calibrate([frame]);
    expect(result.earConfidenceDiff).toBe(0);
  });
});

// ===== evaluatePosture with baseline 추가 에지 케이스 =====
describe("evaluatePosture with baseline edge cases", () => {
  it("should handle baseline with earForwardRatio=null (no ears in baseline)", () => {
    const baseline = createBaseline();
    baseline.earForwardRatio = null;
    // 귀가 어깨 근처여도 earForwardRatio가 null이면 전방 돌출 체크 스킵
    const kps = createKeypoints({
      left_ear: { name: "left_ear", x: 145, y: 197, score: 0.9 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).not.toContain("고개 전방 돌출");
  });

  it("should handle baseline with shoulderWidth=0", () => {
    const baseline = createBaseline();
    baseline.shoulderWidth = 0;
    const kps = createKeypoints({
      left_shoulder: { name: "left_shoulder", x: 85, y: 200, score: 0.9 },
      right_shoulder: { name: "right_shoulder", x: 215, y: 200, score: 0.9 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).not.toContain("화면에 너무 가까움");
  });

  it("should skip ear forward check when no ear has good confidence", () => {
    const baseline = createBaseline();
    const kps = createKeypoints({
      left_ear: { name: "left_ear", x: 145, y: 197, score: 0.1 },
      right_ear: { name: "right_ear", x: 175, y: 197, score: 0.1 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).not.toContain("고개 전방 돌출");
  });

  it("should use right ear for forward check when left ear low confidence", () => {
    const baseline = createBaseline();
    const kps = createKeypoints({
      left_ear: { name: "left_ear", x: 145, y: 85, score: 0.1 },
      right_ear: { name: "right_ear", x: 175, y: 185, score: 0.9 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).toContain("고개 전방 돌출");
  });

  it("should not detect head rotation when only one ear exists", () => {
    const baseline = createBaseline();
    const kps = createKeypoints();
    kps[3] = { name: "not_ear", x: 0, y: 0, score: 0.9 };
    // leftEar not found, rightEar exists → skip rotation check
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).not.toContain("고개 회전");
  });

  it("should handle narrow shoulder width with baseline", () => {
    const baseline = createBaseline();
    const kps = createKeypoints({
      left_shoulder: { name: "left_shoulder", x: 155, y: 200, score: 0.9 },
      right_shoulder: { name: "right_shoulder", x: 160, y: 200, score: 0.9 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.isGood).toBe(true);
    expect(result.issues).toContain("어깨 간격이 너무 좁습니다");
  });

  it("should handle low confidence keypoints with baseline", () => {
    const baseline = createBaseline();
    const kps = createKeypoints({
      nose: { name: "nose", x: 160, y: 80, score: 0.1 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.isGood).toBe(true);
    expect(result.issues).toContain("키포인트 신뢰도 부족");
  });
});

// ===== calibrate 내부 분기 커버리지 =====
describe("calibrate internal branches", () => {
  it("should handle frame where a keypoint is not found at all", () => {
    // left_eye가 아예 없는 프레임 — findKeypoint이 undefined 반환
    const frame = [
      { name: "nose", x: 160, y: 80, score: 0.9 },
      // left_eye 없음
      { name: "right_eye", x: 165, y: 78, score: 0.8 },
      { name: "left_ear", x: 145, y: 85, score: 0.9 },
      { name: "right_ear", x: 175, y: 85, score: 0.9 },
      { name: "left_shoulder", x: 110, y: 200, score: 0.9 },
      { name: "right_shoulder", x: 210, y: 200, score: 0.9 },
    ];
    const result = calibrate([frame]);
    expect(result).not.toBeNull();
    // left_eye는 averaged에 없을 수 있지만 필수 키포인트가 아니므로 정상
  });

  it("should handle all keypoints below MIN_KEYPOINT_SCORE for a name", () => {
    // left_eye가 존재하지만 모든 프레임에서 score가 낮음 → count=0 → averaged에 미포함
    const frame = createKeypoints();
    frame[1] = { name: "left_eye", x: 155, y: 78, score: 0.1 };
    const result = calibrate([frame]);
    expect(result).not.toBeNull();
  });

  it("should handle multiple frames with mixed keypoint availability", () => {
    const frame1 = createKeypoints();
    const frame2 = createKeypoints();
    // frame2에서 left_ear score가 낮음
    frame2[3] = { name: "left_ear", x: 145, y: 90, score: 0.1 };
    const result = calibrate([frame1, frame2]);
    expect(result).not.toBeNull();
    // left_ear는 frame1만 사용되어 평균 = frame1 값
    expect(result.keypoints.left_ear.y).toBe(85);
  });
});

// ===== evaluatePosture 신뢰도 분기 커버리지 =====
describe("evaluatePosture confidence branches", () => {
  it("should handle missing left_shoulder (not found)", () => {
    const kps = createKeypoints();
    kps[5] = { name: "not_shoulder", x: 110, y: 200, score: 0.9 };
    const result = evaluatePosture(kps);
    expect(result.isGood).toBe(true);
    expect(result.issues).toContain("키포인트 신뢰도 부족");
  });

  it("should handle missing right_shoulder (not found)", () => {
    const kps = createKeypoints();
    kps[6] = { name: "not_shoulder", x: 210, y: 200, score: 0.9 };
    const result = evaluatePosture(kps);
    expect(result.isGood).toBe(true);
    expect(result.issues).toContain("키포인트 신뢰도 부족");
  });

  it("should handle left_shoulder low score with baseline", () => {
    const baseline = createBaseline();
    const kps = createKeypoints({
      left_shoulder: { name: "left_shoulder", x: 110, y: 200, score: 0.1 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).toContain("키포인트 신뢰도 부족");
  });

  it("should handle right_shoulder low score with baseline", () => {
    const baseline = createBaseline();
    const kps = createKeypoints({
      right_shoulder: { name: "right_shoulder", x: 210, y: 200, score: 0.1 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).toContain("키포인트 신뢰도 부족");
  });

  it("should handle nose not found with baseline", () => {
    const baseline = createBaseline();
    const kps = createKeypoints();
    kps[0] = { name: "not_nose", x: 0, y: 0, score: 0.9 };
    const result = evaluatePosture(kps, baseline);
    expect(result.issues).toContain("키포인트 신뢰도 부족");
  });

  it("should handle narrow shoulders with baseline", () => {
    const baseline = createBaseline();
    const kps = createKeypoints({
      left_shoulder: { name: "left_shoulder", x: 159, y: 200, score: 0.9 },
      right_shoulder: { name: "right_shoulder", x: 160, y: 200, score: 0.9 },
    });
    const result = evaluatePosture(kps, baseline);
    expect(result.isGood).toBe(true);
    expect(result.issues).toContain("어깨 간격이 너무 좁습니다");
  });
});

// ===== lib.js 418-430 (posture AI enable click) 분기 =====
// 이 부분은 lib.js의 트레이 메뉴 클릭 핸들러로, main.test.js에서 커버

// ===== 상수 값 확인 =====
describe("상수 값 확인", () => {
  it("should have correct fallback threshold values", () => {
    expect(BAD_POSTURE_THRESHOLD.noseShoulderRatio).toBe(0.6);
    expect(BAD_POSTURE_THRESHOLD.shoulderTiltRatio).toBe(0.08);
    expect(BAD_POSTURE_THRESHOLD.earShoulderForwardRatio).toBe(0.04);
  });

  it("should have correct deviation threshold values", () => {
    expect(DEVIATION_THRESHOLD.noseShoulderRatioDrop).toBe(0.15);
    expect(DEVIATION_THRESHOLD.shoulderTiltIncrease).toBe(0.05);
    expect(DEVIATION_THRESHOLD.headRotationConfidenceDiff).toBe(0.4);
    expect(DEVIATION_THRESHOLD.shoulderWidthIncrease).toBe(0.25);
    expect(DEVIATION_THRESHOLD.headTiltIncrease).toBe(0.06);
    expect(DEVIATION_THRESHOLD.noseCenterOffset).toBe(0.08);
    expect(DEVIATION_THRESHOLD.slouchRatioDrop).toBe(0.10);
    expect(DEVIATION_THRESHOLD.earForwardRatioDrop).toBe(0.15);
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

  it("should have CALIBRATION_FRAME_COUNT of 5", () => {
    expect(CALIBRATION_FRAME_COUNT).toBe(5);
  });
});
