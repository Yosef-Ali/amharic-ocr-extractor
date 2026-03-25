import { sql } from './src/lib/neon';

async function test() {
  const rows = await sql`SELECT user_id, id FROM documents ORDER BY saved_at DESC LIMIT 1`;
  if (!rows.length) return console.log('No documents');
  const d = rows[0];
  console.log('Testing document:', d.id);
  
  const content = await sql`
    SELECT jsonb_array_length(page_images) as len
    FROM document_content WHERE document_id = ${d.id}
  `;
  console.log('Images length:', content[0]?.len);
  
  const pageIndex = 0;
  try {
    const r1 = await sql`SELECT page_images->>${pageIndex} AS img FROM document_content WHERE document_id = ${d.id}`;
    console.log('Result of ->>0:', r1[0]?.img?.substring(0, 30));
  } catch(e) { console.error('Error on ->>:', e.message); }
  
  try {
    const r2 = await sql`SELECT page_images->>(${pageIndex}::int) AS img FROM document_content WHERE document_id = ${d.id}`;
    console.log('Result of ->>(0::int):', r2[0]?.img?.substring(0, 30));
  } catch(e) { console.error('Error on ->>(int):', e.message); }
}

test().catch(console.error);
