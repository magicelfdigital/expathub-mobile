/**
 * Component tests for the web quiz-save modal email-capture moment in
 * web/src/components/QuizSaveModal.tsx.
 *
 * The save-your-progress modal is one of three email-capture surfaces that
 * feed a mid-funnel Meta `Lead` signal (the others being the mobile
 * readiness-quiz email gate and the mobile country waitlist). This suite
 * mirrors the readiness-gate coverage in
 * app/onboarding/__tests__/result.test.tsx: the `Lead` event must fire only
 * after a successful backend save, never on a 4xx/5xx or network error, and
 * the raw email must never appear in the Meta payload (PII guardrail).
 */

const trackLead = jest.fn();
const trackQuizSaveSubmitted = jest.fn();
const trackQuizSaveDismissed = jest.fn();
jest.mock("@/lib/pixel", () => ({
  trackLead: (...args: any[]) => trackLead(...args),
  trackQuizSaveSubmitted: (...args: any[]) => trackQuizSaveSubmitted(...args),
  trackQuizSaveDismissed: (...args: any[]) => trackQuizSaveDismissed(...args),
}));

import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { QuizSaveModal } from "../QuizSaveModal";

function renderModal() {
  return render(
    <QuizSaveModal
      visible
      noCount={4}
      onClose={jest.fn()}
      onContinue={jest.fn()}
    />,
  );
}

async function submitEmail(email: string) {
  fireEvent.change(screen.getByTestId("quiz-save-email"), {
    target: { value: email },
  });
  await act(async () => {
    fireEvent.click(screen.getByTestId("quiz-save-submit"));
  });
}

beforeEach(() => {
  trackLead.mockReset();
  trackQuizSaveSubmitted.mockReset();
  trackQuizSaveDismissed.mockReset();
  (global as any).fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({}),
  }));
});

afterEach(() => {
  cleanup();
});

describe("Web QuizSaveModal — Meta Lead signal", () => {
  it("fires trackLead(source='quiz_save') after a successful /api/auth/quiz-lead save", async () => {
    renderModal();
    await submitEmail("ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = ((global as any).fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toContain("/api/auth/quiz-lead");
    expect(opts.method).toBe("POST");

    await waitFor(() => expect(trackLead).toHaveBeenCalledTimes(1));
    expect(trackLead).toHaveBeenCalledWith({ source: "quiz_save", noCount: 4 });

    // The submitted analytics event also fires on success.
    expect(trackQuizSaveSubmitted).toHaveBeenCalledTimes(1);

    // PII guardrail: the raw email must never appear in the Meta payload.
    expect(JSON.stringify(trackLead.mock.calls[0])).not.toContain(
      "ada@lovelace.io",
    );
  });

  it("does NOT fire trackLead when the email is invalid (no POST, no signal)", async () => {
    renderModal();
    await submitEmail("not-an-email");

    expect((global as any).fetch).not.toHaveBeenCalled();
    expect(trackLead).not.toHaveBeenCalled();
    expect(trackQuizSaveSubmitted).not.toHaveBeenCalled();
  });

  it("does NOT fire trackLead when the API returns a 5xx (no false-positive ad signal)", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }));
    renderModal();
    await submitEmail("ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(trackLead).not.toHaveBeenCalled();
    expect(trackQuizSaveSubmitted).not.toHaveBeenCalled();
  });

  it("does NOT fire trackLead when the API returns a 4xx", async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "bad request" }),
    }));
    renderModal();
    await submitEmail("ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(trackLead).not.toHaveBeenCalled();
    expect(trackQuizSaveSubmitted).not.toHaveBeenCalled();
  });

  it("does NOT fire trackLead when fetch itself rejects (network error)", async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error("network down");
    });
    renderModal();
    await submitEmail("ada@lovelace.io");

    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(trackLead).not.toHaveBeenCalled();
    expect(trackQuizSaveSubmitted).not.toHaveBeenCalled();
  });
});
