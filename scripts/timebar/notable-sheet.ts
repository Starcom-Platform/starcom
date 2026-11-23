/**
 * The time bar's notable rules, as a page for the owner's one review (critique-2026-11-01, OR26): a row a layer, the
 * draft rule (or why none is proposed), the fields it reads and what places it in time. Picks save in the page's own
 * database, collection `picks`, a document per layer: `approve`, `change` with a note, or `none` (no marker); for a
 * layer with no rule proposed, `agree` or `propose` with a note. Starcom reads them back and sets each rule's status.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/timebar/notable-sheet.ts <out.html>
 */
import fs from 'node:fs';
import { NOTABLE_RULES } from '../../src/features/globe/timebar/notableRules';

const out = process.argv[2] ?? 'notable-sheet.html';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const proposed = NOTABLE_RULES.filter((r) => r.rule);

const rows = NOTABLE_RULES.map((r) => `<tr data-id="${r.layer}" data-kind="${r.rule ? 'rule' : 'none'}">
<th scope="row"><span class="layer">${esc(r.label)}</span><code>${r.layer}</code></th>
<td>${r.rule ? `<p class="rule">${esc(r.rule)}</p>` : '<p class="rule quiet">No marker proposed.</p>'}<p class="basis">${esc(r.basis)}</p>${r.rule ? `<p class="when"><span>Placed at</span> ${esc(r.when)}</p>` : ''}</td>
<td class="pick"><div class="choices" role="group" aria-label="${esc(r.label)}"></div><input type="text" placeholder="${r.rule ? 'How to change it (optional)' : 'A rule you want (optional)'}" aria-label="Note for ${esc(r.label)}"></td>
</tr>`).join('\n');

const html = `<title>Time Bar Markers</title>
<style>
:root { --bg: #f6f7f9; --panel: #ffffff; --fg: #1c2530; --muted: #5a6776; --line: #d9dee5; --accent: #0b7f95; --accent-soft: #e2f3f6; --ok: #1f8a4c; --warn: #9a5b00; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0f1419; --panel: #151c23; --fg: #dce3ea; --muted: #8d9aa8; --line: #2a3440; --accent: #4fd1e8; --accent-soft: #12303a; --ok: #4cc27f; --warn: #e0a24a; color-scheme: dark; } }
:root[data-theme="dark"] { --bg: #0f1419; --panel: #151c23; --fg: #dce3ea; --muted: #8d9aa8; --line: #2a3440; --accent: #4fd1e8; --accent-soft: #12303a; --ok: #4cc27f; --warn: #e0a24a; color-scheme: dark; }
body { background: var(--bg); color: var(--fg); font: 14px/1.5 "IBM Plex Sans", system-ui, sans-serif; padding: 24px 16px 64px; }
main { max-width: 1080px; margin: 0 auto; display: grid; gap: 16px; }
h1 { font: 600 22px/1.25 "IBM Plex Sans", system-ui, sans-serif; margin: 0; text-wrap: balance; }
.lead { margin: 0; max-width: 70ch; color: var(--muted); }
.bar { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 1; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 6px; }
.progress { font-variant-numeric: tabular-nums; font-weight: 600; }
.status { color: var(--muted); }
.bar button { margin-left: auto; }
.wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); }
table { width: 100%; border-collapse: collapse; min-width: 720px; }
th, td { text-align: left; vertical-align: top; padding: 12px; border-top: 1px solid var(--line); }
thead th { border-top: 0; font: 600 11px/1.3 "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
th[scope=row] { width: 18%; }
.layer { display: block; font-weight: 600; }
code { font: 12px "IBM Plex Mono", ui-monospace, monospace; color: var(--muted); }
.rule { margin: 0 0 4px; }
.quiet { color: var(--muted); font-style: italic; }
.basis, .when { margin: 0; color: var(--muted); font-size: 13px; }
.when span { font-weight: 600; }
.pick { width: 30%; }
.choices { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
button { font: inherit; padding: 4px 10px; border-radius: 4px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; }
button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent); color: var(--fg); font-weight: 600; }
button.confirm { border-color: var(--warn); color: var(--warn); }
input[type=text] { width: 100%; box-sizing: border-box; font: inherit; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); }
tr.picked th .layer::after { content: " ✓"; color: var(--ok); }
@media (max-width: 640px) { body { padding-inline: 16px; } .bar button { margin-left: 0; } }
</style>
<main>
<h1>Time bar markers: what each layer counts as notable</h1>
<p class="lead">The one time bar marks notable events (critique-2026-11-01, OR17; your OR26: I draft a rule a layer, you review once). ${proposed.length} of ${NOTABLE_RULES.length} layers get a draft rule; the other ${NOTABLE_RULES.length - proposed.length} have no event time, or no severity but one Starcom computes, so I propose no marker rather than invent one. Every rule reads only fields the items carry. Pick each row, or approve the rest at once; picks save as you make them and I read them from here.</p>
<div class="bar"><span class="progress" id="progress">0 of ${NOTABLE_RULES.length} picked</span><span class="status" id="status">Connecting…</span><button type="button" id="approve-rest">Approve every row I haven't picked</button></div>
<div class="wrap"><table>
<thead><tr><th scope="col">Layer</th><th scope="col">Draft rule, its fields, and when it is placed</th><th scope="col">Your pick</th></tr></thead>
<tbody>
${rows}
</tbody></table></div>
</main>
<script>
(() => {
  const CHOICES = { rule: [['approve', 'Approve'], ['change', 'Change'], ['none', 'No marker']], none: [['agree', 'Agree: none'], ['propose', 'Propose one']] };
  const ids = [...document.querySelectorAll('tbody tr')].map((tr) => tr.dataset.id);
  const state = new Map();
  const queue = new Map();
  let db = null; let canWrite = false;
  const statusEl = document.getElementById('status');
  const progressEl = document.getElementById('progress');
  const setStatus = (s) => { statusEl.textContent = s; };
  const rowOf = (id) => document.querySelector('tr[data-id="' + id + '"]');
  for (const id of ids) {
    const tr = rowOf(id);
    const box = tr.querySelector('.choices');
    for (const [value, label] of CHOICES[tr.dataset.kind]) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.value = value; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => choose(id, (p) => ({ ...p, pick: p.pick === value ? null : value })));
      box.appendChild(b);
    }
    const input = tr.querySelector('input');
    input.addEventListener('change', () => choose(id, (p) => ({ ...p, note: input.value })));
  }
  function render(id) {
    const tr = rowOf(id); const pick = state.get(id) || {};
    tr.querySelectorAll('.choices button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.value === pick.pick)); b.disabled = !canWrite; });
    const input = tr.querySelector('input');
    if (document.activeElement !== input) input.value = pick.note || '';
    input.disabled = !canWrite;
    tr.classList.toggle('picked', !!pick.pick);
  }
  function renderProgress() {
    progressEl.textContent = ids.filter((id) => (state.get(id) || {}).pick).length + ' of ' + ids.length + ' picked';
  }
  function choose(id, change) {
    if (!db || !canWrite) return;
    const next = change(state.get(id) || {});
    state.set(id, next); render(id); renderProgress();
    const before = queue.get(id) || Promise.resolve();
    const write = before.then(() => db.collection('picks').doc(id).set({ pick: next.pick || null, note: next.note || '', at: new Date().toISOString() }))
      .then(() => setStatus('Saved'))
      .catch((e) => setStatus('Not saved (' + (e && e.code || 'error') + '): try again, or name rows in chat.'));
    queue.set(id, write);
  }
  ids.forEach(render);
  const restButton = document.getElementById('approve-rest');
  let armed = null;
  restButton.addEventListener('click', async () => {
    if (!db || !canWrite) { setStatus('Picks cannot be saved in this view.'); return; }
    const rest = ids.filter((id) => !(state.get(id) || {}).pick);
    if (!rest.length) { setStatus('Every row is picked.'); return; }
    if (!armed) {
      restButton.classList.add('confirm'); restButton.textContent = 'Click again to approve ' + rest.length + ' rows';
      armed = setTimeout(() => { armed = null; restButton.classList.remove('confirm'); restButton.textContent = "Approve every row I haven't picked"; }, 5000);
      return;
    }
    clearTimeout(armed); armed = null; restButton.classList.remove('confirm'); restButton.disabled = true;
    for (const id of rest) {
      const kind = rowOf(id).dataset.kind;
      choose(id, (p) => ({ ...p, pick: kind === 'rule' ? 'approve' : 'agree' }));
      await queue.get(id);
    }
    restButton.disabled = false; restButton.textContent = "Approve every row I haven't picked";
  });
  (async () => {
    const claude = window.claude;
    if (!claude || typeof claude.use !== 'function') { setStatus('Picks save only inside Claude: name rows in chat instead.'); return; }
    const [store, user] = await Promise.all([claude.use('db'), claude.use('user')]);
    if (!store) { setStatus('Picks cannot be saved in this view: name rows in chat instead.'); return; }
    db = store;
    const may = user ? await user.can('data.write') : null;
    canWrite = may !== false;
    setStatus(canWrite ? 'Picks save as you make them.' : 'You can read the picks; only the owner and contributors make them.');
    ids.forEach(render);
    db.collection('picks').onSnapshot((snap) => {
      for (const doc of snap.docs) { const d = doc.data() || {}; state.set(doc.id, { pick: d.pick || null, note: d.note || '' }); }
      ids.forEach(render); renderProgress();
    }, () => setStatus('Live picks stopped: reload to see the latest.'));
  })();
})();
</script>`;

fs.writeFileSync(out, html);
console.log(`${NOTABLE_RULES.length} layers, ${proposed.length} with a draft rule; ${Math.round(html.length / 1024)} KB -> ${out}`);
