import { rateLimit } from "./auth.mjs";
// Durable inbox is authoritative. A send attempt is claimed once; ambiguous delivery is never retried automatically.
export function createNotifications({
  ledger,
  mailer,
  adminEmails,
  origin,
  now,
}) {
  return async function sendNotification(id) {
    if (!mailer.configured || !adminEmails.length) return;
    try {
      await rateLimit(ledger, "organizer-notifications", 60, 3600000, now());
      const row = await ledger.transaction((s) => {
        const n = s.notifications?.[id];
        if (!n || n.emailState) return null;
        n.emailState = "sending";
        n.emailAttemptedAt = now();
        return structuredClone(n);
      });
      if (!row) return;
      let state = "accepted";
      try {
        const subject =
          {
            photo: "New photo awaiting review",
            video: "New video awaiting review",
            contact: "New contact form submission",
            guestbook: "New guestbook message awaiting review",
          }[row.kind] || "New event submission";
        await mailer.send({
          id: "notification-" + id,
          to: adminEmails[0],
          subject: "SimplySoph · " + subject,
          html: `<p>${subject}.</p><p><a href="${origin}/admin/notifications/">Sign in to review</a></p><p>Guest details remain in your private administration area.</p>`,
        });
      } catch (e) {
        state = e.code === "MAIL_DELIVERY_UNKNOWN" ? "unknown" : "failed";
      }
      await ledger.transaction((s) => {
        if (s.notifications?.[id]) s.notifications[id].emailState = state;
      });
    } catch {
      /* Submission is already durable; inbox remains available even if sending cannot complete. */
    }
  };
}
