"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@timesprime/ui/ThemeContext";

/**
 * askTimesPrime: a question about the article on screen, answered by /api/chat with the article's
 * title and description as context (F-013: a failure is reported, never answered). Moved out of
 * ArticleDetailView unchanged, so the AI chat switch (B-06) can show or hide it on its own.
 */
export default function AskAboutArticle({ title, description }: { title: string; description?: string }) {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAiAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;

    setAiLoading(true);
    setAiResponse(null);
    setAiError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: aiQuestion,
          articleContext: {
            title,
            description,
          },
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `AI query failed with status ${res.status}`);
      }
      if (!res.body) {
        throw new Error("No response body from server.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setAiResponse(fullText);
      }

      // F-013: a failure is reported as one, as the chatbot does. It used to
      // be answered with a made-up "Key Takeaway" shown as the AI's answer.
      if (!fullText.trim()) {
        setAiResponse(null);
        setAiError(
          language === "hi"
            ? "अभी इस अनुरोध को संसाधित करने में समस्या हो रही है।"
            : "I'm having trouble processing that request right now."
        );
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "unknown network error";
      console.error("askTimesPrime failed:", reason);
      setAiResponse(null);
      setAiError(language === "hi" ? `क्षमा करें, अनुरोध विफल रहा: ${reason}` : `Sorry, that request failed: ${reason}`);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className={`rounded-2xl border p-3.5 shadow-sm space-y-3 ${
      isDark
        ? "border-[#383d45] bg-[#25282d] text-white"
        : "border-slate-200 bg-white text-slate-900"
    }`}>
      <div className="flex items-center space-x-1.5 text-red-500 font-serif font-black text-xs uppercase tracking-wider">
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500" />
        </span>
        <Sparkles className="h-3.5 w-3.5 text-red-500" />
        <span>askTimesPrime</span>
      </div>
      <form onSubmit={handleAiAsk} className="relative flex items-center">
        <input
          type="text"
          value={aiQuestion}
          onChange={(e) => setAiQuestion(e.target.value)}
          placeholder={language === "hi" ? "इस लेख के बारे में कुछ भी पूछें..." : "Ask anything about this article..."}
          className={`w-full rounded-xl border py-2 pl-3 pr-9 text-[11px] font-medium focus:outline-none transition-colors ${
            isDark
              ? "border-[#383d45] bg-[#1f2226] text-white placeholder-slate-500 focus:border-red-500"
              : "border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-red-600"
          }`}
        />
        <button
          type="submit"
          disabled={aiLoading}
          className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-xs"
        >
          {aiLoading ? (
            <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <ArrowRight className="h-3 w-3" />
          )}
        </button>
      </form>
      {aiResponse && (
        <div className={`rounded-lg border p-3 text-[11px] leading-relaxed animate-in fade-in ${
          isDark
            ? "border-red-900/50 bg-[#1a1c1e] text-slate-200"
            : "border-red-200 bg-red-50 text-slate-700"
        }`}>
          <span className="font-bold text-red-500 block mb-1">
            {language === "hi" ? "एआई उत्तर:" : "AI Answer:"}
          </span>
          {aiResponse}
        </div>
      )}
      {aiError && (
        <div role="alert" className={`rounded-lg border p-3 text-[11px] leading-relaxed animate-in fade-in ${
          isDark
            ? "border-red-900/50 bg-[#1a1c1e] text-red-300"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {aiError}
        </div>
      )}
    </div>
  );
}
