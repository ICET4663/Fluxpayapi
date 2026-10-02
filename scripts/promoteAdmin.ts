// Usage: npm run promote-admin -- user@example.com
import { pool } from '../src/db/pool.ts';
import { findUserByEmail } from '../src/modules/users/users.repository.ts';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run promote-admin -- <email>');
  process.exit(1);
}

try {
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exitCode = 1;
  } else {
    await pool.query(`update profiles set role = 'admin' where id = $1`, [user.id]);
    console.log(`${user.fullName} <${user.email}> is now an admin.`);
  }
} finally {
  await pool.end();
}
