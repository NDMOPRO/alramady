import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://postgres:HojTbrXjdJiFAlePxFiDcmvgdkeeTUBG@postgres.railway.internal:5432/railway' } } });

try {
  await prisma.$executeRawUnsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN DEFAULT false');
  console.log('1. is_owner column ensured');
  await prisma.$executeRawUnsafe('ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(128)');
  console.log('2. username column ensured');

  const existing = await prisma.$queryRawUnsafe("SELECT id, email FROM users WHERE email = 'prog.muhammed@gmail.com'");
  console.log('3. Existing users found:', existing.length);

  if (existing.length > 0) {
    const hash = await bcrypt.hash('15001500', 12);
    await prisma.$executeRawUnsafe("UPDATE users SET is_owner = true, role = 'root_admin', status = 'ACTIVE', username = 'MRUHAILY', name = 'MRUHAILY', password_hash = '" + hash + "' WHERE id = '" + existing[0].id + "'");
    console.log('4. Owner updated:', existing[0].id);
  } else {
    const hash = await bcrypt.hash('15001500', 12);
    const tenants = await prisma.$queryRawUnsafe('SELECT id FROM tenants LIMIT 1');
    const tid = tenants[0]?.id;
    console.log('4. Tenant:', tid);
    await prisma.$executeRawUnsafe("INSERT INTO users (id, name, username, email, password_hash, role, status, is_owner, phone, tenant_id) VALUES (gen_random_uuid(), 'MRUHAILY', 'MRUHAILY', 'prog.muhammed@gmail.com', '" + hash + "', 'root_admin', 'ACTIVE', true, '+966553445533', '" + tid + "')");
    console.log('5. Owner created');
  }
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await prisma.$disconnect();
}
