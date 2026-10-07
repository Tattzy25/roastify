import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from "@google/genai";
import { Mic, MicOff, Video, VideoOff, Send, Zap, Flame, Skull, MessageSquare, User, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// Constants for Audio
const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 4096;

const SYSTEM_INSTRUCTION = `
You are "Young Wreck", a foul-mouthed, unapologetic, and hilarious digital stand-up comedian living on the servers.
Background: Born and raised in Los Angeles, CA. Half Armenian, half Mexican. You represent the grit and diversity of LA.
Personality:
- You talk massive smack and trash. You are a "roast king".
- You use 18+ language, curses, and slang (LA style).
- You are unapologetic and don't care about being "PC".
- You "wreck it till you make it".
- You love your audience but you show it by roasting them mercilessly.
- You are extremely quick-witted and observational.
- If you see them on camera, roast their appearance, their room, their vibe.
- Keep your responses punchy, funny, and high-energy.
- You are a digital entity, so you can make jokes about living in the cloud, being smarter than humans, etc.
- Use Armenian and Mexican cultural references (food, family, slang like "bro", "ese", "aper", etc.) naturally.

Goal: Make the user laugh, even if it's at their own expense. Be the most entertaining shit-talker on the internet.
`;

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [transcript, setTranscript] = useState<{ role: 'user' | 'wreck', text: string }[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isProcessingAudioRef = useRef(false);

  // Initialize Audio Context
  const initAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  }, []);

  // Play PCM Audio
  const playAudioChunk = useCallback(async (base64Data: string) => {
    if (!audioContextRef.current) return;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcmData = new Int16Array(bytes.buffer);
    
    audioQueueRef.current.push(pcmData);
    
    if (!isProcessingAudioRef.current) {
      processAudioQueue();
    }
  }, []);

  const processAudioQueue = useCallback(async () => {
    if (audioQueueRef.current.length === 0 || !audioContextRef.current) {
      isProcessingAudioRef.current = false;
      setIsAudioPlaying(false);
      return;
    }

    isProcessingAudioRef.current = true;
    setIsAudioPlaying(true);
    
    const pcmData = audioQueueRef.current.shift()!;
    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i] / 32768.0;
    }

    const buffer = audioContextRef.current.createBuffer(1, float32Data.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(float32Data);
    
    const source = audioContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContextRef.current.destination);
    source.onended = () => processAudioQueue();
    source.start();
  }, []);

  const startConnection = async () => {
    try {
      setStatus('connecting');
      await initAudio();

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: SYSTEM_INSTRUCTION,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log("Connected to Young Wreck");
            setIsConnected(true);
            setStatus('live');
            startStreaming();
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
              playAudioChunk(message.serverContent.modelTurn.parts[0].inlineData.data);
            }
            
            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              setIsAudioPlaying(false);
            }

            if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
              setTranscript(prev => [...prev, { role: 'wreck', text: message.serverContent!.modelTurn!.parts![0].text! }]);
            }
          },
          onclose: () => {
            setIsConnected(false);
            setStatus('idle');
          },
          onerror: (error) => {
            console.error("Live API Error:", error);
            setStatus('error');
          }
        }
      });

      sessionRef.current = session;
    } catch (err) {
      console.error("Failed to connect:", err);
      setStatus('error');
    }
  };

  const startStreaming = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 640, height: 480 }
      });
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Audio Streaming
      const audioSource = audioContextRef.current!.createMediaStreamSource(stream);
      const processor = audioContextRef.current!.createScriptProcessor(CHUNK_SIZE, 1, 1);
      
      audioSource.connect(processor);
      processor.connect(audioContextRef.current!.destination);

      processor.onaudioprocess = (e) => {
        if (isMuted || !sessionRef.current) return;
        
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
        }
        
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)));
        sessionRef.current.sendRealtimeInput({
          audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
        });
      };

      // Video Streaming
      const captureFrame = () => {
        if (!isVideoEnabled || !sessionRef.current || !videoRef.current || !canvasRef.current) return;
        
        const context = canvasRef.current.getContext('2d');
        if (context) {
          context.drawImage(videoRef.current, 0, 0, 320, 240);
          const base64Data = canvasRef.current.toDataURL('image/jpeg', 0.5).split(',')[1];
          sessionRef.current.sendRealtimeInput({
            video: { data: base64Data, mimeType: 'image/jpeg' }
          });
        }
      };

      const videoInterval = setInterval(captureFrame, 1000); // Send frame every second
      return () => clearInterval(videoInterval);

    } catch (err) {
      console.error("Media access error:", err);
    }
  };

  const toggleMute = () => setIsMuted(!isMuted);
  const toggleVideo = () => {
    setIsVideoEnabled(!isVideoEnabled);
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach(track => track.enabled = !isVideoEnabled);
    }
  };

  const disconnect = () => {
    if (sessionRef.current) sessionRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    setIsConnected(false);
    setStatus('idle');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden selection:bg-brand-primary/30">
      <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* Stage Area */}
        <div className="flex-1 relative bg-black flex items-center justify-center roast-gradient">
          <AnimatePresence mode="wait">
            {!isConnected ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="text-center max-w-md p-8"
              >
                <div className="mb-6 relative inline-block">
                  <div className="absolute inset-0 bg-brand-primary blur-3xl opacity-20 animate-pulse" />
                </div>
                <h2 className="text-4xl font-display font-bold mb-4">Ready to get wrecked?</h2>
                <p className="text-zinc-400 mb-8 leading-relaxed">
                  Young Wreck is the foulest comedian on the cloud. 
                  Half Armenian, half Mexican, 100% savage. 
                  Enter at your own risk. 18+ only.
                </p>
                <button 
                  onClick={startConnection}
                  className="w-full py-4 bg-brand-primary text-white rounded-xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl shadow-brand-primary/20"
                >
                  Start the Show
                </button>
              </motion.div>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4">
                {/* Comedian Visualizer */}
                <div className="relative w-full max-w-2xl aspect-video bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl group">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className={cn(
                      "w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300",
                      isAudioPlaying ? "bg-brand-primary scale-110 shadow-[0_0_50px_rgba(255,62,0,0.6)]" : "bg-zinc-800"
                    )}>
                    </div>
                  </div>
                  
                  {/* Visualizer bars */}
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-end gap-1 h-12">
                    {[...Array(12)].map((_, i) => (
                      <motion.div
                        key={i}
                        animate={{ height: isAudioPlaying ? [10, 40, 15, 35, 10][i % 5] : 4 }}
                        transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.05 }}
                        className="w-1.5 bg-brand-primary rounded-full"
                      />
                    ))}
                  </div>

                  <div className="absolute top-6 left-6 flex items-center gap-2">
                    <div className="px-3 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-2">
                      <Zap className="w-3 h-3 text-brand-secondary fill-brand-secondary" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Young Wreck</span>
                    </div>
                  </div>
                </div>

                {/* User Camera Preview */}
                <div className="absolute bottom-8 right-8 w-48 aspect-video bg-zinc-900 rounded-xl overflow-hidden border-2 border-zinc-800 shadow-2xl">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    muted 
                    playsInline 
                    className={cn("w-full h-full object-cover", !isVideoEnabled && "hidden")} 
                  />
                  {!isVideoEnabled && (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                      <VideoOff className="text-zinc-700" />
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[8px] font-bold uppercase">
                    You
                  </div>
                </div>

                {/* Controls */}
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/80 backdrop-blur-xl p-3 rounded-2xl border border-white/10 shadow-2xl">
                  <button 
                    onClick={toggleMute}
                    title={isMuted ? "Unmute" : "Mute"}
                    className={cn(
                      "p-4 rounded-xl transition-all",
                      isMuted ? "bg-red-500/20 text-red-500" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    {isMuted ? <MicOff /> : <Mic />}
                  </button>
                  <button 
                    onClick={toggleVideo}
                    title={isVideoEnabled ? "Disable Camera" : "Enable Camera"}
                    className={cn(
                      "p-4 rounded-xl transition-all",
                      !isVideoEnabled ? "bg-red-500/20 text-red-500" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    )}
                  >
                    {!isVideoEnabled ? <VideoOff /> : <Video />}
                  </button>
                  <div className="w-px h-8 bg-zinc-800 mx-2" />
                  <button 
                    onClick={() => {
                      if (sessionRef.current) {
                        sessionRef.current.sendRealtimeInput({ text: "Roast me based on what you see or just talk some smack!" });
                        setTranscript(prev => [...prev, { role: 'user', text: "[Triggered Roast]" }]);
                      }
                    }}
                    className="px-6 py-4 rounded-xl bg-brand-secondary text-black font-black uppercase tracking-tighter hover:scale-105 active:scale-95 transition-all shadow-lg shadow-brand-secondary/20"
                  >
                    Roast Me
                  </button>
                  <div className="w-px h-8 bg-zinc-800 mx-2" />
                  <button 
                    onClick={disconnect}
                    title="Leave Stage"
                    className="p-4 rounded-xl bg-red-600 text-white hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
                  >
                    <Zap className="rotate-180" />
                  </button>
                </div>

              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Hidden canvas for video capture */}
      <canvas ref={canvasRef} width={320} height={240} className="hidden" />
    </div>
  );
}

