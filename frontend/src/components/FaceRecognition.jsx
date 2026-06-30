import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import Webcam from "react-webcam";
import * as faceapi from "face-api.js";

export default function FaceRecognition() {
  const webcamRef = useRef(null);

  const [result, setResult] =
    useState("Waiting...");

  useEffect(() => {
    const interval = setInterval(
      recognizeFace,
      2000
    );

    return () =>
      clearInterval(interval);
  }, []);

  const recognizeFace = async () => {
    const screenshot =
      webcamRef.current?.getScreenshot();

    if (!screenshot) return;

    const img = await faceapi.fetchImage(
      screenshot
    );

    const detection = await faceapi
      .detectSingleFace(
        img,
        new faceapi.TinyFaceDetectorOptions()
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setResult("No Face Found");
      return;
    }

    const currentDescriptor =
      detection.descriptor;

    let bestMatch = "Unknown";
    let bestDistance = 1;

    Object.keys(localStorage).forEach(
      (key) => {
        if (!key.startsWith("face_")) return;

        const saved = JSON.parse(
          localStorage.getItem(key)
        );

        const distance =
          faceapi.euclideanDistance(
            currentDescriptor,
            saved
          );

        if (
          distance < bestDistance &&
          distance < 0.55
        ) {
          bestDistance = distance;
          bestMatch = key.replace(
            "face_",
            ""
          );
        }
      }
    );

    setResult(bestMatch);
  };

  return (
    <div className="p-5 border rounded-xl">
      <h2 className="text-xl font-bold mb-3">
        Face Recognition
      </h2>

      <Webcam
        ref={webcamRef}
        screenshotFormat="image/jpeg"
      />

      <div className="mt-4 text-lg font-bold">
        {result === "Unknown"
          ? "❌ Unknown Person"
          : `✅ Welcome ${result}`}
      </div>
    </div>
  );
}