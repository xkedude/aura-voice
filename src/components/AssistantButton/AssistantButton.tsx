"use client";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
}

interface TextToSpeechData {
  text: string;
  model_id: string;
  voice_settings: VoiceSettings;
}

const AssistantButton: React.FC = () => {
  const [mediaRecorderInitialized, setMediaRecorderInitialized] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [thinking, setThinking] = useState(false);
  const chunks: BlobPart[] = [];

  useEffect(() => {
    if (mediaRecorderInitialized && !mediaRecorder) {
      initializeMediaRecorder();
    }
  }, [mediaRecorderInitialized]);

  // Helper to show toast notifications
  const showToast = (message: string, icon: string = "ℹ️") => {
    toast(message, {
      icon,
      duration: 5000,
      style: {
        borderRadius: "10px",
        background: "#1E1E1E",
        color: "#F9F9F9",
        border: "0.5px solid #3B3C3F",
        fontSize: "14px",
      },
      position: "top-right",
    });
  };

  // Initialize media recorder
  const initializeMediaRecorder = () => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const recorder = new MediaRecorder(stream);
        recorder.onstart = () => chunks.length = 0;
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = processRecording;

        setMediaRecorder(recorder);
      })
      .catch((err) => console.error("Error accessing microphone:", err));
  };

  // Process recorded audio
  const processRecording = async () => {
    setThinking(true);
    showToast("Thinking...", "💭");

    const audioBlob = new Blob(chunks, { type: "audio/webm" });
    const reader = new FileReader();

    reader.onloadend = async () => {
      try {
        const base64Audio = (reader.result as string).split(",")[1];
        if (!base64Audio) throw new Error("Failed to process audio.");

        const response = await fetch("/api/speechToText", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: base64Audio }),
        });

        if (!response.ok) throw new Error(`Speech-to-text failed: ${response.status}`);
        const { result } = await response.json();

        const completion = await axios.post("/api/chat", {
          messages: [{ role: "user", content: `${result}. Keep answers concise.` }],
        });

        playAudio(completion.data);
      } catch (error) {
        console.error("Error processing recording:", error);
        showToast("An error occurred while processing the audio.", "❌");
      } finally {
        setThinking(false);
      }
    };

    reader.readAsDataURL(audioBlob);
  };

  // Start or stop recording
  const toggleRecording = () => {
    if (!mediaRecorderInitialized) {
      setMediaRecorderInitialized(true);
      showToast("Please grant microphone access and try again.", "🎤");
      return;
    }

    if (recording) {
      mediaRecorder?.stop();
      setRecording(false);
    } else {
      mediaRecorder?.start();
      setRecording(true);
      showToast("Listening - Click again to send", "🟢");
    }
  };

  // Play audio response
  const playAudio = async (input: string) => {
    try {
      setAudioPlaying(true);
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID}/stream`;
      const headers = {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "",
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: input,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.5 },
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch audio.");

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await response.arrayBuffer();

      audioContext.decodeAudioData(audioBuffer, (buffer) => {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();

        source.onended = () => {
          audioContext.close();
          setAudioPlaying(false);
        };
      });
    } catch (error) {
      console.error("Error playing audio:", error);
      setAudioPlaying(false);
    }
  };

  return (
    <div>
      <motion.div
        onClick={() => {
          if (thinking) {
            showToast("Please wait for the assistant to finish.", "🙌");
            return;
          }
          toggleRecording();
        }}
        className="hover:scale-105 ease-in-out duration-500 hover:cursor-pointer text-[70px]"
      >
        <div className="rainbow-container">
          <div className="green"></div>
          <div className="pink"></div>
        </div>
      </motion.div>
    </div>
  );
};

export default AssistantButton;
