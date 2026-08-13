"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";
import Chatbot from "@/components/Chatbot";

export default function FloatingAiAssistant() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <>
      {/* Global Floating AI Circle Button (Bottom Right) */}
      <button
        onClick={() => setIsChatOpen(!isChatOpen)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 hover:scale-110 cursor-pointer ${
          isChatOpen
            ? "bg-red-600 text-white shadow-red-500/40 rotate-45"
            : "bg-gradient-to-br from-red-600 to-rose-700 text-white shadow-red-500/30 animate-pulse hover:shadow-2xl"
        }`}
        title={isChatOpen ? "Close AI Assistant" : "Ask TimesPrime AI Assistant"}
        aria-label="AI Assistant"
      >
        {isChatOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <Sparkles className="h-6 w-6" />
        )}
      </button>

      {/* Global Floating Chatbot Drawer */}
      <Chatbot
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </>
  );
}
