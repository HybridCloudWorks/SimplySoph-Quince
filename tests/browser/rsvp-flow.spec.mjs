// The RSVP form's shortcuts and safety nets: one-tap answers and the email's
// quick-answer links, answers that survive Back, a reload, a language switch
// and an expired link, the form's own validation, where focus goes after each
// step, and the messages for a server outage and a pasted link. Everything
// runs through the real API (see harness.mjs).
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { chooseCounts, eventGroup, responsesOf } from "./rsvp-helpers.mjs";

const everyCount = {
  Ceremony: [2, 1],
  Dinner: [2, 0],
  "Reception & dance": [1, 0],
};

test("“Everyone’s coming” fills each invited event with the whole invitation and goes straight to the review", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household, {
    invited: { ceremony: true, dinner: true, dance: false },
  });
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Everyone’s coming" }).click();

  const heading = page.getByRole("heading", { name: "Review your response" });
  await expect(heading).toBeFocused();
  await expect(page).toHaveTitle(/^Review your response · /);
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText([
    "Ceremony: 2 adults/teens, 1 child",
    "Dinner: 2 adults/teens, 1 child",
  ]);
  // Nothing is saved until Save.
  expect(await responsesOf(harness, household)).toEqual([]);
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  const [saved] = await responsesOf(harness, household);
  expect(saved.attendance).toEqual({
    ceremony: { adultsTeens: 2, kids: 1 },
    dinner: { adultsTeens: 2, kids: 1 },
    dance: { adultsTeens: 0, kids: 0 },
  });
});

// Before: the decline sent a household in by its invitation link to sign in by
// email before it could leave a note (13 steps, a trip to the mail app).
test("“We can’t make it” saves a decline; the note thanks the family, and the household leaves Sophia a note without signing in again", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "We can’t make it" }).click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText([
    "Ceremony: not attending",
    "Dinner: not attending",
    "Reception & dance: not attending",
  ]);
  await page.getByRole("button", { name: "Save my RSVP" }).click();

  await expect(
    page.getByRole("heading", { name: "Thank you for letting us know." }),
  ).toBeFocused();
  await expect(
    page.getByText("We’ll miss you, and thank you for your love."),
  ).toBeVisible();
  await expect(page.getByText(/in our hearts/)).toHaveCount(0);
  await expect(page.getByText(/guestbook/i)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Edit response" }),
  ).toHaveClass(/\boutline\b/);
  const sentBefore = harness.sent.length;
  await page.getByRole("link", { name: "Leave Sophia a note" }).click();
  await expect(page).toHaveURL(harness.url("/guestbook/"));
  // The same page offers the note from the link: no email sign-in.
  await expect(page.getByRole("heading", { name: "Sign in with your email" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Leave Sophia a note" })).toBeVisible();
  await expect(page.getByLabel("Your name, as you’d like it to appear")).toHaveValue("Rivera Family");
  await page.getByLabel("Your note").fill("We’ll be thinking of you, Sophia!");
  await page.getByRole("button", { name: "Send my note" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Thank you!" })).toHaveText(
    "Thank you! Sophia will read your note; it won’t appear on this page.",
  );
  const [note] = Object.values((await harness.ledger.read()).messages);
  expect(note).toMatchObject({
    kind: "guestbook",
    via: "link",
    householdId: household.id,
    name: "Rivera Family",
    text: "We’ll be thinking of you, Sophia!",
    display: "family",
    state: "pending",
  });
  // No email went to the guest for it.
  expect(harness.sent.slice(sentBefore).some((m) => m.to === household.email)).toBe(false);
  const [saved] = await responsesOf(harness, household);
  expect(Object.values(saved.attendance).every((v) => !v.adultsTeens && !v.kids)).toBe(true);
});

test("the email’s quick-answer link opens on the review step and saves nothing until Save", async ({
  page,
  harness,
}) => {
  const household = households.morales;
  const { link } = await harness.issueInvitation(household, { locale: "es" });
  await page.goto(harness.forBrowser(link + ".yes"));

  await expect(
    page.getByRole("heading", { name: "Revisen su respuesta" }),
  ).toBeVisible();
  await expect(page).toHaveURL(harness.url("/es/rsvp/"));
  await expect(page.getByRole("main").getByRole("button")).toHaveText([
    "Guardar mi respuesta",
    "Cambiar cantidades",
  ]);
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText([
    "Ceremonia: 2 adultos/jóvenes, 2 niños",
    "Cena: 2 adultos/jóvenes, 2 niños",
    "Recepción y baile: 2 adultos/jóvenes, 2 niños",
  ]);
  // A link scanner opening the link saves nothing.
  expect(await responsesOf(harness, household)).toEqual([]);
  expect(harness.notion.patches).toEqual([]);
  expect(harness.sent).toEqual([]);

  // "Change counts" opens the form filled in the same way.
  await page.getByRole("button", { name: "Cambiar cantidades" }).click();
  await expect(
    page.getByRole("heading", { name: "Familia Morales" }),
  ).toBeFocused();
  await expect(
    eventGroup(page, "Cena").getByLabel("Niños"),
  ).toHaveValue("2");

  // The "no" link fills zeros.
  await page.goto(harness.forBrowser(link + ".no"));
  await expect(page.getByRole("main").getByRole("listitem").first()).toHaveText(
    "Ceremonia: no asistirán",
  );
  await page.getByRole("button", { name: "Guardar mi respuesta" }).click();
  await expect(
    page.getByText("Los vamos a extrañar; gracias por su cariño."),
  ).toBeVisible();
  expect(await responsesOf(harness, household)).toHaveLength(1);
});

test("answers survive Back from the review, a reload and a switch to Spanish, and are cleared once saved", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  await page.goto(harness.forBrowser(link));
  await chooseCounts(page, everyCount);
  const requests = page.getByLabel(
    "Anything we should know? Allergies, accessibility needs, or a song you’d love to hear (optional)",
  );
  await requests.fill("A song for Sophia");
  await page.getByRole("button", { name: "Review response" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your response" }),
  ).toBeVisible();

  // Back returns to the form, on this page, with the answers.
  await page.goBack();
  await expect(page).toHaveURL(harness.url("/rsvp/"));
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeFocused();
  await expect(eventGroup(page, "Ceremony").getByLabel("Children")).toHaveValue("1");
  // Forward goes back to the review.
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Review your response" }),
  ).toBeVisible();
  await page.goBack();

  await eventGroup(page, "Dinner").getByLabel("Children").selectOption("1");
  await page.reload();
  await expect(page.getByText("We kept the answers you started.")).toBeVisible();
  await expect(eventGroup(page, "Dinner").getByLabel("Children")).toHaveValue("1");
  await expect(requests).toHaveValue("A song for Sophia");

  // The same answers in Spanish.
  await page.getByRole("link", { name: "Español" }).click();
  await expect(page).toHaveURL(harness.url("/es/rsvp/"));
  await expect(
    page.getByText("Guardamos las respuestas que empezaron."),
  ).toBeVisible();
  await expect(
    eventGroup(page, "Recepción y baile").getByLabel("Adultos / jóvenes"),
  ).toHaveValue("1");
  await page.getByRole("button", { name: "Revisar respuesta" }).click();
  await page.getByRole("button", { name: "Guardar mi respuesta" }).click();
  await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
  const [saved] = await responsesOf(harness, household);
  expect(saved).toMatchObject({
    attendance: {
      ceremony: { adultsTeens: 2, kids: 1 },
      dinner: { adultsTeens: 2, kids: 1 },
      dance: { adultsTeens: 1, kids: 0 },
    },
    requests: "A song for Sophia",
  });

  // Saved: the tab no longer holds a draft, and the form shows the answer.
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((k) => k.startsWith("misxv-rsvp:")),
    ),
  ).toEqual([]);
  await page.goto(harness.url("/rsvp/"));
  await expect(page.getByText("We kept the answers you started.")).toHaveCount(0);
  await expect(eventGroup(page, "Dinner").getByLabel("Children")).toHaveValue("1");
  // Only answers were kept, never the link.
  expect(JSON.stringify(await page.evaluate(() => ({ ...sessionStorage })))).not.toContain(
    link.split("#")[1],
  );
});

// Hosting publishes the site on merge and the API is deployed by hand, so for
// a while the site can run against an API that sends no householdId.
test("without a household id from the API, no answers are kept, so one household’s never fill another’s form", async ({
  page,
  harness,
}) => {
  await page.route("**/api/invitation", async (route) => {
    const response = await route.fetch(),
      json = await response.json();
    delete json.householdId;
    await route.fulfill({ response, json });
  });
  const rivera = await harness.issueInvitation(households.rivera),
    morales = await harness.issueInvitation(households.morales);
  await page.goto(harness.forBrowser(rivera.link));
  await chooseCounts(page, { Ceremony: [2, 1] });
  await page.getByLabel("Anything we should know? Allergies, accessibility needs, or a song you’d love to hear (optional)").fill("Rivera’s song");

  // Another household's invitation, opened in the same tab.
  await page.goto(harness.forBrowser(morales.link));
  await expect(page.getByRole("heading", { name: "Familia Morales" })).toBeVisible();
  await expect(page.getByText("We kept the answers you started.")).toHaveCount(0);
  await expect(eventGroup(page, "Ceremony").getByLabel("Adults / teens")).toHaveValue("");
  await expect(
    page.getByLabel("Anything we should know? Allergies, accessibility needs, or a song you’d love to hear (optional)"),
  ).toHaveValue("");
  expect(
    await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith("misxv-rsvp:"))),
  ).toEqual([]);
});

test("answers kept in the tab that don’t fit the invitation are set aside, not restored", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household, {
    invited: { ceremony: true, dinner: true, dance: false },
  });
  await page.goto(harness.forBrowser(link));
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
  const key = "misxv-rsvp:" + household.id;
  for (const attendance of [
    // More people than the invitation has seats for.
    { ceremony: { adultsTeens: "5", kids: "0" } },
    // An event that isn't on this invitation.
    { ceremony: { adultsTeens: "2", kids: "1" }, dance: { adultsTeens: "2", kids: "1" } },
  ]) {
    await page.evaluate(
      ([k, v]) => sessionStorage.setItem(k, JSON.stringify(v)),
      [key, { attendance, contact: null, requests: "" }],
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
    await expect(page.getByText("We kept the answers you started.")).toHaveCount(0);
    await expect(eventGroup(page, "Ceremony").getByLabel("Adults / teens")).toHaveValue("");
    expect(await page.evaluate((k) => sessionStorage.getItem(k), key)).toBeNull();
  }
});

test("a session kept busy stays open past 30 minutes", async ({
  page,
  harness,
  setNow,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  const opened = harness.now();
  await page.goto(harness.forBrowser(link));
  await chooseCounts(page, { Ceremony: [2, 1] });
  // Twenty minutes later the guest is still choosing: the page checks in.
  await setNow(opened + 20 * 60_000);
  await chooseCounts(page, { Dinner: [2, 1] });
  await expect
    .poll(async () =>
      Object.values((await harness.ledger.read()).sessions).find((s) => s.scope === "rsvp")
        ?.expiresAt,
    )
    .toBe(opened + 50 * 60_000);
  await setNow(opened + 45 * 60_000);
  await chooseCounts(page, { "Reception & dance": [0, 0] });
  await page.getByRole("button", { name: "Review response" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
});

test("an invitation link that timed out keeps the answers and saves once the invitation is opened again", async ({
  page,
  harness,
  setNow,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  await page.goto(harness.forBrowser(link));
  await chooseCounts(page, everyCount);
  await page.getByRole("button", { name: "Review response" }).click();
  // The guest steps away for 31 minutes before tapping Save.
  await setNow(harness.now() + 31 * 60_000);
  const save = page.getByRole("button", { name: "Save my RSVP" });
  await save.click();
  await expect(page.locator("#portal .error")).toHaveText(
    "Your invitation link timed out. Open your invitation email again; your answers are kept here.",
  );
  await expect(save).toBeFocused();
  expect(await responsesOf(harness, household)).toEqual([]);

  // A reload now shows the code form, and says the answers are kept.
  await page.reload();
  await expect(
    page.getByText(
      "Your answers are kept in this tab. Open your invitation email again, or paste its link below, to finish.",
    ),
  ).toBeVisible();

  // Opening the invitation again in this tab brings the answers back.
  await page.goto(harness.forBrowser(link));
  await expect(page.getByText("We kept the answers you started.")).toBeVisible();
  await expect(eventGroup(page, "Reception & dance").getByLabel("Adults / teens")).toHaveValue("1");
  await page.getByRole("button", { name: "Review response" }).click();

  // It times out again; this time the email opens in another tab.
  await setNow(harness.now() + 31 * 60_000);
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page.locator("#portal .error")).toContainText("timed out");
  const other = await page.context().newPage();
  await other.clock.setFixedTime(harness.now());
  await other.goto(harness.forBrowser(link));
  await expect(other.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
  await other.close();
  // Back in the first tab, Save works with the answers that were kept there.
  await page.bringToFront();
  await page.evaluate(() => dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("You’re back in, and your answers are still here."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  const [saved] = await responsesOf(harness, household);
  expect(saved.attendance.dance).toEqual({ adultsTeens: 1, kids: 0 });
});

test("the form checks itself: one summary in the page’s language, linked to each missing count", async ({
  page,
  harness,
}) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await expect(page.locator("#response")).toHaveAttribute("novalidate", "");
  await chooseCounts(page, { Ceremony: [2] });
  const review = page.getByRole("button", { name: "Review response" });
  await review.click();

  const summary = page.locator(".error-summary");
  await expect(summary).toBeFocused();
  // One link per event with a count to choose, named by the event (the round
  // 2 review's six comma-separated labels broke mid-label on a phone).
  await expect(summary.locator("p")).toHaveText(["Choose how many for:"]);
  await expect(summary.getByRole("listitem")).toHaveText(["Ceremony", "Dinner", "Reception & dance"]);
  await expect(page).toHaveTitle(/^Error: /);
  const kids = eventGroup(page, "Ceremony").getByLabel("Children");
  await expect(kids).toHaveAttribute("aria-invalid", "true");
  // Each count's note names its event, so the notes are not all "Choose one."
  await expect(kids).toHaveAccessibleDescription("Ceremony: choose how many children.");
  await expect(eventGroup(page, "Dinner").getByLabel("Adults / teens")).toHaveAccessibleDescription(
    "Dinner: choose how many adults/teens.",
  );
  await expect(eventGroup(page, "Ceremony").getByLabel("Adults / teens")).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  // Each name in the summary takes focus to its event's first count to
  // choose, without a # in the address.
  await summary.getByRole("link", { name: "Ceremony" }).click();
  await expect(kids).toBeFocused();
  await summary.getByRole("link", { name: "Dinner" }).click();
  await expect(eventGroup(page, "Dinner").getByLabel("Adults / teens")).toBeFocused();
  await expect(page).toHaveURL(harness.url("/rsvp/"));
  // Choosing a count clears that field's mark.
  await kids.selectOption("0");
  await expect(kids).not.toHaveAttribute("aria-invalid", "true");
  expect(await responsesOf(harness, households.rivera)).toEqual([]);

  // In Spanish, in Spanish.
  await page.goto(harness.url("/es/rsvp/"));
  await page.getByRole("button", { name: "Revisar respuesta" }).click();
  await expect(page.locator(".error-summary p")).toHaveText(["Elijan cuántos para:"]);
  await expect(page.locator(".error-summary").getByRole("listitem")).toHaveText(["Cena", "Recepción y baile"]);
  await expect(eventGroup(page, "Cena").getByLabel("Niños")).toHaveAccessibleDescription(
    "Cena: elijan cuántos niños.",
  );
});

test("an invitation without children asks only about adults and teens", async ({
  page,
  harness,
}) => {
  const household = households.planner;
  const { link } = await harness.issueInvitation(household, {
    invited: { ceremony: true, dinner: false, dance: false },
  });
  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByText("Your invitation includes up to 1 adult/teen."),
  ).toBeVisible();
  await expect(page.getByRole("main").getByLabel("Children")).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("group")).toHaveCount(1);
  await chooseCounts(page, { Ceremony: [1] });
  await page.getByRole("button", { name: "Review response" }).click();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText([
    "Ceremony: 1 adult/teen",
  ]);
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  const [saved] = await responsesOf(harness, household);
  expect(saved.attendance.ceremony).toEqual({ adultsTeens: 1, kids: 0 });
});

test("a server error page reads as trouble on our end, and Save keeps focus and works again", async ({
  page,
  harness,
}) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await chooseCounts(page, everyCount);
  await page.getByRole("button", { name: "Review response" }).click();
  await page.route("**/api/rsvp", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<!doctype html><title>502 Bad Gateway</title>",
    }),
  );
  const save = page.getByRole("button", { name: "Save my RSVP" });
  await save.click();
  await expect(page.locator("#portal .error")).toHaveText(
    "Something went wrong on our end. Your answers are still here — try again in a minute, or email misxv@simplysoph.com.",
  );
  await expect(page.getByText(/not open yet/)).toHaveCount(0);
  await expect(save).toBeFocused();
  await expect(save).toBeEnabled();
  await page.unroute("**/api/rsvp");
  await save.click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
});

test("a pasted invitation link works without https://, with stray spaces, or as the code", async ({
  page,
  harness,
}) => {
  const { link, code } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.url("/rsvp/"));
  const box = page.getByLabel("Invitation link or code");
  await expect(box).toHaveAttribute("autocapitalize", "off");
  await expect(box).toHaveAttribute("autocorrect", "off");
  await expect(box).toHaveAttribute("spellcheck", "false");
  // The hint shows a code's shape too (R-080; tests/sign-in-words.test.mjs
  // holds it to the server's codes).
  await expect(box).toHaveAccessibleDescription(
    "For example misxv.simplysoph.com/rsvp/#… from your invitation email or message, or a code of 16 letters and numbers, like ABCD-EFGH-…",
  );
  await expect(page.locator("#portal .deadline")).toHaveText(
    "Please reply by Sunday, November 15.",
  );
  const continueButton = page.getByRole("button", { name: "Continue" });

  // A link from another site, or one cut off before its private part.
  await box.fill("https://example.com/rsvp/#" + link.split("#")[1]);
  await continueButton.click();
  await expect(page.locator("#access .error")).toHaveText(
    "Use the link from your invitation to this website.",
  );
  await expect(continueButton).toBeFocused();
  await box.fill(harness.forBrowser(link).split("#")[0]);
  await continueButton.click();
  await expect(page.locator("#access .error")).toContainText(
    "This link is missing its private part",
  );

  // The link without https://, broken over two lines by a mail app.
  const bare = harness.forBrowser(link).replace(/^https?:\/\//, "");
  await box.fill(`  ${bare.slice(0, 30)}\n${bare.slice(30)}  `);
  await continueButton.click();
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeFocused();

  // The typed code, in lower case with spaces.
  await page.context().clearCookies();
  await page.goto(harness.url("/rsvp/"));
  await box.fill(code.toLowerCase().replaceAll("-", " "));
  await continueButton.click();
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
});
