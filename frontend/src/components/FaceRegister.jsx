import React, { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import * as faceapi from "face-api.js";

export default function FaceDetection() {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);

  const [status, setStatus] = useState("Loading AI Models...");

  useEffect(() => {
    loadModels();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const loadModels = async () => {
    try {
      const MODEL_URL = "/models";

      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      setStatus("Models Loaded ✅");
    } catch (err) {
      console.error(err);
      setStatus("Model Loading Failed ❌");
    }
  };

  const handleVideoOnPlay = () => {
    intervalRef.current = setInterval(async () => {
      const video = webcamRef.current?.video;

      if (!video || video.readyState !== 4) return;

      const detections = await faceapi
        .detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions()
        )
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (detections.length > 0) {
        setStatus(`🟢 Face Detected (${detections.length})`);
      } else {
        setStatus("🔴 No Face Found");
      }

      const canvas = canvasRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const displaySize = {
        width: video.videoWidth,
        height: video.videoHeight,
      };

      faceapi.matchDimensions(canvas, displaySize);

      const resized = faceapi.resizeResults(
        detections,
        displaySize
      );

      const ctx = canvas.getContext("2d");

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      faceapi.draw.drawDetections(
        canvas,
        resized
      );

      faceapi.draw.drawFaceLandmarks(
        canvas,
        resized
      );
    }, 300);
  };

  return (
    <div className="flex flex-col items-center p-6">
      <h2 className="text-2xl font-bold mb-4">
        NANNA AI Vision
      </h2>

      <div className="relative">
        <Webcam
          ref={webcamRef}
          audio={false}
          width={720}
          height={540}
          onPlay={handleVideoOnPlay}
          screenshotFormat="image/jpeg"
        />

        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0"
        />
      </div>

      <div className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-white">
        {status}
      </div>
    </div>
  );
}