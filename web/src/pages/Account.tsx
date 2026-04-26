import { useUser } from "@/hooks/useUser";

export default function Account() {
  const { user, isLoading } = useUser();

  return (
    <section
      data-testid="page-account"
      className="container-page py-10 sm:py-16"
    >
      <h1 className="font-display text-4xl">Account</h1>
      <p className="mt-3 max-w-2xl text-[var(--color-ink-muted)]">
        Web account UI — sign-in, manage subscription, request a refund —
        arrives with later tasks. This page reads the session via the shared
        <code className="mx-1">useUser</code> hook so other tasks can build on it.
      </p>
      <div
        className="card mt-6 max-w-md p-6"
        data-testid="account-status"
      >
        <div className="text-sm uppercase tracking-wider text-[var(--color-ink-muted)]">
          Session
        </div>
        <div className="mt-2 font-display text-2xl">
          {isLoading ? "Checking…" : user ? user.email ?? "Signed in" : "Anonymous"}
        </div>
      </div>
    </section>
  );
}
