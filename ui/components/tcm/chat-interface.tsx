"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { MessageBubble, Message, FrameReference } from "./message-bubble";
import { TCMSearchResult } from "@/lib/tcm-db";

interface ChatInterfaceProps {
  onSourceSelect?: (source: TCMSearchResult) => void;
}

export function ChatInterface({ onSourceSelect }: ChatInterfaceProps) {
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const query = input.trim();
    if (!query || isSearching) return;

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
  };

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
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about TCM concepts..."
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
}

