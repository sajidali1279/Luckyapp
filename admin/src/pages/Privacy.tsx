export default function Privacy() {
  const s: Record<string, React.CSSProperties> = {
    page:       { maxWidth: 760, margin: '0 auto', padding: '48px 24px 100px', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1a1a1a', lineHeight: 1.75 },
    logo:       { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 },
    badge:      { background: '#1D3557', color: '#fff', fontWeight: 700, fontSize: 20, padding: '8px 16px', borderRadius: 8 },
    h1:         { fontSize: 30, fontWeight: 800, margin: '0 0 6px', letterSpacing: -0.5 },
    updated:    { color: '#666', fontSize: 14, margin: '0 0 8px' },
    intro:      { color: '#444', fontSize: 15, margin: '0 0 40px', lineHeight: 1.8 },
    toc:        { background: '#f7f9fc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', marginBottom: 40 },
    tocTitle:   { fontWeight: 700, fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: 0.8, color: '#1D3557', margin: '0 0 10px' },
    tocList:    { margin: 0, paddingLeft: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' } as React.CSSProperties,
    tocItem:    { fontSize: 13, color: '#1D3557' },
    h2:         { fontSize: 18, fontWeight: 800, margin: '44px 0 10px', color: '#1D3557', borderBottom: '2px solid #e2e8f0', paddingBottom: 6 },
    h3:         { fontSize: 15, fontWeight: 700, margin: '20px 0 6px', color: '#374151' },
    p:          { margin: '0 0 14px', fontSize: 15 },
    ul:         { margin: '0 0 14px', paddingLeft: 22, fontSize: 15 },
    li:         { marginBottom: 6 },
    table:      { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14, marginBottom: 14 },
    th:         { background: '#f1f5f9', padding: '10px 14px', textAlign: 'left' as const, fontWeight: 700, borderBottom: '2px solid #e2e8f0', fontSize: 13 },
    td:         { padding: '10px 14px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' as const },
    highlight:  { background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '14px 18px', marginBottom: 14, fontSize: 14, color: '#92400E' },
    hr:         { border: 'none', borderTop: '1px solid #e5e5e5', margin: '48px 0' },
    contact:    { background: '#f7f9fc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '24px 28px' },
  };

  const sections = [
    '1. Who We Are', '2. Information We Collect', '3. How We Collect Your Data',
    '4. How We Use Your Data', '5. Who Can See Your Data', '6. Third-Party Service Providers',
    '7. Data Retention', '8. Your Rights', '9. Push Notifications',
    '10. Biometric & Device Features', '11. Children\'s Privacy', '12. California Residents (CCPA)',
    '13. International Users', '14. Security', '15. Changes to This Policy',
  ];

  return (
    <div style={s.page}>
      <div style={s.logo}>
        <span style={s.badge}>LS</span>
        <span style={{ fontWeight: 800, fontSize: 22 }}>Lucky Stop</span>
      </div>

      <h1 style={s.h1}>Privacy Policy</h1>
      <p style={s.updated}>Last updated: June 7, 2026</p>
      <p style={s.updated}>Effective date: June 7, 2026</p>

      <p style={s.intro}>
        Lucky Stop Inc. ("Lucky Stop", "we", "our", or "us") operates the Lucky Stop mobile application
        (the "App") — a loyalty and rewards platform for Lucky Stop gas stations and convenience stores.
        This Privacy Policy explains what personal information we collect, why we collect it, how we use
        and protect it, and the choices and rights available to you. By using the App, you agree to the
        practices described in this policy.
      </p>

      {/* Table of Contents */}
      <div style={s.toc}>
        <p style={s.tocTitle}>Contents</p>
        <ol style={s.tocList}>
          {sections.map(sec => (
            <li key={sec} style={s.tocItem}>{sec}</li>
          ))}
        </ol>
      </div>

      {/* 1 */}
      <h2 style={s.h2}>1. Who We Are</h2>
      <p style={s.p}>
        Lucky Stop Inc. is a retail loyalty platform company operating across approximately 12 Lucky Stop
        gas station and convenience store locations. The App is developed and maintained by Cliff Industries
        on behalf of Lucky Stop Inc. References to "we" or "us" throughout this policy refer to both entities
        acting together as joint data controllers.
      </p>
      <p style={s.p}>
        For privacy-related inquiries, contact us at:{' '}
        <a href="mailto:support@luckystop.cliffindus.com" style={{ color: '#E63946' }}>
          support@luckystop.cliffindus.com
        </a>
      </p>

      {/* 2 */}
      <h2 style={s.h2}>2. Information We Collect</h2>

      <h3 style={s.h3}>2a. Information You Provide</h3>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Data</th>
            <th style={s.th}>Description</th>
            <th style={s.th}>Required?</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Phone number', 'Used to create your account and verify identity via one-time passcode (OTP). This is your primary account identifier.', 'Yes'],
            ['Display name', 'Your name as shown in the app. Used to personalize your experience and visible to store staff when they scan your QR code.', 'No'],
            ['Recovery email', 'An optional email address you can add to help recover access to your account if you lose your phone.', 'No'],
            ['Profile photo', 'An optional avatar image you upload. Stored securely and shown only within the app.', 'No'],
            ['Business information', 'If you submit a request to advertise your business through the app, we collect your business name, description, contact phone, website, and logo image.', 'Only if you apply to advertise'],
          ].map(([data, desc, req]) => (
            <tr key={data as string}>
              <td style={{ ...s.td, fontWeight: 600 }}>{data}</td>
              <td style={s.td}>{desc}</td>
              <td style={s.td}>{req}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={s.h3}>2b. Information Generated by Using the App</h3>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Data</th>
            <th style={s.th}>Description</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Unique QR code', 'A unique identifier assigned to your account. Used by store cashiers to look up your account when granting rewards. Never contains personal data — it is an opaque code that maps to your account.'],
            ['Transaction history', 'A record of each purchase for which you earned cashback: the store location, purchase amount, product category (e.g. groceries, gas, hot food), cashback amount awarded, and timestamp.'],
            ['Rewards balance', 'Your running total of cashback credits earned and redeemed.'],
            ['Redemption history', 'Records of credits you have redeemed for in-store products, including the item, store, and date.'],
            ['Receipt photos', 'Photos of purchase receipts uploaded by store employees to verify your transaction. Required for fraud prevention. You do not upload these — store staff do.'],
            ['Missing-points reports', 'If you submit a dispute for missing cashback, we collect your description of the transaction, the store involved, and any approximate purchase amount you provide.'],
            ['Product requests', 'Items you request that a store should stock. Includes the product name and your account.'],
            ['Store chat messages', 'If you are a store employee, messages you send in the internal staff chat for your store.'],
            ['Work schedule data', 'If you are a store employee, your availability and shift preferences entered in the scheduling feature.'],
            ['Push notification token', 'A device token generated by Firebase Cloud Messaging, used to deliver push notifications to your device. Rotated automatically by the operating system.'],
            ['App usage and crash data', 'Anonymous technical data such as crash reports, error logs, and feature usage patterns used to identify and fix bugs. This data does not identify you personally.'],
          ].map(([data, desc]) => (
            <tr key={data as string}>
              <td style={{ ...s.td, fontWeight: 600, minWidth: 160 }}>{data}</td>
              <td style={s.td}>{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={s.h3}>2c. Information We Do Not Collect</h3>
      <ul style={s.ul}>
        <li style={s.li}>We do <strong>not</strong> collect your precise GPS location or track your movements.</li>
        <li style={s.li}>We do <strong>not</strong> collect payment card numbers or any financial account information.</li>
        <li style={s.li}>We do <strong>not</strong> collect biometric data (fingerprints or face geometry) — biometric login uses your device's own secure enclave and the result (pass/fail) is never sent to our servers.</li>
        <li style={s.li}>We do <strong>not</strong> access your contacts, calendar, or other device apps.</li>
        <li style={s.li}>We do <strong>not</strong> collect data from children under 13.</li>
      </ul>

      {/* 3 */}
      <h2 style={s.h2}>3. How We Collect Your Data</h2>
      <ul style={s.ul}>
        <li style={s.li}><strong>Directly from you</strong> — when you create an account, update your profile, submit a dispute, or request a product.</li>
        <li style={s.li}><strong>From store staff</strong> — when a cashier scans your QR code and enters your purchase amount, or uploads a receipt photo to verify a transaction.</li>
        <li style={s.li}><strong>Automatically</strong> — device tokens for push notifications are generated automatically by Firebase when you first log in. Crash and error data is collected automatically when the app encounters a problem.</li>
        <li style={s.li}><strong>From Firebase Authentication</strong> — when you verify your phone number via OTP, Firebase processes your phone number on our behalf to confirm your identity.</li>
      </ul>

      {/* 4 */}
      <h2 style={s.h2}>4. How We Use Your Data</h2>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Purpose</th>
            <th style={s.th}>Data Used</th>
            <th style={s.th}>Legal Basis</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Operate your rewards account', 'Phone number, name, QR code, transaction history, rewards balance', 'Performance of contract'],
            ['Verify purchases and prevent fraud', 'Receipt photos, transaction records, purchase amounts', 'Legitimate interest / contract'],
            ['Send push notifications', 'Push token, notification preferences', 'Consent (you can opt out at any time)'],
            ['Display personalized offers', 'Your store location, transaction history', 'Legitimate interest'],
            ['Respond to disputes and support requests', 'Missing-points reports, transaction data, contact information', 'Legitimate interest / contract'],
            ['Staff scheduling and communication', 'Employee profile, schedule preferences, chat messages', 'Contract (employment/role)'],
            ['Improve the app and fix bugs', 'Anonymous crash logs and usage data', 'Legitimate interest'],
            ['Comply with legal obligations', 'Any data required by applicable law', 'Legal obligation'],
          ].map(([purpose, data, basis]) => (
            <tr key={purpose as string}>
              <td style={{ ...s.td, fontWeight: 600 }}>{purpose}</td>
              <td style={s.td}>{data}</td>
              <td style={s.td}>{basis}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 5 */}
      <h2 style={s.h2}>5. Who Can See Your Data</h2>
      <p style={s.p}>
        Access to your data within the Lucky Stop system is strictly controlled by role. Only the minimum
        data necessary for each role is accessible:
      </p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Role</th>
            <th style={s.th}>What They Can See</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['You (customer)', 'Your own rewards balance, transaction history, redemptions, disputes, and profile.'],
            ['Cashier / Employee', 'Your display name and current rewards balance — only when they scan your QR code to process a transaction. They cannot browse customer accounts.'],
            ['Store Manager', 'Transaction history and rewards activity for customers at their assigned store(s) only. They cannot see data from other stores.'],
            ['Lucky Stop HQ (Super Admin)', 'Aggregated data and transaction history across all stores for operational oversight, analytics, and fraud investigation.'],
            ['System Administrator (Cliff Industries)', 'Full system access for maintenance, security monitoring, and technical support. Access is logged and audited.'],
          ].map(([role, access]) => (
            <tr key={role as string}>
              <td style={{ ...s.td, fontWeight: 600, minWidth: 180 }}>{role}</td>
              <td style={s.td}>{access}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={s.p}>
        We do <strong>not</strong> sell, rent, or trade your personal information to any third party for
        their own marketing or commercial purposes.
      </p>

      {/* 6 */}
      <h2 style={s.h2}>6. Third-Party Service Providers</h2>
      <p style={s.p}>
        We use the following third-party services to operate the App. Each provider processes your data
        only on our behalf and is bound by a data processing agreement:
      </p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Provider</th>
            <th style={s.th}>Purpose</th>
            <th style={s.th}>Data Shared</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Firebase Authentication (Google)', 'Phone number OTP verification — confirms your identity when you log in', 'Phone number'],
            ['Firebase Cloud Messaging (Google)', 'Delivery of push notifications to your device', 'Push device token'],
            ['Firebase Storage / AWS S3', 'Secure cloud storage for receipt photos, profile avatars, and promotional images', 'Uploaded images'],
            ['Neon / PostgreSQL', 'Encrypted database hosting for account, transaction, and rewards data', 'All account data'],
            ['Render', 'Cloud hosting for the App\'s backend API server', 'Request data (processed in transit)'],
            ['Vercel', 'Hosting for the staff administration dashboard', 'Admin session data'],
          ].map(([provider, purpose, data]) => (
            <tr key={provider as string}>
              <td style={{ ...s.td, fontWeight: 600 }}>{provider}</td>
              <td style={s.td}>{purpose}</td>
              <td style={s.td}>{data}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={s.p}>
        We do not use advertising networks, data brokers, or analytics companies that track you across
        other apps or websites.
      </p>

      {/* 7 */}
      <h2 style={s.h2}>7. Data Retention</h2>
      <p style={s.p}>
        We retain your data for as long as necessary to provide the service and comply with legal obligations.
        Specific retention periods:
      </p>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Data Type</th>
            <th style={s.th}>Retention Period</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Account profile (phone number, name, email)', 'Until you delete your account'],
            ['Transaction history and rewards balance', 'Until you delete your account, or 5 years for legal/tax compliance — whichever is longer'],
            ['Receipt photos', '12 months from the date of the transaction, then automatically deleted'],
            ['Missing-points dispute reports', '24 months from the date of submission'],
            ['Push notification tokens', 'Refreshed automatically; stale tokens deleted after 90 days of inactivity'],
            ['Employee chat messages', '6 months from the date sent'],
            ['App crash and error logs', '90 days, stored anonymously'],
            ['Deleted account data', 'Fully purged within 30 days of deletion request, except where retention is required by law'],
          ].map(([type, period]) => (
            <tr key={type as string}>
              <td style={{ ...s.td, fontWeight: 600 }}>{type}</td>
              <td style={s.td}>{period}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 8 */}
      <h2 style={s.h2}>8. Your Rights</h2>
      <p style={s.p}>
        Depending on where you live, you may have some or all of the following rights regarding your
        personal data. To exercise any of these rights, contact us at{' '}
        <a href="mailto:support@luckystop.cliffindus.com" style={{ color: '#E63946' }}>
          support@luckystop.cliffindus.com
        </a>
        . We will respond within 30 days.
      </p>
      <ul style={s.ul}>
        <li style={s.li}>
          <strong>Access</strong> — Request a copy of the personal information we hold about you.
        </li>
        <li style={s.li}>
          <strong>Correction</strong> — Ask us to correct inaccurate or incomplete data. You can update your
          name, email, and profile photo directly in the app under Profile → Account Settings.
        </li>
        <li style={s.li}>
          <strong>Deletion</strong> — Request deletion of your account and all associated personal data.
          You can initiate this directly in the app under Profile → Delete My Account, or by emailing us.
          Deletion is processed within 30 days. Some records may be retained where required by law (e.g.
          transaction records for tax purposes).
        </li>
        <li style={s.li}>
          <strong>Portability</strong> — Request an export of your data in a machine-readable format (JSON or CSV).
        </li>
        <li style={s.li}>
          <strong>Opt out of push notifications</strong> — Disable notifications at any time in your device
          settings (Settings → Notifications → Lucky Stop) without affecting your rewards account.
        </li>
        <li style={s.li}>
          <strong>Withdraw consent</strong> — Where we rely on your consent to process data, you may
          withdraw consent at any time. This will not affect processing that occurred before withdrawal.
        </li>
        <li style={s.li}>
          <strong>Lodge a complaint</strong> — You may lodge a complaint with the data protection authority
          in your jurisdiction if you believe we have processed your data unlawfully.
        </li>
      </ul>

      {/* 9 */}
      <h2 style={s.h2}>9. Push Notifications</h2>
      <p style={s.p}>
        We use Firebase Cloud Messaging (FCM) to send push notifications to your device. Notifications
        may include:
      </p>
      <ul style={s.ul}>
        <li style={s.li}>Confirmations when cashback is added to your account</li>
        <li style={s.li}>Special offers and limited-time promotions from your store</li>
        <li style={s.li}>Updates on product requests or missing-points disputes</li>
        <li style={s.li}>Operational updates from your store (employees only)</li>
      </ul>
      <p style={s.p}>
        You can opt out of all push notifications at any time through your device's notification settings.
        Opting out does not affect your rewards account or your ability to use the app.
      </p>

      {/* 10 */}
      <h2 style={s.h2}>10. Biometric &amp; Device Features</h2>
      <p style={s.p}>
        The Lucky Stop app supports biometric login (fingerprint or face recognition) as a convenient
        alternative to your PIN. Biometric authentication is handled entirely by your device's operating
        system (Android Biometric API). We never receive, store, or transmit your biometric data.
        The app only receives a pass or fail result from the device.
      </p>
      <p style={s.p}>
        Your language preference (English or Español) is stored locally on your device using AsyncStorage
        and is not transmitted to our servers.
      </p>

      {/* 11 */}
      <h2 style={s.h2}>11. Children's Privacy</h2>
      <p style={s.p}>
        The Lucky Stop app is not directed at or intended for children under the age of 13. We do not
        knowingly collect personal information from children under 13. If you believe a child under 13
        has created an account or provided us with personal information, please contact us immediately at{' '}
        <a href="mailto:support@luckystop.cliffindus.com" style={{ color: '#E63946' }}>
          support@luckystop.cliffindus.com
        </a>{' '}
        and we will promptly delete the account and all associated data.
      </p>

      {/* 12 */}
      <h2 style={s.h2}>12. California Residents (CCPA)</h2>
      <p style={s.p}>
        If you are a California resident, the California Consumer Privacy Act (CCPA) grants you specific
        rights in addition to those described above:
      </p>
      <ul style={s.ul}>
        <li style={s.li}>
          <strong>Right to Know</strong> — You may request disclosure of the categories and specific pieces
          of personal information we have collected about you in the past 12 months, the sources, our
          business purpose for collecting it, and the categories of third parties with whom we share it.
        </li>
        <li style={s.li}>
          <strong>Right to Delete</strong> — You may request deletion of your personal information, subject
          to certain exceptions permitted by law.
        </li>
        <li style={s.li}>
          <strong>Right to Opt Out of Sale</strong> — We do not sell personal information. No opt-out is
          required, but you may still submit a request to confirm this.
        </li>
        <li style={s.li}>
          <strong>Right to Non-Discrimination</strong> — We will not deny you service, charge different
          prices, or provide a different level of service because you exercised any CCPA right.
        </li>
      </ul>
      <p style={s.p}>
        To exercise your CCPA rights, contact us at{' '}
        <a href="mailto:support@luckystop.cliffindus.com" style={{ color: '#E63946' }}>
          support@luckystop.cliffindus.com
        </a>{' '}
        with the subject line "California Privacy Request". We will verify your identity before processing
        your request and respond within 45 days.
      </p>

      {/* 13 */}
      <h2 style={s.h2}>13. International Users</h2>
      <p style={s.p}>
        Lucky Stop operates primarily in the United States. If you access the app from outside the United
        States, your information will be transferred to, stored, and processed in the United States where
        our servers and service providers are located. By using the app, you consent to this transfer.
        We take steps to ensure your data is protected in accordance with this policy regardless of where
        it is processed.
      </p>

      {/* 14 */}
      <h2 style={s.h2}>14. Security</h2>
      <p style={s.p}>
        We implement industry-standard technical and organizational measures to protect your personal
        information, including:
      </p>
      <ul style={s.ul}>
        <li style={s.li}><strong>Encryption in transit</strong> — all data between the app and our servers is encrypted using HTTPS/TLS.</li>
        <li style={s.li}><strong>Encryption at rest</strong> — database records and stored files are encrypted at the infrastructure level.</li>
        <li style={s.li}><strong>Token-based authentication</strong> — access tokens are short-lived and rotate automatically. No passwords are stored.</li>
        <li style={s.li}><strong>Role-based access control (RBAC)</strong> — every API endpoint enforces the minimum access level required for each role. Staff cannot access data outside their assigned store.</li>
        <li style={s.li}><strong>Audit logging</strong> — sensitive administrative actions (account changes, point grants, account deletions) are recorded in an immutable audit log.</li>
        <li style={s.li}><strong>Receipt photo protection</strong> — receipt images are stored in private cloud buckets not accessible via public URL.</li>
      </ul>
      <p style={s.p}>
        No system is completely secure. If you believe your account has been compromised, contact us
        immediately at{' '}
        <a href="mailto:support@luckystop.cliffindus.com" style={{ color: '#E63946' }}>
          support@luckystop.cliffindus.com
        </a>.
      </p>

      {/* 15 */}
      <h2 style={s.h2}>15. Changes to This Policy</h2>
      <p style={s.p}>
        We may update this privacy policy periodically to reflect changes in our practices, technology,
        legal requirements, or other factors. When we make material changes, we will:
      </p>
      <ul style={s.ul}>
        <li style={s.li}>Update the "Last updated" date at the top of this page</li>
        <li style={s.li}>Send a push notification to app users summarizing the key changes</li>
        <li style={s.li}>For significant changes affecting your rights, ask for your renewed consent where required by law</li>
      </ul>
      <p style={s.p}>
        We encourage you to review this policy periodically. Your continued use of the app after changes
        take effect constitutes acceptance of the updated policy.
      </p>

      <hr style={s.hr} />

      <div style={s.contact}>
        <h2 style={{ ...s.h2, margin: '0 0 12px', borderBottom: 'none', paddingBottom: 0 }}>Contact Us</h2>
        <p style={s.p}>
          If you have any questions about this privacy policy, want to exercise your rights, or need to
          report a privacy concern, please contact us:
        </p>
        <p style={{ ...s.p, margin: 0 }}>
          <strong>Lucky Stop Customer Support</strong><br />
          Email:{' '}
          <a href="mailto:support@luckystop.cliffindus.com" style={{ color: '#E63946' }}>
            support@luckystop.cliffindus.com
          </a><br />
          Response time: within 2 business days for general inquiries; within 30 days for data rights requests.
        </p>
      </div>
    </div>
  );
}
