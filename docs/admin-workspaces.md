# Family Administration

Communications has four tabs: General Announcements, WhatsApp Reminders, SMS Reminders and Communication Emails. Each category shows the latest five active records. Full history supports search, status filters, sorting, editing and reversible archive/restore. Archived announcements are not public; archived drafts cannot send. Sent delivery facts remain immutable; private notes can be edited. Message creation uses the channel composer and still requires recipient review.

Accounting displays cumulative Deposit Paid (initial deposit plus later payments), Owed, and matching footer totals in integer cents. Missing final costs remain pending. Expense and Godparent deletion is reversible and archives the linked Notion page. Documents remain private and recoverable. Failed syncs are visibly pending and retryable.

The owner uses ADMIN_EMAILS. Approved email-only family administrators use ADMIN_DELEGATE_EMAILS, email verification and MFA. Delegates have no owner permission to grant administration or delete accounts. Administrator Eligible in Notion is required for delegated and guest-account administrators, checked at MFA and every admin API request. Checking it alone never grants access. Guest Access lets the owner grant administration after eligibility is checked. Account deletion revokes sessions and invitation access; restoration never restores admin permissions or sessions automatically.

Media Uploads QR links directly to /share/#media-upload. The upload page still requires invitation/account authorization; guests choose files using the multiple-file chooser. The printable QR has no website text in its center.

Validation: 138 automated tests, 66 generated-document/link checks. Synthetic browser review covered tab isolation, full history archive/restore/search, authenticated seating, and exact accounting totals. Synthetic records never reach Notion or guests.
