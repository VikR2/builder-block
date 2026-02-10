"use client";

import { useState, useRef, useEffect, FormEvent, forwardRef, useImperativeHandle, useCallback, KeyboardEvent } from "react";
import { MessageBubble, Message, FrameReference, VideoClip } from "./message-bubble";
import { ChartConfig } from "@/lib/tcm-chart-data";
import { TCMSearchResult } from "@/lib/tcm-db";

interface ChatInterfaceProps {
  onSourceSelect?: (source: TCMSearchResult) => void;
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

export const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(function ChatInterface({ onSourceSelect }, ref) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Welcome to the TCM Knowledge Bot! Ask me anything about TCM trading concepts like:\n\n- What is the Submission Range?\n- How does book building work?\n- Explain order fulfillment\n- What is the matching window?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Debounced fetch for autocomplete suggestions
  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSuggestions([]);
      setShowAutocomplete(false);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const res = await fetch(`/api/tcm/search?q=${encodeURIComponent(query)}&source=skills&limit=5`);
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
  }, []);

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
      // Build message history for context (exclude loading messages)
      const history = messages
        .filter((m) => !m.isLoading && m.id !== "welcome")
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      // Call the chat endpoint
      const response = await fetch("/api/tcm/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: query,
          history,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Chat request failed");
      }

      const responseContent = data.response;
      const sources: TCMSearchResult[] = data.sources || [];
      const frames: FrameReference[] = data.frames || [];
      const chartData: ChartConfig | undefined = data.chartData || undefined;
      const videoClip: VideoClip | undefined = data.videoClip || undefined;

      // Replace loading message with actual response
      setMessages((prev) => {
        const newMessages = prev.filter((m) => !m.isLoading);
        return [
          ...newMessages,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: responseContent,
            timestamp: new Date(),
            sources: sources.slice(0, 5), // Limit sources shown
            frames: frames.slice(0, 3), // Limit frames shown
            chartData,
            videoClip,
          },
        ];
      });
    } catch (error) {
      console.error("Search error:", error);

      // Replace loading with error message
      setMessages((prev) => {
        const newMessages = prev.filter((m) => !m.isLoading);
        return [
          ...newMessages,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content:
              "Sorry, I encountered an error searching the knowledge base. Please try again.",
            timestamp: new Date(),
          },
        ];
      });
    } finally {
      setIsSearching(false);
      inputRef.current?.focus();
    }
  }, [isSearching, messages]);

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
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Welcome to the TCM Knowledge Bot! Ask me anything about TCM trading concepts like:\n\n- What is the Submission Range?\n- How does book building work?\n- Explain order fulfillment\n- What is the matching window?",
        timestamp: new Date(),
      },
    ]);
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
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-gradient-to-br from-accent to-accent/60 flex items-center justify-center">
            <span className="text-accent-foreground font-bold text-sm">TCM</span>
          </div>
          <div>
            <h2 className="font-semibold">TCM Knowledge Bot</h2>
            <p className="text-xs text-muted-foreground">
              Ask about TCM trading concepts
            </p>
          </div>
        </div>
        <button
          onClick={handleNewChat}
          className="px-3 py-1.5 text-sm rounded-md bg-secondary hover:bg-secondary/80 transition-colors"
        >
          New Chat
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
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
      <div className="border-t border-border p-4">
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
            placeholder="Ask about TCM concepts... (type @ for skill suggestions)"
            disabled={isSearching}
            className="flex-1 px-4 py-3 rounded-lg border bg-secondary/50 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isSearching || !input.trim()}
            className="px-4 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Searching skills, documents, and video transcripts
        </p>
      </div>
    </div>
  );
});
