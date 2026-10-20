import React from 'react';
import { Mic, MicOff, Video, VideoOff, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { useGeminiLive } from './hooks/useGeminiLive';

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
  const {
    isConnected,
    isMuted,
    isVideoEnabled,
    isAudioPlaying,
    videoRef,
    canvasRef,
    status,
    startConnection,
    disconnect,
    sendText,
    toggleMute,
    toggleVideo,
  } = useGeminiLive(SYSTEM_INSTRUCTION);

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
                      sendText("Roast me based on what you see or just talk some smack!");
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
