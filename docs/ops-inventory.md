# The private event inventory

The cleanup inventory lists every cloud resource made for Mis XV: exact resource names, project number, Secret Manager secret names, Entra and OAuth IDs, the mailbox ID, Twilio SIDs and the GitHub OIDC trust conditions. None of these are secret values, but together they map the attack surface. That is why the inventory is **private** (issue #109) and lives outside this public repository:

| File | Private location | Local working copy (git-ignored) |
|---|---|---|
| Event resources and their cleanup steps | `gs://misxv-ops-simplysoph-66c78/event-resources.json` | `ops/event-resources.json` |
| Shared simplysoph.com DNS changes | `gs://misxv-ops-simplysoph-66c78/shared-domain-changes.json` | `ops/shared-domain-changes.json` |

The bucket is separate from the media bucket (`misxv-2027-…`) on purpose: the website's runtime identity can read the media bucket, and it must never read this one. Only project owners can.

`ops/*.json` is in `.gitignore`, and `npm test` fails if either file is ever committed again, or if a live Twilio SID or mailbox ID appears in the docs or code (`tests/cleanup.test.mjs`).

## Public summary

As of 2026-11-08 the inventory records 55 resources: 54 active and 1 removed. By type: 11 IAM bindings, 7 secrets, 4 GitHub deployment grants, 4 Twilio content templates, 3 service accounts, 3 Exchange role assignments, 2 each of DNS records, OAuth grants, Entra applications, Twilio Messaging Services and Scheduler jobs, and 1 each of the shared mailbox, mailbox delegate, Hosting site, custom domain, storage bucket, Notion records, Artifact Registry repository, Cloud Run service, Twilio API key, WhatsApp sender, notification channel, log alert and budget alert. The shared-domain file records 13 DNS changes on simplysoph.com, all preserved at retirement.

Some identifiers stay public because the browser needs them, and they grant nothing on their own: the Entra **sign-in** app's client ID and the tenant ID (`docs/deployment.md`, `.env.example`), the Workload Identity provider path in `.github/workflows/check.yml` (GitHub's OIDC token is still required), and the event phone number guests text.

## One-time setup (owner)

Run these once, from a machine signed in as a project owner. Then **record the bucket itself** as a `storage-bucket` resource in `event-resources.json` (cleanup rule: every created resource is inventoried).

```bash
gcloud storage buckets create gs://misxv-ops-simplysoph-66c78 --project=simplysoph-66c78 --location=us-central1 --uniform-bucket-level-access --public-access-prevention
```

```bash
gcloud storage buckets update gs://misxv-ops-simplysoph-66c78 --versioning
```

Then upload the current files. If your clone already pulled the change that removed them, restore them from the last commit that had them first:

```bash
mkdir -p ops && git show 9ad0431:ops/event-resources.json > ops/event-resources.json && git show 9ad0431:ops/shared-domain-changes.json > ops/shared-domain-changes.json
```

```bash
gcloud storage cp ops/event-resources.json ops/shared-domain-changes.json gs://misxv-ops-simplysoph-66c78/
```

Check that nobody else can read it (the output should list only project-owner/editor convenience bindings):

```bash
gcloud storage buckets get-iam-policy gs://misxv-ops-simplysoph-66c78
```

## Everyday use

Download, edit, then upload. Versioning keeps every earlier copy, and `--if-generation-match` refuses the upload if someone else changed the file since you downloaded it.

```bash
gcloud storage cp gs://misxv-ops-simplysoph-66c78/*.json ops/
```

```bash
gcloud storage objects describe gs://misxv-ops-simplysoph-66c78/event-resources.json --format="value(generation)"
```

```bash
gcloud storage cp ops/event-resources.json gs://misxv-ops-simplysoph-66c78/event-resources.json --if-generation-match=GENERATION
```

## Cleanup review

`npm run cleanup:plan` reads `ops/event-resources.json` (or `--inventory=<path>`) and writes `work/cleanup/plan.md` locally. It changes nothing. The GitHub Actions version was removed: logs and step summaries of a public repository are public, so it would republish the inventory. Run it on your own machine, and keep the plan private.

## Earlier public copies

Both files were public in this repository's history until 2026-11-08. The history was deliberately **not** rewritten (owner's decision): GitHub keeps pull-request refs regardless, and no secret values were ever in them, so nothing needs rotating. Treat the identifiers as known, and keep relying on IAM, App Check and the per-route checks, not on their obscurity.
