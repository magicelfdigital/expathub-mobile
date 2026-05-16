import { useState } from "react";

import {
  trackLead,
  trackQuizSaveDismissed,
  trackQuizSaveSubmitted,
} from "@/lib/pixel";

type Props = {
  visible: boolean;
  noCount: number;
  onClose: () => void;
  onContinue: () => void;
};

// Web counterpart to `src/components/QuizSaveModal.tsx`. Same trigger thresholds
// and copy as the mobile modal so the recovery prompt feels consistent across
// surfaces. The submit path writes a `quiz_leads` row with
// `source: "web_funnel_save"` so the existing welcome-email sequence picks it
// up exactly the same way it does for the email gate.
export function QuizSaveModal({ visible, noCount, onClose, onContinue }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  function reset() {
    setEmail("");
    setSubmitted(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/quiz-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          // The endpoint validates `tier` is set, so use the same blocker tier
          // mobile sends for save-prompt leads.
          tier: "quiz_save_blockers",
          score: noCount,
          risks: ["soft_save_after_q5"],
          source: "web_funnel_save",
        }),
      });
      if (!res.ok) throw new Error("Could not save right now.");
      trackQuizSaveSubmitted({ noCount });
      // Mid-funnel Meta signal so App Promotion / Conversions campaigns can
      // optimise against email captures from the save-your-progress modal,
      // not just the post-result email gate. Source tag distinguishes this
      // from `Lead` calls on /start (`source: "readiness_quiz"`).
      trackLead({ source: "quiz_save", noCount });
      setSubmitted(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    trackQuizSaveDismissed({ noCount, submitted });
    reset();
    onClose();
  }

  function handleContinue() {
    reset();
    onContinue();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="quiz-save-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
    >
      <div className="card relative w-full max-w-md p-6 sm:p-7">
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          data-testid="quiz-save-close"
          className="absolute right-3 top-3 rounded-full p-1.5 text-[var(--color-ink-muted)] hover:bg-black/5"
        >
          <span aria-hidden className="block text-xl leading-none">×</span>
        </button>

        {submitted ? (
          <div data-testid="quiz-save-success">
            <h2 className="font-display text-2xl">Check your inbox</h2>
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              We'll send your blocker breakdown and starter guide shortly. Want
              to keep going for your full match?
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                className="btn-primary"
                onClick={handleContinue}
                data-testid="quiz-save-continue"
              >
                See my match
              </button>
              <button
                type="button"
                className="text-sm text-[var(--color-ink-muted)] underline"
                onClick={handleClose}
              >
                I'll come back later
              </button>
            </div>
          </div>
        ) : (
          <div data-testid="quiz-save-form">
            <h2 className="font-display text-2xl">Save your progress</h2>
            <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
              You've identified {noCount} blockers so far. Drop your email and
              we'll send your personalised starter guide — no account required.
            </p>
            <form onSubmit={handleSubmit} className="mt-5 space-y-3">
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                data-testid="quiz-save-email"
                className="w-full rounded-lg border bg-white px-4 py-3 text-base outline-none focus:border-[var(--color-primary)]"
                style={{ borderColor: "var(--color-border)" }}
              />
              {error ? (
                <div
                  data-testid="quiz-save-error"
                  className="text-sm text-red-600"
                >
                  {error}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                data-testid="quiz-save-submit"
                className="w-full rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-60"
                style={{ background: "var(--color-primary)", color: "white" }}
              >
                {busy ? "Sending…" : "Email me my starter guide"}
              </button>
            </form>
            <button
              type="button"
              onClick={handleContinue}
              data-testid="quiz-save-skip"
              className="mt-3 w-full text-sm text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
            >
              No thanks, keep going
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
