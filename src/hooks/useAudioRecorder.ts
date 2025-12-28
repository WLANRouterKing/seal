import { useState, useRef, useCallback, useEffect } from 'react'

export interface AudioRecorderState {
  isRecording: boolean
  isPaused: boolean
  duration: number
  audioBlob: Blob | null
  audioUrl: string | null
  waveform: number[]
  error: string | null
}

export interface AudioRecorderActions {
  startRecording: () => Promise<void>
  stopRecording: () => void
  cancelRecording: () => void
  pauseRecording: () => void
  resumeRecording: () => void
}

const SAMPLE_RATE = 44100
const MAX_DURATION = 60 // 60 seconds max like NIP-A0 suggests

export function useAudioRecorder(): [AudioRecorderState, AudioRecorderActions] {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [waveform, setWaveform] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)

  // Cleanup function
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    mediaRecorderRef.current = null
    analyserRef.current = null
    chunksRef.current = []
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup()
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
    }
  }, [cleanup, audioUrl])

  // Waveform analysis - use ref to avoid self-reference issue
  const analyzeWaveformRef = useRef<() => void>(() => {})

  useEffect(() => {
    analyzeWaveformRef.current = () => {
      if (!analyserRef.current || !isRecording || isPaused) return

      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyserRef.current.getByteFrequencyData(dataArray)

      // Calculate average amplitude (0-1)
      const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255

      setWaveform(prev => {
        const newWaveform = [...prev, average]
        // Keep last 50 samples for visualization
        if (newWaveform.length > 50) {
          return newWaveform.slice(-50)
        }
        return newWaveform
      })

      animationRef.current = requestAnimationFrame(analyzeWaveformRef.current)
    }
  }, [isRecording, isPaused])

  const analyzeWaveform = useCallback(() => {
    analyzeWaveformRef.current()
  }, [])

  const startRecording = useCallback(async () => {
    try {
      setError(null)
      setAudioBlob(null)
      setWaveform([])
      setDuration(0)

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
        setAudioUrl(null)
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: SAMPLE_RATE
        }
      })
      streamRef.current = stream

      // Set up audio analysis
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      // Determine best audio format
      // Prefer webm/opus for smaller files, fallback to mp4/aac or mp3
      let mimeType = 'audio/webm;codecs=opus'
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/mp4'
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/mpeg'
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'audio/webm' // Fallback
          }
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        cleanup()
      }

      mediaRecorder.onerror = () => {
        setError('Recording failed')
        cleanup()
      }

      mediaRecorder.start(100) // Collect data every 100ms
      setIsRecording(true)

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= MAX_DURATION) {
            // Auto-stop at max duration
            mediaRecorderRef.current?.stop()
            setIsRecording(false)
            return prev
          }
          return prev + 0.1
        })
      }, 100)

      // Start waveform analysis
      analyzeWaveform()
    } catch (err) {
      console.error('Failed to start recording:', err)
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Microphone access denied')
      } else {
        setError('Failed to access microphone')
      }
      cleanup()
    }
  }, [audioUrl, cleanup, analyzeWaveform])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)
    }
  }, [isRecording])

  const cancelRecording = useCallback(() => {
    cleanup()
    setIsRecording(false)
    setIsPaused(false)
    setDuration(0)
    setWaveform([])
    setAudioBlob(null)
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
    }
  }, [cleanup, audioUrl])

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause()
      setIsPaused(true)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [isRecording, isPaused])

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume()
      setIsPaused(false)

      // Resume timer
      timerRef.current = setInterval(() => {
        setDuration(prev => {
          if (prev >= MAX_DURATION) {
            mediaRecorderRef.current?.stop()
            setIsRecording(false)
            return prev
          }
          return prev + 0.1
        })
      }, 100)

      // Resume waveform analysis
      analyzeWaveform()
    }
  }, [isRecording, isPaused, analyzeWaveform])

  return [
    { isRecording, isPaused, duration, audioBlob, audioUrl, waveform, error },
    { startRecording, stopRecording, cancelRecording, pauseRecording, resumeRecording }
  ]
}

// Convert recorded blob to File for upload
export function audioToFile(blob: Blob): File {
  // Determine extension from mime type
  const mimeType = blob.type
  let ext = 'webm'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    ext = 'm4a'
  } else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
    ext = 'mp3'
  } else if (mimeType.includes('ogg')) {
    ext = 'ogg'
  }

  return new File([blob], `voice_${Date.now()}.${ext}`, { type: mimeType })
}

// Format duration for display (mm:ss)
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Generate waveform string for NIP-A0 imeta tag (normalized 0-255 values)
export function generateWaveformString(waveform: number[]): string {
  // Normalize to 0-255 and encode as comma-separated values
  return waveform.map(v => Math.round(v * 255)).join(',')
}
