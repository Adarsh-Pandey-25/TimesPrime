"use client";

import { useState, useRef, useEffect } from "react";
import { Bot, Send, X, Sparkles, User, RefreshCw } from "lucide-react";
import { ChatMessage } from "@/types";

interface ChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Chatbot({ isOpen, onClose }: ChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "ai",
      text: "Hello! I'm your TimesPrime AI News Assistant. Ask me to summarize top headlines, explain news topics, or suggest articles!",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: input,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const aiMsgId = (Date.now() + 1).toString();
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ message: userMsg.text }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (!res.body) {
        throw new Error("No response body from server.");
      }

      // Insert an empty AI bubble, then fill it in as text streams in.
      setMessages((prev) => [...prev, { id: aiMsgId, sender: "ai", text: "", timestamp }]);
      setLoading(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) => (m.id === aiMsgId ? { ...m, text: fullText } : m))
        );
      }

      if (!fullText.trim()) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, text: "I'm having trouble processing that request right now." } : m
          )
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown network error";
      setMessages((prev) => {
        const already = prev.some((m) => m.id === aiMsgId);
        const errorText = `Sorry, that request failed: ${reason}`;
        return already
          ? prev.map((m) => (m.id === aiMsgId ? { ...m, text: errorText } : m))
          : [...prev, { id: aiMsgId, sender: "ai", text: errorText, timestamp }];
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[500px] w-[90vw] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl backdrop-blur-xl transition-all animate-in fade-in slide-in-from-bottom-5">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex items-center space-x-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">TimesPrime AI</h3>
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              Online Assistant
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`flex max-w-[82%] items-start space-x-2 rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm ${
                msg.sender === "user"
                  ? "bg-red-600 text-white rounded-br-none shadow-sm"
                  : "bg-white text-slate-800 border border-slate-200 shadow-xs rounded-bl-none"
              }`}
            >
              <div className="space-y-1">
                <p className="leading-relaxed">{msg.text}</p>
                <span className="block text-[9px] opacity-70 text-right">
                  {msg.timestamp}
                </span>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="flex items-center space-x-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-xs">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-red-600" />
              <span>AI is thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-center space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask AI news assistant..."
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-red-600 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white transition-colors hover:bg-red-700 disabled:opacity-50 shadow-sm"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
