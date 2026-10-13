// Administrator sign-in journeys on /admin/login/: the sign-in options, the
// refusal for accounts that are not administrators, and a full sign-in with the
// emailed link and an authenticator code. The API checks are the real ones
// (see harness.mjs); only Google's sign-in script is mocked (fixtures.mjs).
import { test, expect, mockGoogleSignIn } from "./fixtures.mjs";
import { households, OWNER_EMAIL } from "./harness.mjs";
import { totp } from "../../server/auth.mjs";

const ADMIN_LINK =
  /href="(https:\/\/127\.0\.0\.1:\d+\/admin\/login\/#[A-Za-z0-9_-]{43})"/;
const LINK_REQUESTED =
  "If this email has administrator access, a sign-in link will arrive shortly. The link expires in 15 minutes.";
const adminSessions = async (harness) =>
  Object.values((await harness.ledger.read()).sessions).filter(
    (s) => s.kind === "admin" && s.email !== OWNER_EMAIL,
  );
async function requestLink(page, harness, email) {
  await page.goto(harness.url("/admin/login/"));
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Email my sign-in link" }).click();
  await expect(page.getByText(LINK_REQUESTED)).toBeVisible();
}

test("the administrator sign-in page offers the emailed link, Microsoft and Google", async ({
  page,
  harness,
}) => {
  await mockGoogleSignIn(page, {});
  await page.goto(harness.url("/admin/login/"));

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Administrator sign-in",
  );
  await expect(
    page.getByRole("heading", { name: "Sign in by email" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeEditable();
  await expect(
    page.getByRole("button", { name: "Email my sign-in link" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("heading", { name: "Or sign in with" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign in with Microsoft" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Sign in with Google" }),
  ).toBeEnabled();
  // The administration menu stays hidden until someone has signed in.
  await expect(
    page.getByRole("complementary", { name: "Administration" }),
  ).toBeHidden();
});

test("the emailed link is refused for anyone who is not an administrator", async ({
  page,
  context,
  harness,
}) => {
  // A guest's email gets the same neutral answer, and no email is sent.
  await requestLink(page, harness, households.rivera.email);
  expect(harness.sent).toEqual([]);

  // An administrator's link is sent; the family then unticks "Administrator
  // Eligible" in Notion before the link is opened.
  const planner = households.planner;
  await requestLink(page, harness, planner.email);
  expect(harness.sent.map((m) => [m.to, m.subject])).toEqual([
    [planner.email, "SimplySoph · Administrator sign-in"],
  ]);
  const link = harness.sent[0].html.match(ADMIN_LINK)[1];
  harness.notion.setAdministrator(planner.id, false);

  // The link opens in a new tab, as from an email.
  const fromEmail = await context.newPage();
  await fromEmail.goto(harness.forBrowser(link));
  await fromEmail.getByRole("button", { name: "Confirm email" }).click();

  const note = fromEmail.getByRole("alert");
  await expect(note.getByRole("heading")).toHaveText(
    "This account isn’t an administrator",
  );
  await expect(note).toContainText(
    "You signed in with the link we emailed you, and that part worked.",
  );
  await expect(note.getByRole("link", { name: "My account" })).toHaveAttribute(
    "href",
    "/account/",
  );
  await expect(
    note.getByRole("link", { name: "Try a different account" }),
  ).toHaveAttribute("href", "/admin/login/");
  await expect(
    fromEmail.getByRole("textbox", { name: "Authenticator code" }),
  ).toHaveCount(0);
  expect(await adminSessions(harness)).toEqual([]);
});

test("a Google account that is not an administrator gets the refusal message", async ({
  page,
  harness,
}) => {
  // A verified Google Workspace account for a guest's address.
  await mockGoogleSignIn(page, {
    sub: "google-subject-rivera",
    email: households.rivera.email,
    email_verified: true,
    hd: "example.com",
  });
  await page.goto(harness.url("/admin/login/"));
  await page.getByRole("button", { name: "Sign in with Google" }).click();

  const note = page
    .getByRole("alert")
    .filter({ has: page.getByRole("heading") });
  await expect(note.getByRole("heading")).toHaveText(
    "This account isn’t an administrator",
  );
  await expect(note).toContainText(
    "You signed in with your Google account, and that part worked.",
  );
  await expect(note).toContainText(
    "If you’re expecting access, please contact Saul or Diana.",
  );
  expect(await adminSessions(harness)).toEqual([]);
  expect(Object.keys((await harness.ledger.read()).challenges)).toEqual([]);
});

test("an administrator signs in with the emailed link and an authenticator code", async ({
  page,
  context,
  harness,
}) => {
  const planner = households.planner;
  await requestLink(page, harness, planner.email);
  const link = harness.sent[0].html.match(ADMIN_LINK)[1];

  const fromEmail = await context.newPage();
  await fromEmail.goto(harness.forBrowser(link));
  await fromEmail.getByRole("button", { name: "Confirm email" }).click();
  await expect(
    fromEmail.getByText("Email confirmed. Enter your authenticator code."),
  ).toBeVisible();
  await expect(
    fromEmail.getByRole("heading", { name: "Set up your authenticator" }),
  ).toBeVisible();
  await expect(
    fromEmail.getByRole("img", {
      name: "QR code that adds SimplySoph to your authenticator app",
    }),
  ).toBeVisible();

  // The authenticator app's part: read the key from the setup link and make
  // the current code.
  await fromEmail.getByText("Can’t scan? Setting up on this phone?").click();
  const uri = await fromEmail
    .getByRole("link", { name: "Add to my authenticator app" })
    .getAttribute("href");
  const secret = new URL(uri).searchParams.get("secret");
  await fromEmail
    .getByRole("textbox", { name: "Authenticator code" })
    .fill(totp(secret, Math.floor(harness.now() / 30000)));
  await fromEmail.getByRole("button", { name: "Verify and sign in" }).click();

  await expect(fromEmail).toHaveURL(harness.url("/admin/"));
  await expect(
    fromEmail.getByRole("complementary", { name: "Administration" }),
  ).toBeVisible();
  await expect(
    fromEmail.getByText("Households", { exact: true }),
  ).toBeVisible();
  const [session] = await adminSessions(harness);
  expect(session).toMatchObject({
    kind: "admin",
    email: planner.email,
    rowId: planner.id,
  });
  // Only the sign-in email went out.
  expect(harness.sent.map((m) => m.to)).toEqual([planner.email]);
});
