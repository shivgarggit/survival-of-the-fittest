#!/usr/bin/env python3
"""
refresh_data.py - pull prices and dividends from Tiingo and build engine_data.json.

Talks to Tiingo directly. Replaces the earlier Yahoo-based fetcher, which ignored
your API token and does not work on CI runners because Yahoo blocks datacentre IPs.

Reads only the quarterly roster from weights.xlsx. Everything else comes from Tiingo.

  TIINGO_TOKEN=xxxx python refresh_data.py --workbook weights.xlsx --json engine_data.json
"""

import argparse, json, os, sys, time
import urllib.request, urllib.error, urllib.parse
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("Missing package.  pip install openpyxl")

BASE = "https://api.tiingo.com/tiingo/daily"
TICKER_FIX = {"APPL": "AAPL", "BRKB": "BRK-B", "VISA": "V", "PNJ": "PG", "BRK.B": "BRK-B"}
BENCHMARKS = ["SPY", "QQQ", "SPMO", "XLG", "MAGS", "RSP", "PSLDX"]

# Some symbols are punctuated differently by different vendors. Try each in turn.
VARIANTS = {
    "BRK-B": ["BRK-B", "BRK.B", "BRKB", "BRK_B"],
    "BF-B":  ["BF-B", "BF.B", "BFB"],
}


def http_json(url, tries=4):
    """GET with backoff. Tiingo throttles free accounts aggressively."""
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "survival-of-fittest/1.0"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:200]
            last = "HTTP %s %s" % (e.code, body)
            if e.code in (401, 403):
                sys.exit("\nAUTH FAILED: %s\n"
                         "Check the TIINGO_TOKEN secret is set and has no stray spaces." % last)
            if e.code == 404:
                return None
            if e.code == 429 or e.code >= 500:
                wait = 20 * (attempt + 1)
                print("      throttled, waiting %ds" % wait, flush=True)
                time.sleep(wait)
                continue
            break
        except Exception as e:
            last = str(e)
            time.sleep(5 * (attempt + 1))
    print("      giving up: %s" % last, flush=True)
    return None


def fetch(ticker, token, start, end):
    """Try each known spelling of the symbol; return (rows, symbol_that_worked)."""
    for sym in VARIANTS.get(ticker, [ticker]):
        q = urllib.parse.urlencode({"startDate": start, "endDate": end,
                                    "format": "json", "token": token})
        rows = http_json("%s/%s/prices?%s" % (BASE, sym.lower(), q))
        if rows:
            return rows, sym
    return None, ticker


def read_weights(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    rows = list(wb["Weightage"].iter_rows(values_only=True))
    hdr = rows[1]
    cols, names = [], []
    for i, h in enumerate(hdr):
        if h and "_Weightage" in str(h):
            t = str(h).replace("_Weightage", "")
            cols.append(i); names.append(TICKER_FIX.get(t, t))
    out = []
    for r in rows[2:]:
        if not r[0] or r[1] is None or r[2] is None:
            continue
        w = {n: float(r[i]) for i, n in zip(cols, names)
             if isinstance(r[i], (int, float)) and r[i] > 0}
        if w:
            out.append(dict(q=str(r[0]).strip(),
                            start=str(r[1])[:10], end=str(r[2])[:10], w=w))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workbook", required=True)
    ap.add_argument("--json", default="engine_data.json")
    ap.add_argument("--token", default=os.environ.get("TIINGO_TOKEN", ""))
    a = ap.parse_args()

    if not a.token:
        sys.exit("No token. Set the TIINGO_TOKEN environment variable or pass --token.")

    quarters = read_weights(a.workbook)
    if not quarters:
        sys.exit("No quarters found in the Weightage sheet of %s" % a.workbook)
    comps = sorted({t for q in quarters for t in q["w"]})
    start = min(q["start"] for q in quarters)
    end = max(q["end"] for q in quarters)
    print("Roster: %d quarters, %d components, %s to %s" % (len(quarters), len(comps), start, end))

    raw, failed = {}, []
    allt = comps + [b for b in BENCHMARKS if b not in comps]

    def pull(tickers, label, pace):
        out = []
        for i, t in enumerate(tickers, 1):
            print("  %s [%2d/%2d] %-8s" % (label, i, len(tickers), t), end="", flush=True)
            rows, sym = fetch(t, a.token, start, end)
            if not rows:
                print("NO DATA", flush=True); out.append(t); continue
            raw[t] = rows
            nd = sum(1 for r in rows if (r.get("divCash") or 0) > 0)
            ns = sum(1 for r in rows if (r.get("splitFactor") or 1) != 1)
            note = "" if sym == t else "  (matched as %s)" % sym
            print("%5d rows, %2d dividends, %d splits%s" % (len(rows), nd, ns, note), flush=True)
            time.sleep(pace)
        return out

    failed = pull(allt, "  ", 1.5)

    if failed:
        print("\n%d symbol(s) returned nothing: %s" % (len(failed), ", ".join(failed)))
        print("Waiting 90s in case this is rate limiting, then retrying those only.\n", flush=True)
        time.sleep(90)
        failed = pull(failed, "retry", 3.0)

    missing = [t for t in comps if t not in raw]
    if missing or failed:
        print("\n" + "=" * 60)
        print("FAILURE SUMMARY")
        print("=" * 60)
        for t in failed:
            kind = "COMPONENT (fatal)" if t in comps else "benchmark (skippable)"
            print("  %-8s %s" % (t, kind))
        print()
        if missing:
            print("These are strategy components, so the backtest cannot be built without")
            print("them. Most likely causes, in order:")
            print("  1. Tiingo does not cover that symbol under this spelling.")
            print("     Test it in a browser:")
            print("     https://api.tiingo.com/tiingo/daily/<symbol>/prices"
                  "?startDate=2026-07-01&token=YOURTOKEN")
            print("  2. You hit the hourly request ceiling. Wait an hour and re-run.")
            print("  3. The symbol is spelled differently in weights.xlsx than at Tiingo.")
            sys.exit("\nStopping rather than publishing a wrong backtest.")
        print("All missing symbols are benchmarks. Continuing without them.")

    cal = sorted({r["date"][:10] for t in comps for r in raw[t]})
    pos = {d: i for i, d in enumerate(cal)}
    n = len(cal)

    def series(t, field):
        out = [None] * n
        for r in raw[t]:
            d = r["date"][:10]
            if d in pos and r.get(field) is not None:
                out[pos[d]] = float(r[field])
        last = None
        for i in range(n):
            if out[i] is None: out[i] = last
            else: last = out[i]
        return out

    def rnd(v):
        if v is None: return None
        av = abs(v)
        return round(v, 4 if av < 10 else (3 if av < 100 else 2))

    px = {t: [rnd(v) for v in series(t, "adjClose")] for t in comps}

    bench, last_real = {}, {}
    for b in BENCHMARKS:
        if b not in raw: continue
        s = series(b, "adjClose")
        bench[b] = dict(p=[rnd(v) for v in s], d=[0.0] * n)
        idx = [i for i, v in enumerate(s) if v is not None]
        last_real[b] = idx[-1] if idx else 0

    splits = {t: [(r["date"][:10], float(r["splitFactor"]))
                  for r in raw[t] if (r.get("splitFactor") or 1) != 1] for t in comps}
    def fwd(t, d):
        f = 1.0
        for sd, sf in splits.get(t, []):
            if sd > d: f *= sf
        return f
    dps = {}
    for q in quarters:
        acc = {}
        for t in q["w"]:
            if t not in raw: continue
            s = sum(float(r["divCash"]) / fwd(t, r["date"][:10])
                    for r in raw[t]
                    if (r.get("divCash") or 0) > 0 and q["start"] <= r["date"][:10] <= q["end"])
            if s: acc[t] = s
        dps[q["q"]] = acc

    payload = dict(
        dates=cal, px=px, bench=bench, lastReal=last_real,
        quarters=[dict(q=q["q"], start=q["start"], end=q["end"],
                       w={t: q["w"][t] for t in sorted(q["w"])},
                       dps={t: round(dps[q["q"]].get(t, 0.0), 6) for t in sorted(q["w"])})
                  for q in quarters],
        used=comps)
    Path(a.json).write_text(json.dumps(payload, separators=(",", ":")))
    print("\nWrote %s  %.0f KB  (%d days, %d components, %d benchmarks)"
          % (a.json, len(json.dumps(payload)) / 1024, n, len(comps), len(bench)))
    print("Coverage:")
    for t in sorted(raw):
        s = [v for v in series(t, "adjClose") if v is not None]
        tag = "benchmark" if t in BENCHMARKS else "component"
        print("  %-9s %-6s %5d days  %s to %s" %
              (tag, t, len(s), raw[t][0]["date"][:10], raw[t][-1]["date"][:10]))


if __name__ == "__main__":
    main()
