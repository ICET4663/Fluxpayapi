// Usage: node --env-file=.env scripts/promoteAdmin.ts user@example.com
import { db } from '../src/db/client.ts';
import { findUserByEmail } from '../src/modules/users/users.repository.ts';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node --env-file=.env scripts/promoteAdmin.ts <email>');
  process.exit(1);
}

const user = findUserByEmail(email);
if (!user) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}

db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(user.id);
console.log(`${user.fullName} <${user.email}> is now an admin.`);
