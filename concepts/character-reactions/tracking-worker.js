importScripts(
  "assets/vision-worker.js",
  "wave-detector.js",
  "reaction-detector.js",
);
let hands,
  face,
  detector = new ReactionDetector(),
  lastFace = null,
  frameCount = 0;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const { FilesetResolver, GestureRecognizer, FaceLandmarker } =
        self.MediaPipe;
      const files = await FilesetResolver.forVisionTasks(
        new URL("assets/wasm/", self.location.href).href,
      );
      // Create sequentially: both tasks use the bundled WASM loader in this worker.
      hands = await GestureRecognizer.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL(
            "assets/gesture_recognizer.task",
            self.location.href,
          ).href,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
      face = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL(
            "assets/face_landmarker.task",
            self.location.href,
          ).href,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: "ready" });
    } catch (e) {
      self.postMessage({ type: "error", message: e.message });
    }
  }
  if (data.type === "frame") {
    try {
      const result = hands.recognizeForVideo(data.frame, data.timestamp);
      result.aspect = data.frame.width / data.frame.height;
      // Faces are slower-changing; 7–8 Hz keeps both models off the UI thread.
      if (frameCount++ % 2 === 0)
        lastFace = face.detectForVideo(data.frame, data.timestamp);
      self.postMessage({
        type: "result",
        reaction: detector.update(
          result,
          lastFace,
          data.timestamp,
          data.blocked,
        ),
      });
    } catch (e) {
      self.postMessage({ type: "error", message: e.message });
    } finally {
      data.frame.close();
    }
  }
  if (data.type === "reset") {
    detector.reset();
    lastFace = null;
    frameCount = 0;
  }
};
