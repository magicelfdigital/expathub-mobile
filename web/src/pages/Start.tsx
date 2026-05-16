import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  MAX_SCORE,
  QUIZ_QUESTIONS,
  calculateQuizResult,
  getReadinessLabel,
  type ReadinessLevel,
  type RegionPreference,
} from "@quiz-data";
import LockedSection from "@/components/LockedSection";
import { QuizSaveModal } from "@/components/QuizSaveModal";
import { webApiClient } from "@/lib/api";
import {
  identifyByEmail,
  trackCompletedQuiz,
  trackInitiateCheckout,
  trackLead,
  trackLockedSectionViewed,
  trackQuizAbandoned,
  trackQuizCompleted,
  trackQuizQuestionAnswered,
  trackQuizSaveShown,
  trackQuizStarted,
  trackResultScreenViewed,
} from "@/lib/pixel";
import {
  clearQuizState,
  loadQuizState,
  saveQuizState,
  type QuizPersistedState,
} from "@/lib/quiz";
import { useUser, userHasProAccess } from "@/hooks/useUser";

// Five questions per the funnel spec — first 4 yes/no readiness questions
// plus the region preference. We pull from the canonical mobile quiz data so
// the wording always matches what people see in the app.
const FUNNEL_QUESTION_IDS = [1, 2, 3, 5, 9] as const;
const FUNNEL_QUESTIONS = FUNNEL_QUESTION_IDS.map((id) => {
  const q = QUIZ_QUESTIONS.find((x) => x.id === id);
  if (!q) throw new Error(`Missing quiz question ${id}`);
  return q;
});

// Mirrors mobile's `SAVE_PROMPT_TRIGGER_INDEX` / `SAVE_PROMPT_NO_THRESHOLD`
// (see app/onboarding/quiz.tsx). On web the funnel ends at Q5, so the
// recovery prompt fires immediately after the 5th answer when the user has
// signalled they're not ready ("no" 3+ times) — surfacing a softer email
// capture before the regular email gate so we don't lose them entirely.
const SAVE_PROMPT_TRIGGER_INDEX = 4;
const SAVE_PROMPT_NO_THRESHOLD = 3;

type CountryMatch = {
  slug: string;
  name: string;
  flag: string;
  matchScore: number;
  region: RegionPreference;
  brief: string;
  highlights: string[];
};

// Curated set of countries the marketing site can show as match results.
const COUNTRY_MATCHES: CountryMatch[] = [
  {
    slug: "portugal",
    name: "Portugal",
    flag: "🇵🇹",
    matchScore: 92,
    region: "southern_europe",
    brief:
      "Portugal still tops most lists, but the D7, D8, and HQA visas now route applicants through very different timelines and tax outcomes.",
    highlights: [
      "D8 Digital Nomad Visa requires ~€3,480/mo in remote income and grants a 5-year path to permanent residency.",
      "NHR 2.0 (the IFICI regime) replaced the old NHR — eligibility is now narrower and tied to qualifying scientific/tech roles.",
      "Lisbon rents have risen ~40% in 3 years; Porto, Braga, and the Silver Coast remain materially cheaper.",
    ],
  },
  {
    slug: "spain",
    name: "Spain",
    flag: "🇪🇸",
    matchScore: 90,
    region: "southern_europe",
    brief:
      "Spain rewards remote workers and retirees, but the digital nomad visa, NIE timing, and autonomo tax brackets quietly trip up most newcomers in the first 90 days.",
    highlights: [
      "Digital Nomad Visa offers a 24% flat tax for up to 5 years for qualifying remote workers.",
      "Public healthcare (Seguridad Social) is excellent once enrolled — but private cover is required for the first year on most visas.",
      "Coastal cities (Valencia, Málaga) cost 35–45% less than Madrid or Barcelona for the same lifestyle.",
    ],
  },
  {
    slug: "france",
    name: "France",
    flag: "🇫🇷",
    matchScore: 84,
    region: "southern_europe",
    brief:
      "Long-stay visas, OFII validation, prefecture appointments, and the carte de séjour renewal cycle determine whether year two is calm or a scramble.",
    highlights: [
      "VLS-TS Visiteur requires ~€18,500/yr in passive income and explicitly forbids local employment.",
      "Talent Passport is the cleanest route for founders and salaried tech roles — 4-year card, family included.",
      "Outside Paris, monthly costs drop by 30–45% with no loss of healthcare quality.",
    ],
  },
  {
    slug: "ireland",
    name: "Ireland",
    flag: "🇮🇪",
    matchScore: 86,
    region: "northern_europe",
    brief:
      "English-speaking EU access with a Stamp 0 / Stamp 4 residency split that hinges on income source and whether you intend to work locally.",
    highlights: [
      "Stamp 0 (financially independent) needs ~€50,000/yr personal income and full private health insurance.",
      "Critical Skills Employment Permit is the fast lane for tech and healthcare roles — 2-year permit then long-term residency.",
      "Outside Dublin, rent is 40–55% cheaper for a comparable apartment.",
    ],
  },
  {
    slug: "uk",
    name: "United Kingdom",
    flag: "🇬🇧",
    matchScore: 82,
    region: "northern_europe",
    brief:
      "Skilled Worker, Global Talent and Innovator Founder routes have very different cost, timeline and dependency rules — the wrong pick adds 12+ months.",
    highlights: [
      "Skilled Worker visa minimum salary is £38,700 for most roles (with route-specific exceptions).",
      "Global Talent has no salary floor and grants 5 years up-front for endorsed applicants.",
      "Health surcharge runs £1,035/yr per adult for the duration of the visa.",
    ],
  },
  {
    slug: "canada",
    name: "Canada",
    flag: "🇨🇦",
    matchScore: 85,
    region: "north_america",
    brief:
      "Express Entry, the Provincial Nominee Programs, and the Start-up Visa each have very different timelines and points thresholds — the wrong stream can add 12+ months.",
    highlights: [
      "Express Entry CRS cutoffs have hovered around 480–540 for general draws; category-based draws (French, healthcare, STEM) often clear at much lower scores.",
      "Provincial Nominee Programs add 600 CRS points and are the cleanest route for applicants outside the federal cutoff.",
      "Start-up Visa grants permanent residency up-front with a qualifying designated-organization commitment.",
    ],
  },
  {
    slug: "mexico",
    name: "Mexico",
    flag: "🇲🇽",
    matchScore: 88,
    region: "latin_america",
    brief:
      "Easy on entry, complicated on residency. The temporary→permanent path, INM appointment delays, and CFE/FM3 timing decide whether your move is smooth or stuck.",
    highlights: [
      "Temporary Resident visa requires ~$4,400/mo income or ~$73,000 in savings (figures move with UMA).",
      "INM consular appointments in the US can take 3–6 months — start the visa abroad, not in-country.",
      "CDMX, Guadalajara, and Mérida have the deepest expat infrastructure.",
    ],
  },
  {
    slug: "costa-rica",
    name: "Costa Rica",
    flag: "🇨🇷",
    matchScore: 84,
    region: "latin_america",
    brief:
      "Pensionado, Rentista, and Inversionista each have different income rules and dependent rights — and CAJA enrollment is non-negotiable once you land.",
    highlights: [
      "Pensionado needs $1,000/mo lifetime pension; Rentista needs $2,500/mo for 2 years (or $60k bank deposit).",
      "CAJA enrollment (~7–11% of declared income) is mandatory and unlocks the public healthcare system.",
      "Central Valley (Atenas, Grecia, Escazú) has the best balance of climate, healthcare, and bilingual infrastructure.",
    ],
  },
  {
    slug: "panama",
    name: "Panama",
    flag: "🇵🇦",
    matchScore: 78,
    region: "latin_america",
    brief:
      "Friendly Nations, Pensionado and Qualified Investor visas all funnel into permanent residency — but the timing and tax exposure differ sharply.",
    highlights: [
      "Friendly Nations visa requires a $200k bank deposit or qualifying real-estate / job offer.",
      "Pensionado is one of the cheapest retirement visas globally — $1,000/mo income.",
      "Territorial tax: foreign-source income is generally not taxed.",
    ],
  },
  {
    slug: "thailand",
    name: "Thailand",
    flag: "🇹🇭",
    matchScore: 82,
    region: "other",
    brief:
      "DTV, LTR, and Elite visas have wildly different cost/benefit profiles. The wrong choice locks you out of work eligibility for years.",
    highlights: [
      "DTV (Destination Thailand Visa) gives 5 years of multi-entry stays for remote workers.",
      "LTR Wealthy Pensioner / Wealthy Global Citizen routes need $80k+/yr income or $1M+ in assets.",
      "Elite visa is paid (THB 900k+) and grants 5–20 years — fast, but does not grant work rights.",
    ],
  },
  {
    slug: "vietnam",
    name: "Vietnam",
    flag: "🇻🇳",
    matchScore: 74,
    region: "other",
    brief:
      "Cheap, vibrant, but visa runway is short. Most expats juggle 90-day e-visas or company-sponsored work permits with strict renewal rules.",
    highlights: [
      "E-visa lasts 90 days, multiple-entry; long-term residency is harder than in Thailand.",
      "Work permits require degree + 3 years experience + employer sponsorship.",
      "Cost of living in HCMC and Hanoi is 40–60% cheaper than Bangkok for a comparable lifestyle.",
    ],
  },
];

function pickTopMatches(region: RegionPreference): CountryMatch[] {
  const inRegion = COUNTRY_MATCHES.filter((c) => c.region === region);
  const others = COUNTRY_MATCHES.filter((c) => c.region !== region);
  const sorted = [
    ...inRegion.sort((a, b) => b.matchScore - a.matchScore),
    ...others.sort((a, b) => b.matchScore - a.matchScore),
  ];
  return sorted.slice(0, 3);
}

type Step =
  | { kind: "intro" }
  | { kind: "question"; index: number }
  | { kind: "calculating" }
  | { kind: "email" }
  | { kind: "results" };

export default function Start() {
  // Restore any in-progress quiz from localStorage so a refresh doesn't reset
  // the funnel. We use lazy initializers so we only touch storage once on mount.
  const initialPersisted = useMemo<QuizPersistedState | null>(
    () => loadQuizState(),
    [],
  );
  const [step, setStep] = useState<Step>(() => {
    const persisted = initialPersisted;
    if (!persisted) return { kind: "intro" };
    if (persisted.step.kind === "question") {
      const idx = persisted.step.index;
      if (idx >= 0 && idx < FUNNEL_QUESTIONS.length) {
        return { kind: "question", index: idx };
      }
      return { kind: "intro" };
    }
    return persisted.step;
  });
  const [answers, setAnswers] = useState<Record<number, string>>(
    () => initialPersisted?.answers ?? {},
  );
  const [email, setEmail] = useState(() => initialPersisted?.email ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savePromptVisible, setSavePromptVisible] = useState(false);
  const [savePromptNoCount, setSavePromptNoCount] = useState(0);
  const introFiredRef = useRef(false);
  const startedFiredRef = useRef(false);
  const completedRef = useRef(false);
  const abandonedFiredRef = useRef(false);
  const savePromptShownRef = useRef(false);
  const answersRef = useRef<Record<number, string>>({});
  const lastQuestionIndexRef = useRef(0);
  const { user } = useUser();
  const hasAccess = userHasProAccess(user);

  // Keep refs in sync so the abandonment cleanup (which runs after the
  // component unmounts and therefore can't read state directly) sees the
  // final answers + last visited question.
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    if (step.kind === "question") {
      lastQuestionIndexRef.current = step.index;
    }
  }, [step]);

  useEffect(() => {
    // Only the once-per-session tracking calls are guarded by the ref.
    // The pagehide listener + cleanup must always be registered, otherwise
    // React StrictMode's mount→cleanup→remount cycle would leave the second
    // mount with no listener and no cleanup.
    if (!introFiredRef.current) {
      introFiredRef.current = true;
      // Meta optimization signal — fires on intro view (top of funnel).
      // `quiz_started` is intentionally NOT fired here — see `startQuiz()`.
      trackInitiateCheckout({ funnel: "web_quiz_funnel", surface: "web" });
    }

    const fireAbandonedIfApplicable = () => {
      if (abandonedFiredRef.current) return;
      if (completedRef.current) return;
      const answeredCount = Object.keys(answersRef.current).length;
      if (answeredCount > 0 && answeredCount < FUNNEL_QUESTIONS.length) {
        abandonedFiredRef.current = true;
        trackQuizAbandoned({
          lastQuestionIndex: lastQuestionIndexRef.current,
          answered: answeredCount,
          totalQuestions: FUNNEL_QUESTIONS.length,
        });
      }
    };

    // `pagehide` covers tab close / hard navigation; the unmount cleanup
    // covers SPA route changes. The abandonedFiredRef guard prevents
    // double-fires when both fire (e.g. unmount caused by navigation).
    const onPageHide = () => fireAbandonedIfApplicable();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      fireAbandonedIfApplicable();
    };
  }, []);

  // Persist progress on every meaningful state change. Intro is skipped (no
  // answers yet). The 900ms calculating spinner is persisted as `email` so a
  // refresh during that brief window resumes at the email gate rather than
  // dropping the just-selected final answer back to the last question.
  useEffect(() => {
    const trimmedEmail = email.trim();
    if (step.kind === "question") {
      saveQuizState({
        step: { kind: "question", index: step.index },
        answers,
        email: trimmedEmail || undefined,
      });
    } else if (step.kind === "email" || step.kind === "calculating") {
      saveQuizState({
        step: { kind: "email" },
        answers,
        email: trimmedEmail || undefined,
      });
    } else if (step.kind === "results") {
      saveQuizState({ step: { kind: "results" }, answers });
    }
  }, [step, answers, email]);

  function restartQuiz(): void {
    clearQuizState();
    setAnswers({});
    setEmail("");
    setError(null);
    setStep({ kind: "intro" });
  }

  const result = useMemo(() => {
    if (step.kind !== "results" && step.kind !== "email" && step.kind !== "calculating") {
      return null;
    }
    return calculateQuizResult(answers);
  }, [answers, step.kind]);

  const region: RegionPreference =
    (answers[9] as RegionPreference | undefined) ?? "southern_europe";
  const matches = useMemo(() => pickTopMatches(region), [region]);

  function finishQuizAfterLastAnswer(): void {
    // Mark complete before transitioning so the abandonment cleanup
    // doesn't misclassify a finished quiz that happens to unmount mid-route.
    completedRef.current = true;
    // Mirror mobile's `quiz_completed` fired when the last question is
    // answered. Email-gate completion fires a second event in submitEmail().
    trackQuizCompleted({ totalQuestions: FUNNEL_QUESTIONS.length });
    setStep({ kind: "calculating" });
    // Brief "calculating…" pause so users register the result is theirs.
    window.setTimeout(() => setStep({ kind: "email" }), 900);
  }

  function answerCurrentAndAdvance(value: string): void {
    if (step.kind !== "question") return;
    const q = FUNNEL_QUESTIONS[step.index];
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    // Mirror mobile's per-question event so we can see drop-off by question.
    trackQuizQuestionAnswered({
      questionId: q.id,
      questionIndex: step.index,
      category: q.category,
      answer: value,
    });
    if (step.index + 1 >= FUNNEL_QUESTIONS.length) {
      // Recovery prompt: mirrors `app/onboarding/quiz.tsx`'s save-modal
      // trigger. If the user has signalled they aren't ready ("no" 3+
      // times), surface the soft email capture before the regular email
      // gate. The web funnel ends at Q5 so this fires after the last
      // answer; on mobile the same trigger fires mid-quiz because there
      // are 11 more questions to come.
      const noCount = Object.values(next).filter((v) => v === "no").length;
      if (
        !savePromptShownRef.current &&
        step.index === SAVE_PROMPT_TRIGGER_INDEX &&
        noCount >= SAVE_PROMPT_NO_THRESHOLD
      ) {
        savePromptShownRef.current = true;
        setSavePromptNoCount(noCount);
        setSavePromptVisible(true);
        trackQuizSaveShown({ questionIndex: step.index, noCount });
        return;
      }
      finishQuizAfterLastAnswer();
    } else {
      setStep({ kind: "question", index: step.index + 1 });
    }
  }

  function handleSavePromptClose(): void {
    setSavePromptVisible(false);
    // Don't strand the user on the answered question — proceed to the
    // calculating step the same way they would have without the modal.
    finishQuizAfterLastAnswer();
  }

  function handleSavePromptContinue(): void {
    setSavePromptVisible(false);
    finishQuizAfterLastAnswer();
  }

  function back(): void {
    if (step.kind === "question" && step.index > 0) {
      setStep({ kind: "question", index: step.index - 1 });
    } else if (step.kind === "question" && step.index === 0) {
      setStep({ kind: "intro" });
    } else if (step.kind === "email") {
      setStep({ kind: "question", index: FUNNEL_QUESTIONS.length - 1 });
    }
  }

  async function submitEmail(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Identify the visitor before we fire any post-email events so the
      // `Lead`/`quiz_completed` pair below already carries the email-keyed
      // distinct_id. PostHog will then alias the pre-email anon id to this
      // one (via `$anon_distinct_id`) and later, after account creation,
      // re-alias the email id to the real user id (see `useUser`).
      // Awaited but never thrown — analytics must never block the form.
      await identifyByEmail(email).catch(() => {});

      const computed = result ?? calculateQuizResult(answers);
      // Mobile and web both send the 4-value readiness level as
      // `readinessLevel` on the backend payload, which the server stores in
      // both `readiness_level` and the legacy `tier` column during the
      // rename rollout (task #115). Fresh `getReadinessLabel(...)` always
      // returns a value; the optional chain is defensive against legacy
      // persisted shapes.
      const readinessLevel: ReadinessLevel =
        computed.readiness?.level ??
        getReadinessLabel(computed.score, computed.maxScore ?? MAX_SCORE).level;
      await webApiClient.readinessLead({
        email: email.trim(),
        score: computed.score,
        readinessLevel,
        risks: computed.risks,
        // Pass a typed-as-string answers map for the readiness_leads jsonb.
        answers: Object.fromEntries(
          Object.entries(answers).map(([k, v]) => [k, String(v)]),
        ),
      });
      // Also write to quiz_leads with the web_funnel source so the existing
      // welcome email sequence trigger picks it up.
      await fetch("/api/auth/quiz-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          readinessLevel,
          regionPreference: region,
          score: computed.score,
          risks: computed.risks,
          source: "web_funnel",
        }),
      }).catch(() => {});
      trackLead({
        funnel: "web_quiz_funnel",
        surface: "web",
        tier: readinessLevel,
        region,
      });
      // Mirror mobile's result-screen `quiz_completed` (with tier/score/action)
      // so the funnel dashboards can split lead capture from quiz finish.
      // The web's email submit IS the lead-capture/account-start moment, so
      // we use `action: "create_account"` to match mobile's vocabulary.
      trackQuizCompleted({
        tier: readinessLevel,
        score: computed.score,
        action: "create_account",
      });
      setStep({ kind: "results" });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
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
      {step.kind === "intro" ? (
        <IntroView
          onStart={() => {
            // Mirror mobile's `quiz_started` semantics: fire when the user
            // actually enters the quiz (mobile fires it on quiz-screen mount,
            // which is the equivalent of clicking "Start the quiz" on web).
            // The ref guards against double-fires if the user navigates
            // back to intro and re-starts within the same page mount —
            // mobile fires it once per quiz screen mount, so we do the same.
            if (!startedFiredRef.current) {
              startedFiredRef.current = true;
              // Strict mobile-parity: mobile fires `quiz_started` with no
              // properties (see `trackEvent("quiz_started")` in
              // `app/onboarding/quiz.tsx`). The `postUnifiedAnalytics` helper
              // already merges `surface: "web"` into every payload, so we
              // don't need to pass it explicitly here.
              trackQuizStarted();
            }
            setStep({ kind: "question", index: 0 });
          }}
        />
      ) : null}

      {step.kind === "question" ? (
        <QuestionView
          step={step}
          answers={answers}
          onAnswer={answerCurrentAndAdvance}
          onBack={back}
        />
      ) : null}

      {step.kind === "calculating" ? <CalculatingView /> : null}

      {step.kind === "email" ? (
        <EmailGateView
          email={email}
          onChange={setEmail}
          onSubmit={submitEmail}
          onBack={back}
          submitting={submitting}
          error={error}
        />
      ) : null}

      {step.kind === "results" && result ? (
        <ResultsView
          matches={matches}
          readinessLevel={
            result.readiness?.level ??
            getReadinessLabel(result.score, result.maxScore ?? MAX_SCORE).level
          }
          score={result.score}
          hasAccess={hasAccess}
          onRestart={restartQuiz}
        />
      ) : null}

      <QuizSaveModal
        visible={savePromptVisible}
        noCount={savePromptNoCount}
        onClose={handleSavePromptClose}
        onContinue={handleSavePromptContinue}
      />
    </section>
  );
}

function IntroView({ onStart }: { onStart: () => void }) {
  return (
    <div data-testid="quiz-intro" className="max-w-2xl">
      <h1 className="font-display text-4xl sm:text-5xl">
        Where should you move?
      </h1>
      <p className="mt-4 text-lg text-[var(--color-ink-muted)]">
        Answer 5 questions. Get your personalized country match.
      </p>
      <ul className="mt-6 space-y-2 text-sm text-[var(--color-ink-muted)]">
        <li>• 90-second readiness check</li>
        <li>• Top 3 country matches with a free Decision Brief on your #1</li>
        <li>• No card required</li>
      </ul>
      <button
        type="button"
        onClick={onStart}
        data-testid="quiz-start"
        className="btn-primary mt-8 inline-flex rounded-lg px-6 py-3 text-base font-semibold"
        style={{ background: "var(--color-primary)", color: "white" }}
      >
        Start the quiz
      </button>
    </div>
  );
}

function QuestionView({
  step,
  answers,
  onAnswer,
  onBack,
}: {
  step: { kind: "question"; index: number };
  answers: Record<number, string>;
  onAnswer: (value: string) => void;
  onBack: () => void;
}) {
  const q = FUNNEL_QUESTIONS[step.index];
  const total = FUNNEL_QUESTIONS.length;
  const progressPct = ((step.index + 1) / total) * 100;
  const currentAnswer = answers[q.id];

  return (
    <div data-testid={`quiz-question-${q.id}`} className="max-w-xl">
      {/* Progress bar */}
      <div
        className="mb-6 flex items-center justify-between text-xs uppercase tracking-wider text-[var(--color-ink-muted)]"
      >
        <span>
          Question {step.index + 1} of {total}
        </span>
        <span>{q.category}</span>
      </div>
      <div
        data-testid="quiz-progress"
        className="mb-8 h-2 w-full overflow-hidden rounded-full bg-[var(--color-border)]"
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${progressPct}%`,
            background: "var(--color-primary)",
          }}
        />
      </div>

      <h2
        data-testid="quiz-question-text"
        className="font-display text-2xl leading-snug sm:text-3xl"
      >
        {q.text}
      </h2>

      <div className="mt-6 space-y-3">
        {q.options.map((opt) => {
          const selected = currentAnswer === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAnswer(opt.value)}
              data-testid={`quiz-answer-${opt.value}`}
              className="flex w-full items-center justify-between rounded-xl border px-5 py-4 text-left transition"
              style={{
                borderColor: selected
                  ? "var(--color-primary)"
                  : "var(--color-border)",
                background: selected
                  ? "var(--color-primary)"
                  : "var(--color-surface)",
                color: selected ? "white" : "var(--color-ink)",
              }}
            >
              <span className="text-base font-medium">
                {opt.emoji ? <span className="mr-2">{opt.emoji}</span> : null}
                {opt.label}
              </span>
              <span aria-hidden className="text-sm opacity-60">
                →
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          data-testid="quiz-back"
          className="text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
        >
          ← Back
        </button>
        <span className="text-xs text-[var(--color-ink-muted)]">
          Your answers stay private.
        </span>
      </div>
    </div>
  );
}

function CalculatingView() {
  return (
    <div
      data-testid="quiz-calculating"
      className="mx-auto max-w-md text-center"
    >
      <div
        className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-border)]"
        style={{ borderTopColor: "var(--color-primary)" }}
      />
      <p className="mt-5 font-display text-2xl">Calculating your match…</p>
      <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
        Cross-referencing your answers against 11 countries.
      </p>
    </div>
  );
}

function EmailGateView({
  email,
  onChange,
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  email: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div data-testid="quiz-email-gate" className="mx-auto max-w-md">
      <h2 className="font-display text-3xl sm:text-4xl">
        Your top match is ready.
      </h2>
      <p className="mt-3 text-base text-[var(--color-ink-muted)]">
        Where should we send your personalized Decision Brief?
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => onChange(e.target.value)}
          disabled={submitting}
          data-testid="input-email"
          className="w-full rounded-lg border bg-white px-4 py-3 text-base outline-none focus:border-[var(--color-primary)]"
          style={{ borderColor: "var(--color-border)" }}
        />
        <button
          type="submit"
          disabled={submitting}
          data-testid="button-email-submit"
          className="w-full rounded-lg px-4 py-3 text-base font-semibold disabled:opacity-60"
          style={{ background: "var(--color-primary)", color: "white" }}
        >
          {submitting ? "Sending…" : "Show me my match"}
        </button>
        {error ? (
          <div data-testid="text-email-error" className="text-sm text-red-600">
            {error}
          </div>
        ) : null}
      </form>
      <div className="mt-4 flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          className="text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
        >
          ← Back to quiz
        </button>
        <span className="text-xs text-[var(--color-ink-muted)]">
          We'll never share your email.
        </span>
      </div>
    </div>
  );
}

function ResultsView({
  matches,
  readinessLevel,
  score,
  hasAccess,
  onRestart,
}: {
  matches: CountryMatch[];
  readinessLevel: ReadinessLevel;
  score: number;
  hasAccess: boolean;
  onRestart: () => void;
}) {
  const top = matches[0];
  const rest = matches.slice(1);
  // Visible readiness badge — derived directly from the 4-value readiness
  // level so the UI matches the same framing the mobile app uses.
  const readinessLabel =
    readinessLevel === "ready_to_plan"
      ? "Ready to plan"
      : readinessLevel === "serious_researcher"
        ? "Serious researcher"
        : readinessLevel === "curious_explorer"
          ? "Curious explorer"
          : "Just getting started";

  // Fire a single locked-section signal once on results render so PostHog +
  // Pixel can attribute the funnel without waiting on scroll. We also mirror
  // mobile's `result_screen_viewed` + Meta `CompletedQuiz` events here so the
  // existing funnel + Meta dashboards work for the web /start funnel too.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    trackLockedSectionViewed({
      section: "web_quiz_results",
      country: top?.slug ?? "none",
    });
    // Send the 4-value readiness level as `tier` on analytics events so web
    // events line up with mobile's `tier` field (mobile sends
    // `readiness.level`).
    trackResultScreenViewed({ matchScore: score, tier: readinessLevel });
    trackCompletedQuiz({
      top_country: top?.slug ?? "none",
      tier: readinessLevel,
    });
  }, [top, score, readinessLevel]);

  return (
    <div data-testid="quiz-results" className="max-w-3xl">
      <div className="flex items-center gap-3">
        <span
          className="rounded-full bg-[var(--color-gold)]/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-ink)]"
          data-testid="quiz-tier"
        >
          {readinessLabel} · {score}/16
        </span>
      </div>
      <h2 className="mt-3 font-display text-3xl sm:text-4xl">
        Your top 3 country matches
      </h2>
      <p className="mt-2 text-[var(--color-ink-muted)]">
        Based on your readiness profile and region preference. The first
        Decision Brief is free — the rest unlock with Pro.
      </p>

      {top ? (
        <article
          data-testid={`match-free-${top.slug}`}
          className="card mt-8 border-2 border-[var(--color-gold)]/30 bg-[var(--color-paper)] p-6 sm:p-8"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span aria-hidden className="text-4xl">
              {top.flag}
            </span>
            <div>
              <h3 className="font-display text-2xl capitalize">{top.name}</h3>
              <div className="text-xs uppercase tracking-wider text-[var(--color-ink-muted)]">
                Match #1 · {top.matchScore}/100 · Free preview
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed">{top.brief}</p>
          <ul className="mt-4 space-y-2 text-sm leading-relaxed">
            {top.highlights.map((h, idx) => (
              <li key={idx} className="flex gap-2">
                <span aria-hidden className="text-[var(--color-gold)]">
                  ✓
                </span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to={`/country/${top.slug}`}
              data-testid={`match-cta-detail-${top.slug}`}
              className="btn-primary"
            >
              See the full {top.name} brief
            </Link>
          </div>
        </article>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {rest.map((m, idx) => (
          <LockedSection
            key={m.slug}
            title={`#${idx + 2} · ${m.name}`}
            sectionKey={`web_match_${m.slug}`}
            countrySlug={m.slug}
            userHasAccess={hasAccess}
            teaser={`${m.matchScore}/100 match. ${m.brief.slice(0, 110)}…`}
            ctaHref="/pricing"
            ctaLabel="Unlock with 14-day free trial"
            lockedHeadline={`Unlock the full ${m.name} brief`}
            lockedBullets={[
              "Visa pathway, document checklists, and renewal timing",
              "City-by-city cost of living for the cities expats actually move to",
              "Healthcare access — public enrollment + private premiums",
              "Schools by city with tuition bands",
              "Common pitfalls and how to avoid them",
            ]}
          >
            <div className="space-y-2 text-sm leading-relaxed">
              <p>{m.brief}</p>
              <ul className="mt-2 list-disc pl-4">
                {m.highlights.slice(0, 2).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>
          </LockedSection>
        ))}
      </div>

      <div
        className="mt-10 rounded-xl border-2 border-[var(--color-primary)]/30 bg-[var(--color-cream)] p-6 sm:p-8"
        data-testid="quiz-results-cta"
      >
        <h3 className="font-display text-xl">
          Get the full Decision Brief for all 3 matches
        </h3>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          Pro unlocks visa, cost-of-living, healthcare, schools, and the
          relocation planner for every country we cover.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Link
            to="/pricing"
            data-testid="quiz-results-pricing"
            className="btn-primary"
          >
            See plans
          </Link>
          <button
            type="button"
            onClick={onRestart}
            data-testid="quiz-restart"
            className="text-sm text-[var(--color-ink-muted)] underline-offset-2 hover:underline"
          >
            Restart quiz
          </button>
        </div>
      </div>
    </div>
  );
}
