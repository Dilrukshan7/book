import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCREENSHOTS_DIR = join(process.cwd(), 'verification-screenshots');
if (!existsSync(SCREENSHOTS_DIR)) {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const CHROMIUM_EXEC = 'C:\\Users\\USER\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe';
const BASE_URL = 'http://127.0.0.1:4321';

async function runBrowserVerification() {
  console.log('--- Starting Browser End-to-End Verification ---');
  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXEC,
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    // 1. Home Page Verification
    console.log('1. Checking Home Page (/) ...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const title = await page.title();
    console.log(`   Page Title: "${title}"`);
    
    // Verify Subscriptions link in masthead nav
    const navText = await page.textContent('#masthead-nav');
    console.log(`   Masthead Navigation: "${navText?.replace(/\s+/g, ' ').trim()}"`);
    if (!navText?.includes('Subscriptions')) {
      throw new Error('Subscriptions link missing from navigation bar!');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '01_homepage.png'), fullPage: false });
    console.log('   Saved screenshot: 01_homepage.png');

    // 2. Dedicated Subscription Plans Page (/subscriptions)
    console.log('2. Checking Subscription Plans Page (/subscriptions) ...');
    await page.goto(`${BASE_URL}/subscriptions`, { waitUntil: 'networkidle' });
    const subHeading = await page.textContent('.sub-header__title');
    console.log(`   Subscriptions Heading: "${subHeading?.trim()}"`);
    
    // Verify plan cards are rendered
    const planCards = await page.$$('.plan-card');
    console.log(`   Found ${planCards.length} Subscription Plan cards`);
    if (planCards.length === 0) {
      throw new Error('No subscription plan cards rendered on /subscriptions!');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '02_subscriptions_catalog.png'), fullPage: false });
    console.log('   Saved screenshot: 02_subscriptions_catalog.png');

    // 3. Book Roadmap Page with Subscription Passes Section
    console.log('3. Checking Book Roadmap Page (/books/linear-algebra-and-learning-from-data) ...');
    await page.goto(`${BASE_URL}/books/linear-algebra-and-learning-from-data`, { waitUntil: 'networkidle' });
    const bookTitle = await page.textContent('.bookhead__title');
    console.log(`   Book Title: "${bookTitle?.trim()}"`);
    const subSectionText = await page.textContent('.book-subscriptions');
    if (!subSectionText?.includes('Reading Passes') && !subSectionText?.includes('Study Guides')) {
      throw new Error('Subscription passes section not found on Book roadmap page!');
    }
    console.log('   Subscription Passes Section verified on Book Roadmap');
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '03_book_roadmap_subscriptions.png'), fullPage: false });
    console.log('   Saved screenshot: 03_book_roadmap_subscriptions.png');

    // 4. Protected Study Guide Access - Unauthenticated Paywall Check
    console.log('4. Testing Protected Study Guide (Unauthorized Access Paywall) ...');
    await page.goto(`${BASE_URL}/books/linear-algebra-and-learning-from-data/i-1`, { waitUntil: 'networkidle' });
    const paywallTitle = await page.textContent('.paywall-block__title');
    console.log(`   Paywall Banner Title: "${paywallTitle?.trim()}"`);
    if (!paywallTitle?.includes('Study Pass Required')) {
      throw new Error('Paywall did not trigger for unauthenticated user on protected study guide!');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '04_study_guide_paywall.png'), fullPage: false });
    console.log('   Saved screenshot: 04_study_guide_paywall.png');

    // 5. User Registration Flow
    console.log('5. Testing User Registration (/auth/register) ...');
    const testEmail = `student_${Date.now()}@readbooks.dev`;
    await page.goto(`${BASE_URL}/auth/register?redirect=/subscriptions`, { waitUntil: 'networkidle' });
    await page.fill('#name', 'Alex Student');
    await page.fill('#email', testEmail);
    await page.fill('#password', 'StudyPass123!');
    await page.click('#submit-btn');

    await page.waitForURL('**/subscriptions', { timeout: 10000 });
    await page.waitForSelector('text=Signed in as Alex Student', { timeout: 10000 });
    console.log('   User registered & redirected to /subscriptions');
    console.log('   Session Info: "Logged in as Alex Student"');
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '05_user_registered_subscriptions.png'), fullPage: false });
    console.log('   Saved screenshot: 05_user_registered_subscriptions.png');

    // 6. Subscription Purchase / Activation Flow
    console.log('6. Purchasing / Activating Pass via Passyn API ...');
    const passBtn = await page.$('.purchase-pass-btn[data-book-slug="linear-algebra-and-learning-from-data"]');
    if (!passBtn) {
      throw new Error('Purchase pass button not found for book!');
    }
    await passBtn.click();
    await page.waitForSelector('.badge--active', { timeout: 10000 });
    const activeBadge = await page.textContent('.badge--active');
    console.log(`   Subscription Status: "${activeBadge?.trim()}"`);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '06_pass_activated.png'), fullPage: false });
    console.log('   Saved screenshot: 06_pass_activated.png');

    // 7. Verify Study Guide is Now UNLOCKED!
    console.log('7. Verifying Study Guide is now UNLOCKED for subscribed user ...');
    await page.goto(`${BASE_URL}/books/linear-algebra-and-learning-from-data/i-1`, { waitUntil: 'networkidle' });
    const hasPaywall = (await page.$('.paywall-block')) !== null;
    const hasContent = (await page.$('.guide__body .prose')) !== null;
    console.log(`   Has Paywall: ${hasPaywall}, Has Unlocked Content: ${hasContent}`);
    if (hasPaywall || !hasContent) {
      throw new Error('Study guide is still paywalled after subscribing!');
    }
    const guideHeading = await page.textContent('.guide__title');
    console.log(`   Unlocked Guide Title: "${guideHeading?.replace(/\s+/g, ' ').trim()}"`);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '07_study_guide_unlocked.png'), fullPage: false });
    console.log('   Saved screenshot: 07_study_guide_unlocked.png');

    // 8. User Dashboard (/account/subscriptions)
    console.log('8. Checking User Dashboard (/account/subscriptions) ...');
    await page.goto(`${BASE_URL}/account/subscriptions`, { waitUntil: 'networkidle' });
    const dashboardTitle = await page.textContent('.sub-header__title');
    console.log(`   Dashboard Title: "${dashboardTitle?.trim()}"`);
    const activePassCount = (await page.$$('.plan-card--featured')).length;
    console.log(`   Active Passes in Dashboard: ${activePassCount}`);
    if (activePassCount === 0) {
      throw new Error('Active pass not shown in user dashboard!');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '08_user_dashboard.png'), fullPage: false });
    console.log('   Saved screenshot: 08_user_dashboard.png');

    // 9. Admin Dashboard Access & Plan Creation (/admin/subscriptions)
    console.log('9. Checking Admin Dashboard (/admin/subscriptions) ...');
    // Clear student cookies and log in as Admin
    await context.clearCookies();
    await page.goto(`${BASE_URL}/auth/login?redirect=/admin/subscriptions`, { waitUntil: 'networkidle' });
    await page.fill('#email', 'admin@readbooks.dev');
    await page.fill('#password', 'AdminPass123!');
    await page.click('#submit-btn');

    await page.waitForURL('**/admin/subscriptions', { timeout: 10000 });
    await page.waitForSelector('text=Subscription Management', { timeout: 10000 });
    const adminHeading = await page.textContent('.sub-header__title');
    console.log(`   Admin Heading: "${adminHeading?.trim()}"`);

    // Click "+ Create New Plan"
    await page.click('#toggle-new-plan');
    await page.fill('#plan-name', '48-Hour Exam Prep Pass');
    await page.fill('#plan-price', '11.99');
    await page.fill('#plan-duration', '48');
    await page.fill('#plan-desc', 'Two full days of intensive review and exam problem breakdowns');

    await page.click('#submit-new-plan');
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('text=48-Hour Exam Prep Pass', { timeout: 10000 });
    console.log('   Plan Created: YES (48-Hour Exam Prep Pass)');
    await page.screenshot({ path: join(SCREENSHOTS_DIR, '09_admin_dashboard.png'), fullPage: false, animations: 'disabled' });
    console.log('   Saved screenshot: 09_admin_dashboard.png');

    console.log('\n--- ALL BROWSER E2E VERIFICATIONS PASSED SUCCESSFULLY ---');
  } finally {
    await browser.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error('\n❌ BROWSER VERIFICATION FAILED:', err);
  process.exit(1);
});
