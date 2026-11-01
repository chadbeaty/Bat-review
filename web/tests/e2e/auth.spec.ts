import { expect, test } from "@playwright/test";
import { latestLink, mailpitAvailable } from "./mailpit";

const PASSWORD = "correct-horse-battery";
const NEW_PASSWORD = "longer-better-password-2";

test.describe("accounts", () => {
  test.beforeEach(async () => {
    test.skip(!(await mailpitAvailable()), "Needs the local Supabase stack and its Mailpit inbox");
  });

  test("validates the sign-up form", async ({ page }) => {
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel("Password").fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters")).toBeVisible();
    await expect(page.getByText("Agree to the terms to create an account")).toBeVisible();
  });

  test("sign up, confirm email, sign out, sign in, reset password", async ({ page }) => {
    const email = `player-${Date.now()}@example.com`;
    const username = `slugger_${Date.now() % 100000}`;

    // Sign up
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByLabel("Username").fill(username);
    await page.getByLabel(/I agree/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/verify-email/);
    await expect(page.getByText(email)).toBeVisible();

    // Can't sign in before confirming
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Confirm your email first/)).toBeVisible();

    // Confirm through the emailed link
    await page.goto(await latestLink(email, /confirm/i));
    await expect(page).toHaveURL(/\/account/);
    await expect(page.getByText(`@${username}`)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // Sign out
    await page.getByRole("button", { name: "Sign out" }).last().click();
    await expect(page).toHaveURL("/");
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);

    // Wrong password, then right password, with a hostile redirect that must be ignored
    await page.goto("/sign-in?next=//evil.example.com");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrong-password-here");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/localhost:3000\/account$/);

    // Reset the password from a signed-out browser
    await page.context().clearCookies();
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If that email has an account/)).toBeVisible();
    await page.goto(await latestLink(email, /reset/i));
    await expect(page).toHaveURL(/\/reset-password/);
    await page.getByLabel("New password").fill(NEW_PASSWORD);
    await page.getByLabel("Type it again").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Your password was updated.")).toBeVisible();

    // The new password works
    await page.context().clearCookies();
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/account/);
  });

  test("gives the same answer for unknown emails on password reset", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If that email has an account/)).toBeVisible();
  });

  test("shows a clear message for expired or broken email links", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=bogus&type=signup");
    await expect(page).toHaveURL(/\/sign-in\?error=link-expired/);
    await expect(page.getByText(/expired or was already used/)).toBeVisible();
  });
});
