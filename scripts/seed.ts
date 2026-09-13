import {migrate} from '../packages/database/src/migrate.ts';
import {pool} from '../packages/database/src/index.ts';
await migrate();console.log('ExPress schema ready. Open portal to create your isolated sample workspace. No shared passwords or API secrets are seeded.');await pool.end();
