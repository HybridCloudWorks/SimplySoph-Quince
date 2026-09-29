# Twilio runtime status

Verified September 28, 2026 through provider APIs and Twilio Console.

- Advanced Opt-Out is enabled on the submitted campaign service. START/UNSTOP, STOP and its aliases, and HELP/INFO use the branded Simply Soph Media responses. Verified in Console; live handset testing remains pending.

- Submitted SMS campaign: IN_PROGRESS, no reported errors, service MG6d6cc68fbd2ca1c60f35b7698a467049 (Sole Proprietor A2P Messaging Service). Event phone +16827868002 belongs to this service. Do not create another campaign.
- Original MG64189f3d8d7622baf0aefd9b3f265261 is empty; retained for review, not deleted.
- SMS inbound POST and delivery callbacks now point to https://misxv.simplysoph.com/api/twilio/inbound and /api/twilio/status; service-level routing enabled.
- Runtime revision misxv-api-00011-mmb serves 100% traffic. Pinned Auth Token version 2; restricted key secret misxv-twilio-runtime-secret version 1. Existing email/Notion configuration preserved.
- Runtime key Mis XV 2027 runtime (exact SID in private work/twilio-runtime-key.json and Cloud Run TWILIO_API_KEY_SID) has messages/read only for keyword verification. Main key is not deployed. SMS_ENABLED=false and SMS_ACTIVATION_REVIEWED=false. Sending permission and activation require post-approval testing.
- Signed malformed-message probe returned 422 INVALID_MESSAGE, proving signature accepted before rejecting invalid data without writing a guest record. No messages sent.
- WhatsApp sender +16827868002 ONLINE; no templates found and no WhatsApp application transport or callbacks enabled yet. SMS consent is not WhatsApp consent.
- New secrets, runtime grants, key and service changes are in ops/event-resources.json. February 1 remains review/export, not deletion.

Next: verify campaign approval, confirm genuine START/STOP/HELP callbacks and Notion projection with a consenting owner test, then grant restricted Messages create permission and enable reviewed sending. Prepare WhatsApp-specific opt-in, approved templates and transport separately.
