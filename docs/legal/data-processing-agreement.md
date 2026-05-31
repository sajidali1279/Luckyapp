# Data Processing Agreement

**Between:**  
**Cliff Industries** ("Processor"), operator of the Lucky Stop Loyalty Platform  
Contact: sksajidali1279@gmail.com

**And:**  
The store operator named in the accompanying Merchant Agreement ("Controller")

**Effective Date:** The date the Merchant Agreement is executed between the parties.

---

## 1. Definitions

**"Personal Data"** means any information relating to an identified or identifiable natural person, including but not limited to names, phone numbers, purchase history, device identifiers, and location data collected through the Lucky Stop Loyalty Platform.

**"Processing"** means any operation performed on Personal Data, including collection, storage, retrieval, use, disclosure, or deletion.

**"Data Subject"** means any individual whose Personal Data is processed under this Agreement — primarily customers and employees of the Controller.

**"Applicable Privacy Law"** means the California Consumer Privacy Act (CCPA), the Children's Online Privacy Protection Act (COPPA), and any other applicable federal or state privacy legislation.

---

## 2. Scope of Processing

Cliff Industries processes Personal Data on behalf of the Controller solely for the purpose of operating the Lucky Stop Loyalty Platform, including:

- Authenticating users via phone number and OTP
- Recording and crediting loyalty transactions
- Delivering push notifications related to offers and account activity
- Storing receipt photos for fraud verification
- Generating transaction analytics and reporting visible to the Controller
- Responding to data subject rights requests coordinated through the Controller

Processing is limited to what is necessary to provide the services described in the Merchant Agreement.

---

## 3. Controller's Obligations

The Controller agrees to:

- Ensure that any collection of Personal Data from customers and employees is accompanied by an appropriate privacy notice referencing the Lucky Stop Privacy Policy
- Obtain any consents required under Applicable Privacy Law before enrolling customers in the loyalty program
- Promptly notify Cliff Industries of any instruction that the Controller believes would violate Applicable Privacy Law
- Respond to data subject requests (access, deletion, opt-out) in coordination with Cliff Industries

---

## 4. Processor's Obligations

Cliff Industries agrees to:

- Process Personal Data only on documented instructions from the Controller, except where required by law
- Ensure that personnel with access to Personal Data are bound by confidentiality obligations
- Implement and maintain appropriate technical and organizational security measures as described in Section 6
- Not sell, rent, or share Personal Data with third parties except as necessary to provide the services (see Section 5 — Subprocessors)
- Assist the Controller in responding to data subject rights requests within 10 business days of receiving a verified request
- Delete or return all Personal Data upon termination of the Merchant Agreement, at the Controller's written request, within 30 days

---

## 5. Subprocessors

Cliff Industries uses the following subprocessors to deliver the platform services. The Controller authorizes their use as part of this Agreement:

| Subprocessor | Purpose | Location |
|---|---|---|
| **Neon** | PostgreSQL database hosting | United States |
| **Render** | Backend API hosting | United States |
| **Firebase (Google)** | Phone authentication, push notifications | United States |
| **Cloudinary** | Receipt photo and image storage | United States |
| **Vercel** | Admin portal hosting | United States |

Cliff Industries will notify the Controller at least 14 days before adding or replacing a subprocessor that processes Personal Data. If the Controller objects, either party may terminate the Merchant Agreement with 30 days' written notice.

---

## 6. Security Measures

Cliff Industries implements the following technical and organizational measures to protect Personal Data:

**Technical:**
- All data in transit encrypted via TLS 1.2 or higher
- All data at rest encrypted at the database layer
- Authentication tokens expire and are rotated regularly
- Receipt images stored in access-controlled cloud storage
- Role-based access control (RBAC) limits data access to authorized personnel

**Organizational:**
- Access to production systems limited to Cliff Industries personnel with a legitimate operational need
- No Personal Data is processed on personal devices without appropriate controls
- Security incidents are reviewed and documented

---

## 7. Data Breach Notification

In the event of a confirmed breach of Personal Data that poses a risk to data subjects, Cliff Industries will:

1. Notify the Controller within **72 hours** of becoming aware of the breach
2. Provide the nature of the breach, the categories and approximate number of data subjects affected, and the likely consequences
3. Describe the measures taken or proposed to address the breach

The Controller is responsible for any notifications to data subjects or regulatory authorities as required by Applicable Privacy Law.

---

## 8. Data Retention and Deletion

Personal Data is retained for as long as the customer or employee account is active, plus:

- Transaction records: 3 years after the transaction date (for audit and billing integrity)
- Receipt photos: 1 year after the transaction date
- Deleted accounts: Personal Data is removed within 30 days of account deletion. Transaction records are anonymized but retained for billing verification.

Upon termination of the Merchant Agreement, Cliff Industries will delete all Personal Data associated with the Controller's store within 60 days, except where retention is required by law.

---

## 9. Data Subject Rights

Under CCPA and other Applicable Privacy Law, data subjects have the right to:

- **Know** what Personal Data is collected and how it is used
- **Delete** their Personal Data (subject to legal exceptions)
- **Opt out** of the sale of their Personal Data (Cliff Industries does not sell Personal Data)
- **Non-discrimination** for exercising privacy rights

Customers may submit deletion requests through the Lucky Stop mobile app (Delete My Account) or by emailing sksajidali1279@gmail.com. The Controller may also submit requests on behalf of their customers or employees.

---

## 10. Term and Termination

This Agreement remains in effect for the duration of the Merchant Agreement. It terminates automatically when the Merchant Agreement terminates. Sections 6, 7, 8, and 9 survive termination.

---

## 11. Governing Law

This Agreement is governed by the laws of the State of California, consistent with the Merchant Agreement.

---

## 12. Order of Precedence

In the event of a conflict between this Data Processing Agreement and the Merchant Agreement, this Agreement controls with respect to data processing matters only.

---

*Cliff Industries — Lucky Stop Loyalty Platform*  
*Last updated: May 2026*
