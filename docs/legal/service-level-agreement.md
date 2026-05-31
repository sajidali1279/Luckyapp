# Service Level Agreement (SLA)

**Provider:** Cliff Industries, operator of the Lucky Stop Loyalty Platform  
**Applies to:** All active Lucky Stop store subscribers  
**Effective Date:** Upon execution of the Merchant Agreement  
**Contact:** sksajidali1279@gmail.com

---

## 1. Scope

This Service Level Agreement defines the uptime commitment, support response times, maintenance procedures, and service credit terms for the Lucky Stop Loyalty Platform, including:

- The mobile app (iOS and Android)
- The web admin portal (admin.luckystop.cliffindus.com)
- The backend API (api.luckystop.cliffindus.com)
- Push notification delivery

---

## 2. Uptime Commitment

Cliff Industries commits to **99.5% monthly uptime** for the Lucky Stop backend API and admin portal.

| Metric | Target |
|---|---|
| Monthly uptime | 99.5% |
| Maximum monthly downtime | ~3.6 hours |
| Measurement period | Calendar month |

**Uptime** is defined as the API returning valid responses to authenticated requests. Uptime is not measured at the mobile app or push notification layer, as those depend on third-party infrastructure (Apple, Google, Firebase).

### Exclusions

The following are excluded from uptime calculations:

- Scheduled maintenance windows (see Section 4)
- Outages caused by third-party services (Firebase, Neon, Render, Cloudinary, Vercel)
- Force majeure events (natural disasters, widespread internet outages)
- Outages caused by the subscriber's own internet connectivity or device issues
- Outages resulting from subscriber actions that violate the Merchant Agreement or Acceptable Use Policy

---

## 3. Support Response Times

| Severity | Definition | Response Time | Resolution Target |
|---|---|---|---|
| **Critical** | Platform fully down during business hours — no transactions can be processed | 2 hours | 4 hours |
| **High** | Core feature broken (scanning, redemption) — significant business impact | 4 hours | 8 hours |
| **Medium** | Non-core feature degraded (analytics, scheduling) — workaround available | 1 business day | 3 business days |
| **Low** | Minor issue, cosmetic bug, documentation request | 2 business days | Next release cycle |

**Business hours:** Monday–Friday, 9am–6pm Central Time.  
Critical issues reported outside business hours will receive an initial response by the next business day morning, with best-effort same-day resolution for issues that began after hours.

**To report an issue:**  
Email sksajidali1279@gmail.com with your store name, a description of the issue, and the severity level. Screenshots or screen recordings speed up resolution significantly.

---

## 4. Scheduled Maintenance

Scheduled maintenance (software updates, database migrations, infrastructure changes) will be performed during the following windows:

- **Preferred window:** Sunday 2am–5am Central Time
- **Notice:** At least 48 hours advance notice via email to the store's registered contact
- **Duration:** Typically less than 30 minutes; maximum 3 hours for major updates

Scheduled maintenance does not count toward the monthly downtime calculation.

Emergency maintenance (required to prevent a security incident or data loss) may be performed at any time with as much notice as practicable.

---

## 5. Service Credits

If monthly uptime falls below the 99.5% commitment (excluding scheduled maintenance and the exclusions in Section 2), the subscriber is entitled to a service credit applied to their next billing cycle:

| Actual Monthly Uptime | Credit |
|---|---|
| 99.0% – 99.49% | 10% of monthly fee |
| 98.0% – 98.99% | 25% of monthly fee |
| Below 98.0% | 50% of monthly fee |

**To claim a credit:**  
Submit a request by email within 14 days of the end of the affected month. Include your store name and the dates/times of the outage. Cliff Industries will review and apply confirmed credits within one billing cycle.

Service credits are the subscriber's sole remedy for downtime and do not affect the subscriber's right to terminate the Merchant Agreement under its terms.

---

## 6. Data Backup and Recovery

- Database backups are performed daily with a minimum 7-day retention
- Receipt photo backups follow the storage provider's (Cloudinary) redundancy guarantees
- Recovery Point Objective (RPO): 24 hours — in a worst-case data loss scenario, up to 24 hours of data may be unrecoverable
- Recovery Time Objective (RTO): 4 hours — the platform will be restored within 4 hours of a confirmed catastrophic failure

---

## 7. Platform Updates and Feature Changes

- App updates are delivered via the App Store and Google Play. Subscribers cannot control the update schedule, but Cliff Industries will not remove features without at least 30 days' notice.
- Breaking changes to the mobile app or admin portal that require staff retraining will be communicated with at least 14 days' advance notice.
- Feature additions and improvements are included in the subscription at no additional cost unless otherwise stated.

---

## 8. Modifications to This SLA

Cliff Industries may update this SLA with 30 days' written notice. Continued use of the platform after the notice period constitutes acceptance of the updated terms.

---

*Cliff Industries — Lucky Stop Loyalty Platform*  
*Last updated: May 2026*
