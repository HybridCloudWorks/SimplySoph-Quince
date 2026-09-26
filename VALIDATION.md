# Validation record

September 26, 2026. This records local preview evidence, not production readiness.

## Passed

- Dependency-free static build: five guest routes plus 404 generated successfully.
- All local route and asset references checked; invitation image loaded in the browser.
- HTTP checks: Home, Details, RSVP, FAQ, Privacy returned 200; an unknown route returned 404 with the themed page.
- JavaScript syntax checks for RSVP behavior and preview server.
- Six Node tests: both locales/all seven email templates; HTML escaping; unsafe link rejection; live-date/deadline guards; committed-response guard; change-copy requirement.
- Fourteen HTML/plain-text email preview pairs rendered without any network dispatch.
- Browser RSVP: invalid-code feedback, valid sample household, required-answer validation, all-declined review, mixed attendance, review, honest demo completion, and preserved answers when reopening edit.
- Browser visual checks: desktop Home and RSVP; 390px phone Home and RSVP. At the phone width, Home and RSVP had no horizontal document overflow. Invitation loaded successfully.
- No captured browser console errors at final Home check.

The browser check caught and fixed a malformed attending option before delivery.

## Not yet verified / not implemented

Live Notion writes, guest authorization, durable persistence, concurrent edits, rate limiting, sender/domain/DNS configuration, real email deliverability, signed webhook processing, privacy retention operations, full English/Spanish website parity, all email-client rendering, 200% text zoom, complete accessibility audit, and production hosting. No real guest response or email was transmitted.

The family subsequently confirmed Friday, January 15, 2027. Website copy, configuration, email previews, and planning documents now use the confirmed date. The original invitation artwork still says Saturday and is explicitly identified as incorrect on the website. Preview/demo notices remain because live RSVP is not connected. Calendar/countdown remain unimplemented. Map target is based on supplied invitation text; venue identity and directions still need family verification.
