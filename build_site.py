#!/usr/bin/env python3
"""
build_site.py - run the backtest server-side and emit ONLY derived series.

Reads engine_data.json (produced by refresh_data.py) and writes site/portfolio.json.
No ticker price ever appears in the output: the published payload contains index
levels normalised to 1.00, quarterly summary rows, and per-quarter component
RETURNS (percentages, not prices). That keeps the public page fully interactive
while never redistributing the underlying price feed.
"""
import json, math, argparse, datetime as dt
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('--data', default='engine_data.json')
ap.add_argument('--out',  default='site/portfolio.json')
ap.add_argument('--adjclose', action='store_true',
                help='prices are already total-return; skip separate dividend handling')
a = ap.parse_args()

D = json.load(open(a.data))
dates = D['dates']; n = len(dates)

def px(t, i):
    s = D['px'].get(t)
    if not s: return None
    v = s[i]
    if v is not None: return v
    for k in range(i-1, -1, -1):
        if s[k] is not None: return s[k]
    return None

# resolve quarter boundaries onto the trading calendar
qs = []
for q in D['quarters']:
    si = next((i for i, d in enumerate(dates) if d >= q['start']), None)
    ei = next((i for i in range(n-1, -1, -1) if dates[i] <= q['end']), None)
    if si is None or ei is None or si > ei: continue
    q = dict(q); q['si'], q['ei'] = si, ei; qs.append(q)

# ---- strategy index: growth of 1.00, quarterly equal-weight reconstitution ----
strat = [None]*n; divc = 0.0; prev = None; quarters = []
for q in qs:
    A, B = q['si'], q['ei']
    base = 1.0 if prev is None else sum(prev[t]*px(t, A) for t in prev)
    amt  = base + divc; divc = 0.0
    live = [t for t in q['w'] if px(t, A)]
    tot  = sum(q['w'][t] for t in live)
    qty  = {t: amt*(q['w'][t]/tot)/px(t, A) for t in live}
    nd = B - A + 1; qd = 0.0
    for i in range(A, B+1):
        per = sum(qty[t]*q['dps'].get(t, 0.0)/nd for t in qty)
        qd += per                       # reported either way
        if not a.adjclose:
            divc += per                 # only reinvested as cash when not on adjClose
        strat[i] = sum(qty[t]*px(t, i) for t in qty) + divc
    close = strat[B] - divc
    quarters.append(dict(
        q=q['q'], start=dates[A], end=dates[B], n=len(live),
        open=round(amt, 8), close=round(close, 8),
        ret=round(close/amt - 1, 6), div=round(qd, 8),
        dy=round(qd/amt, 8),           # dividend yield on opening capital
        tot=round(strat[B]/amt - 1, 6),
        holdings=sorted(live),
        cret={t: round(px(t, B)/px(t, A) - 1, 5) for t in live}))
    prev = qty
for i in range(n):
    if strat[i] is None: strat[i] = strat[i-1] if i else 1.0

# ---- benchmark indices: growth of 1.00, distributions reinvested ----
series = {'Strategy': [round(v, 8) for v in strat]}
last_real = {}
for k, b in D.get('bench', {}).items():
    p, dv = b['p'], b.get('d', [0]*n)
    s0 = next((i for i, v in enumerate(p) if v), None)
    if s0 is None: continue
    out = [None]*n; last = p[s0]; sh = 1.0/last
    for i in range(s0, n):
        v = p[i]
        if v is None or not v > 0: v = last
        else: last = v
        if not a.adjclose and dv[i]: sh += sh*dv[i]/v
        out[i] = round(sh*v, 8)
    series[k] = out
    lr = D.get('lastReal', {}).get(k)
    last_real[k] = lr if lr is not None else max(i for i, v in enumerate(out) if v is not None)

prev_h = None; turn = []
for q in quarters:
    if prev_h is None:
        q['inn'] = []; q['out'] = []
    else:
        q['inn'] = [t for t in q['holdings'] if t not in prev_h]
        q['out'] = [t for t in prev_h if t not in q['holdings']]
    turn.append(len(q['inn']))
    prev_h = q['holdings']

payload = dict(
    generated   = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
    asOf        = dates[-1],
    firstDate   = dates[0],
    dates       = dates,
    series      = series,
    lastReal    = last_real,
    quarters    = quarters,
    basis       = 'total return, dividends reinvested' if a.adjclose
                  else 'price return plus dividends held to next rebalance',
    nComponents = len(qs[0]['w']) if qs else 0,
    nQuarters   = len(quarters),
    avgTurnover = round(sum(turn)/max(1, len(turn)-1), 2),
    current     = quarters[-1]['holdings'] if quarters else [],
    currentQ    = quarters[-1]['q'] if quarters else '',
    divBasis    = ('reported only - adjClose already reinvests them' if a.adjclose
                   else 'held as cash, redeployed at the next rebalance'),
)

Path(a.out).parent.mkdir(parents=True, exist_ok=True)
Path(a.out).write_text(json.dumps(payload, separators=(',', ':')))

kb = len(json.dumps(payload, separators=(',', ':')))/1024
print('wrote %s  %.0f KB' % (a.out, kb))
print('  %d days, %d quarters, series: %s' % (n, len(quarters), ', '.join(series)))
print('  strategy index final %.4f  ->  $%s on $100k'
      % (strat[-1], format(round(strat[-1]*100000), ',')))
for k in series:
    if k != 'Strategy':
        print('  %-6s final %.4f' % (k, series[k][-1]))

# hard guarantee: no ticker-level price data in the published file
blob = json.dumps(payload)
leaked = [t for t in D['px'] if ('"%s"' % t) in blob and t not in
          {h for q in quarters for h in q['holdings']}]
assert 'px' not in payload, 'price block must never be published'
print('\nprice series published: NONE (payload carries index levels + returns only)')
