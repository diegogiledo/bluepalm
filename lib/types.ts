export type BookingStatus =
  | "requested"   // submitted by customer, awaiting BluePalm review
  | "confirmed"   // BluePalm accepted; open for detailers / assigned
  | "assigned"    // a detailer is on the job
  | "completed"
  | "cancelled";

export type PaymentStatus = "unpaid" | "card_on_file" | "payment_link_sent" | "paid" | "payment_failed" | "refunded" | "partially_refunded";

export type Package = {
  id: string; name: string; tagline: string; base_price: number; features: string[];
  duration_hint: string; sort: number; active: boolean;
};
export type ServiceZip = { zip: string; city: string; county: string; enabled: boolean };
export type Setting = { key: string; value: unknown };
export type Customer = {
  id: string; email: string; name: string; phone: string; access_token: string;
  loyalty_points: number; created_at: string;
};
export type DetailerStatus = "pending" | "approved" | "rejected" | "suspended";
export type Detailer = {
  id: string; name: string; email: string; phone: string; business_name: string;
  business_type: string; ein_last4: string; years_experience: number; experience: string;
  counties: string[]; availability: string[]; insurance_file: string | null;
  insurance_expires: string | null; status: DetailerStatus; access_token: string;
  agreement_accepted_at: string; commission_rate: number | null;
  onboarding: { insurance_verified: boolean; background_check: boolean; orientation: boolean; payouts_connected: boolean };
  stripe_account_id: string | null; admin_notes: string; created_at: string;
  /** "applied" = signed up on bluepalm.shop; "market" = an existing local business that took a job from an email. */
  source?: "applied" | "market";
};
/** Existing local detailing businesses BluePalm sends customers to (no sign-up needed). */
export type MarketDetailerStatus = "new" | "invited" | "opted_in" | "unsubscribed";
export type MarketDetailer = {
  id: string; business_name: string; owner_name: string | null; email: string | null; phone: string | null;
  website: string | null; logo_url: string | null; city: string; counties: string[]; mobile: boolean;
  /** Base location and how far they travel, for the coverage map. */
  address: string | null; lat: number | null; lon: number | null; radius_miles: number;
  source_url: string | null; notes: string; status: MarketDetailerStatus; token: string;
  invited_at: string | null; opted_in_at: string | null; unsubscribed_at: string | null;
  detailer_id: string | null; created_at: string;
};
/** One emailed job request to one market detailer. */
export type JobOffer = {
  id: string; booking_id: string; market_detailer_id: string; token: string;
  status: "sent" | "accepted" | "passed" | "taken"; sent_at: string; responded_at: string | null;
};
export type Booking = {
  id: string; ref: string; customer_id: string;
  zip: string; address: string; city: string; vehicle: string; vehicle_details: string;
  package_id: string; package_name: string; price_estimate: number | null;
  date: string; time_window: string; preferred_detailer_id: string | null;
  instructions: string; status: BookingStatus; detailer_id: string | null;
  recurring_plan_id: string | null; commission_rate: number | null;
  final_price: number | null; payment_status: PaymentStatus; refund_amount: number;
  promo_code: string | null; discount_pct: number;
  stripe_customer_id: string | null; payment_method_id: string | null; card_label: string | null; payment_error: string | null;
  payment_intent: string | null; checkout_url: string | null;
  cancel_reason: string; customer_rating: number | null; customer_feedback: string;
  created_at: string; completed_at: string | null;
};
export type RecurringPlan = {
  id: string; customer_id: string; frequency: "biweekly" | "monthly"; package_id: string;
  vehicle: string; zip: string; address: string; city: string; time_window: string;
  preferred_detailer_id: string | null; status: "active" | "paused" | "cancelled";
  next_date: string; created_at: string;
};
export type Message = {
  id: string; booking_id: string; sender: "customer" | "detailer" | "admin"; body: string; created_at: string;
};
export type Outbox = {
  id: string; channel: "email"; to: string; subject: string; body: string;
  status: "sent" | "logged" | "failed"; error: string; created_at: string;
};
export type StaffRole = "admin" | "dispatcher";
export type Staff = { email: string; role: StaffRole; name: string };

/** A monthly operating expense entered in the Finance tab (for EBITDA). */
export type Expense = { id: string; month: string; category: string; amount: number; note: string; created_at: string };

export type Tables = {
  packages: Package; service_zips: ServiceZip; settings: Setting; customers: Customer;
  detailers: Detailer; bookings: Booking; recurring_plans: RecurringPlan; messages: Message;
  outbox: Outbox; staff: Staff; market_detailers: MarketDetailer; job_offers: JobOffer; expenses: Expense;
};
export type TableName = keyof Tables;
