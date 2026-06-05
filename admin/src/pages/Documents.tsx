import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '../store/authStore';

// ─── Import all docs as raw markdown strings (bundled at build time) ──────────
import privacyPolicyMd       from '../../../docs/legal/privacy-policy.md?raw';
import termsOfServiceMd      from '../../../docs/legal/terms-of-service.md?raw';
import merchantAgreementMd   from '../../../docs/legal/merchant-agreement.md?raw';
import loyaltyTermsMd        from '../../../docs/legal/loyalty-program-terms.md?raw';
import superAdminManualMd    from '../../../docs/user-manual/super-admin-manual.md?raw';
import storeManagerManualMd  from '../../../docs/user-manual/store-manager-manual.md?raw';
import employeeManualMd      from '../../../docs/user-manual/employee-manual.md?raw';
import customerGuideMd       from '../../../docs/user-manual/customer-guide.md?raw';
import appDocumentationMd    from '../../../docs/technical/app-documentation.md?raw';
import storeOwnerPitchMd     from '../../../docs/business/store-owner-pitch.md?raw';
import storeOwnerOverviewMd  from '../../../docs/business/store-owner-overview.md?raw';
import cashierQuickRefMd     from '../../../docs/operational/cashier-quick-reference.md?raw';
import newStoreChecklistMd   from '../../../docs/operational/new-store-setup-checklist.md?raw';
import changelogMd           from '../../../docs/operational/changelog.md?raw';
import dpaMd                 from '../../../docs/legal/data-processing-agreement.md?raw';
import slaMd                 from '../../../docs/legal/service-level-agreement.md?raw';
import cookiePolicyMd        from '../../../docs/legal/cookie-policy.md?raw';
import aupMd                 from '../../../docs/legal/acceptable-use-policy.md?raw';

// ─── Doc manifest ─────────────────────────────────────────────────────────────

type DocRole = 'DEV_ADMIN' | 'SUPER_ADMIN' | 'STORE_MANAGER';

interface Doc {
  id: string;
  title: string;
  description: string;
  icon: string;
  content: string;
  roles: DocRole[];        // which roles can see this doc
  category: 'legal' | 'manual' | 'technical' | 'business' | 'operational';
}

const ALL_DOCS: Doc[] = [
  // Legal
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    description: 'CCPA/COPPA compliance, data collection, retention, and subprocessors.',
    icon: '🔒',
    content: privacyPolicyMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  {
    id: 'terms-of-service',
    title: 'Terms of Service',
    description: 'Customer eligibility, loyalty rules, fraud prohibitions, and arbitration.',
    icon: '📋',
    content: termsOfServiceMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  {
    id: 'merchant-agreement',
    title: 'Merchant Agreement',
    description: 'B2B contract between Cliff Industries and store operators — SLA, fees, DPA.',
    icon: '🤝',
    content: merchantAgreementMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  {
    id: 'loyalty-program-terms',
    title: 'Loyalty Program Terms',
    description: 'Cashback rates, tier system, catalog redemption, and program rules.',
    icon: '🏆',
    content: loyaltyTermsMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  // User Manuals
  {
    id: 'super-admin-manual',
    title: 'Super Admin Manual',
    description: 'Full HQ portal guide — stores, staff, offers, analytics, audit logs.',
    icon: '👑',
    content: superAdminManualMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'manual',
  },
  {
    id: 'store-manager-manual',
    title: 'Store Manager Manual',
    description: 'Order lists, employee requests, offers, schedules, and reports.',
    icon: '🏪',
    content: storeManagerManualMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'],
    category: 'manual',
  },
  {
    id: 'employee-manual',
    title: 'Employee Manual',
    description: 'Transaction flow, receipt standards, item requests, and critical rules.',
    icon: '👤',
    content: employeeManualMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'],
    category: 'manual',
  },
  {
    id: 'customer-guide',
    title: 'Customer Guide',
    description: 'Onboarding, QR code, tiers, catalog redemption, and FAQ.',
    icon: '📱',
    content: customerGuideMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'],
    category: 'manual',
  },
  // Technical
  {
    id: 'app-documentation',
    title: 'Technical Documentation',
    description: 'Architecture, API reference, schema, deployment, fraud prevention.',
    icon: '⚙️',
    content: appDocumentationMd,
    roles: ['DEV_ADMIN'],
    category: 'technical',
  },
  // Legal (additional)
  {
    id: 'data-processing-agreement',
    title: 'Data Processing Agreement',
    description: 'DPA between Cliff Industries (Processor) and store operators (Controller) — CCPA/privacy compliance.',
    icon: '🔐',
    content: dpaMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  {
    id: 'service-level-agreement',
    title: 'Service Level Agreement',
    description: 'Uptime commitment (99.5%), support response times, service credits, and maintenance windows.',
    icon: '📶',
    content: slaMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  {
    id: 'cookie-policy',
    title: 'Cookie Policy',
    description: 'Cookies and local storage used by the admin portal — what, why, and how to manage them.',
    icon: '🍪',
    content: cookiePolicyMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  {
    id: 'acceptable-use-policy',
    title: 'Acceptable Use Policy',
    description: 'Platform rules for all roles — prohibited uses, fraud prevention, enforcement, and reporting.',
    icon: '📜',
    content: aupMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN'],
    category: 'legal',
  },
  // Business
  {
    id: 'store-owner-pitch',
    title: 'Store Owner Pitch',
    description: 'Sales pitch for prospective store owners — value proposition, features, pricing, and onboarding.',
    icon: '📊',
    content: storeOwnerPitchMd,
    roles: ['DEV_ADMIN'],
    category: 'business',
  },
  {
    id: 'store-owner-overview',
    title: 'Store Owner Overview',
    description: 'Operational overview for onboarded store owners — what they have, how it works, support.',
    icon: '🏬',
    content: storeOwnerOverviewMd,
    roles: ['DEV_ADMIN'],
    category: 'business',
  },
  // Operational
  {
    id: 'cashier-quick-reference',
    title: 'Cashier Quick Reference',
    description: 'One-page printable guide for cashiers — scan flow, redemption, common issues, and rules.',
    icon: '🖨️',
    content: cashierQuickRefMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'],
    category: 'operational',
  },
  {
    id: 'new-store-setup-checklist',
    title: 'New Store Setup Checklist',
    description: 'Step-by-step onboarding checklist for launching a new store on the platform.',
    icon: '✅',
    content: newStoreChecklistMd,
    roles: ['DEV_ADMIN'],
    category: 'operational',
  },
  {
    id: 'changelog',
    title: 'Platform Changelog',
    description: 'Release notes and feature history — what changed, when, and which roles it affects.',
    icon: '📝',
    content: changelogMd,
    roles: ['DEV_ADMIN', 'SUPER_ADMIN', 'STORE_MANAGER'],
    category: 'operational',
  },
];

const CATEGORIES = [
  { id: 'legal',       label: 'Legal Documents',  icon: '⚖️',  color: '#1D3557', bg: '#EFF6FF' },
  { id: 'manual',      label: 'User Manuals',      icon: '📖',  color: '#157A6E', bg: '#F0FDF9' },
  { id: 'technical',   label: 'Technical Docs',    icon: '🛠️',  color: '#7C3AED', bg: '#F5F3FF' },
  { id: 'business',    label: 'Business Docs',     icon: '📊',  color: '#B45309', bg: '#FFFBEB' },
  { id: 'operational', label: 'Operations',        icon: '⚙️',  color: '#0F766E', bg: '#F0FDFA' },
] as const;

// ─── Reader modal ─────────────────────────────────────────────────────────────

function DocReader({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  function handlePrint() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Convert markdown to a simple plain-text representation for printing
    // We'll inject the rendered HTML
    const el = document.getElementById('doc-reader-content');
    const html = el?.innerHTML ?? '';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${doc.title}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              font-size: 13px; line-height: 1.7; color: #212529;
              max-width: 800px; margin: 0 auto; padding: 48px 40px;
            }
            h1 { font-size: 26px; font-weight: 900; color: #1D3557; margin-bottom: 8px; padding-bottom: 12px; border-bottom: 2px solid #E63946; }
            h2 { font-size: 18px; font-weight: 800; color: #1D3557; margin: 28px 0 10px; }
            h3 { font-size: 15px; font-weight: 700; color: #1D3557; margin: 20px 0 8px; }
            h4 { font-size: 13px; font-weight: 700; color: #495057; margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 0.5px; }
            p { margin-bottom: 10px; }
            ul, ol { padding-left: 20px; margin-bottom: 10px; }
            li { margin-bottom: 4px; }
            strong { font-weight: 700; }
            em { font-style: italic; }
            code { font-family: 'Courier New', monospace; background: #f1f3f5; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
            pre { background: #f1f3f5; border-radius: 8px; padding: 14px; margin: 12px 0; overflow-x: auto; }
            pre code { background: none; padding: 0; }
            table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; }
            th { background: #1D3557; color: #fff; padding: 8px 12px; text-align: left; font-weight: 700; }
            td { padding: 7px 12px; border-bottom: 1px solid #dee2e6; }
            tr:nth-child(even) td { background: #f8f9fa; }
            blockquote { border-left: 4px solid #E63946; padding: 8px 16px; margin: 12px 0; color: #495057; background: #fff5f5; }
            hr { border: none; border-top: 1px solid #dee2e6; margin: 20px 0; }
            a { color: #E63946; text-decoration: none; }
            @media print {
              body { padding: 20px; }
              @page { margin: 2cm; }
            }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
  }

  return (
    <div style={rs.overlay} onClick={onClose}>
      <div style={rs.panel} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={rs.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>{doc.icon}</span>
            <div>
              <div style={rs.headerTitle}>{doc.title}</div>
              <div style={rs.headerSub}>{doc.description}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={handlePrint} style={rs.printBtn}>
              🖨️ Download PDF
            </button>
            <button onClick={onClose} style={rs.closeBtn}>✕</button>
          </div>
        </div>

        {/* Content */}
        <div style={rs.body}>
          <div id="doc-reader-content" style={rs.prose}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {doc.content}
            </ReactMarkdown>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Documents() {
  const { user } = useAuthStore();
  const role = (user?.role ?? 'STORE_MANAGER') as DocRole;
  const [activeDoc, setActiveDoc] = useState<Doc | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const visibleDocs = ALL_DOCS.filter(d => d.roles.includes(role));
  const filteredDocs = activeCategory
    ? visibleDocs.filter(d => d.category === activeCategory)
    : visibleDocs;

  return (
    <div style={ps.root}>

      {/* Page header */}
      <div style={ps.hero}>
        <div>
          <h1 style={ps.heroTitle}>Documents</h1>
          <p style={ps.heroSub}>Legal agreements, user manuals, and technical documentation.</p>
        </div>
      </div>

      {/* Category filter */}
      <div style={ps.filterRow}>
        <button
          style={{ ...ps.filterBtn, ...(activeCategory === null ? ps.filterBtnActive : {}) }}
          onClick={() => setActiveCategory(null)}
        >
          All ({visibleDocs.length})
        </button>
        {CATEGORIES.map(cat => {
          const count = visibleDocs.filter(d => d.category === cat.id).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.id}
              style={{ ...ps.filterBtn, ...(activeCategory === cat.id ? ps.filterBtnActive : {}) }}
              onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            >
              {cat.icon} {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Doc grid */}
      <div style={ps.grid}>
        {filteredDocs.map(doc => {
          const cat = CATEGORIES.find(c => c.id === doc.category)!;
          return (
            <button
              key={doc.id}
              style={ps.card}
              onClick={() => setActiveDoc(doc)}
            >
              <div style={{ ...ps.cardIconWrap, background: cat.bg }}>
                <span style={ps.cardIcon}>{doc.icon}</span>
              </div>
              <div style={ps.cardBody}>
                <div style={ps.cardTitle}>{doc.title}</div>
                <div style={ps.cardDesc}>{doc.description}</div>
              </div>
              <div style={{ ...ps.cardCatBadge, color: cat.color, background: cat.bg }}>
                {cat.icon} {cat.label}
              </div>
              <span style={ps.cardArrow}>→</span>
            </button>
          );
        })}
      </div>

      {/* Reader */}
      {activeDoc && (
        <DocReader doc={activeDoc} onClose={() => setActiveDoc(null)} />
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ps: Record<string, React.CSSProperties> = {
  root: { padding: '32px 32px 48px' },
  hero: {
    marginBottom: 28, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 16,
  },
  heroTitle: { fontSize: 28, fontWeight: 900, color: '#1D3557', marginBottom: 6 },
  heroSub: { fontSize: 14, color: '#6c757d', margin: 0 },

  filterRow: { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' as const },
  filterBtn: {
    background: '#f1f5f9', border: '1.5px solid #e2e8f0',
    borderRadius: 20, padding: '7px 16px',
    fontSize: 13, fontWeight: 600, color: '#475569',
    cursor: 'pointer', transition: 'all 0.15s ease',
  },
  filterBtnActive: {
    background: '#1D3557', borderColor: '#1D3557', color: '#fff',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: 16,
  },
  card: {
    background: '#fff', border: '1.5px solid #e9ecef', borderRadius: 16,
    padding: '20px', cursor: 'pointer', textAlign: 'left' as const,
    display: 'flex', flexDirection: 'column' as const, gap: 12,
    transition: 'box-shadow 0.15s ease, border-color 0.15s ease, transform 0.1s ease',
    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    position: 'relative' as const,
  },
  cardIconWrap: {
    width: 48, height: 48, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  cardIcon: { fontSize: 22 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: 800, color: '#1D3557', marginBottom: 4 },
  cardDesc: { fontSize: 13, color: '#6c757d', lineHeight: 1.5 },
  cardCatBadge: {
    fontSize: 11, fontWeight: 700, borderRadius: 8,
    padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content',
  },
  cardArrow: {
    position: 'absolute' as const, right: 20, top: 20,
    fontSize: 16, color: '#cbd5e1', fontWeight: 700,
  },
};

const rs: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const, inset: 0,
    background: 'rgba(0,0,0,0.55)', zIndex: 1000,
    display: 'flex', alignItems: 'stretch',
    justifyContent: 'flex-end',
  },
  panel: {
    background: '#fff', width: '100%',
    display: 'flex', flexDirection: 'column' as const,
    boxShadow: '-8px 0 40px rgba(0,0,0,0.18)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '20px 28px', borderBottom: '1px solid #e9ecef',
    background: '#fff', flexShrink: 0,
    gap: 16,
  },
  headerTitle: { fontSize: 17, fontWeight: 900, color: '#1D3557' },
  headerSub: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  printBtn: {
    background: '#1D3557', color: '#fff',
    border: 'none', borderRadius: 10,
    padding: '9px 18px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
  closeBtn: {
    background: '#f1f5f9', color: '#495057',
    border: 'none', borderRadius: 8,
    width: 34, height: 34, fontSize: 14, fontWeight: 700,
    cursor: 'pointer', flexShrink: 0,
  },
  body: {
    flex: 1, overflowY: 'auto' as const,
    padding: '32px 40px 48px',
  },
  prose: {
    fontSize: 14, lineHeight: 1.75, color: '#212529',
    maxWidth: 720,
  },
};
