const STORAGE_KEY = "quiz_state_v1";

export type QuizPersistedStep =
  | { kind: "question"; index: number }
  | { kind: "email" }
  | { kind: "results" };

export type QuizPersistedState = {
  step: QuizPersistedStep;
  answers: Record<number, string>;
};

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveQuizState(state: QuizPersistedState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full or disabled (private mode). Silently ignore — the
    // quiz continues to work in-memory, we just lose resume-on-refresh.
  }
}

export function loadQuizState(): QuizPersistedState | null {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<QuizPersistedState>;
    const step = candidate.step;
    const answers = candidate.answers;
    if (!step || typeof step !== "object" || typeof step.kind !== "string") {
      return null;
    }
    if (step.kind === "question") {
      if (typeof (step as { index?: unknown }).index !== "number") return null;
    } else if (step.kind !== "email" && step.kind !== "results") {
      return null;
    }
    if (!answers || typeof answers !== "object") return null;
    return { step, answers } as QuizPersistedState;
  } catch {
    return null;
  }
}

export function clearQuizState(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
