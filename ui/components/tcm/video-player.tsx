"use client";

import { useRef, useState, useEffect, useCallback } from 'react';
import { VideoClipInfo, formatTimeSeconds, getVideoFilePath } from '@/lib/tcm-video-clips';

interface VideoPlayerProps {
  clip: VideoClipInfo;
  autoPlay?: boolean;
  className?: string;
  onTimeUpdate?: (currentTime: number) => void;
  defaultMode?: PlaybackMode;
  hideHeader?: boolean;
  seekTo?: number;  // When this changes, seek to this timestamp
  theaterMode?: boolean;  // When true, video fills parent container height
  debug?: boolean;  // Show debug overlay with state info
}

// Debug logging helper - only logs in development or when debug=true
const DEBUG_ENABLED = process.env.NODE_ENV === 'development';
function debugLog(component: string, action: string, data?: Record<string, unknown>) {
  if (DEBUG_ENABLED) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    console.log(`[${timestamp}] [${component}] ${action}`, data ? JSON.stringify(data) : '');
  }
}

type PlaybackMode = 'clip' | 'full';
type PlaybackSpeed = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;

const PLAYBACK_SPEEDS: PlaybackSpeed[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function VideoPlayer({
  clip,
  autoPlay = false,
  className = '',
  onTimeUpdate: onTimeUpdateCallback,
  defaultMode = 'clip',
  hideHeader = false,
  seekTo,
  theaterMode = false,
  debug = false
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isPlayingRef = useRef(false);

  // Core state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(clip.startTime);
  const [fullDuration, setFullDuration] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Mode state
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(defaultMode);

  // Control state
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Hover state for progress bar
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverPosition, setHoverPosition] = useState<number>(0);

  // Derived values
  // In full mode, use fullDuration if available, otherwise fall back to clip.endTime
  // This ensures controls work before video metadata fully loads
  const effectiveStart = playbackMode === 'clip' ? clip.startTime : 0;
  const effectiveEnd = playbackMode === 'clip' ? clip.endTime : (fullDuration > 0 ? fullDuration : clip.endTime);
  const effectiveDuration = effectiveEnd - effectiveStart;

  // Progress calculation
  const progress = effectiveDuration > 0
    ? ((currentTime - effectiveStart) / effectiveDuration) * 100
    : 0;

  // Clip position in full video (for timeline indicator)
  const clipStartPercent = fullDuration > 0 ? (clip.startTime / fullDuration) * 100 : 0;
  const clipEndPercent = fullDuration > 0 ? (clip.endTime / fullDuration) * 100 : 100;

  // Keep ref in sync with state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    debugLog('VideoPlayer', 'isPlaying changed', { isPlaying });
  }, [isPlaying]);

  // Debug: Log controlsVisible changes
  useEffect(() => {
    debugLog('VideoPlayer', 'controlsVisible changed', { controlsVisible, isPlaying: isPlayingRef.current });
  }, [controlsVisible]);

  // Reset controls visibility on user interaction
  const showControls = useCallback(() => {
    debugLog('VideoPlayer', 'showControls called', {
      isPlayingRef: isPlayingRef.current,
      currentControlsVisible: controlsVisible
    });
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      debugLog('VideoPlayer', 'Cleared existing timeout');
    }
    // Use ref to get current isPlaying value to avoid stale closure
    if (isPlayingRef.current) {
      debugLog('VideoPlayer', 'Setting 3s hide timeout (video is playing)');
      controlsTimeoutRef.current = setTimeout(() => {
        debugLog('VideoPlayer', 'Timeout fired - hiding controls');
        setControlsVisible(false);
      }, 3000);
    } else {
      debugLog('VideoPlayer', 'No timeout set (video is paused)');
    }
  }, [controlsVisible]); // Include controlsVisible for logging only

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      debugLog('VideoPlayer', 'loadedmetadata', {
        duration: video.duration,
        clipStartTime: clip.startTime,
        clipEndTime: clip.endTime,
        videoId: clip.videoId
      });
      video.currentTime = clip.startTime;
      setFullDuration(video.duration);
      setIsLoading(false);
    };

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);

      // Call external callback if provided
      if (onTimeUpdateCallback) {
        onTimeUpdateCallback(time);
      }

      // Only enforce boundaries in clip mode
      if (playbackMode === 'clip' && time >= clip.endTime) {
        debugLog('VideoPlayer', 'clip boundary reached', {
          currentTime: time,
          clipEndTime: clip.endTime,
          action: 'pausing and resetting to start'
        });
        video.pause();
        video.currentTime = clip.startTime;
        setIsPlaying(false);
      }
    };

    const handlePlay = () => {
      debugLog('VideoPlayer', 'play event', {
        currentTime: video.currentTime,
        playbackMode,
        effectiveStart,
        effectiveEnd
      });
      setIsPlaying(true);
      showControls();
    };

    const handlePause = () => {
      debugLog('VideoPlayer', 'pause event', {
        currentTime: video.currentTime,
        willShowControls: true
      });
      setIsPlaying(false);
      setControlsVisible(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        debugLog('VideoPlayer', 'cleared hide timeout on pause');
      }
    };

    const handleError = () => {
      debugLog('VideoPlayer', 'ERROR', {
        videoId: clip.videoId,
        error: video.error?.message || 'unknown error',
        code: video.error?.code
      });
      setHasError(true);
      setIsLoading(false);
    };

    const handleEnded = () => {
      debugLog('VideoPlayer', 'ended event', {
        playbackMode,
        willPause: playbackMode === 'full'
      });
      if (playbackMode === 'full') {
        setIsPlaying(false);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('error', handleError);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('error', handleError);
      video.removeEventListener('ended', handleEnded);
    };
  }, [clip.startTime, clip.endTime, playbackMode, showControls, onTimeUpdateCallback]);

  // Auto-play if enabled
  useEffect(() => {
    if (autoPlay && videoRef.current && !isLoading) {
      videoRef.current.play().catch(() => {
        // Autoplay blocked by browser
      });
    }
  }, [autoPlay, isLoading]);

  // Sync volume and playback rate
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = isMuted ? 0 : volume;
      video.playbackRate = playbackSpeed;
    }
  }, [volume, isMuted, playbackSpeed]);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle external seek requests
  useEffect(() => {
    if (seekTo !== undefined && videoRef.current) {
      videoRef.current.currentTime = seekTo;
      showControls();
    }
  }, [seekTo, showControls]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if this player container or its children have focus
      if (!containerRef.current?.contains(document.activeElement) &&
          document.activeElement !== document.body) {
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          seekRelative(-5);
          break;
        case 'arrowright':
          e.preventDefault();
          seekRelative(5);
          break;
        case 'm':
          e.preventDefault();
          setIsMuted(m => !m);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'escape':
          if (isFullscreen) {
            e.preventDefault();
            document.exitFullscreen();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    debugLog('VideoPlayer', 'togglePlay called', {
      isPlaying,
      currentTime: video.currentTime,
      playbackMode,
      effectiveStart,
      effectiveEnd,
      effectiveDuration
    });

    if (isPlaying) {
      video.pause();
    } else {
      // In clip mode, start from beginning if at the end
      if (playbackMode === 'clip' && video.currentTime >= clip.endTime - 0.5) {
        debugLog('VideoPlayer', 'resetting to clip start (was at end)');
        video.currentTime = clip.startTime;
      }
      // In full mode, restart if at the very end
      if (playbackMode === 'full' && video.currentTime >= fullDuration - 0.5) {
        debugLog('VideoPlayer', 'resetting to 0 (was at end in full mode)');
        video.currentTime = 0;
      }
      video.play();
    }
  };

  const seekRelative = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;

    const oldTime = video.currentTime;
    let newTime = video.currentTime + seconds;

    // Clamp to effective boundaries
    newTime = Math.max(effectiveStart, Math.min(effectiveEnd, newTime));

    debugLog('VideoPlayer', 'seekRelative', {
      seconds,
      oldTime,
      newTime,
      effectiveStart,
      effectiveEnd,
      clamped: newTime !== oldTime + seconds
    });

    video.currentTime = newTime;
    showControls();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const seekTime = effectiveStart + parseFloat(e.target.value);
    debugLog('VideoPlayer', 'handleSeek (range input)', {
      inputValue: e.target.value,
      seekTime,
      effectiveStart
    });
    video.currentTime = seekTime;
    showControls();
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const seekTime = effectiveStart + (percent * effectiveDuration);
    const clampedTime = Math.max(effectiveStart, Math.min(effectiveEnd, seekTime));

    debugLog('VideoPlayer', 'progressBarClick', {
      clickX: e.clientX,
      rectLeft: rect.left,
      rectWidth: rect.width,
      percent,
      seekTime,
      clampedTime,
      effectiveStart,
      effectiveEnd,
      effectiveDuration
    });

    video.currentTime = clampedTime;
    showControls();
  };

  const jumpToClipStart = () => {
    const video = videoRef.current;
    if (!video) return;
    debugLog('VideoPlayer', 'jumpToClipStart', {
      clipStartTime: clip.startTime,
      previousTime: video.currentTime
    });
    video.currentTime = clip.startTime;
    setPlaybackMode('clip');
    showControls();
  };

  const jumpToClipEnd = () => {
    const video = videoRef.current;
    if (!video) return;
    debugLog('VideoPlayer', 'jumpToClipEnd', {
      clipEndTime: clip.endTime,
      previousTime: video.currentTime
    });
    video.currentTime = clip.endTime;
    showControls();
  };

  const handleModeChange = (mode: PlaybackMode) => {
    const video = videoRef.current;
    if (!video) return;

    debugLog('VideoPlayer', 'modeChange', {
      previousMode: playbackMode,
      newMode: mode,
      currentTime: video.currentTime,
      clipStart: clip.startTime,
      clipEnd: clip.endTime,
      willJumpToClipStart: mode === 'clip' && (video.currentTime < clip.startTime || video.currentTime > clip.endTime)
    });

    setPlaybackMode(mode);

    // When switching to clip mode, jump to clip start if outside clip
    if (mode === 'clip') {
      if (video.currentTime < clip.startTime || video.currentTime > clip.endTime) {
        video.currentTime = clip.startTime;
      }
    }
    showControls();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (isFullscreen) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
      }
    } catch (err) {
      // Fullscreen not supported
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0) setIsMuted(false);
  };

  const handleProgressBarHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const previewTime = effectiveStart + (percent * effectiveDuration);
    setHoverTime(previewTime);
    setHoverPosition(e.clientX - rect.left);
  };

  const handleProgressBarLeave = () => {
    setHoverTime(null);
  };

  if (hasError) {
    return (
      <div className={`rounded-lg overflow-hidden border border-border/50 bg-card ${className}`}>
        <div className="flex items-center justify-center h-48 text-muted-foreground">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">Video not available</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`flex flex-col ${theaterMode ? '' : 'rounded-lg border border-border/50'} overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : ''} ${className}`}
      onMouseMove={showControls}
      onMouseLeave={() => isPlaying && setControlsVisible(false)}
      tabIndex={0}
    >
      {/* Header */}
      {!hideHeader && (
        <div
          className={`flex items-center justify-between px-3 py-2 bg-background/50 border-b border-border/30 transition-opacity duration-300 ${!controlsVisible && isPlaying ? 'opacity-0' : 'opacity-100'}`}
          onMouseMove={showControls}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium truncate max-w-[200px]">{clip.videoTitle}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Toggle */}
            <div className="flex items-center bg-background/50 rounded-full p-0.5">
              <button
                onClick={() => handleModeChange('clip')}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
                  playbackMode === 'clip'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                Clip
              </button>
              <button
                onClick={() => handleModeChange('full')}
                className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${
                  playbackMode === 'full'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary'
                }`}
              >
                Full
              </button>
            </div>

            {/* Expand button */}
            {!isFullscreen && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 rounded hover:bg-background transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Video Container - flex-1 to take remaining space in flexbox layout */}
      <div className="relative bg-black flex-1 min-h-0" onMouseMove={showControls} onClick={togglePlay}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <video
          ref={videoRef}
          src={getVideoFilePath(clip.videoId)}
          className={`w-full cursor-pointer ${
            isFullscreen
              ? 'h-screen'
              : theaterMode
                ? 'h-full'  // Fill parent container in theater mode
                : isExpanded
                  ? 'max-h-[600px]'
                  : 'max-h-[300px]'
          } object-contain`}
          playsInline
          preload="metadata"
        />

        {/* Large play button overlay */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
            isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100 bg-black/20'
          }`}
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center hover:scale-110 transition-transform shadow-lg">
            <svg className="w-8 h-8 text-black ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>

        {/* Clip context badge (in full mode) */}
        {playbackMode === 'full' && (
          <div className={`absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm border border-yellow-500/30 transition-opacity duration-300 ${!controlsVisible && isPlaying ? 'opacity-0' : 'opacity-100'}`} onClick={(e) => e.stopPropagation()}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
            </span>
            <span className="text-xs text-white/90 font-medium">
              Clip: {formatTimeSeconds(clip.startTime)} - {formatTimeSeconds(clip.endTime)}
            </span>
            <button
              onClick={jumpToClipStart}
              className="text-xs text-yellow-400 hover:text-yellow-300 font-medium transition-colors"
            >
              Jump
            </button>
          </div>
        )}

        {/* Progress bar overlay - ALWAYS VISIBLE */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-6 bg-gradient-to-t from-black/60 to-transparent" onClick={(e) => e.stopPropagation()}>
          <div
            ref={progressBarRef}
            className="relative h-1 group cursor-pointer"
            onClick={handleProgressBarClick}
            onMouseMove={handleProgressBarHover}
            onMouseLeave={handleProgressBarLeave}
          >
            {/* Background track */}
            <div className="absolute inset-0 h-1 group-hover:h-1.5 transition-all bg-white/30 rounded-full" />

            {/* Clip region indicator (in full mode) */}
            {playbackMode === 'full' && (
              <div
                className="absolute h-1 group-hover:h-1.5 transition-all bg-yellow-500/40 rounded-full"
                style={{ left: `${clipStartPercent}%`, width: `${clipEndPercent - clipStartPercent}%` }}
              />
            )}

            {/* Progress fill */}
            <div
              className="absolute h-1 group-hover:h-1.5 transition-all bg-red-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />

            {/* Scrubber thumb - appears on hover */}
            <div
              className="absolute top-1/2 w-3.5 h-3.5 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-md pointer-events-none"
              style={{ left: `${progress}%`, transform: 'translate(-50%, -50%)' }}
            />

            {/* Clip boundary markers (in full mode) */}
            {playbackMode === 'full' && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); jumpToClipStart(); }}
                  className="absolute top-1/2 w-2 h-4 bg-yellow-500 rounded-sm hover:bg-yellow-400 transition-colors cursor-pointer z-10"
                  style={{ left: `${clipStartPercent}%`, transform: 'translate(-50%, -50%)' }}
                  title="Clip start"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); jumpToClipEnd(); }}
                  className="absolute top-1/2 w-2 h-4 bg-yellow-500 rounded-sm hover:bg-yellow-400 transition-colors cursor-pointer z-10"
                  style={{ left: `${clipEndPercent}%`, transform: 'translate(-50%, -50%)' }}
                  title="Clip end"
                />
              </>
            )}

            {/* Time preview tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-8 px-2 py-1 bg-black/90 rounded text-xs text-white font-mono pointer-events-none whitespace-nowrap z-20"
                style={{ left: `${hoverPosition}px`, transform: 'translateX(-50%)' }}
              >
                {formatTimeSeconds(hoverTime)}
              </div>
            )}
          </div>
        </div>

        {/* Debug Overlay - shows when debug prop is true */}
        {debug && (
          <div
            className="absolute top-3 right-3 p-2 bg-black/80 backdrop-blur-sm rounded text-xs font-mono text-white z-30 max-w-[200px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-bold text-yellow-400 mb-1">DEBUG</div>
            <div className={`${controlsVisible ? 'text-green-400' : 'text-red-400'}`}>
              controls: {controlsVisible ? 'VISIBLE' : 'HIDDEN'}
            </div>
            <div className={`${isPlaying ? 'text-green-400' : 'text-yellow-400'}`}>
              playing: {isPlaying ? 'YES' : 'NO'}
            </div>
            <div>mode: {playbackMode}</div>
            <div>time: {formatTimeSeconds(currentTime)}</div>
            <div>effStart: {effectiveStart.toFixed(1)}</div>
            <div>effEnd: {effectiveEnd.toFixed(1)}</div>
            <div>duration: {effectiveDuration.toFixed(1)}</div>
            <div>progress: {progress.toFixed(1)}%</div>
            <div className="text-gray-400 text-[10px] mt-1">
              Check console for detailed logs
            </div>
          </div>
        )}
      </div>

      {/* Button Controls - FADE when playing, flex-shrink-0 to prevent being hidden */}
      <div
        data-testid="video-controls"
        data-controls-visible={controlsVisible}
        data-is-playing={isPlaying}
        className={`px-3 py-2 bg-zinc-800 border-t border-zinc-600 transition-opacity duration-300 min-h-[52px] flex-shrink-0 ${!controlsVisible && isPlaying ? 'opacity-0' : 'opacity-100'}`}
        onMouseMove={showControls}
      >
        <div className="flex items-center gap-2 text-white">
          {/* Play/Pause button */}
          <button
            onClick={togglePlay}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Skip Back 10s */}
          <button
            onClick={() => seekRelative(-10)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Back 10 seconds (←)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.5 3C17.15 3 21.08 6.03 22.47 10.22L20.1 11C19.05 7.81 16.04 5.5 12.5 5.5C10.54 5.5 8.77 6.22 7.38 7.38L10 10H3V3L5.6 5.6C7.45 4 9.85 3 12.5 3M10 12V22H8V14H6V12H10M18 14V20C18 21.11 17.11 22 16 22H14C12.9 22 12 21.1 12 20V14C12 12.9 12.9 12 14 12H16C17.11 12 18 12.9 18 14M14 14V20H16V14H14Z"/>
            </svg>
          </button>

          {/* Skip Forward 10s */}
          <button
            onClick={() => seekRelative(10)}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Forward 10 seconds (→)"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 3C4.85 3 0.92 6.03 -0.47 10.22L1.9 11C2.95 7.81 5.96 5.5 9.5 5.5C11.46 5.5 13.23 6.22 14.62 7.38L12 10H19V3L16.4 5.6C14.55 4 12.15 3 9.5 3H10M10 12V22H8V14H6V12H10M18 14V20C18 21.11 17.11 22 16 22H14C12.9 22 12 21.1 12 20V14C12 12.9 12.9 12 14 12H16C17.11 12 18 12.9 18 14M14 14V20H16V14H14Z"/>
            </svg>
          </button>

          {/* Volume control */}
          <div
            className="relative flex items-center"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              onClick={() => setIsMuted(m => !m)}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted || volume === 0 ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : volume < 0.5 ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
              )}
            </button>

            {/* Volume slider */}
            <div className={`overflow-hidden transition-all duration-200 ${showVolumeSlider ? 'w-20 ml-1' : 'w-0'}`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-full h-1 bg-border rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>

          {/* Time display */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <span>{formatTimeSeconds(currentTime - effectiveStart)}</span>
            <span>/</span>
            <span>{formatTimeSeconds(effectiveDuration)}</span>
          </div>

          <div className="flex-1" />

          {/* Playback speed */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(m => !m)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-sm font-medium rounded bg-white/10 hover:bg-white/20 transition-colors"
              title="Playback speed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
              <span>{playbackSpeed}x</span>
            </button>

            {showSpeedMenu && (
              <div className="absolute bottom-full right-0 mb-2 py-1 bg-black/95 border border-white/20 rounded-lg shadow-xl z-20 min-w-[80px]">
                {PLAYBACK_SPEEDS.map(speed => (
                  <button
                    key={speed}
                    onClick={() => {
                      setPlaybackSpeed(speed);
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full px-4 py-1.5 text-sm text-left hover:bg-white/10 transition-colors ${
                      playbackSpeed === speed ? 'text-red-500 font-semibold' : 'text-white'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (F)'}
          >
            {isFullscreen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            )}
          </button>
        </div>

        {/* Keyboard hints (shown in fullscreen) */}
        {isFullscreen && controlsVisible && (
          <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>Space: Play/Pause</span>
            <span>←/→: Seek</span>
            <span>M: Mute</span>
            <span>F: Fullscreen</span>
            <span>Esc: Exit</span>
          </div>
        )}
      </div>

      {/* Description */}
      {clip.description && !isFullscreen && (
        <div className="px-3 py-2 bg-background/20 border-t border-border/30">
          <p className="text-xs text-muted-foreground">{clip.description}</p>
        </div>
      )}
    </div>
  );
}

// Button component to show "Watch explanation" that opens video
interface WatchExplanationButtonProps {
  clip: VideoClipInfo;
  onWatch: () => void;
}

export function WatchExplanationButton({ clip, onWatch }: WatchExplanationButtonProps) {
  return (
    <button
      onClick={onWatch}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 text-yellow-600 text-sm transition-colors"
    >
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z" />
      </svg>
      <span>Watch explanation</span>
      <span className="text-xs opacity-75">
        ({formatTimeSeconds(clip.startTime)} - {formatTimeSeconds(clip.endTime)})
      </span>
    </button>
  );
}

// Modal for fullscreen video
interface VideoModalProps {
  clip: VideoClipInfo;
  isOpen: boolean;
  onClose: () => void;
}

export function VideoModal({ clip, isOpen, onClose }: VideoModalProps) {
  // Handle Escape key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button with keyboard hint */}
        <div className="absolute -top-10 right-0 flex items-center gap-2">
          <span className="text-xs text-white/50">Press Esc to close</span>
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <VideoPlayer clip={clip} autoPlay />
      </div>
    </div>
  );
}
