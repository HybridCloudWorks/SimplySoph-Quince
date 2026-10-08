# Simply Soph Media: A2P campaign resubmission (30909)

The previous submission was **rejected with error 30909: Message Flow or Call to Action incomplete/unverified**. The values below replace it. They are the only values to paste into Twilio, and they must stay identical to `site/sms-program.mjs` (a test enforces that the replies and keyword below match the code).

Do not resubmit until the release containing the new `/sms/` page is live and you have opened https://misxv.simplysoph.com/sms/ and https://misxv.simplysoph.com/sms-terms/ in a private browser window. Reviewers visit these URLs manually.

- Brand: Simply Soph Media (Sole Proprietor). **VERIFY** the registered brand name is exactly this.
- Sender: +16827868002
- Program version: 2026-10-08

## message_flow

```
Simply Soph Media (sole proprietor) runs an optional text program for invited guests of Sophia's quinceañera on Jan 15, 2027. The only opt-in method is the guest texting a keyword. The call to action is public, with no login, at https://misxv.simplysoph.com/sms/ (Spanish: https://misxv.simplysoph.com/es/sms/), linked as "SMS Updates" in the footer of every page. It reads: "Text SOPHIA to +1 682-786-8002 to receive Simply Soph Media event texts: invitation links, RSVP reminders and schedule/venue updates. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Consent is not required to RSVP or attend." The page links the SMS Terms (https://misxv.simplysoph.com/sms-terms/) and Privacy Policy (https://misxv.simplysoph.com/privacy/). After texting SOPHIA (or START/UNSTOP to re-subscribe) the guest immediately receives: "Simply Soph Media: You're subscribed to Sophia's event texts (invites, RSVP reminders, updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel." Numbers are never enrolled from guest lists, paper invitations, email RSVPs or organizer entry; only phones that texted the keyword and match an invited guest receive messages, each reviewed by an organizer before sending. US and Canadian numbers only. No mobile information or opt-in data is shared with third parties or affiliates.
```

## Keywords and replies

| Field | Value |
|---|---|
| opt_in_keywords | `SOPHIA, START, UNSTOP` |
| opt_in_message | `Simply Soph Media: You're subscribed to Sophia's event texts (invites, RSVP reminders, updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.` |
| help_keywords | `HELP, INFO` |
| help_message | `Simply Soph Media: Help for Sophia's event texts: misxv@simplysoph.com or https://misxv.simplysoph.com/sms/. Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel.` |
| opt_out_keywords | `STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE, OPTOUT` |
| opt_out_message | `Simply Soph Media: You are unsubscribed from Sophia's event texts. No more messages will be sent. Reply SOPHIA or START to re-subscribe.` |

## Sample messages

1. `Simply Soph Media: RSVP for Sophia's quinceanera closes Oct 31. Use your private invitation link or https://misxv.simplysoph.com/rsvp/. Reply STOP to opt out.`
2. `Simply Soph Media: Sophia's ceremony is Fri Jan 15 at 4 PM, dinner 6:30 PM. Details: https://misxv.simplysoph.com/details/. Reply HELP for help, STOP to opt out.`

Sample 1 avoids "ñ" so it stays in one GSM-7 segment.

## Other fields

- **Use case description:** Optional event updates for invited guests of a private family quinceañera: invitation links, RSVP reminders, schedule and venue changes. No purchased lists, no third-party or unrelated marketing.
- **Embedded links:** Yes (misxv.simplysoph.com only). **Embedded phone numbers:** No. **Age-gated content:** No. **Direct lending:** No.
- **Privacy policy URL:** https://misxv.simplysoph.com/privacy/. **Terms URL:** https://misxv.simplysoph.com/sms-terms/

## Why this fixes 30909

| Reviewer check | Before | Now |
|---|---|---|
| Collection mechanism described | Keyword only; how guests find the number was not stated | Public URL, footer link, exact CTA text quoted |
| Every opt-in path described | Organizer-ticked Notion consent could make a number sendable (undisclosed path) | Code now requires a verified keyword opt-in; Notion consent alone is ignored |
| Unique program keyword | `START`/`UNSTOP` only (carrier-reserved re-opt-in words) | `SOPHIA` (program keyword) plus re-subscribe keywords |
| Confirmation quoted | Not included in the description | Quoted verbatim in message_flow and on the public page |
| Brand consistent | Footer said "SimplySoph"; samples said "SimplySoph RSVP" | Footer, page, replies and samples all say "Simply Soph Media" |
| Privacy non-sharing | Limited to "for marketing or promotional purposes" | Carrier-standard non-sharing statement on privacy, SMS terms and general policy |

After resubmitting: do not create a new campaign; edit and resubmit the rejected one. Vetting typically takes several business days. Record the submission date and outcome in `ops/event-resources.json`.
