/**
 * Generates and opens a printable invoice in a new window.
 * The user can then Save as PDF from the browser's print dialog.
 */
export function downloadInvoicePdf(invoice: {
  period: string;
  totalDevCut: number;
  totalCashback: number;
  totalTxns: number;
  totalVolume: number;
  isPaid: boolean;
  paidAt: string | null;
  stores: { store: { name: string; city: string }; amount: number; txCount: number; cashbackIssued: number }[];
}) {
  const [y, m] = invoice.period.split('-').map(Number);
  const monthName = new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
  const invoiceNumber = `INV-${invoice.period.replace('-', '')}`;
  const issuedDate = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const paidDate = invoice.paidAt
    ? new Date(invoice.paidAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  const fmt$ = (n: number) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const storeRows = [...invoice.stores]
    .sort((a, b) => b.amount - a.amount)
    .map((row) => `
      <tr>
        <td>${row.store.name}</td>
        <td>${row.store.city}</td>
        <td style="text-align:right">${row.txCount}</td>
        <td style="text-align:right">${fmt$(row.cashbackIssued)}</td>
        <td style="text-align:right; font-weight:600; color:#c0392b">${fmt$(row.amount)}</td>
      </tr>
    `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoiceNumber} — Lucky Stop</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #222; padding: 48px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand-icon { font-size: 36px; }
    .brand-name { font-size: 22px; font-weight: 900; color: #1D3557; line-height: 1; }
    .brand-sub { font-size: 11px; color: #888; letter-spacing: 1px; text-transform: uppercase; }
    .invoice-meta { text-align: right; }
    .invoice-title { font-size: 28px; font-weight: 800; color: #E63946; }
    .invoice-num { font-size: 13px; color: #666; margin-top: 4px; }
    .status-badge { display: inline-block; margin-top: 8px; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    .status-paid { background: #d4edda; color: #155724; }
    .status-unpaid { background: #fff3cd; color: #856404; }
    .divider { border: none; border-top: 2px solid #E63946; margin: 32px 0; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 36px; }
    .party label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 6px; display: block; }
    .party .name { font-size: 15px; font-weight: 700; color: #1D3557; }
    .party .detail { font-size: 12px; color: #666; margin-top: 2px; }
    .dates { display: flex; gap: 48px; margin-bottom: 36px; }
    .date-item label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; }
    .date-item .val { font-size: 14px; font-weight: 600; color: #222; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #1D3557; color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    th:not(:first-child):not(:nth-child(2)) { text-align: right; }
    td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 12px; }
    tr:last-child td { border-bottom: none; }
    tr:nth-child(even) { background: #f9f9f9; }
    .totals { margin-left: auto; width: 300px; border-top: 2px solid #eee; padding-top: 16px; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
    .totals-row.total { border-top: 2px solid #1D3557; padding-top: 12px; margin-top: 6px; font-size: 16px; font-weight: 800; color: #1D3557; }
    .totals-row.total .amount { color: #E63946; }
    .payment-proof { margin-top: 40px; background: #f0fff4; border: 1.5px solid #68d391; border-radius: 10px; padding: 16px 20px; }
    .payment-proof .proof-title { font-weight: 700; color: #276749; font-size: 14px; margin-bottom: 4px; }
    .payment-proof .proof-detail { font-size: 12px; color: #276749; }
    .footer { margin-top: 48px; border-top: 1px solid #eee; padding-top: 16px; text-align: center; font-size: 11px; color: #aaa; }
    @media print {
      body { padding: 24px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-icon">⛽</div>
      <div>
        <div class="brand-name">Lucky Stop</div>
        <div class="brand-sub">Platform Services</div>
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-num">${invoiceNumber}</div>
      <div class="status-badge ${invoice.isPaid ? 'status-paid' : 'status-unpaid'}">
        ${invoice.isPaid ? '✓ PAID' : 'UNPAID'}
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="parties">
    <div class="party">
      <label>From</label>
      <div class="name">Lucky Stop Platform</div>
      <div class="detail">Platform Developer</div>
      <div class="detail">luckystop-api.onrender.com</div>
    </div>
    <div class="party" style="text-align:right">
      <label>Bill To</label>
      <div class="name">Lucky Stop HQ</div>
      <div class="detail">Super Administrator</div>
      <div class="detail">All Stores</div>
    </div>
  </div>

  <div class="dates">
    <div class="date-item">
      <label>Billing Period</label>
      <div class="val">${monthName}</div>
    </div>
    <div class="date-item">
      <label>Invoice Date</label>
      <div class="val">${issuedDate}</div>
    </div>
    <div class="date-item">
      <label>Date Paid</label>
      <div class="val">${paidDate}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Store</th>
        <th>City</th>
        <th style="text-align:right">Transactions</th>
        <th style="text-align:right">Cashback Issued</th>
        <th style="text-align:right">Platform Fee</th>
      </tr>
    </thead>
    <tbody>
      ${storeRows}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Total Cashback Issued</span>
      <span>${fmt$(invoice.totalCashback)}</span>
    </div>
    <div class="totals-row">
      <span>Total Transactions</span>
      <span>${invoice.totalTxns.toLocaleString()}</span>
    </div>
    <div class="totals-row">
      <span>Purchase Volume</span>
      <span>${fmt$(invoice.totalVolume)}</span>
    </div>
    <div class="totals-row total">
      <span>Platform Fee Due</span>
      <span class="amount">${fmt$(invoice.totalDevCut)}</span>
    </div>
  </div>

  ${invoice.isPaid && invoice.paidAt ? `
  <div class="payment-proof">
    <div class="proof-title">✓ Payment Confirmed</div>
    <div class="proof-detail">This invoice was marked as paid on ${paidDate}. This document serves as proof of payment for the ${monthName} billing cycle.</div>
  </div>
  ` : ''}

  <div class="footer">
    Lucky Stop Platform · Invoice ${invoiceNumber} · Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
  </div>

  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Please allow pop-ups to download the invoice PDF.'); return; }
  win.document.write(html);
  win.document.close();
}
