import { useEffect, useRef, useState, useCallback } from "react";
import { AudioAnalyzer } from "../utils/audioAnalyzer";
export const useAvatarVoice = ({ isListening = false, isSpeaking = false, message = "", voiceStyle = "female", }) => {
    const audioContextRef = useRef(null);
    const analyzerRef = useRef(null);
    const analyserNodeRef = useRef(null);
    const [audioReady, setAudioReady] = useState(false);
    const [currentLipSync, setCurrentLipSync] = useState(0);
    const animationFrameRef = useRef(null);
    // Initialize audio context
    const initializeAudio = useCallback(async () => {
        if (audioContextRef.current)
            return;
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            audioContextRef.current = audioContext;
            // Get microphone stream for live input
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = audioContext.createMediaStreamSource(stream);
            // Create analyzer
            const analyzer = new AudioAnalyzer(audioContext, source);
            analyzerRef.current = analyzer;
            analyserNodeRef.current = analyzer.getAnalyser();
            setAudioReady(true);
        }
        catch (error) {
            console.error("Failed to initialize audio:", error);
        }
    }, []);
    // Update lip sync
    useEffect(() => {
        if (!isSpeaking || !analyzerRef.current)
            return;
        const updateLipSync = () => {
            const lipData = analyzerRef.current.updateLipSync();
            const avgLip = (lipData.A + lipData.E + lipData.I + lipData.O + lipData.U) / 5;
            setCurrentLipSync(avgLip);
            animationFrameRef.current = requestAnimationFrame(updateLipSync);
        };
        updateLipSync();
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isSpeaking]);
    // Speak with avatar animation
    const speak = useCallback((text) => {
        if (!audioContextRef.current) {
            initializeAudio();
            return;
        }
        // Use Web Speech API for voice synthesis
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        // Select voice based on style
        const voiceFilter = (voice) => {
            if (voiceStyle === "female") {
                return /female|woman|zira|susan|samantha|aria|jenny/i.test(voice.name);
            }
            else if (voiceStyle === "male") {
                return /male|man|david|mark|daniel|ravi/i.test(voice.name);
            }
            return true;
        };
        const selectedVoice = voices.find(voiceFilter) || voices[0];
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }
        utterance.rate = 1;
        utterance.pitch = voiceStyle === "female" ? 1.2 : 0.8;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }, [voiceStyle, initializeAudio]);
    return {
        audioReady,
        analyserNode: analyserNodeRef.current,
        initializeAudio,
        speak,
        currentLipSync,
    };
};
/**
 * Hook for avatar state management and reactions
 */
export const useAvatarState = () => {
    const [state, setState] = useState({
        isListening: false,
        isSpeaking: false,
        isThinking: false,
        currentExpression: "neutral",
        lastCommand: null,
    });
    const setListening = useCallback((value) => {
        setState((prev) => ({
            ...prev,
            isListening: value,
            currentExpression: value ? "processing" : prev.currentExpression,
        }));
    }, []);
    const setSpeaking = useCallback((value) => {
        setState((prev) => ({
            ...prev,
            isSpeaking: value,
            currentExpression: value ? "neutral" : prev.currentExpression,
        }));
    }, []);
    const setThinking = useCallback((value) => {
        setState((prev) => ({
            ...prev,
            isThinking: value,
            currentExpression: value ? "thinking" : "neutral",
        }));
    }, []);
    const setExpression = useCallback((expression) => {
        setState((prev) => ({
            ...prev,
            currentExpression: expression,
        }));
    }, []);
    const recordCommand = useCallback((command) => {
        setState((prev) => ({
            ...prev,
            lastCommand: command,
            currentExpression: "happy",
        }));
    }, []);
    return {
        state,
        setListening,
        setSpeaking,
        setThinking,
        setExpression,
        recordCommand,
    };
};
