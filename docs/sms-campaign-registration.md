# Simply Soph Media: A2P campaign resubmission

- **Campaign:** `CMc4a08f0e5cf080f32a30ab202995f92a` (Sole Proprietor, use case STARTER)
- **Messaging Service:** `MG6d6cc68fbd2ca1c60f35b7698a467049`
- **Sender:** +1 682-786-8002
- **Program version:** 2026-10-09

## Why it was rejected (30909)

The reviewer's note quoted the old message flow: *"Guests access the event website through their invitation"*. That described a private, checkbox-based opt-in that the reviewer could not open, and it never existed in the code. The only opt-in is a texted keyword, and its call to action is on a public page. Every field below describes that one path. A test (`tests/sms-campaign.test.mjs`) keeps these values identical to the site and to `site/sms-program.mjs`.

## Before you edit

1. Confirm https://misxv.simplysoph.com/sms/ and https://misxv.simplysoph.com/sms-terms/ show the current text in a private browser window. The opt-in reply on `/sms/` must end with the Terms and Privacy links.
2. In **Messaging → Services → Sole Proprietor A2P Messaging Service → Opt-Out Management**, set the **Opt-in** confirmation message to the exact **opt-in message** below. The other replies are unchanged.
3. In **Messaging → Regulatory Compliance → Brands**, check the brand name. Every field here says **Simply Soph Media**. If the brand is registered under a different name, stop and align the names first, because reviewers reject mismatches.

## Edit the campaign

Open **Messaging → Regulatory Compliance → Campaigns → `CMc4a08f0e…`**. On **Revise errors and resubmit your A2P Campaign registration**, replace each field with the value below. The fields are listed in the order the form shows them.

### Campaign description

```
Messages are sent by Simply Soph Media to guests of Sophia's quinceañera (January 15, 2027) who opted in by texting SOPHIA to +1 682-786-8002. Messages include event invitation links, RSVP deadline reminders, and schedule, venue or parking updates for the celebration. No marketing or third-party content is sent.
```

### Sample message #1

```
Simply Soph Media: [Name], you're invited to Sophia's quinceanera on Fri Jan 15, 2027! RSVP by Oct 31: https://misxv.simplysoph.com/rsvp/ Reply STOP to opt out.
```

### Sample message #2

```
Simply Soph Media: Reminder, RSVP for Sophia's quinceanera closes Oct 31: https://misxv.simplysoph.com/rsvp/ Reply HELP for help, STOP to opt out.
```

### Sample message #3

```
Simply Soph Media: Update for Sophia's quinceanera: [schedule, venue or parking change]. Details: https://misxv.simplysoph.com/details/ Reply STOP to opt out.
```

### Sample message #4

```
Simply Soph Media: Confirma tu asistencia a los XV de Sophia antes del 31 de octubre: https://misxv.simplysoph.com/es/rsvp/ Responde STOP para cancelar.
```

### Sample message #5

Delete the existing text and leave this box **empty**. Only two samples are required.

### Select any content your messages may contain

- **Embedded links:** checked
- **Phone numbers:** unchecked
- **Content related to direct lending or other loan arrangement:** unchecked
- **Age-gated content:** unchecked

### Provide link to the Campaign's privacy policy

```
https://misxv.simplysoph.com/privacy/
```

### Provide link to Campaign's terms of service

```
https://misxv.simplysoph.com/sms-terms/
```

### Message Flow: How do end-users consent to receive messages?

```
End users opt in only by texting a keyword. WHERE: The call to action is on the public page https://misxv.simplysoph.com/sms/ (Spanish: https://misxv.simplysoph.com/es/sms/), linked as "SMS Updates" in the footer of every page of misxv.simplysoph.com. No login or invitation is needed to view it. It reads: "Text SOPHIA to +1 682-786-8002 to receive Simply Soph Media event texts: invitation links, RSVP reminders and schedule/venue updates. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Consent is not required to RSVP or attend." The page links the SMS Terms (https://misxv.simplysoph.com/sms-terms/) and Privacy Policy (https://misxv.simplysoph.com/privacy/). HOW: The user texts SOPHIA (START or UNSTOP also work) from their own phone to +1 682-786-8002. Joining is optional and texting the keyword is the only opt-in method; numbers are never added from a list or a form. AFTER: The user immediately receives: "Simply Soph Media: You're subscribed to Sophia's event texts (invites, RSVP reminders, updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Terms: https://misxv.simplysoph.com/sms-terms/ Privacy: https://misxv.simplysoph.com/privacy/" The user can reply HELP for help or STOP to cancel at any time.
```

### List all opt-in keywords

```
SOPHIA,START,UNSTOP
```

### What is the opt-in message?

```
Simply Soph Media: You're subscribed to Sophia's event texts (invites, RSVP reminders, updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel. Terms: https://misxv.simplysoph.com/sms-terms/ Privacy: https://misxv.simplysoph.com/privacy/
```

### List all opt-out keywords

```
STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT,REVOKE,OPTOUT
```

### What is the opt-out message?

```
Simply Soph Media: You are unsubscribed from Sophia's event texts. No more messages will be sent. Reply SOPHIA or START to re-subscribe.
```

### List all help keywords

```
HELP,INFO
```

### What is the help message?

```
Simply Soph Media: Help for Sophia's event texts: misxv@simplysoph.com or https://misxv.simplysoph.com/sms/. Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel.
```

Finally, tick **I confirm the information entered here is ready to submit for review** and submit. Editing does not charge a new vetting fee. Sole Proprietor reviews usually take hours to a few days. Record the submission date and the outcome in `ops/event-resources.json`.

## Sources

- Error 30909 and the passing keyword example: https://www.twilio.com/docs/api/errors/30909
- Field-by-field requirements (keyword campaign, Terms, Privacy): https://help.twilio.com/articles/11847054539547-A2P-10DLC-Campaign-Approval-Requirements
- Editing a failed campaign: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/troubleshooting-a2p-brands/troubleshooting-and-rectifying-a2p-campaigns

Never use **Continue registration** on the A2P overview page while this campaign exists. It starts a new campaign and deletes this one.
