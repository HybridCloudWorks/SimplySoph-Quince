# Family Administration

Communications has four tabs: General Announcements, WhatsApp Reminders, SMS Reminders and Communication Emails. Each category shows the latest five active records. Full history supports search, status filters, sorting, editing and reversible archive/restore. Archived announcements are not public; archived drafts cannot send. Sent delivery facts remain immutable; private notes can be edited. Message creation uses the channel composer and still requires recipient review. The SMS tab is self-contained: it lists every household with a plain status (Subscribed, Hasn't texted SOPHIA yet, Opted out, Not a US/Canada number, No phone in Notion), sends a test to the organizer's own phone, and sends batches after one typed-count confirmation; see [twilio-setup.md](twilio-setup.md).

Accounting displays cumulative Deposit Paid (initial deposit plus later payments), Owed, and matching footer totals in integer cents. Missing final costs remain pending. Expense and Godparent deletion is reversible and archives the linked Notion page. Documents remain private and recoverable. A sync interrupted by a Notion outage stays pending and is retried by the scheduled drain; a change Notion refuses is marked "Refused by Notion", reported once in Notifications, and corrected by editing the record or pressing Retry sync.

The owner uses ADMIN_EMAILS. Every other administrator is the main Email of a Notion row with Administrator Eligible ticked, checked at sign-in and on every admin request; their first sign-in uses the emailed link and sets up an authenticator. Unticking ends their access at once and removes their authenticator a day later. Only the owner can reset authenticators, create recovery codes, import guests, change the Notion schema and see the access history. See [account-access.md](account-access.md).

Media Uploads QR links directly to /share/#media-upload. Uploading needs the email sign-in (the household's Notion email); guests choose files using the multiple-file chooser. The printable QR has no website text in its center.

This layout was released in commit cb09175 (September 2026); its validation record is in the git history.
