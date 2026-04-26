import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <article
      data-testid="page-privacy"
      className="container-page py-10 sm:py-16"
    >
      <div className="card mx-auto max-w-3xl px-6 py-10 sm:px-10">
        <h1 className="font-display text-3xl">Privacy Policy</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          ExpatHub by Magic Elf Digital — Last updated: February 12, 2026
        </p>

        <h2 className="mt-8 font-display text-xl">Introduction</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Magic Elf Digital ("we," "our," or "us") operates the ExpatHub mobile
          application. This Privacy Policy explains how we handle information
          when you use our app. We are committed to protecting your privacy and
          being transparent about our practices.
        </p>

        <h2 className="mt-6 font-display text-xl">Information We Do Not Collect</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub is designed with privacy in mind. We do not collect, store,
          or transmit:
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li>Personal identification information (name, email, phone number)</li>
          <li>Location data</li>
          <li>Contacts, photos, or media</li>
          <li>Device identifiers or advertising IDs</li>
          <li>Usage analytics or behavioral tracking data</li>
          <li>Cookies or web tracking technologies</li>
        </ul>

        <h2 className="mt-6 font-display text-xl">Information Stored on Your Device</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub stores a small amount of data locally on your device to
          improve your experience. This data never leaves your device and is
          not accessible to us:
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li>
            <strong>Country preference:</strong> The country you select for
            browsing guides and resources.
          </li>
          <li>
            <strong>App preferences:</strong> Display and navigation settings.
          </li>
        </ul>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          You can clear this data at any time by uninstalling the app or
          clearing the app's storage in your device settings.
        </p>

        <h2 className="mt-6 font-display text-xl">Subscriptions and Payments</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub offers optional paid subscriptions ("ExpatHub Pro") to
          unlock premium content. All payment processing is handled entirely by
          third-party services:
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li><strong>Apple App Store</strong> (for iOS purchases)</li>
          <li><strong>Google Play Store</strong> (for Android purchases)</li>
          <li><strong>RevenueCat</strong> (subscription management platform)</li>
          <li><strong>Stripe</strong> (for web-based purchases, if applicable)</li>
        </ul>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          We do not collect, process, or store any payment information (credit
          card numbers, billing addresses, etc.). Your purchase history and
          subscription status are managed by the respective app store and
          RevenueCat. Please refer to their privacy policies for details on how
          they handle your payment data:
        </p>
        <ul className="ml-5 mt-2 list-disc text-[var(--color-ink-muted)]">
          <li><a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener">Apple Privacy Policy</a></li>
          <li><a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a></li>
          <li><a href="https://www.revenuecat.com/privacy" target="_blank" rel="noopener">RevenueCat Privacy Policy</a></li>
          <li><a href="https://stripe.com/privacy" target="_blank" rel="noopener">Stripe Privacy Policy</a></li>
        </ul>

        <h2 className="mt-6 font-display text-xl">Third-Party Services</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          The app may contain links to external websites, such as official
          government immigration resources, community forums, or vendor
          services. These third-party sites have their own privacy policies,
          and we are not responsible for their content or practices. We
          encourage you to review their policies when visiting external sites.
        </p>

        <h2 className="mt-6 font-display text-xl">Children's Privacy</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          ExpatHub is not directed at children under the age of 13. We do not
          knowingly collect any information from children. If you believe a
          child has provided information through our app, please contact us so
          we can take appropriate action.
        </p>

        <h2 className="mt-6 font-display text-xl">Data Security</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Since we do not collect or transmit personal data, there is minimal
          risk to your information. Local preferences stored on your device are
          protected by your device's built-in security features (passcode,
          biometrics, encryption).
        </p>

        <h2 className="mt-6 font-display text-xl">Changes to This Policy</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          We may update this Privacy Policy from time to time. Any changes will
          be reflected on this page with an updated "Last updated" date. We
          encourage you to review this policy periodically.
        </p>

        <h2 className="mt-6 font-display text-xl">Contact Us</h2>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          If you have any questions or concerns about this Privacy Policy or
          our practices, please contact us at:
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
          See also{" "}
          <Link to="/terms">Terms of Service</Link> and{" "}
          <Link to="/data-delete">Data Deletion</Link>.
        </p>
      </div>
    </article>
  );
}
