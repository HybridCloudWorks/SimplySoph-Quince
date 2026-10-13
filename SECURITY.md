# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, pull request or discussion for a security problem.

A useful report says what is affected (a page, an API route or a file in this repository), how to reproduce it, and what an attacker could do with it. Please do not include real guest names, contact details, invitation links or codes; describe them instead.

You will get an acknowledgement in the report thread. This is a family project with no bug bounty, so please give reasonable time for a fix before disclosing anything publicly.

## Scope

- The code in this repository.
- The live website at [misxv.simplysoph.com](https://misxv.simplysoph.com) and its `/api/` service, limited to what you can observe as an ordinary visitor or invited guest.

Out of scope: testing that sends messages to guests, creates load, or tries other people's invitation links or accounts; and the third-party services the site uses (Notion, Microsoft 365, Twilio, Google Cloud, Firebase). Report problems in those services to their vendors.

## Supported versions

Only the current `main` branch, which is what the live website runs, receives fixes.
