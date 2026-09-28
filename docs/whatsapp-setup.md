# WhatsApp RSVP Setup

Scope: international guests who choose WhatsApp receive a private invitation link and complete the existing website RSVP. Website RSVP updates continue to project to Notion. Email remains available. SMS remains US/Canada only. Replying inside WhatsApp does not currently submit an RSVP or authenticate a website account.

## Owner Steps

1. Finish the dedicated Twilio account and SMS sender registration first.
2. In Twilio Console, open Messaging → Senders → WhatsApp Senders and use Self Sign-up. Connect a Meta Business Portfolio you control and register a suitable number. Use truthful family/event details and let Twilio/Meta determine eligibility; registration and template approval are not guaranteed. Do not migrate an existing personal WhatsApp number without reviewing the effect on that account.
3. Test with the Twilio WhatsApp Sandbox and consenting owner numbers before production. Sandbox participants must join the sandbox; it is not a guest production sender.
4. Submit English and Spanish invitation/reminder templates. Let Meta classify and approve them. Use a private RSVP button/link appropriate for the approved template. Do not upload actual invitation tokens in public screenshots or examples.
5. Return with sender status and approved template identifiers, never API secrets. Keep credentials in Google Secret Manager and inventory all new event resources before activation.

## Template Drafts For Review

English: “You’re invited to celebrate Sophia Isabel’s quinceañera on January 15, 2027. Please RSVP by October 31, 2026 using your private invitation link. Reply STOP to stop event messages.”

Spanish: “Te invitamos a celebrar los quince años de Sophia Isabel el 15 de enero de 2027. Confirma tu asistencia antes del 31 de octubre de 2026 usando tu enlace privado. Responde STOP para dejar de recibir mensajes del evento.”

These are drafts, not approved templates or consent evidence. A guest must opt in before an initiated message. Outside the 24-hour window after a guest sends a message, use an approved template. A sent template alone does not reopen that window.

## Application Work Before Activation

- Add channel preference, language, E.164 phone, WhatsApp-specific consent text/version/date/source and opt-out fields to Notion and the guest account form. SMS consent must not be reused as WhatsApp consent.
- Implement an approved-template transport with a separate activation gate, signed status/inbound callbacks, permanent send-attempt receipts, and channel-specific suppression. Do not guess a phone's WhatsApp availability or automatically use international SMS as fallback.
- Match private invitation links to their current household/generation at drafting and dispatch. Verify each template's private-link behavior before use.
- Preview recipient, language, template, applicable costs and channel before an administrator sends. No guest campaign is authorized by completing setup alone.
- Test owner-controlled numbers and verify Notion sync, opt-out, duplicate callbacks and uncertain-delivery handling. Keep email functional throughout.

Nothing in this change provisions a WhatsApp sender, purchases a number, or sends messages. WhatsApp transport is not yet implemented. February 1, 2027 remains a review/export date, not automatic deletion; preserve shared accounts and revoke only inventoried event resources after approval.

References: [Twilio self sign-up](https://www.twilio.com/docs/whatsapp/self-sign-up), [WhatsApp messaging](https://www.twilio.com/docs/whatsapp/api), [template rules](https://www.twilio.com/docs/whatsapp/tutorial/send-whatsapp-notification-messages-templates), [pricing](https://www.twilio.com/en-us/whatsapp/pricing).
