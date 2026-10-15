// Guest RSVP journeys: a private invitation link, the per-event form, review,
// save and the confirmation, in English and Spanish, plus the deadline and a
// broken link. The RSVP runs through the real API (see harness.mjs).
import { test, expect } from "./fixtures.mjs";
import { households, AFTER_DEADLINE, DEADLINE } from "./harness.mjs";
import { chooseCounts, responsesOf } from "./rsvp-helpers.mjs";

test("an English guest answers for each event from the invitation link and sees the confirmation", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  expect(link).toMatch(
    /^https:\/\/127\.0\.0\.1:\d+\/rsvp\/#[A-Za-z0-9_-]{43}$/,
  );

  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeVisible();
  // The private token leaves the address bar once it has been exchanged.
  await expect(page).toHaveURL(harness.url("/rsvp/"));
  // What the invitation includes, by when to answer, and each event's time and place.
  await expect(
    page.getByText("Your invitation includes up to 2 adults/teens and 1 child."),
  ).toBeVisible();
  await expect(page.locator("#portal .deadline")).toHaveText(
    "Please reply by Sunday, November 15.",
  );
  await expect(page.getByRole("main").getByRole("group")).toHaveText([
    /^Ceremony · 4:00\sPM · Our Lady of Guadalupe Church/,
    /^Dinner · 6:30\sPM · The AMZ Event Center/,
    /^Reception & dance · 7:30\sPM · The AMZ Event Center/,
  ]);
  await expect(page.getByText(/Meal selections/)).toHaveCount(0);
  await chooseCounts(page, {
    Ceremony: [2, 1],
    Dinner: [2, 0],
    "Reception & dance": [0, 0],
  });
  await page
    .getByLabel("Dietary/accessibility needs or song request (optional)")
    .fill("One vegetarian meal, please.");
  await page.getByRole("button", { name: "Review response" }).click();

  await expect(
    page.getByRole("heading", { name: "Review your response" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText([
    "Ceremony: 2 adults/teens, 1 child",
    "Dinner: 2 adults/teens",
    "Reception & dance: not attending",
  ]);
  await page.getByRole("button", { name: "Save my RSVP" }).click();

  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  const thanks = page.getByRole("heading", {
    name: "We can’t wait to celebrate with you!",
  });
  await expect(thanks).toBeVisible();
  await expect(thanks).toBeFocused();
  await expect(page).toHaveTitle(/^We can’t wait to celebrate with you! · /);
  await expect(page.getByText("Thank you, Rivera Family.")).toBeVisible();
  await expect(
    page.getByText("Saved Oct 1 · you can change it until November 15"),
  ).toBeVisible();
  const edit = page.getByRole("link", { name: "Edit response" });
  await expect(edit).toHaveAttribute("href", "/rsvp/");
  await expect(edit).toHaveClass(/\boutline\b/);
  // Internal sync status and the deadline banner stay off the confirmation.
  await expect(page.getByText(/guest list/)).toHaveCount(0);
  await expect(page.locator("#portal .deadline")).toHaveCount(0);

  // The answer reached the ledger and the household's Notion row.
  const [saved] = await responsesOf(harness, household);
  expect(saved).toMatchObject({
    attendance: {
      ceremony: { adultsTeens: 2, kids: 1 },
      dinner: { adultsTeens: 2, kids: 0 },
      dance: { adultsTeens: 0, kids: 0 },
    },
    requests: "One vegetarian meal, please.",
  });
  const row = harness.notion.page(household.id);
  expect(row.RSVP.select.name).toBe("Yes");
  expect(row["Website response ID"].rich_text[0].text.content).toBe(saved.id);
  expect(row["Website requests"].rich_text[0].text.content).toBe(
    "One vegetarian meal, please.",
  );
  expect(
    ["Ceremony", "Dinner", "Dance"].map((e) => [
      row[e + " adults"].number,
      row[e + " kids"].number,
    ]),
  ).toEqual([
    [2, 1],
    [2, 0],
    [0, 0],
  ]);
  // The capped receipt went to the household's email on file, in the fake mailbox.
  expect(harness.sent.map((m) => m.to)).toEqual([household.email]);
});

test("a Spanish guest completes the same journey on /es/ and sees the Spanish confirmation", async ({
  page,
  harness,
}) => {
  const household = households.morales;
  // This invitation leaves out the reception.
  const { link } = await harness.issueInvitation(household, {
    locale: "es",
    invited: { ceremony: true, dinner: true, dance: false },
  });
  expect(link).toMatch(
    /^https:\/\/127\.0\.0\.1:\d+\/es\/rsvp\/#[A-Za-z0-9_-]{43}$/,
  );

  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByRole("heading", { name: "Familia Morales" }),
  ).toBeVisible();
  // The reception is not on this invitation, so it is not mentioned at all.
  await expect(page.getByRole("main").getByText(/Recepción|no incluid/)).toHaveCount(0);
  await expect(
    page.getByText("Su invitación incluye hasta 2 adultos/jóvenes y 2 niños."),
  ).toBeVisible();
  await expect(page.locator("#portal .deadline")).toHaveText(
    "Fecha límite para responder: domingo 15 de noviembre.",
  );
  await expect(page.getByRole("main").getByRole("group")).toHaveText([
    /^Ceremonia · 4:00\sp\.\s?m\. · Our Lady of Guadalupe Church/,
    /^Cena · 6:30\sp\.\s?m\. · The AMZ Event Center/,
  ]);
  await chooseCounts(page, { Ceremonia: [2, 2], Cena: [1, 2] }, [
    "Adultos / jóvenes",
    "Niños",
  ]);
  await page.getByRole("button", { name: "Revisar respuesta" }).click();

  await expect(
    page.getByRole("heading", { name: "Revisen su respuesta" }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText([
    "Ceremonia: 2 adultos/jóvenes, 2 niños",
    "Cena: 1 adulto/joven, 2 niños",
  ]);
  await page.getByRole("button", { name: "Guardar mi respuesta" }).click();

  await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
  await expect(
    page.getByRole("heading", { name: "¡Los esperamos con mucha ilusión!" }),
  ).toBeVisible();
  await expect(page.getByText("Gracias, Familia Morales.")).toBeVisible();
  await expect(
    page.getByText("Guardada el 1 oct · pueden cambiarla hasta el 15 de noviembre"),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText([
    "Ceremonia: 2 adultos/jóvenes, 2 niños",
    "Cena: 1 adulto/joven, 2 niños",
  ]);
  await expect(
    page.getByRole("link", { name: "Editar respuesta" }),
  ).toHaveAttribute("href", "/es/rsvp/");

  const [saved] = await responsesOf(harness, household);
  expect(saved.attendance).toEqual({
    ceremony: { adultsTeens: 2, kids: 2 },
    dinner: { adultsTeens: 1, kids: 2 },
    dance: { adultsTeens: 0, kids: 0 },
  });
  const row = harness.notion.page(household.id);
  expect(row.RSVP.select.name).toBe("Yes");
  expect(row["Dinner adults"].number).toBe(1);
  expect(harness.sent.map((m) => m.to)).toEqual([household.email]);
});

test("after the deadline a household that never answered sees the closed note, not the form", async ({
  page,
  harness,
  setNow,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  await setNow(AFTER_DEADLINE);

  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByRole("heading", { name: "RSVPs are closed" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "RSVPs closed on November 15. To answer or change your answer now, please contact us.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Contact us" }),
  ).toHaveAttribute("href", "/contact/");
  await expect(page.getByRole("button", { name: "Review response" })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("group")).toHaveCount(0);
  // No "Please reply by" once answers are closed.
  await expect(page.locator("#portal .deadline")).toHaveCount(0);
  expect(await responsesOf(harness, household)).toEqual([]);
  expect(harness.notion.patches).toEqual([]);
  expect(harness.sent).toEqual([]);
});

test("after the deadline the Spanish page shows the closed note in Spanish", async ({
  page,
  harness,
  setNow,
}) => {
  const household = households.morales;
  const { link } = await harness.issueInvitation(household, { locale: "es" });
  await setNow(AFTER_DEADLINE);

  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByRole("heading", { name: "Las respuestas están cerradas" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Las respuestas cerraron el 15 de noviembre. Para responder o cambiar su respuesta, escríbannos.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Escríbannos" }),
  ).toHaveAttribute("href", "/es/contact/");
  await expect(page.getByRole("button", { name: "Revisar respuesta" })).toHaveCount(0);
  expect(await responsesOf(harness, household)).toEqual([]);
});

test("a form opened before the deadline but saved after it is refused and nothing is saved", async ({
  page,
  harness,
  setNow,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  await setNow(DEADLINE - 60_000);

  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeVisible();
  // The deadline passes while the guest is still filling in the form.
  await setNow(AFTER_DEADLINE);
  await chooseCounts(page, {
    Ceremony: [1, 0],
    Dinner: [1, 0],
    "Reception & dance": [1, 0],
  });
  await page.getByRole("button", { name: "Review response" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "The RSVP deadline has passed. Please contact us.",
  );
  await expect(page).toHaveURL(harness.url("/rsvp/"));
  await expect(
    page.getByRole("button", { name: "Save my RSVP" }),
  ).toBeEnabled();
  expect(await responsesOf(harness, household)).toEqual([]);
  expect(harness.notion.patches).toEqual([]);
  expect(harness.sent).toEqual([]);
});

// The review speaks to the household (ustedes: "Revisen su respuesta"), and
// so do the refusals that only a save from it can get.
test("in Spanish, a refused save speaks to the household the way the review does", async ({
  page,
  harness,
  setNow,
}) => {
  const household = households.morales;
  const { link } = await harness.issueInvitation(household, { locale: "es" });
  await setNow(DEADLINE - 60_000);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Vamos todos" }).click();
  await expect(page.getByRole("heading", { name: "Revisen su respuesta" })).toBeVisible();
  const save = page.getByRole("button", { name: "Guardar mi respuesta" }),
    alert = page.locator("#portal .error");
  // Answered in another window in the meantime.
  await page.route("**/api/rsvp", (route) =>
    route.fulfill({ status: 409, json: { error: "RESPONSE_CHANGED" } }),
  );
  await save.click();
  await expect(alert).toHaveText(
    "Su respuesta cambió en otra ventana. Recarguen la página para revisar la última respuesta guardada.",
  );
  await page.unroute("**/api/rsvp");
  await setNow(AFTER_DEADLINE);
  await save.click();
  await expect(alert).toHaveText("La fecha límite ya pasó. Por favor, escríbannos.");
  expect(await responsesOf(harness, household)).toEqual([]);
});

test("a household that answers just before the deadline sees the RSVP closed right after it and cannot change it", async ({
  page,
  harness,
  setNow,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  // Ten minutes before the deadline; the invitation session lasts 30 minutes.
  await setNow(DEADLINE - 10 * 60_000);
  await page.goto(harness.forBrowser(link));
  await chooseCounts(page, {
    Ceremony: [2, 1],
    Dinner: [2, 1],
    "Reception & dance": [2, 1],
  });
  await page.getByRole("button", { name: "Review response" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page.getByRole("link", { name: "Edit response" })).toBeVisible();
  const [before] = await responsesOf(harness, household);

  await setNow(AFTER_DEADLINE);
  await page.reload();
  await expect(
    page.getByText(
      "The RSVP deadline has passed. To change your answer, please contact us.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Contact us" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit response" })).toHaveCount(
    0,
  );

  // Going back to /rsvp/ directly shows the closed note with the saved answer,
  // not a form that could be changed.
  await page.goto(harness.url("/rsvp/"));
  await expect(
    page.getByRole("heading", { name: "RSVPs are closed" }),
  ).toBeVisible();
  await expect(page.getByText("Your saved answer:")).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem").first()).toContainText(
    "2 adults/teens, 1 child",
  );
  await expect(page.getByRole("button", { name: "Review response" })).toHaveCount(0);
  expect(await responsesOf(harness, household)).toEqual([before]);
  expect(harness.notion.page(household.id)["Dinner adults"].number).toBe(2);
});

for (const [kind, fragment] of [
  // Well formed (43 characters) but never issued.
  ["an unknown", "unknown-invitation-link-".padEnd(43, "0")],
  ["a malformed", "not-a-real-invitation"],
])
  test(`${kind} invitation link shows the friendly error, not a crash`, async ({
    page,
    harness,
  }) => {
    await harness.issueInvitation(households.rivera);
    await page.goto(harness.url("/rsvp/#" + fragment));

    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "This invitation link isn't working." }),
    ).toHaveText(
      "This invitation link isn't working. It may be incomplete or replaced by a newer link; open your most recent invitation email or contact us.",
    );
    await expect(
      page.getByRole("heading", { name: "Open your invitation" }),
    ).toBeVisible();
    // The broken link is neither kept in the address bar nor copied into the form.
    await expect(page).toHaveURL(harness.url("/rsvp/"));
    await expect(page.getByLabel("Invitation link or code")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
    const sessions = Object.values((await harness.ledger.read()).sessions);
    expect(sessions.filter((s) => s.kind === "guest")).toEqual([]);
  });
