"use client";

import { useState, useRef, useEffect, FormEvent, forwardRef, useImperativeHandle, useCallback, KeyboardEvent, useMemo } from "react";
import { MessageBubble, Message, FrameReference, VideoClip } from "./message-bubble";
import { ChartConfig } from "@/lib/tcm-chart-data";
import { TCMSearchResult } from "@/lib/tcm-db";
import { useAuth } from "@/lib/auth/context";
import { StructuredCoachBrief } from "@/lib/tcm-coach-brief";
import {
  buildTCMChatSessionKey,
  buildLegacyTCMChatSessionKey,
  migrateLegacyTCMChatSession,
  migrateStoredTCMChatSession,
  readTCMChatSession,
  writeTCMChatSession,
} from "@/lib/tcm-chat-session";

interface ChatInterfaceProps {
  onSourceSelect?: (source: TCMSearchResult) => void;
  preferredVideoId?: string;
  preferredPlaylistId?: number | null;
  preferredTimestamp?: number | null;
  storageNamespace?: string;
  legacyStorageNamespaces?: string[];
  chatMode?: "knowledge" | "lesson";
  title?: string;
  subtitle?: string;
  welcomeMessage?: string;
  placeholder?: string;
  helperText?: string;
  newChatLabel?: string;
}

export interface ChatInterfaceRef {
  submitMessage: (message: string) => void;
  setInputValue: (value: string) => void;
}

interface SkillSuggestion {
  id: number;
  name: string;
  description: string;
}

const DEFAULT_WELCOME_MESSAGE =
  "Welcome to the TCM Knowledge Bot! Ask me anything about TCM trading concepts like:\n\n- What is the Submission Range?\n- How does book building work?\n- Explain order fulfillment\n- What is the matching window?";
const LEGACY_NAMESPACE_SEPARATOR = "\u0001";

export const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(function ChatInterface({
  onSourceSelect,
  preferredVideoId,
  preferredPlaylistId,
  preferredTimestamp,
  storageNamespace = "default",
  legacyStorageNamespaces = [],
  chatMode = "knowledge",
  title = "TCM Knowledge Bot",
  subtitle = "Ask about TCM trading concepts",
  welcomeMessage = DEFAULT_WELCOME_MESSAGE,
  placeholder = "Ask about TCM concepts... (type @ for skill suggestions)",
  helperText = "Searching skills, documents, and video transcripts",
  newChatLabel = "New Chat"
}, ref) {
  const { user, loading: authLoading } = useAuth();
  const createWelcomeMessage = useCallback((): Message => ({
    id: "welcome",
    role: "assistant",
    content: welcomeMessage,
    timestamp: new Date(),
  }), [welcomeMessage]);
  const storageScope = storageNamespace;
  const storageKey = user ? buildTCMChatSessionKey(user.id, storageScope) : null;
  const legacyStorageNamespacesKey = legacyStorageNamespaces.join(LEGACY_NAMESPACE_SEPARATOR);
  const normalizedLegacyStorageNamespaces = useMemo(
    () => legacyStorageNamespacesKey
      ? legacyStorageNamespacesKey.split(LEGACY_NAMESPACE_SEPARATOR).filter(Boolean)
      : [],
    [legacyStorageNamespacesKey]
  );
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: welcomeMessage,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hydratedStorageKeyRef = useRef<string | null>(null);

  // Autocomplete state
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [suggestions, setSuggestions] = useState<SkillSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!storageKey || !user) {
      setMessages([createWelcomeMessage()]);
      setInput("");
      setHasHydratedStorage(false);
      hydratedStorageKeyRef.current = null;
      return;
    }

    const persistedSession = readTCMChatSession(storageKey)
      || normalizedLegacyStorageNamespaces
        .map((namespace) => migrateStoredTCMChatSession({
          fromKey: buildTCMChatSessionKey(user.id, namespace),
          nextKey: storageKey,
          scope: storageScope,
        }))
        .find((session): session is NonNullable<typeof session> => Boolean(session))
      || migrateLegacyTCMChatSession({
        legacyKey: buildLegacyTCMChatSessionKey(storageScope),
        nextKey: storageKey,
        userId: user.id,
        scope: storageScope
      });

    if (!persistedSession || persistedSession.messages.length === 0) {
      setMessages([createWelcomeMessage()]);
      setInput("");
      hydratedStorageKeyRef.current = storageKey;
      setHasHydratedStorage(true);
      return;
    }

    setMessages(
      persistedSession.messages.map((message) => ({
        ...message,
        timestamp: new Date(message.timestamp),
      }))
    );
    setInput(persistedSession.input);
    hydratedStorageKeyRef.current = storageKey;
    setHasHydratedStorage(true);
  }, [authLoading, createWelcomeMessage, normalizedLegacyStorageNamespaces, storageKey, storageScope, user]);

  useEffect(() => {
    if (!storageKey || !user || !hasHydratedStorage || hydratedStorageKeyRef.current !== storageKey) {
      return;
    }

    const messagesToPersist = messages
      .filter((message) => !message.isLoading)
      .map((message) => ({
        ...message,
        timestamp: message.timestamp.toISOString(),
      }));

    writeTCMChatSession(storageKey, {
      userId: String(user.id),
      scope: storageScope,
      messages: messagesToPersist,
      input,
    });
  }, [hasHydratedStorage, input, messages, storageKey, storageScope, user]);

  // Debounced fetch for autocomplete suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowAutocomplete(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const params = new URLSearchParams({
        q: query,
        source: "skills",
        limit: "5",
      });
      if (preferredVideoId) {
        params.set("preferredVideoId", preferredVideoId);
      }
      const res = await fetch(`/api/tcm/search?${params.toString()}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const skillResults = (data.results || [])
        .filter((r: TCMSearchResult) => r.type === 'skill')
        .map((r: TCMSearchResult) => ({
          id: typeof r.id === 'string' ? parseInt(r.id.replace('skill-', '')) : r.id,
          name: r.title,
          description: r.content || '',
        }));
      setSuggestions(skillResults);
      setShowAutocomplete(skillResults.length > 0);
      setSelectedIndex(0);
    } catch (error) {
      console.error('Autocomplete error:', error);
      setSuggestions([]);
      setShowAutocomplete(false);
    } finally {
      setIsLoadingSuggestions(false);
    }
  }, [preferredVideoId]);

  // Handle input changes with autocomplete trigger
  const handleInputChange = useCallback((value: string) => {
    setInput(value);

    // Check for @ trigger
    const atIndex = value.lastIndexOf('@');
    if (atIndex !== -1) {
      const query = value.slice(atIndex + 1);
      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Debounce the fetch
      debounceTimerRef.current = setTimeout(() => {
        fetchSuggestions(query);
      }, 300);
    } else {
      setShowAutocomplete(false);
      setSuggestions([]);
    }
  }, [fetchSuggestions]);

  // Insert selected suggestion
  const insertSuggestion = useCallback((suggestion: SkillSuggestion) => {
    const atIndex = input.lastIndexOf('@');
    if (atIndex !== -1) {
      const newInput = input.slice(0, atIndex) + suggestion.name;
      setInput(newInput);
    } else {
      setInput(suggestion.name);
    }
    setShowAutocomplete(false);
    setSuggestions([]);
    inputRef.current?.focus();
  }, [input]);

  // Handle keyboard navigation for autocomplete
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (!showAutocomplete || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Tab' || (e.key === 'Enter' && showAutocomplete)) {
      if (suggestions[selectedIndex]) {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }
  }, [showAutocomplete, suggestions, selectedIndex, insertSuggestion]);

  const submitMessageInternal = useCallback(async (query: string) => {
    if (!query.trim() || isSearching) return;

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    // Add loading message
    const loadingMessage: Message = {
      id: `loading-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, loadingMessage]);
    setInput("");
    setIsSearching(true);

    try {
      const history = messages
        .filter((m) => !m.isLoading && m.id !== "welcome")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const requestBody = {
        message: query,
        history,
        preferredVideoId,
        preferredPlaylistId,
        preferredTimestamp,
        chatMode,
      };

      const setAssistantState = (updater: (current: Message) => Message) => {
        setMessages((prev) => prev.map((message) => (
          message.id === loadingMessage.id ? updater(message) : message
        )));
      };

      const loadJsonFallback = async () => {
        const response = await fetch("/api/tcm/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Chat request failed");
        }

        setAssistantState((current) => ({
          ...current,
          isLoading: false,
          content: data.response,
          structuredAnswer: data.structuredAnswer as StructuredCoachBrief | undefined,
          sources: (data.sources || []).slice(0, 5),
          frames: (data.frames || []).slice(0, 3),
          chartData: data.chartData || undefined,
          videoClip: data.videoClip || undefined,
          primaryClip: data.primaryClip || undefined,
          recommendedClips: data.recommendedClips || [],
          watchLink: data.watchLink || undefined,
          lessonLink: data.lessonLink || undefined,
          usedLLM: typeof data.usedLLM === "boolean" ? data.usedLLM : undefined,
          fallbackReason: data.fallbackReason || null,
          model: data.model || null,
        }));
      };

      try {
        const response = await fetch("/api/tcm/chat/stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok || !response.body) {
          throw new Error("Streaming chat request failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedContent = "";
        let didFinish = false;
        let streamedMeta: Partial<Message> = {};

        const applyStreamUpdate = () => {
          setAssistantState((current) => ({
            ...current,
            ...streamedMeta,
            content: accumulatedContent,
          }));
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes("\n\n")) {
            const separatorIndex = buffer.indexOf("\n\n");
            const rawEvent = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);

            if (!rawEvent.trim()) continue;

            let eventName = "message";
            let eventData = "";

            for (const line of rawEvent.split("\n")) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                eventData += line.slice(5).trim();
              }
            }

            if (!eventData) continue;
            const parsed = JSON.parse(eventData) as Record<string, unknown>;

            if (eventName === "meta") {
              streamedMeta = {
                structuredAnswer: parsed.structuredAnswer as StructuredCoachBrief | undefined,
                sources: Array.isArray(parsed.sources) ? (parsed.sources as TCMSearchResult[]).slice(0, 5) : [],
                frames: Array.isArray(parsed.frames) ? (parsed.frames as FrameReference[]).slice(0, 3) : [],
                chartData: parsed.chartData as ChartConfig | undefined,
                videoClip: parsed.videoClip as VideoClip | undefined,
                primaryClip: parsed.primaryClip as VideoClip | undefined,
                recommendedClips: Array.isArray(parsed.recommendedClips) ? parsed.recommendedClips as VideoClip[] : [],
                watchLink: typeof parsed.watchLink === "string" ? parsed.watchLink : undefined,
                lessonLink: typeof parsed.lessonLink === "string" ? parsed.lessonLink : undefined,
              };
              applyStreamUpdate();
            } else if (eventName === "token") {
              const delta = typeof parsed.delta === "string" ? parsed.delta : "";
              accumulatedContent += delta;
              applyStreamUpdate();
            } else if (eventName === "done") {
              didFinish = true;
              accumulatedContent = typeof parsed.response === "string" ? parsed.response : accumulatedContent;
              setAssistantState((current) => ({
                ...current,
                ...streamedMeta,
                isLoading: false,
                content: accumulatedContent,
                structuredAnswer: parsed.structuredAnswer as StructuredCoachBrief | undefined || current.structuredAnswer,
                usedLLM: typeof parsed.usedLLM === "boolean" ? parsed.usedLLM : undefined,
                fallbackReason: parsed.fallbackReason === "provider_unavailable" || parsed.fallbackReason === "generation_failed"
                  ? parsed.fallbackReason
                  : null,
                model: typeof parsed.model === "string" ? parsed.model : null,
              }));
            } else if (eventName === "error") {
              throw new Error(typeof parsed.error === "string" ? parsed.error : "Streaming response failed");
            }
          }
        }

        if (!didFinish) {
          setAssistantState((current) => ({
            ...current,
            ...streamedMeta,
            isLoading: false,
            content: accumulatedContent || current.content,
          }));
        }
      } catch (streamError) {
        console.warn("Streaming chat failed, falling back to JSON:", streamError);
        await loadJsonFallback();
      }
    } catch (error) {
      console.error("Search error:", error);

      setMessages((prev) => prev.map((message) => (
        message.id === loadingMessage.id
          ? {
              ...message,
              isLoading: false,
              content: "Sorry, I encountered an error searching the knowledge base. Please try again.",
            }
          : message
      )));
    } finally {
      setIsSearching(false);
      inputRef.current?.focus();
    }
  }, [chatMode, isSearching, messages, preferredPlaylistId, preferredTimestamp, preferredVideoId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShowAutocomplete(false);
    await submitMessageInternal(input.trim());
  };

  // Expose imperative handle for parent components
  useImperativeHandle(ref, () => ({
    submitMessage: (message: string) => {
      submitMessageInternal(message);
    },
    setInputValue: (value: string) => {
      setInput(value);
      inputRef.current?.focus();
    },
  }), [submitMessageInternal]);

  const handleNewChat = () => {
    setMessages([createWelcomeMessage()]);
    setInput("");
    setShowAutocomplete(false);
    inputRef.current?.focus();
  };

  const handleSourceClick = (source: TCMSearchResult) => {
    onSourceSelect?.(source);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/70 bg-background/60">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center shadow-sm">
            <span className="text-accent-foreground font-bold text-sm">TCM</span>
          </div>
          <div>
            <h2 className="font-semibold tracking-tight">{title}</h2>
            <p className="max-w-xl text-xs text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>
        <button
          onClick={handleNewChat}
          className="px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
        >
          {newChatLabel}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gradient-to-b from-background to-background/95 p-4 md:p-5">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onSourceClick={handleSourceClick}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border/70 bg-background/80 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 relative">
          {/* Autocomplete Dropdown */}
          {showAutocomplete && suggestions.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 right-12 bg-card border border-border rounded-lg shadow-lg z-10 overflow-hidden">
              {isLoadingSuggestions ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">Loading...</div>
              ) : (
                suggestions.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`w-full px-3 py-2 text-left text-sm hover:bg-secondary/80 transition-colors ${
                      i === selectedIndex ? 'bg-amber-500/20 text-amber-500' : 'text-foreground'
                    }`}
                    onClick={() => insertSuggestion(s)}
                    onMouseEnter={() => setSelectedIndex(i)}
                  >
                    <div className="font-medium">{s.name}</div>
                    {s.description && (
                      <div className="text-xs text-muted-foreground truncate">{s.description}</div>
                    )}
                  </button>
                ))
              )}
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border bg-secondary/30">
                <kbd className="px-1 py-0.5 rounded bg-secondary text-[10px]">Tab</kbd> or <kbd className="px-1 py-0.5 rounded bg-secondary text-[10px]">Enter</kbd> to select
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isSearching}
            className="flex-1 px-4 py-3 rounded-xl border bg-secondary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSearching || !input.trim()}
            className="px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14 5l7 7m0 0l-7 7m7-7H3"
              />
            </svg>
          </button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">
          {helperText}
        </p>
      </div>
    </div>
  );
});
