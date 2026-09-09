import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThumbsUp, Meh, ThumbsDown, Send, KeyRound, PartyPopper } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { Button, Modal } from "@/components/ui";

const RATINGS = [
  { id: "love", icon: ThumbsUp, label: "Love it" },
  { id: "meh", icon: Meh, label: "It's okay" },
  { id: "bad", icon: ThumbsDown, label: "Needs work" },
];

export function FeedbackModal() {
  const { feedbackOpen, closeFeedback, unlockVault, navigate, pushToast } = useApp();
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState("love");
  const [sending, setSending] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const submit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const res = await api.sendFeedback(message, rating);
      if (res.unlockToken) {
        setCelebrate(true);
        unlockVault();
        setTimeout(() => {
          setCelebrate(false);
          setMessage("");
          closeFeedback();
          navigate("vault");
        }, 2400);
      } else {
        setMessage("");
        closeFeedback();
        pushToast({ kind: "success", title: "Feedback sent", message: "Thanks for helping shape v2.0" });
      }
    } catch {
      pushToast({ kind: "error", title: "Could not send feedback", message: "Please try again" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={feedbackOpen} onClose={closeFeedback} width="max-w-lg">
      <AnimatePresence mode="wait">
        {celebrate ? (
          <motion.div
            key="celebrate"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="relative flex flex-col items-center gap-4 py-10 text-center"
          >
            {/* secret particles */}
            {Array.from({ length: 14 }).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 0],
                  x: Math.cos((i / 14) * Math.PI * 2) * (70 + (i % 3) * 30),
                  y: Math.sin((i / 14) * Math.PI * 2) * (50 + (i % 4) * 22),
                  scale: [0, 1, 0.6],
                }}
                transition={{ duration: 1.6, delay: i * 0.05, ease: "easeOut" }}
                className={`absolute size-2 rounded-full ${
                  i % 3 === 0 ? "bg-indigo-400" : i % 3 === 1 ? "bg-cyan-300" : "bg-fuchsia-400"
                }`}
              />
            ))}
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 16 }}
              className="grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 shadow-xl shadow-indigo-500/30"
            >
              <KeyRound className="size-8 text-white" />
            </motion.div>
            <div>
              <div className="text-lg font-semibold text-gradient">Secret accepted</div>
              <div className="mt-1 text-sm text-slate-400">
                A hidden <span className="text-indigo-300">Vault</span> has been unlocked in your sidebar.
              </div>
            </div>
            <button
              onClick={() => {
                setCelebrate(false);
                setMessage("");
                closeFeedback();
                navigate("vault");
              }}
              className="btn-gradient focus-ring mt-2 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium"
            >
              <KeyRound className="size-4" />
              Open the Vault
            </button>
            <PartyPopper className="size-5 text-slate-500" />
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-1 text-lg font-semibold tracking-tight">Send feedback</div>
            <p className="mb-5 text-[13px] leading-relaxed text-slate-500">
              Tell us what works, what breaks, or what you dream about. Every message is read.
            </p>

            <div className="mb-4 flex gap-2">
              {RATINGS.map((r) => {
                const Icon = r.icon;
                const active = rating === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setRating(r.id)}
                    className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-[11px] font-medium transition-all duration-200 focus-ring ${
                      active
                        ? "border-indigo-300/40 bg-indigo-400/10 text-indigo-200"
                        : "border-white/[0.08] bg-white/[0.02] text-slate-500 hover:border-white/15 hover:text-slate-300"
                    }`}
                  >
                    <Icon className={`size-4 ${active ? "text-indigo-300" : ""}`} />
                    {r.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Type your thoughts…"
              className="w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-indigo-300/40 focus-ring"
            />

            <div className="mt-5 flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Sent locally · nothing leaves this device</span>
              <Button variant="primary" loading={sending} onClick={submit} icon={<Send className="size-4" />}>
                Send
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
