const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

const READBOOKS_DB_URL = process.env.READBOOKS_DB_URL || process.env.DATABASE_URL;
if (!READBOOKS_DB_URL) {
  console.error('Error: READBOOKS_DB_URL or DATABASE_URL environment variable is required.');
  process.exit(1);
}
const sql = neon(READBOOKS_DB_URL);

const realPlans = [
  {
    bookSlug: 'introduction-to-linear-algebra',
    name: '24-Hour Intensive Pass',
    description: 'Full unmetered access to all study guides, video notes, and roadmap milestones for 24 hours.',
    price: 4.99,
    durationHours: 24,
    type: 'DAY',
    passynPassId: 'cmw7ah6y90005jt08us1l80gb',
  },
  {
    bookSlug: 'introduction-to-linear-algebra',
    name: '7-Day Study Sprint Pass',
    description: 'One full week of structured access to study guides and problem set breakdowns.',
    price: 14.99,
    durationHours: 168,
    type: 'WEEKLY',
    passynPassId: 'cmw7ah7x3000bjt083zgkhzwz',
  },
  {
    bookSlug: 'introduction-to-linear-algebra',
    name: 'Semester Mastery Pass (30 Days)',
    description: '30-day comprehensive access with full interactive progress tracking and study guides.',
    price: 29.99,
    durationHours: 720,
    type: 'CUSTOM',
    passynPassId: 'cmw7ah8hd000hjt089b61p9xv',
  },
  {
    bookSlug: 'linear-algebra-and-learning-from-data',
    name: '24-Hour Sprint Pass',
    description: '24-hour full access to MIT 18.065 deep learning and matrix calculus study guides.',
    price: 5.99,
    durationHours: 24,
    type: 'DAY',
    passynPassId: 'cmw7ah8yg000njt088jvq2pkh',
  },
  {
    bookSlug: 'linear-algebra-and-learning-from-data',
    name: 'Weekly Deep-Dive Pass',
    description: '7-day deep-dive into SVD, PCA, neural networks, and optimization roadmaps.',
    price: 18.99,
    durationHours: 168,
    type: 'WEEKLY',
    passynPassId: 'cmw7ah9nz000tjt08yt9tmeec',
  },
  {
    bookSlug: 'linear-algebra-and-learning-from-data',
    name: 'Full Course Pass (30 Days)',
    description: '30 days of comprehensive study guide and deep learning mathematics access.',
    price: 34.99,
    durationHours: 720,
    type: 'CUSTOM',
    passynPassId: 'cmw7ahakm000yjt08hi75je1b',
  },
];

async function main() {
  console.log('1. Deactivating all legacy mock/test plans in ReadBooks database...');
  await sql.query(`UPDATE book_plans SET is_active = 0 WHERE passyn_pass_id LIKE 'pass_mock_%';`);

  console.log('2. Inserting or activating official real plans with genuine Passyn IDs...');
  const now = new Date().toISOString();

  for (const plan of realPlans) {
    const existing = await sql.query(
      `SELECT id FROM book_plans WHERE book_slug = $1 AND name = $2 LIMIT 1;`,
      [plan.bookSlug, plan.name]
    );

    if (existing && existing.length > 0) {
      console.log(`Updating "${plan.name}" (${plan.bookSlug}) -> ${plan.passynPassId}`);
      await sql.query(
        `UPDATE book_plans SET
          passyn_pass_id = $1,
          description = $2,
          price = $3,
          duration_hours = $4,
          pass_type = $5,
          is_active = 1,
          updated_at = $6
        WHERE id = $7;`,
        [plan.passynPassId, plan.description, plan.price, plan.durationHours, plan.type, now, existing[0].id]
      );
    } else {
      const planId = `plan_${crypto.randomBytes(12).toString('hex')}`;
      console.log(`Inserting "${plan.name}" (${plan.bookSlug}) with ID ${planId}`);
      await sql.query(
        `INSERT INTO book_plans (
          id, book_slug, passyn_pass_id, name, description,
          price, currency, duration_hours, pass_type, is_active,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11);`,
        [
          planId,
          plan.bookSlug,
          plan.passynPassId,
          plan.name,
          plan.description,
          plan.price,
          'USD',
          plan.durationHours,
          plan.type,
          now,
          now,
        ]
      );
    }
  }

  // Also check if any old plan has passyn_pass_id that is still mock, ensure is_active = 0
  await sql.query(`UPDATE book_plans SET is_active = 0 WHERE passyn_pass_id LIKE 'pass_mock_%';`);

  const activePlans = await sql.query(`SELECT id, book_slug, name, passyn_pass_id, price, duration_hours, is_active FROM book_plans WHERE is_active = 1 ORDER BY book_slug, duration_hours;`);
  console.log('\nActive book_plans in ReadBooks DB:');
  console.table(activePlans);
}

main().catch(console.error);
