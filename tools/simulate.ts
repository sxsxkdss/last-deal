import { Table } from '../src/match/table.ts';
import { PRESETS } from '../src/rules/cards.ts';
import { BOT_PROFILES, type BotProfile } from '../src/rules/bot.ts';
import { seeded } from '../src/match/clock.ts';

const seed = Number(process.argv[2] ?? 1);
const count = Number(process.argv[3] ?? 10);
const profiles = process.argv.slice(4) as BotProfile[];
if (
  !Number.isSafeInteger(seed) ||
  !Number.isInteger(count) ||
  count < 1 ||
  count > 10000 ||
  profiles.some((profile) => !BOT_PROFILES.includes(profile)) ||
  profiles.length === 1 ||
  profiles.length > 6
)
  throw Error('Usage: simulate [seed] [match count] [2–6 bot profiles]');
const seats = profiles.length ? profiles : ['standard', 'standard'];
for (let i = 0; i < count; i++) {
  const table = new Table(
    {
      ...PRESETS.den,
      mode: 'debt',
      limit: 250,
      members: seats.map((profile, seat) => ({
        name: 'Bot ' + seat,
        bot: true,
        profile: profile as BotProfile,
      })),
    },
    seeded(seed + i),
  );
  for (let j = 0; j < 10000 && table.phase !== 'over' && Number.isFinite(table.clock.next); j++)
    table.clock.advance(table.clock.next - table.clock.now);
  process.stdout.write(
    JSON.stringify({
      seed: seed + i,
      phase: table.phase,
      winner: table.M.champ,
      rounds: table.M.round,
      debt: table.M.debt,
      timeMs: Math.round(table.clock.now),
    }) + '\n',
  );
  if (table.phase !== 'over') process.exitCode = 1;
}
