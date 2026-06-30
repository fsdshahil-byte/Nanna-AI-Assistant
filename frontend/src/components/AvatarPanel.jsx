import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, Brain, CheckCircle2, } from "lucide-react";
import AvatarCanvas from "./AvatarCanvas";
import { useAvatarVoice, useAvatarState } from "../hooks/useAvatarVoice";
const AvatarPanel = ({ isListening = false, isSpeaking = false, voiceStyle = "female", onCommand, }) => {
    const { audioReady, analyserNode, initializeAudio, speak } = useAvatarVoice({
        isListening,
        isSpeaking,
        voiceStyle,
    });
    const { state, setListening, setSpeaking, setThinking, setExpression } = useAvatarState();
    const [energy, setEnergy] = useState(0);
    const animationFrameRef = useRef(null);
    // Sync external state with internal state
    useEffect(() => {
        setListening(isListening);
        setSpeaking(isSpeaking);
    }, [isListening, isSpeaking, setListening, setSpeaking]);
    // Monitor audio energy
    useEffect(() => {
        if (!isSpeaking || !analyserNode)
            return;
        const updateEnergy = () => {
            const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
            analyserNode.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length / 255;
            setEnergy(avg);
            animationFrameRef.current = requestAnimationFrame(updateEnergy);
        };
        updateEnergy();
        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isSpeaking, analyserNode]);
    const getStatusIcon = () => {
        if (state.isThinking)
            return <Brain size={18} className="text-blue-400"/>;
        if (state.isSpeaking)
            return <Volume2 size={18} className="text-cyan-400 animate-pulse"/>;
        if (state.isListening)
            return <Mic size={18} className="text-green-400 animate-pulse"/>;
        return <CheckCircle2 size={18} className="text-slate-400"/>;
    };
    const getStatusText = () => {
        if (state.isThinking)
            return "Thinking";
        if (state.isSpeaking)
            return "Speaking";
        if (state.isListening)
            return "Listening";
        return "Ready";
    };
    const getStatusColor = () => {
        if (state.isThinking)
            return "from-blue-500/20 to-blue-600/20";
        if (state.isSpeaking)
            return "from-cyan-500/20 to-cyan-600/20";
        if (state.isListening)
            return "from-green-500/20 to-green-600/20";
        return "from-slate-500/20 to-slate-600/20";
    };
    return (<div className="flex flex-col h-full gap-6 p-6 bg-gradient-to-br from-slate-900/50 via-slate-800/50 to-slate-900/50 rounded-2xl border border-slate-700/50">
      {/* Avatar Container */}
      <div className="relative flex-1 rounded-xl overflow-hidden bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-slate-700/50 group shadow-2xl">
        {/* Canvas Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none"/>

        {/* Avatar Canvas */}
        <div className="w-full h-full">
          <AvatarCanvas isListening={state.isListening} isSpeaking={state.isSpeaking} audioAnalyser={analyserNode ?? undefined} onReady={initializeAudio}/>
        </div>

        {/* Status Indicator */}
        <div className="absolute top-4 right-4">
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${getStatusColor()} border border-slate-600/30 flex items-center gap-2 backdrop-blur-md`}>
            {getStatusIcon()}
            <span className="text-xs font-semibold text-white">{getStatusText()}</span>
          </motion.div>
        </div>

        {/* Energy Visualizer */}
        {(state.isSpeaking || state.isListening) && (<div className="absolute bottom-4 left-4 right-4 h-1 bg-slate-800/50 rounded-full overflow-hidden border border-slate-700/30">
            <motion.div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" animate={{ width: `${energy * 100}%` }} transition={{ duration: 0.1 }}/>
          </div>)}

        {/* Listening Indicator */}
        <AnimatePresence>
          {state.isListening && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 border-2 border-green-500/30 rounded-xl pointer-events-none animate-pulse"/>)}
        </AnimatePresence>

        {/* Thinking Indicator */}
        <AnimatePresence>
          {state.isThinking && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 border-2 border-blue-500/30 rounded-xl pointer-events-none"/>)}
        </AnimatePresence>
      </div>

      {/* Status & Controls */}
      <div className="space-y-3">
        {/* Status Display */}
        <div className="px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Avatar Status
              </span>
              <div className="flex gap-1">
                {state.isListening && (<motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.8, repeat: Infinity }} className="w-2 h-2 rounded-full bg-green-400"/>)}
                {state.isSpeaking && (<motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.4, repeat: Infinity }} className="w-2 h-2 rounded-full bg-cyan-400"/>)}
                {state.isThinking && (<motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="w-2 h-2 rounded-full bg-blue-400"/>)}
              </div>
            </div>
            <p className="text-sm text-slate-300">
              {state.isThinking ? "Processing your request..." : ""}
              {state.isSpeaking ? "NANNA is responding..." : ""}
              {state.isListening ? "Listening to your voice..." : ""}
              {!state.isThinking && !state.isSpeaking && !state.isListening ? "Ready to assist" : ""}
            </p>
            {state.lastCommand && (<p className="text-xs text-slate-400">
                Last command: <span className="text-slate-200 font-medium">{state.lastCommand}</span>
              </p>)}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-3">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => {
            setListening(!state.isListening);
            if (!state.isListening) {
                initializeAudio();
            }
        }} className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 border ${state.isListening
            ? "bg-green-500/20 border-green-500/50 text-green-300 hover:bg-green-500/30"
            : "bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50"}`}>
            {state.isListening ? (<>
                <MicOff size={16}/>
                <span>Stop Listening</span>
              </>) : (<>
                <Mic size={16}/>
                <span>Start Listening</span>
              </>)}
          </motion.button>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => {
            setSpeaking(!state.isSpeaking);
            if (!state.isSpeaking) {
                speak("Hello! I'm NANNA, your AI assistant. How can I help you today?");
            }
        }} className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 border ${state.isSpeaking
            ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300 hover:bg-cyan-500/30"
            : "bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50"}`}>
            <Volume2 size={16}/>
            <span>Test Voice</span>
          </motion.button>
        </div>

        {/* Audio Status */}
        <div className="px-3 py-2 bg-slate-800/30 border border-slate-700/30 rounded-lg text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span>Audio System</span>
            <motion.div className={`px-2 py-1 rounded-full text-xs font-semibold ${audioReady
            ? "bg-green-500/20 text-green-300"
            : "bg-amber-500/20 text-amber-300"}`}>
              {audioReady ? "Ready" : "Initializing..."}
            </motion.div>
          </div>
        </div>
      </div>
    </div>);
};
export default AvatarPanel;
