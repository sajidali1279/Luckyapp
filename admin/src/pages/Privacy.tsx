export default function Privacy() {
  const s: Record<string, React.CSSProperties> = {
    page:    { padding: '48px 24px 80px', fontFamily: 'system-ui, sans-serif', color: '#1a1a1a', lineHeight: 1.7 },
    logo:    { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 },
    badge:   { background: '#1D3557', color: '#fff', fontWeight: 700, fontSize: 20, padding: '8px 16px', borderRadius: 8 },
    h1:      { fontSize: 28, fontWeight: 700, margin: '0 0 6px' },
    updated: { color: '#666', fontSize: 14, margin: '0 0 40px' },
    h2:      { fontSize: 17, fontWeight: 700, margin: '32px 0 8px', color: '#1D3557' },
    p:       { margin: '0 0 12px' },
    ul:      { margin: '0 0 12px', paddingLeft: 22 },
    li:      { marginBottom: 4 },
    hr:      { border: 'none', borderTop: '1px solid #e5e5e5', margin: '40px 0' },
    contact: { background: '#f7f7f7', borderRadius: 10, padding: '20px 24px' },
  };

  return (
    <div style={s.page}>
      <div style={s.logo}>
        <span style={s.badge}>LS</span>
        <span style={{ fontWeight: 700, fontSize: 20 }}>Lucky Stop</span>
      </div>

      <h1 style={s.h1}>Privacy Policy</h1>
      <p style={s.updated}>Last updated: June 7, 2026</p>

      <p style={s.p}>
        Lucky Stop ("we", "our", or "us") operates the Lucky Stop mobile application.
        This policy explains what information we collect, how we use it, and your rights
        regarding your data.
      </p>

      <h2 style={s.h2}>Information We Collect</h2>
      <ul style={s.ul}>
        <li style={s.li}><strong>Phone number</strong> — used to create and identify your account via one-time passcode (OTP) verification.</li>
        <li style={s.li}><strong>Name</strong> — provided by you when setting up your profile.</li>
        <li style={s.li}><strong>Location</strong> — used only while the app is open to find your nearest Lucky Stop store and show relevant offers. We do not track or store your location in the background.</li>
        <li style={s.li}><strong>Purchase history</strong> — transaction amounts and dates recorded when a cashier grants you points, used to calculate your rewards balance.</li>
        <li style={s.li}><strong>Receipt photos</strong> — uploaded by store staff to verify purchases. Stored securely and used only for fraud prevention.</li>
        <li style={s.li}><strong>Camera</strong> — used by store employees to scan your QR code and upload receipt photos. The app requests camera access only when these actions are performed.</li>
      </ul>

      <h2 style={s.h2}>How We Use Your Information</h2>
      <ul style={s.ul}>
        <li style={s.li}>Operate your rewards account and calculate cashback credits</li>
        <li style={s.li}>Display store-specific offers and promotions near you</li>
        <li style={s.li}>Send push notifications about your rewards and store promotions (you may opt out in device settings)</li>
        <li style={s.li}>Prevent fraudulent point claims</li>
        <li style={s.li}>Improve app performance and fix issues</li>
      </ul>

      <h2 style={s.h2}>Information Sharing</h2>
      <p style={s.p}>
        We do not sell your personal information. We share data only with the following
        service providers who help us operate the app:
      </p>
      <ul style={s.ul}>
        <li style={s.li}><strong>Firebase (Google)</strong> — phone number authentication and push notifications</li>
        <li style={s.li}><strong>Cloudinary</strong> — secure storage of receipt and promotional images</li>
        <li style={s.li}><strong>Neon / PostgreSQL</strong> — secure database hosting for account and transaction data</li>
      </ul>
      <p style={s.p}>
        Store managers at your local Lucky Stop can view your transaction history
        for their store only, in order to manage your rewards.
      </p>

      <h2 style={s.h2}>Data Retention</h2>
      <p style={s.p}>
        Your account data is retained for as long as your account is active.
        You may request deletion of your account and associated data at any time
        by contacting us at the address below.
      </p>

      <h2 style={s.h2}>Children's Privacy</h2>
      <p style={s.p}>
        The Lucky Stop app is not directed at children under the age of 13.
        We do not knowingly collect personal information from children under 13.
      </p>

      <h2 style={s.h2}>Your Rights</h2>
      <p style={s.p}>You have the right to:</p>
      <ul style={s.ul}>
        <li style={s.li}>Access the personal information we hold about you</li>
        <li style={s.li}>Request correction of inaccurate data</li>
        <li style={s.li}>Request deletion of your account and data</li>
        <li style={s.li}>Opt out of promotional push notifications via your device settings</li>
      </ul>

      <h2 style={s.h2}>Security</h2>
      <p style={s.p}>
        We use industry-standard security measures including encrypted connections (HTTPS),
        token-based authentication, and role-based access controls to protect your data.
      </p>

      <h2 style={s.h2}>Changes to This Policy</h2>
      <p style={s.p}>
        We may update this privacy policy from time to time. We will notify you of
        significant changes via the app or by updating the date at the top of this page.
      </p>

      <hr style={s.hr} />

      <div style={s.contact}>
        <h2 style={{ ...s.h2, margin: '0 0 8px' }}>Contact Us</h2>
        <p style={{ ...s.p, margin: 0 }}>
          If you have questions about this privacy policy or your data, contact us at:<br />
          <strong>Lucky Stop Customer Support</strong><br />
          Email: <a href="mailto:support@luckystop.cliffindus.com" style={{ color: '#E63946' }}>support@luckystop.cliffindus.com</a>
        </p>
      </div>
    </div>
  );
}
