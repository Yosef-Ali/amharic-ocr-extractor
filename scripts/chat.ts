import 'dotenv/config';
import { anthropicChat } from '../src/services/anthropicService';

/**
 * AI Terminal CLI — Run AI chat from the command line.
 * Usage: npx tsx scripts/chat.ts "Your message here"
 */
async function main() {
  const input = process.argv[2];
  if (!input) {
    console.log('Usage: npx tsx scripts/chat.ts "Your message here"');
    process.exit(1);
  }

  const model = process.env.VITE_ANTHROPIC_MODEL || 'MiniMax-M2.7';
  console.log(`\n🤖 [${model}] Thinking...\n`);

  try {
    const response = await anthropicChat(
      [{ role: 'user', text: input }],
      undefined, // No canvas context in terminal
      'You are a helpful AI assistant running in a terminal CLI.',
      model
    );

    console.log('--- Response ---\n');
    console.log(response);
    console.log('\n----------------\n');
  } catch (err) {
    console.error('❌ AI Chat failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
