import { z } from "zod";
import { VEHICLES, TIME_WINDOWS, FREQUENCIES } from "./config";

const phone = z.string().trim().transform((s) => s.replace(/[^\d+]/g, "")).refine((s) => /^\+?1?\d{10}$/.test(s), "Enter a valid US phone number");
export const zip = z.string().trim().regex(/^\d{5}$/, "Enter a 5-digit ZIP code");
const text = (max: number) => z.string().trim().max(max);

export const bookingSchema = z.object({
  zip,
  address: text(160).min(4, "Enter your street address"),
  city: text(80).min(2, "Enter your city"),
  vehicle: z.enum(VEHICLES.map((v) => v.id) as [string, ...string[]], { message: "Choose your vehicle size" }),
  vehicle_details: text(120).optional().default(""),
  package_id: z.string().min(1, "Choose a service"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  time_window: z.enum(TIME_WINDOWS.map((t) => t.id) as [string, ...string[]], { message: "Choose a time window" }),
  preferred_detailer_id: z.string().optional().nullable(),
  frequency: z.enum(FREQUENCIES.map((f) => f.id) as [string, ...string[]]).default("none"),
  name: text(100).min(2, "Enter your full name"),
  email: z.email("Enter a valid email").max(160).transform((s) => s.toLowerCase()),
  phone,
  instructions: text(1000).optional().default(""),
  promo: z.string().trim().max(24).optional().default(""),
  setup_intent: z.string().trim().max(100).optional().default(""),
  website: z.string().max(0).optional(), // honeypot
});
export type BookingInput = z.infer<typeof bookingSchema>;

export const COUNTY_NAMES = ["Manatee County", "Sarasota County", "Pinellas County", "Hillsborough County"] as const;

export const detailerSchema = z.object({
  name: text(100).min(2, "Enter your full name"),
  email: z.email("Enter a valid email").max(160).transform((s) => s.toLowerCase()),
  phone,
  business_name: text(120).optional().default(""),
  business_type: z.enum(["individual", "llc", "corporation", "other"]),
  ein_last4: z.string().trim().regex(/^(\d{4})?$/, "Last 4 digits only").optional().default(""),
  years_experience: z.coerce.number().int().min(0).max(60),
  experience: text(2000).min(20, "Tell us a little more about your experience (20+ characters)"),
  counties: z.array(z.enum(COUNTY_NAMES)).min(1, "Select at least one service area"),
  availability: z.array(z.string().max(20)).min(1, "Select your availability"),
  insurance_expires: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional().default(""),
  agree_contractor: z.literal("on", { message: "You must accept the contractor agreement" }),
  agree_customer_policy: z.literal("on", { message: "You must accept the customer relationship policy" }),
  website: z.string().max(0).optional(),
});

export function fieldErrors(e: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of e.issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.code === "invalid_type" && i.message.includes("undefined") ? "This field is required" : i.message;
  }
  return out;
}
