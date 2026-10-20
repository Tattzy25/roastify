import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';

const SAMPLE_RATE = 16000;
const CHUNK_SIZE = 4096;

type TranscriptItem = { role: 'user' | 'wreck'; text: string };

export function useGeminiLive(systemInstruction: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isProcessingAudioRef = useRef(false);
  const isMutedRef = useRef(false);
  const isVideoEnabledRef = useRef(true);

  const processAudioQueue = useCallback(() => {
    const audioContext = audioContextRef.current;
    const pcmData = audioQueueRef.current.shift();

    if (!audioContext || !pcmData) {
      isProcessingAudioRef.current = false;
      setIsAudioPlaying(false);
      return;
    }

    isProcessingAudioRef.current = true;
    setIsAudioPlaying(true);

    const float32Data = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i += 1) {
      float32Data[i] = pcmData[i] / 32768;
    }

    const buffer = audioContext.createBuffer(1, float32Data.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.onended = processAudioQueue;
    source.start();
  }, []);

  const playAudioChunk = useCallback((base64Data: string) => {
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    audioQueueRef.current.push(new Int16Array(bytes.buffer));
    if (!isProcessingAudioRef.current) {
      processAudioQueue();
    }
  }, [processAudioQueue]);

  const initAudio = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  }, []);

  const startStreaming = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: { width: 640, height: 480 },
    });
    streamRef.current = stream;

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }

    const audioContext = audioContextRef.current;
    if (!audioContext) {
      throw new Error('Audio context is not initialized');
    }

    const audioSource = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1);
    processorRef.current = processor;
    audioSource.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (event) => {
      const session = sessionRef.current;
      if (isMutedRef.current || !session) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i += 1) {
        pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
      }

      const bytes = new Uint8Array(pcmData.buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      session.sendRealtimeInput({
        audio: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' },
      });
    };

    videoIntervalRef.current = window.setInterval(() => {
      const session = sessionRef.current;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!isVideoEnabledRef.current || !session || !video || !canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      context.drawImage(video, 0, 0, 320, 240);
      const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
      if (!base64Data) {
        throw new Error('Failed to encode camera frame');
      }
      session.sendRealtimeInput({ video: { data: base64Data, mimeType: 'image/jpeg' } });
    }, 1000);
  }, []);

  const cleanupMedia = useCallback(() => {
    if (videoIntervalRef.current !== null) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startConnection = useCallback(async () => {
    try {
      setStatus('connecting');
      await initAudio();
      await startStreaming();

      const tokenResponse = await fetch('/api/session-token', { method: 'POST' });
      const tokenResult: { token?: unknown; error?: unknown } = await tokenResponse.json();

      if (!tokenResponse.ok) {
        const message = typeof tokenResult.error === 'string'
          ? tokenResult.error
          : `Session token request failed (${tokenResponse.status})`;
        throw new Error(message);
      }
      if (typeof tokenResult.token !== 'string' || tokenResult.token.length === 0) {
        throw new Error('Session token response did not include a token');
      }

      const ai = new GoogleGenAI({
        apiKey: tokenResult.token,
        httpOptions: { apiVersion: 'v1alpha' },
      });

      const session = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setStatus('live');
          },
          onmessage: (message: LiveServerMessage) => {
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                playAudioChunk(part.inlineData.data);
              }
              if (part.text) {
                setTranscript((previous) => [...previous, { role: 'wreck', text: part.text! }]);
              }
            }

            if (message.serverContent?.interrupted) {
              audioQueueRef.current = [];
              setIsAudioPlaying(false);
            }
          },
          onclose: () => {
            sessionRef.current = null;
            cleanupMedia();
            setIsConnected(false);
            setStatus('idle');
          },
          onerror: (error) => {
            console.error('Live API Error:', error);
            setStatus('error');
          },
        },
      });

      sessionRef.current = session;
    } catch (error) {
      console.error('Failed to connect:', error);
      sessionRef.current?.close();
      sessionRef.current = null;
      cleanupMedia();
      setStatus('error');
    }
  }, [cleanupMedia, initAudio, playAudioChunk, startStreaming, systemInstruction]);

  const disconnect = useCallback(() => {
    const session = sessionRef.current;
    sessionRef.current = null;
    session?.close();
    cleanupMedia();
    audioQueueRef.current = [];
    setIsAudioPlaying(false);
    setIsConnected(false);
    setStatus('idle');
  }, [cleanupMedia]);

  const toggleMute = useCallback(() => {
    setIsMuted((previous) => {
      isMutedRef.current = !previous;
      return !previous;
    });
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoEnabled((previous) => {
      const enabled = !previous;
      isVideoEnabledRef.current = enabled;
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
      return enabled;
    });
  }, []);

  const sendText = useCallback((text: string) => {
    const session = sessionRef.current;
    if (!session) {
      throw new Error('Cannot send text without an active Gemini Live session');
    }
    session.sendRealtimeInput({ text });
    setTranscript((previous) => [...previous, { role: 'user', text }]);
  }, []);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isConnected]);

  useEffect(() => () => {
    sessionRef.current?.close();
    cleanupMedia();
    void audioContextRef.current?.close();
  }, [cleanupMedia]);

  return {
    isConnected,
    isMuted,
    isVideoEnabled,
    isAudioPlaying,
    transcript,
    status,
    videoRef,
    canvasRef,
    startConnection,
    disconnect,
    sendText,
    toggleMute,
    toggleVideo,
  };
}
