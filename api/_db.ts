import { neon } from '@neondatabase/serverless';

const dbUrl = process.env.DATABASE_URL || process.env.VITE_DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL environment variable is not set');
export const sql = neon(dbUrl);
