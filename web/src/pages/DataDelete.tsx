export default function DataDelete() {
  return (
    <section
      data-testid="page-data-delete"
      className="container-page py-10 sm:py-16"
    >
      <div className="card mx-auto max-w-2xl p-8">
        <h1 className="font-display text-3xl">Delete your data</h1>
        <p className="mt-3 text-[var(--color-ink-muted)]">
          To request deletion of your ExpatHub account and any data associated
          with it, send an email to
          {" "}
          <a href="mailto:support@magicelfdigital.com">
            support@magicelfdigital.com
          </a>
          {" "}from the address tied to your account. We will confirm and remove
          your data within 30 days.
        </p>
        <p className="mt-4 text-sm text-[var(--color-ink-muted)]">
          You can also delete your account from inside the mobile app under
          Account → Delete account. The web account UI will offer in-app
          deletion in a follow-up release.
        </p>
      </div>
    </section>
  );
}
