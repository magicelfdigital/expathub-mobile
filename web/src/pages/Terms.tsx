import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <article
      data-testid="page-terms"
      className="container-page py-10 sm:py-16"
    >
      <div className="card mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <h1 className="font-display text-3xl">Terms of Service</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          ExpatHub by Magic Elf Digital — Effective Date: February 12, 2026
        </p>

        <h2 className="mt-8 font-display text-xl">1. Acceptance of Terms</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          By accessing or using ExpatHub ("Service"), including any paid
          subscription features, you agree to be bound by these Terms of
          Service ("Terms"). If you do not agree, you may not use the Service.
        </p>

        <h2 className="mt-6 font-display text-xl">2. Nature of the Service</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub provides educational content, planning tools, and
          informational decision briefs related to international relocation,
          immigration pathways, work authorization, residency, and related
          topics.
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li>ExpatHub does not provide legal, tax, financial, or immigration advice.</li>
          <li>Use of the Service is for informational and educational purposes only.</li>
        </ul>

        <h2 className="mt-6 font-display text-xl">3. No Legal or Professional Advice</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub is not a law firm, tax advisory service, or licensed
          financial advisory provider. Nothing on the platform constitutes:
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li>Legal advice</li>
          <li>Immigration advice</li>
          <li>Tax advice</li>
          <li>Financial advice</li>
          <li>Government guidance</li>
        </ul>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Users are responsible for independently verifying all information
          with official government authorities or licensed professionals before
          making decisions.
        </p>

        <h2 className="mt-6 font-display text-xl">4. Accuracy and Updates</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Immigration laws, visa requirements, tax thresholds, sponsorship
          rules, and related regulations change frequently.
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub uses internal monitoring and review systems, displays review
          metadata where applicable, and updates content periodically. However,
          ExpatHub does not guarantee that information is complete, current, or
          applicable to any specific individual.
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Use of the Service is at your own risk.
        </p>

        <h2 className="mt-6 font-display text-xl">5. Subscription and Billing</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          <strong>Billing Platforms:</strong> Payments may be processed
          through:
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li>Stripe (web subscriptions)</li>
          <li>Apple App Store (iOS subscriptions)</li>
          <li>Google Play Store (Android subscriptions)</li>
          <li>RevenueCat (mobile subscription infrastructure)</li>
        </ul>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          <strong>Auto-Renewal:</strong> Subscriptions automatically renew
          unless cancelled prior to the renewal date.
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          <strong>Cancellation:</strong> Web subscriptions must be cancelled
          through the account dashboard. Mobile subscriptions must be cancelled
          through the respective app store.
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          <strong>Refund Policy:</strong> All subscription fees are
          non-refundable except where required by applicable law.
        </p>

        <h2 className="mt-6 font-display text-xl">6. Account Responsibilities</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">You agree to:</p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li>Provide accurate account information</li>
          <li>Maintain confidentiality of login credentials</li>
          <li>Notify us of unauthorized account use</li>
          <li>Comply with all applicable laws</li>
        </ul>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          You are responsible for all activity conducted under your account.
        </p>

        <h2 className="mt-6 font-display text-xl">7. Intellectual Property</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          All content on ExpatHub, including decision briefs, frameworks,
          structured comparisons, design elements, and branding, is the
          property of Magic Elf Digital and may not be copied, redistributed,
          or reproduced without written permission.
        </p>

        <h2 className="mt-6 font-display text-xl">8. Limitation of Liability</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          To the fullest extent permitted by law, ExpatHub shall not be liable
          for:
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li>Visa denials</li>
          <li>Immigration application rejections</li>
          <li>Missed deadlines</li>
          <li>Financial loss</li>
          <li>Relocation expenses</li>
          <li>Sponsorship failures</li>
          <li>Employment consequences</li>
        </ul>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Total liability shall not exceed the amount paid by the user to
          ExpatHub in the twelve (12) months preceding the claim.
        </p>

        <h2 className="mt-6 font-display text-xl">9. No Government Affiliation</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub is not affiliated with any government agency, immigration
          authority, or official body.
        </p>

        <h2 className="mt-6 font-display text-xl">10. Service Modifications</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub may add or remove countries, update or remove content,
          modify pricing, change subscription structures, and introduce new
          features. Material changes to these Terms will be posted with an
          updated effective date.
        </p>

        <h2 className="mt-6 font-display text-xl">11. Termination</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          We may suspend or terminate access for fraudulent activity, abuse of
          the Service, or violation of these Terms. Users may cancel
          subscriptions at any time.
        </p>

        <h2 className="mt-6 font-display text-xl">12. Governing Law</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          These Terms are governed by the laws of the United States, without
          regard to conflict of law principles.
        </p>

        <h2 className="mt-6 font-display text-xl">13. Contact</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          For questions regarding these Terms:
        </p>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          <strong>Magic Elf Digital</strong>
          <br />
          Email:{" "}
          <a href="mailto:support@magicelfdigital.com">
            support@magicelfdigital.com
          </a>
        </p>

        <p className="mt-8 text-xs text-[var(--color-ink-muted)]">
          See also <Link to="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </article>
  );
}
