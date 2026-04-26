import { useEffect, useRef, useState } from "react";
import { trackInitiateCheckout, trackLead } from "@/lib/pixel";

export default function Start() {
  const firedRef = useRef(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    trackInitiateCheckout({ funnel: "readiness_quiz" });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/readiness-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Something went wrong");
      }
      trackLead({ funnel: "readiness_quiz" });
      setSubmitted(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      data-testid="page-start"
      className="container-page py-10 sm:py-16"
    >
      <h1 className="font-display text-4xl">Take the readiness quiz</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
        The full web quiz lands in a follow-up task. In the meantime, drop your
        email and we'll send your personalised Decision Brief the moment it's ready.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 flex max-w-md flex-col gap-3"
        data-testid="form-readiness-lead"
      >
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitting || submitted}
          className="rounded-lg border border-[var(--color-ink-muted)] bg-white px-4 py-3 text-base outline-none focus:border-[var(--color-primary)]"
          data-testid="input-lead-email"
        />
        <button
          type="submit"
          disabled={submitting || submitted}
          className="btn-primary rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-60"
          style={{
            background: "var(--color-primary)",
            color: "white",
          }}
          data-testid="button-lead-submit"
        >
          {submitted ? "You're on the list" : submitting ? "Saving…" : "Notify me"}
        </button>
        {error ? (
          <div className="text-sm text-red-600" data-testid="text-lead-error">
            {error}
          </div>
        ) : null}
      </form>
    </section>
  );
}
