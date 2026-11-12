"use client";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

/**
 * Card / Apple Pay / Google Pay collection for the booking form (Stripe
 * Payment Element). Nothing is charged here: the card is saved with Stripe
 * (SetupIntent) and charged after the service. Card details go straight to
 * Stripe and never touch BluePalm's servers.
 */
export const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
export const cardsEnabled = Boolean(PUBLISHABLE_KEY);

let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => (stripePromise ??= loadStripe(PUBLISHABLE_KEY));

export type CardHandle = { confirm: (billing: { name: string; email: string; phone: string }) => Promise<{ setupIntent?: string; error?: string }> };

export function CardField({ handle }: { handle: Ref<CardHandle> }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    fetch("/api/payments/setup", { method: "POST" })
      .then((r) => r.json())
      .then((j) => { if (!live) return; if (j.clientSecret) setClientSecret(j.clientSecret); else setError(j.error ?? "Couldn't load the card form."); })
      .catch(() => live && setError("Couldn't load the card form. Check your connection and refresh."));
    return () => { live = false; };
  }, []);

  if (error) return <p className="field-error" role="alert">{error}</p>;
  if (!clientSecret) return <div className="h-32 animate-pulse rounded-2xl bg-sky/60" aria-label="Loading secure card form" />;
  return (
    <Elements stripe={getStripe()} options={{
      clientSecret,
      fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" }],
      appearance: {
        theme: "stripe",
        variables: { colorPrimary: "#1264D6", colorText: "#0B2342", colorDanger: "#dc2626", borderRadius: "16px", fontFamily: "'DM Sans', system-ui, sans-serif", spacingUnit: "4px" },
        rules: { ".Input": { padding: "12px 14px", boxShadow: "none", border: "1px solid rgba(11,35,66,0.12)" }, ".Input:focus": { boxShadow: "0 0 0 4px rgba(18,100,214,0.15)", borderColor: "#1264D6" } },
      },
    }}>
      <Inner handle={handle} />
    </Elements>
  );
}

function Inner({ handle }: { handle: Ref<CardHandle> }) {
  const stripe = useStripe(), elements = useElements();
  const done = useRef<string | null>(null); // a confirmed card is reused if the booking needs a retry
  useImperativeHandle(handle, () => ({
    async confirm(billing) {
      if (done.current) return { setupIntent: done.current };
      if (!stripe || !elements) return { error: "The card form is still loading. Please try again in a moment." };
      const { error: submitError } = await elements.submit();
      if (submitError) return { error: submitError.message ?? "Please check your card details." };
      const { setupIntent, error } = await stripe.confirmSetup({
        elements, redirect: "if_required",
        confirmParams: { return_url: window.location.href, payment_method_data: { billing_details: { name: billing.name, email: billing.email, phone: billing.phone } } },
      });
      if (error) return { error: error.message ?? "Your card couldn't be saved." };
      if (setupIntent?.status !== "succeeded") return { error: "Your card needs another step. Please try again." };
      done.current = setupIntent.id;
      return { setupIntent: setupIntent.id };
    },
  }), [stripe, elements]);
  return (
    <PaymentElement options={{
      layout: "tabs",
      wallets: { applePay: "auto", googlePay: "auto", link: "never" },
      fields: { billingDetails: { name: "never", email: "never", phone: "never" } },
      terms: { card: "never" },
    }} />
  );
}
