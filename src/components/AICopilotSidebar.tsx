import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Bot,
  User,
  Clock,
  Briefcase,
  AlertCircle,
  ChevronRight,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { askAICopilot, getAIPlatformContext } from "@/lib/db";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AICopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const QUICK_PROMPTS = [
  "How many days will it take to complete each active project?",
  "Who is working on multiple projects right now?",
  "Give me an executive status report on all running projects.",
  "Which developers logged blockers or no-work recently?",
];

export function AICopilotSidebar({ isOpen, onClose }: AICopilotSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "👋 **Hello! I'm your AI Platform Copilot.**\n\nI have complete live knowledge of all projects, developer assignments, remaining timelines, and daily logs across your organization. How can I assist you?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [contextData, setContextData] = useState<any>(null);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      getAIPlatformContext().then((data) => {
        if (data) setContextData(data);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText || input).trim();
    if (!q || loading) return;

    const userMsg: Message = {
      id: String(Date.now()),
      role: "user",
      content: q,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInput("");
    setLoading(true);
    // Keep focus in input immediately so user never loses cursor
    inputRef.current?.focus();

    try {
      const answer = await askAICopilot(q);
      const assistantMsg: Message = {
        id: String(Date.now() + 1),
        role: "assistant",
        content: answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error(err.message || "Copilot failed to respond");
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now() + 1),
          role: "assistant",
          content: "⚠️ **Error**: Could not retrieve live platform intelligence. Please verify your backend connection.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-background/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      {/* Slide-out Panel */}
      <div
        className={cn(
          "relative z-10 flex h-full flex-col border-l border-border bg-card shadow-2xl transition-all duration-200",
          expanded ? "w-full md:w-[700px]" : "w-full sm:w-[460px]"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-elevated/50">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-primary to-purple-400 text-primary-foreground shadow-glow">
              <Sparkles className="size-4.5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-sm font-bold text-foreground">AI Intelligence Copilot</h2>
                <span className="rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-mono text-success uppercase">
                  Live DB
                </span>
              </div>
              <p className="text-eyebrow text-[10px]">Real-time Project & Team Knowledge</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setExpanded(!expanded)}
              className="hidden sm:flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
              title={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            <button
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X className="size-4.5" />
            </button>
          </div>
        </div>

        {/* Live Platform Snapshot Bar */}
        {contextData && (
          <div className="flex items-center justify-around border-b border-border/80 bg-elevated/30 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Briefcase className="size-3.5 text-primary" />
              <span className="text-muted-foreground">Projects:</span>
              <strong className="text-foreground">{contextData.active_projects_count} Active</strong>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-warning" />
              <span className="text-muted-foreground">Tasks:</span>
              <strong className="text-foreground">{contextData.total_tasks} Total</strong>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success animate-pulse" />
              <strong className="text-foreground">{contextData.total_employees} Devs</strong>
            </div>
          </div>
        )}

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex gap-3 text-sm",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-primary/15 text-primary"
                )}
              >
                {msg.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </span>

              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-xs"
                    : "bg-elevated border border-border text-foreground rounded-tl-xs shadow-xs"
                )}
              >
                <div className="prose prose-sm dark:prose-invert max-w-none space-y-2 whitespace-pre-wrap">
                  {msg.content}
                </div>
                <span
                  className={cn(
                    "block text-[10px] mt-1.5",
                    msg.role === "user" ? "text-primary-foreground/60 text-right" : "text-muted-foreground"
                  )}
                >
                  {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 text-sm items-start">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="size-3.5" />
              </span>
              <div className="rounded-2xl rounded-tl-xs border border-border bg-elevated px-4 py-3 shadow-xs">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-primary" />
                  <span>Analyzing live MongoDB state with Gemini...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="px-4 py-2 border-t border-border/60 bg-elevated/20">
          <p className="text-eyebrow text-[9px] mb-1.5 text-muted-foreground">Suggested Inquiries</p>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                disabled={loading}
                className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-elevated transition-colors cursor-pointer text-left truncate max-w-full"
              >
                <ChevronRight className="size-3 text-primary shrink-0" />
                <span className="truncate">{prompt}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="border-t border-border p-4 flex gap-2 bg-card">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={loading ? "Copilot is thinking..." : "Ask about project durations, timelines, team load..."}
            className="flex-1 rounded-xl border border-input bg-elevated px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            autoFocus
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
          >
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
