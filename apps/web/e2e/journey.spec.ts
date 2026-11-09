import { test, expect } from '@playwright/test';

test.describe('CareBridge End-to-End Care Journey', () => {
  test('public directory and navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=CareBridge')).toBeVisible();

    // Directory
    await page.click('text=Find providers');
    await expect(page).toHaveURL(/.*providers/);
    await expect(page.locator('text=Lekki Smiles Dental')).toBeVisible();
    await expect(page.locator('text=Ikeja Dental Centre')).toBeVisible();
  });

  test('emergency triage safety redirect', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'patient@carebridge.local');
    await page.fill('input[type="password"]', 'CareBridge!2026');
    await page.click('button[type="submit"]');

    await page.goto('/patient/new');
    await expect(page.locator('text=New care request')).toBeVisible();

    // Toggle emergency symptoms
    await page.click('text=Yes — emergency symptoms');
    await expect(page.locator('text=CareBridge is not an emergency service')).toBeVisible();
    await expect(page.locator('text=Call 112')).toBeVisible();
  });

  test('patient submits request, clinic makes offer, and journey completes', async ({
    browser,
  }) => {
    const patientContext = await browser.newContext();
    const providerContext = await browser.newContext();

    const patientPage = await patientContext.newPage();
    const providerPage = await providerContext.newPage();

    // 1. Patient login & request submission
    await patientPage.goto('/login');
    await patientPage.fill('input[type="email"]', 'patient@carebridge.local');
    await patientPage.fill('input[type="password"]', 'CareBridge!2026');
    await patientPage.click('button[type="submit"]');
    await expect(patientPage).toHaveURL(/.*patient/);

    await patientPage.goto('/patient/new');
    await patientPage.selectOption('select', { label: 'Dentistry' });
    await patientPage.fill('input[placeholder*="service"]', 'Wisdom Tooth Evaluation');
    await patientPage.fill(
      'textarea',
      'Experiencing localized swelling and discomfort in the lower right jaw for two days.',
    );
    await patientPage.click('text=No emergency symptoms');
    await patientPage.click('button[type="submit"]');

    // 2. Provider responds with offer
    await providerPage.goto('/login');
    await providerPage.fill('input[type="email"]', 'owner.lekki@carebridge.local');
    await providerPage.fill('input[type="password"]', 'CareBridge!2026');
    await providerPage.click('button[type="submit"]');
    await expect(providerPage).toHaveURL(/.*provider/);

    // Verify queue displays request
    await expect(providerPage.locator('text=Wisdom Tooth Evaluation')).toBeVisible();
    await providerPage.click('text=Make offer');
    await providerPage.fill('textarea', 'We can see you for an assessment tomorrow.');
    await providerPage.click('button:has-text("Send offer")');

    // 3. Patient accepts offer and books appointment
    await patientPage.reload();
    await expect(patientPage.locator('text=Lekki Smiles Dental')).toBeVisible();
    await patientPage.click('button:has-text("Choose")');

    // Book appointment
    await expect(patientPage.locator('text=Book an appointment')).toBeVisible();
    await patientPage.click('button:has-text("Book appointment")');

    // 4. Provider advances clinical journey
    await providerPage.goto('/provider/patients');
    await expect(providerPage.locator('text=Wisdom Tooth Evaluation')).toBeVisible();
    await providerPage.click('button:has-text("Start assessment")');
    await expect(providerPage.locator('text=Assessment')).toBeVisible();

    await patientContext.close();
    await providerContext.close();
  });
});
