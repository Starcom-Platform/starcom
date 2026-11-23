/**
 * Bakes GFZ Potsdam's 3-hourly Kp since 1932 (CC BY 4.0) into the file the Timestream's field lane reads (decision
 * D-PW, PW42): a character a slot, Kp in thirds, preliminary values marked, the credit in the file. The source stays
 * out of the repository; fetch it again from https://kp.gfz.de/app/files/Kp_ap_since_1932.txt and bake when the lane
 * should reach further (NOAA's last 30 days cover the time since, live).
 *
 *   npm run data:psi-kp -- <Kp_ap_since_1932.txt>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { bakeKp, KP_SLOT_MS, readKpBake } from '../../src/services/psiWatch/timestream/kp';

const [source, out = 'public/data/psi-kp-gfz.json'] = process.argv.slice(2);
if (!source) throw new Error('usage: bake-kp.ts <Kp_ap_since_1932.txt> [out]');
const bake = bakeKp(readFileSync(source, 'utf8'));
const check = readKpBake(JSON.parse(JSON.stringify(bake)));
if (!check || check.kp3.length !== bake.kp.length) throw new Error('the bake does not read back');
writeFileSync(out, `${JSON.stringify(bake)}\n`);
const end = new Date(check.startMs + check.kp3.length * KP_SLOT_MS).toISOString();
console.log(`${out}: ${check.kp3.length} slots from ${new Date(check.startMs).toISOString()} to ${end}`);
