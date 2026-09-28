# Simply Soph Media SMS Campaign

Public sender: +16827868002. Program version: 2026-09-28.

## Opt-In Keywords

START, UNSTOP

## Opt-In Message

Simply Soph Media: You are subscribed to Sophia's event texts: invitation links, RSVP reminders and event updates. Message frequency varies. Msg & data rates may apply. Reply HELP for help or STOP to unsubscribe.

## HELP Message

Simply Soph Media event text support: misxv@simplysoph.com. Message frequency varies. Msg & data rates may apply. Reply STOP to unsubscribe.

## STOP Message

Simply Soph Media: You have unsubscribed from event texts. No further messages will be sent. Reply START to subscribe again.

## Consent Description

Guests visit https://misxv.simplysoph.com/sms/ and read the program description, frequency, rates, STOP/HELP instructions, Privacy Policy and SMS Terms. To opt in, they text START (or UNSTOP to resubscribe) from their own phone to +16827868002. Texting these keywords expressly agrees to recurring automated Simply Soph Media texts for Sophia's event. Consent is optional and not a condition of purchase, RSVP or attendance. Adding a number to Notion or submitting an email RSVP does not opt anyone into SMS. The service records phone-specific keyword consent, timestamp, message identifier and disclosure version privately, and synchronizes consent to matching Notion guest records. No purchased lists or unrelated promotions are used.

Privacy: https://misxv.simplysoph.com/privacy/

SMS Terms: https://misxv.simplysoph.com/sms-terms/

## Configure Before Activation

Create/link the approved campaign's Messaging Service and attach only the event number. Enable Advanced Opt-Out: START and UNSTOP for opt-in, HELP and INFO for help; retain Twilio's standard STOP aliases. Paste the exact replies above into the service configuration. Registration form entries alone do not configure runtime replies.

Set service inbound handler to POST https://misxv.simplysoph.com/api/twilio/inbound (send to webhook, not drop). Delivery callback: POST https://misxv.simplysoph.com/api/twilio/status. Twilio sends the keyword replies; the app returns empty TwiML to avoid duplicates.

Bind the service/account IDs, API key secret and Auth Token to the runtime. The key needs Messages read access to verify incoming START timestamps and prevent stale consent replays, plus Messages create for reviewed dispatch. Never publish credentials. Keep SMS_ENABLED and SMS_ACTIVATION_REVIEWED false until sender approval and owner-controlled START/STOP/HELP, Notion synchronization and delivery tests pass.

Unknown numbers do not receive invitations or account access. Their keyword preferences remain pending until a matching Notion guest phone exists and an administrator retries synchronization. STOP blocks locally even while Notion is unavailable.

This release does not create a Messaging Service, submit a campaign, configure provider replies or send messages. Those provider actions must be verified separately.
