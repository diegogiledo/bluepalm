# BluePalm Auto Care — mobile detailing marketplace (MVP)

*A cleaner car. Right at your door.* A Next.js app for a Tampa Bay & Sarasota mobile car detailing marketplace. Customers book through BluePalm, BluePalm runs bookings, payments and the customer relationship, and vetted independent detailers do the work.

## Quick start

```bash
npm install
cp .env.example .env.local   # set ADMIN_EMAIL, ADMIN_PASSWORD (10+ chars), SESSION_SECRET
npm run dev                  # http://localhost:3000
```

If Supabase isn't configured, the app stores data in `./data/dev-db.json` and uploads in `./data/uploads`. This mode is for development only. Emails are written to **Admin → Notifications** and are not delivered until a Resend key is set.

To reset local data, stop the server and delete the `data/` folder. Packages, launch ZIP codes and settings are seeded again on the next request.

### Production setup
1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor. It enables RLS with no public policies; all access is server-side through the service-role key.
2. Create staff users in Supabase Auth, then `insert into staff (email, role) values (..., 'admin' | 'dispatcher')`.
3. Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `NEXT_PUBLIC_SITE_URL`.
4. Add `RESEND_API_KEY` + `EMAIL_FROM` (verified domain) and Stripe keys. Point a Stripe webhook at `/api/stripe/webhook` (events: `checkout.session.completed`, `account.updated`).

## Map of the app

| Area | Routes |
|---|---|
| Marketing | `/`, `/locations/{manatee-county,sarasota-county,st-petersburg,tampa}`, `/become-a-detailer`, `/detailer-agreement` |
| Booking | `/book` (6-step wizard) → `POST /api/bookings` |
| Customer account | `/account/login` (magic link) → `/account` (upcoming, history, rebook, ratings, messages, recurring plans, loyalty) |
| Detailer portal | `/detailer/login` (magic link) → `/detailer` (onboarding checklist, available/accepted/completed jobs, earnings, ratings, messages) |
| Admin | `/admin` overview · bookings · customers · recurring · detailers · service areas · pricing & commission · notifications |

Code layout: `lib/` holds the data layer (`db.ts`), auth (`auth.ts`, `portal.ts`), business logic (`services.ts`), integrations (`notify.ts`, `stripe.ts`, `files.ts`) and content (`config.ts`, `faq.ts`, `locations.ts`). UI lives in `components/`.

## What's implemented vs. future

**Implemented and tested end to end (local mode)**
- Responsive marketing site with Framer Motion: scroll reveals, staggered cards, hero parallax, an animated wash visual, a nav that shrinks and hides on scroll, FAQ accordion, step transitions, a floating mobile Book button, and an animated service-area map. Reduced-motion preferences are respected through `MotionConfig reducedMotion="user"` and a CSS fallback.
- ZIP checker and booking that **only** accept ZIPs enabled in Admin → Service areas. Launch ZIPs are seeded and can be edited.
- Booking wizard with client and server validation (zod), a honeypot and rate limiting. Bookings are *requests* until staff confirm them. Time windows are preferences, so no fake availability is shown. Preferred-detailer selection only lists approved detailers who serve that county.
- Recurring plans (every 2 weeks / monthly): customers can pause, resume, switch or cancel; admin creates the next visit with one click. One-tap rebooking, booking history, loyalty points (1 pt per $1 on completion, configurable) and ratings.
- Detailer application with insurance upload (file type checked by its contents, 8 MB limit, private storage, admin-only download), agreement acknowledgments, and an onboarding/verification checklist. Accepting jobs is locked until insurance and background check are verified.
- Customer data minimization: before accepting a job, detailers see only service, vehicle, city/ZIP and date. After accepting, they see first name, address and instructions — never email or phone. All messaging runs through BluePalm.
- Admin: confirm requests, assign detailers manually, set final price, cancel, refund (admin only), message, approve/reject/suspend detailers, commission (default plus per-detailer override, locked onto each booking), package pricing, ZIPs, revenue/performance figures, and a notification log.
- Role-based access: `admin` has full access; `dispatcher` can manage bookings, customers, recurring plans and assignments, but not pricing, ZIPs, refunds, documents or notifications. Staff sessions use HMAC-signed httpOnly cookies, with a login rate limit.
- SEO: per-page metadata, four local landing pages, `sitemap.xml`, `robots.txt`, AutoWash/Service/FAQPage JSON-LD. The JSON-LD claims no ratings and no street address.
- Counters show only figures computed from the database, and only after a minimum threshold (25 completed jobs, 20 ratings). Testimonials are clearly labeled placeholders.

**Code written but not yet tested against live services (needs API keys)**
- Supabase backend (`lib/db.ts` Supabase store, Supabase Auth staff login, Storage bucket for documents).
- Resend email delivery (verified and working on bluepalm.shop).
- Stripe Connect: Express onboarding for detailers, Checkout payment links with an application fee (commission) and a transfer to the detailer, refunds with transfer reversal, and a signed webhook.

**Future work**
- Interactive Google Maps/Mapbox map (the current map is a stylized SVG, labeled "not to scale").
- Masked phone calls between customers and detailers. In-platform messaging is in place today.
- Customer password/OTP accounts (today: emailed magic links stored in an httpOnly cookie), reward redemption at checkout, automated recurring scheduling (cron), detailer availability calendars and real-time slots, an automated background-check integration, and multi-instance rate limiting (Redis).
- Real automotive photography. No stock photos were bundled because of licensing; the hero uses an animated illustration.

## Content to confirm before launch
These are written as reasonable drafts and should be reviewed by the owner:
- Cancellation policy and satisfaction guarantee wording (`lib/config.ts → POLICIES`).
- FAQ answers about water/electricity and being home (`lib/faq.ts`).
- Loyalty reward values (`lib/config.ts → LOYALTY`) and the default 20% commission.
- The Independent Contractor Agreement at `/detailer-agreement` is a **draft summary** and must be finalized by a Florida attorney.
- Launch ZIP list (`lib/config.ts → ZIP_SEED`), which can be edited in admin after seeding.
