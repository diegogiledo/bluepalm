import { POLICIES } from "./config";

export const FAQS = [
  {
    q: "Do I need to be home during the service?",
    a: "Not necessarily. For exterior-only services you don't need to be present as long as the vehicle is accessible. For interior services, leave the car unlocked or arrange a key hand-off in your booking instructions. Please remove valuables before your appointment.",
  },
  {
    q: "Do you need my water or electricity?",
    a: "Our detailers are expected to arrive with their own supplies and equipment. If your location has restrictions — for example HOA or apartment rules about washing — let us know in your booking notes and we'll confirm the best approach before your appointment.",
  },
  {
    q: "How do I know my booking is confirmed?",
    a: "Online bookings are submitted as requests. Our team reviews each one and sends a confirmation by email once your appointment is accepted. Your booking isn't final until you receive that confirmation.",
  },
  {
    q: "How does pricing work?",
    a: "Each package has a clear starting price. Your final price depends on vehicle size and condition and is always confirmed with you before you pay. Payments are handled securely through BluePalm — never directly with the detailer.",
  },
  {
    q: "Does my vehicle size change the price?",
    a: "It can. Larger vehicles such as large SUVs, pickup trucks and vans take more time and product, so they may cost more than the starting price. Choose your vehicle type when booking and we'll confirm your price.",
  },
  {
    q: "Can you handle pet hair and stains?",
    a: "Yes, in most cases. Heavy pet hair, deep stains or unusual messes take extra time and may add to the price. Mention them in your booking notes, or request a custom quote, so we can plan accordingly.",
  },
  {
    q: "Do you offer recurring washes?",
    a: "Yes. Choose every two weeks or monthly maintenance when you book. Recurring customers earn loyalty points on every completed service and can request their preferred detailer.",
  },
  { q: "What is your cancellation policy?", a: POLICIES.cancellation },
  { q: "Do you guarantee your work?", a: POLICIES.guarantee },
];
