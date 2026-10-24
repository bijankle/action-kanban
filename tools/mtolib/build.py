"""Builds js/mtolib.js, the parts library behind the smart MTO rows.

Run from the app folder:  python3 tools/mtolib/build.py

Where the numbers come from:
  AUS_open_sections.csv, AUS_hollow_sections.csv   the steelas package (University of Queensland, MIT licence):
                                                   Australian UB, UC, PFC, WB, WC, SHS, RHS and CHS dimensions
  pipe_schedules.py                                the fluids package (MIT licence): ASME B36.10M and B36.19M walls
  the tables below                                 angles, Chinese sections, flats, rounds, plate, fittings, flanges,
                                                   bolting: the common catalogue sizes, typed in here
Mass per metre is worked out from the dimensions where the table has none (steel 7850 kg/m3, stainless 7930,
PE 960), so it's a close estimate for ordering and lifting, not a certified figure.
"""
import csv, json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "js", "mtolib.js")
ST, SS, PE = 7.85e-3, 7.93e-3, 0.96e-3   # kg per mm2 per m

def r1(x): return round(x, 2 if x < 10 else 1)
def tube(od, t, rho=ST): return r1(math.pi * (od - t) * t * rho)
def fmt(x): return ("%g" % x)

def rows(name):
    with open(os.path.join(HERE, name), encoding="utf-8-sig") as f:
        r = list(csv.DictReader(f))
    return r[1:]   # (the second line is the units)

sched = {}
exec(open(os.path.join(HERE, "pipe_schedules.py")).read(), sched)

NPS_DN = {0.125: 6, 0.25: 8, 0.375: 10, 0.5: 15, 0.75: 20, 1.0: 25, 1.25: 32, 1.5: 40, 2.0: 50, 2.5: 65, 3.0: 80, 3.5: 90, 4.0: 100, 5.0: 125,
          6.0: 150, 8.0: 200, 10.0: 250, 12.0: 300, 14.0: 350, 16.0: 400, 18.0: 450, 20.0: 500, 22.0: 550, 24.0: 600, 26.0: 650, 28.0: 700,
          30.0: 750, 32.0: 800, 34.0: 850, 36.0: 900}
def nps_name(n):
    w, f = int(n), n - int(n)
    fr = {0.125: "1/8", 0.25: "1/4", 0.375: "3/8", 0.5: "1/2", 0.75: "3/4"}.get(round(f, 3), "")
    return (str(w) if w else "") + ("-" if w and fr else "") + fr + '"'

def size(n, kg=None, **kw):
    d = {"n": n}
    if kg is not None: d["kg"] = kg
    d.update({k: v for k, v in kw.items() if v is not None})
    return d

# ---------------------------------------------------------------- pipe
def asme_pipe(rho, tables):
    by = {}
    for sch, nps, o, i in tables:
        for n, od, idd in zip(sched[nps], sched[o], sched[i]):
            if n not in NPS_DN or n > 36: continue
            t = round((od - idd) / 2, 2)
            by.setdefault(n, {"od": od, "r": {}})["r"][sch] = {"t": t, "kg": tube(od, t, rho)}
    out = []
    for n in sorted(by):
        dn = NPS_DN[n]
        out.append({"n": "DN%d" % dn, "a": nps_name(n), "od": by[n]["od"], "r": by[n]["r"]})
    return out

CS_TABLES = [(s, "NPS" + k, k2 + "o", k2 + "i") for s, k, k2 in [("SCH5", "5", "S5"), ("SCH10", "10", "S10"), ("SCH20", "20", "S20"), ("SCH30", "30", "S30"),
             ("SCH40", "40", "S40"), ("STD", "STD", "STD"), ("SCH60", "60", "S60"), ("SCH80", "80", "S80"), ("XS", "XS", "XS"), ("SCH100", "100", "S100"),
             ("SCH120", "120", "S120"), ("SCH140", "140", "S140"), ("SCH160", "160", "S160"), ("XXS", "XXS", "XXS")]]
SS_TABLES = [(s, "NPSS" + k, "SS" + k + "o", "SS" + k + "i") for s, k in [("SCH5S", "5"), ("SCH10S", "10"), ("SCH40S", "40"), ("SCH80S", "80")]]
cs_pipe, ss_pipe = asme_pipe(ST, CS_TABLES), asme_pipe(SS, SS_TABLES)

# AS 1074 steel tubes for water, gas and steam (the DN, OD and Light, Medium, Heavy walls)
AS1074 = [(8, 13.5, None, 2.3, 2.9), (10, 17.2, None, 2.3, 2.9), (15, 21.3, 2.0, 2.6, 3.2), (20, 26.9, 2.3, 2.6, 3.2), (25, 33.7, 2.6, 3.2, 4.0),
          (32, 42.4, 2.6, 3.2, 4.0), (40, 48.3, 2.9, 3.2, 4.0), (50, 60.3, 2.9, 3.6, 4.5), (65, 76.1, 3.2, 3.6, 4.5), (80, 88.9, 3.2, 4.0, 5.0),
          (90, 101.6, 3.6, 4.0, 5.0), (100, 114.3, 3.6, 4.5, 5.4), (125, 139.7, None, 5.0, 5.4), (150, 165.1, None, 5.0, 5.4)]
as1074 = [{"n": "DN%d" % dn, "od": od, "r": {k: {"t": t, "kg": tube(od, t)} for k, t in (("Light", l), ("Medium", m), ("Heavy", h)) if t}} for dn, od, l, m, h in AS1074]

# GB/T 8163 and GB/T 3091 (China): ISO outside diameters, walls as the matching ASME schedule
GB_OD = {15: 21.3, 20: 26.9, 25: 33.7, 32: 42.4, 40: 48.3, 50: 60.3, 65: 76.1, 80: 88.9, 100: 114.3, 125: 139.7, 150: 168.3, 200: 219.1, 250: 273, 300: 323.9, 350: 355.6, 400: 406.4, 450: 457, 500: 508, 600: 610}
gb_pipe = []
for p in cs_pipe:
    dn = int(p["n"][2:])
    if dn not in GB_OD: continue
    od = GB_OD[dn]
    gb_pipe.append({"n": "DN%d" % dn, "od": od, "r": {k: {"t": v["t"], "kg": tube(od, v["t"])} for k, v in p["r"].items() if k in ("SCH10", "SCH20", "SCH40", "STD", "SCH80", "XS", "SCH160")}})

# stainless tube, ASTM A269 / A270 and AS 1528.1 (inch OD series)
SST = [(6.35, [0.9, 1.2]), (9.53, [0.9, 1.2, 1.6]), (12.7, [1.2, 1.6, 2.0]), (15.88, [1.2, 1.6]), (19.05, [1.2, 1.6, 2.0]), (22.22, [1.2, 1.6]),
       (25.4, [1.2, 1.6, 2.0, 2.6]), (31.75, [1.2, 1.6, 2.0]), (38.1, [1.2, 1.6, 2.0, 2.6]), (50.8, [1.2, 1.6, 2.0, 2.6]), (63.5, [1.6, 2.0, 2.6]),
       (76.2, [1.6, 2.0, 2.6]), (101.6, [1.6, 2.0, 3.0]), (152.4, [2.0, 2.6, 3.0])]
ss_tube = [{"n": "%g OD" % od, "od": od, "r": {"%g wall" % t: {"t": t, "kg": tube(od, t, SS)} for t in ts}} for od, ts in SST]

# PE pipe, AS/NZS 4130: wall = OD / SDR rounded up to 0.1 mm, 2.0 mm at least
PE_OD = [16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 140, 160, 180, 200, 225, 250, 280, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000]
SDR = [("SDR 7.4", 7.4, "PN25", "PN20"), ("SDR 9", 9, "PN20", "PN16"), ("SDR 11", 11, "PN16", "PN12.5"), ("SDR 13.6", 13.6, "PN12.5", "PN10"),
       ("SDR 17", 17, "PN10", "PN8"), ("SDR 21", 21, "PN8", "PN6.3"), ("SDR 26", 26, "PN6.3", "PN5"), ("SDR 33", 33, "PN5", "PN4")]
def pe_wall(od, s): return max(2.0, math.ceil(od / s * 10 - 1e-9) / 10)
pe = []
for od in PE_OD:
    r = {}
    for nm, s, pn100, pn80 in SDR:
        t = pe_wall(od, s)
        if od / s < 1.6 and s > 11: continue   # (thin walls on small pipe aren't made)
        r[nm] = {"t": t, "kg": tube(od, t, PE), "pn": "PE100 " + pn100 + ", PE80 " + pn80}
    pe.append({"n": "%d OD" % od, "od": od, "r": r})

# ---------------------------------------------------------------- Australian structural (steelas)
op, ho = rows("AUS_open_sections.csv"), rows("AUS_hollow_sections.csv")
PFC_KG = {"380PFC": 55.2, "300PFC": 40.1, "250PFC": 35.5, "230PFC": 25.1, "200PFC": 22.9, "180PFC": 20.9, "150PFC": 17.7, "125PFC": 11.9, "100PFC": 8.33, "75PFC": 5.92}
def open_sec(kind):
    out, seen = [], set()
    for r in op:
        if r["sec_type"] != kind or r["section"] in seen: continue
        seen.add(r["section"])
        m = re.match(r"(\d+)(UB|UC|WB|WC)([\d.]+)", r["section"])
        kg = float(m.group(3)) if m else PFC_KG.get(r["section"])
        out.append(size(r["section"], kg, d=float(r["d"]), b=float(r["b"]), tf=float(r["t_f"]), tw=float(r["t_w"])))
    return sorted(out, key=lambda s: (-s["d"], -(s.get("kg") or 0)))
def hollow(kind):
    out, seen = [], set()
    for r in ho:
        if r["sec_type"] != kind or r["section"] in seen: continue
        seen.add(r["section"]); d, b, t = float(r["d"]), float(r["b"] or 0), float(r["t"])
        if kind == "CHS": kg = tube(d, t)
        else:
            ro = float(r["r_o"] or 2 * t); ri = max(ro - t, 0)
            kg = r1((2 * t * (b + d - 2 * t) - (4 - math.pi) * (ro * ro - ri * ri)) * ST)
        nm = r["section"].replace(kind, " " + kind)
        if kind == "SHS": nm = "%gx%gx%g SHS" % (d, d, t)
        out.append(size(nm, kg, d=d, b=b or None, t=t, g=sorted({x["grade"] for x in ho if x["section"] == r["section"]})))
    return sorted(out, key=lambda s: (s["d"], s.get("b") or 0, s["t"]))

def angle(b1, b2, t, rho=ST): return r1((b1 + b2 - t) * t * rho)
EA = {200: [26, 20, 18, 16, 13], 150: [19, 16, 12, 10], 125: [16, 12, 10, 8], 100: [12, 10, 8, 6], 90: [10, 8, 6], 75: [10, 8, 6, 5], 65: [10, 8, 6, 5],
      55: [6, 5], 50: [8, 6, 5, 3], 45: [6, 5, 3], 40: [6, 5, 3], 30: [6, 5, 3], 25: [6, 5, 3]}
UA = [(150, 100, [12, 10]), (150, 90, [16, 12, 10, 8]), (125, 75, [12, 10, 8, 6]), (100, 75, [10, 8, 6]), (75, 50, [8, 6, 5]), (65, 50, [8, 6, 5])]
ea = [size("%dx%dx%d EA" % (b, b, t), angle(b, b, t), d=b, t=t) for b in sorted(EA, reverse=True) for t in EA[b]]
ua = [size("%dx%dx%d UA" % (a, b, t), angle(a, b, t), d=a, b=b, t=t) for a, b, ts in UA for t in ts]
TFB = [size("125 TFB", 13.1, d=125, b=75), size("100 TFB", 7.2, d=100, b=45)]

FLAT_W = [20, 25, 32, 40, 50, 65, 75, 90, 100, 110, 125, 130, 150, 180, 200, 250, 300]
FLAT_T = [3, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50]
def flats(rho=ST, ws=FLAT_W, ts=FLAT_T): return [size("%dx%d FL" % (w, t), r1(w * t * rho), d=w, t=t) for w in ws for t in ts if t < w and not (w <= 25 and t > 12) and not (w >= 150 and t < 6)]
ROUND = [6, 8, 10, 12, 16, 20, 24, 25, 27, 30, 32, 36, 40, 45, 50, 56, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 150, 180, 200]
def rounds(rho=ST, ds=ROUND): return [size("%d RB" % d, r1(math.pi / 4 * d * d * rho), d=d) for d in ds]
SQB = [10, 12, 16, 20, 25, 32, 40, 50]
def squares(rho=ST): return [size("%d SQ" % d, r1(d * d * rho), d=d) for d in SQB]

# stainless sections, ASTM A276 / A554
ss_ea = [size("%dx%dx%d EA" % (b, b, t), angle(b, b, t, SS), d=b, t=t) for b, ts in [(25, [3, 5]), (30, [3, 5]), (40, [3, 5, 6]), (50, [3, 5, 6]), (65, [5, 6]), (75, [6, 8]), (100, [6, 8, 10])] for t in ts]
ss_shs = [size("%dx%dx%g SHS" % (b, b, t), r1(4 * (b - t) * t * SS), d=b, b=b, t=t) for b, ts in [(20, [1.6]), (25, [1.6, 2]), (30, [1.6, 2]), (40, [1.6, 2, 3]), (50, [1.6, 2, 3]), (65, [2, 3]), (75, [2, 3]), (100, [2, 3, 4])] for t in ts]
ss_rhs = [size("%dx%dx%g RHS" % (d, b, t), r1(2 * (d + b - 2 * t) * t * SS), d=d, b=b, t=t) for d, b, ts in [(40, 20, [1.6, 2]), (50, 25, [1.6, 2]), (75, 25, [2]), (75, 50, [2, 3]), (100, 50, [2, 3]), (150, 50, [3])] for t in ts]

# ---------------------------------------------------------------- Chinese structural
HW = [("HW100x100x6x8", 17.2), ("HW125x125x6.5x9", 23.8), ("HW150x150x7x10", 31.9), ("HW175x175x7.5x11", 40.4), ("HW200x200x8x12", 50.5),
      ("HW250x250x9x14", 72.4), ("HW300x300x10x15", 94.5), ("HW350x350x12x19", 137), ("HW400x400x13x21", 172)]
HM = [("HM150x100x6x9", 21.4), ("HM200x150x6x9", 31.2), ("HM250x175x7x11", 44.1), ("HM300x200x8x12", 57.3), ("HM350x250x9x14", 79.7),
      ("HM400x300x10x16", 107), ("HM450x300x11x18", 124), ("HM500x300x11x15", 115), ("HM600x300x12x17", 137)]
HN = [("HN100x50x5x7", 9.54), ("HN125x60x6x8", 13.3), ("HN150x75x5x7", 14.3), ("HN175x90x5x8", 18.2), ("HN200x100x5.5x8", 21.7), ("HN250x125x6x9", 29.7),
      ("HN300x150x6.5x9", 37.3), ("HN350x175x7x11", 50.0), ("HN400x200x8x13", 66.0), ("HN450x200x9x14", 76.5), ("HN500x200x10x16", 89.6), ("HN600x200x11x17", 106)]
CN_I = [("I10", 11.3), ("I12.6", 14.2), ("I14", 16.9), ("I16", 20.5), ("I18", 24.1), ("I20a", 27.9), ("I20b", 31.1), ("I22a", 33.1), ("I22b", 36.5),
        ("I25a", 38.1), ("I25b", 42.0), ("I28a", 43.5), ("I28b", 47.9), ("I32a", 52.7), ("I32b", 57.7), ("I36a", 60.0), ("I36b", 65.7), ("I40a", 67.6),
        ("I40b", 73.8), ("I45a", 80.4), ("I50a", 93.6), ("I56a", 106.2), ("I63a", 121.6)]
CN_C = [("[5", 5.44), ("[6.3", 6.63), ("[8", 8.04), ("[10", 10.0), ("[12.6", 12.3), ("[14a", 14.5), ("[14b", 16.7), ("[16a", 17.2), ("[16b", 19.8),
        ("[18a", 20.2), ("[18b", 23.0), ("[20a", 22.6), ("[20b", 25.8), ("[22a", 25.0), ("[22b", 28.5), ("[25a", 27.4), ("[25b", 31.3), ("[28a", 31.4),
        ("[28b", 35.8), ("[32a", 38.1), ("[32b", 43.1), ("[36a", 47.8), ("[40a", 58.9)]
CN_L = {20: [3, 4], 25: [3, 4], 30: [3, 4], 36: [3, 4, 5], 40: [3, 4, 5], 45: [4, 5, 6], 50: [4, 5, 6], 56: [4, 5, 6], 63: [5, 6, 8], 70: [5, 6, 7, 8],
        75: [5, 6, 8, 10], 80: [6, 7, 8, 10], 90: [6, 7, 8, 10, 12], 100: [6, 7, 8, 10, 12], 110: [8, 10, 12], 125: [8, 10, 12, 14], 140: [10, 12, 14],
        160: [10, 12, 14, 16], 180: [12, 14, 16, 18], 200: [14, 16, 18, 20, 24]}
cn_l = [size("L%dx%d" % (b, t), angle(b, b, t), d=b, t=t) for b in sorted(CN_L) for t in CN_L[b]]
cn_shs = [size("%dx%dx%g" % (b, b, t), r1(4 * (b - t) * t * ST), d=b, b=b, t=t) for b, ts in [(20, [1.5, 2]), (25, [1.5, 2, 2.5]), (30, [2, 2.5, 3]), (40, [2, 2.5, 3, 4]),
          (50, [2, 2.5, 3, 4, 5]), (60, [2.5, 3, 4, 5]), (70, [3, 4, 5]), (80, [3, 4, 5, 6]), (100, [3, 4, 5, 6, 8]), (120, [4, 5, 6, 8]), (150, [4, 5, 6, 8, 10]),
          (200, [5, 6, 8, 10, 12]), (250, [6, 8, 10, 12]), (300, [8, 10, 12])] for t in ts]
cn_rhs = [size("%dx%dx%g" % (d, b, t), r1(2 * (d + b - 2 * t) * t * ST), d=d, b=b, t=t) for d, b, ts in [(40, 20, [1.5, 2]), (50, 25, [2, 2.5, 3]), (60, 40, [2, 3, 4]),
          (80, 40, [2, 3, 4]), (100, 50, [3, 4, 5]), (120, 60, [3, 4, 5, 6]), (150, 100, [4, 5, 6, 8]), (200, 100, [4, 5, 6, 8]), (250, 150, [6, 8, 10]),
          (300, 200, [8, 10, 12])] for t in ts]
cn_chs = [{"n": "%gx%g" % (od, t), "kg": tube(od, t), "d": od, "t": t} for od, ts in [(21.3, [2.0, 2.8]), (26.9, [2.0, 2.8]), (33.7, [2.5, 3.2]), (42.4, [2.5, 3.2]),
          (48.3, [2.5, 3.0, 3.5]), (60.3, [3.0, 3.5, 4.0]), (76.1, [3.0, 3.5, 4.0]), (88.9, [3.5, 4.0, 5.0]), (114.3, [4.0, 5.0, 6.0]), (139.7, [4.5, 5.0, 6.0]),
          (168.3, [5.0, 6.0, 8.0]), (219.1, [6.0, 8.0, 10.0]), (273, [6.0, 8.0, 10.0]), (323.9, [8.0, 10.0, 12.0])] for t in ts]

# ---------------------------------------------------------------- plate
PL_T = [1.6, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 60, 80, 100]
def plate(ts, rho=ST, mm=True): return [size("%g mm" % t, r1(t * rho * 1000), t=t) for t in ts]   # (kg is per m2)
SHEETS = ["2400x1200", "2500x1250", "3000x1500", "6000x1500", "6000x1800", "6000x2400", "8000x2400", "9600x2400", "12000x2400"]
SS_SHEETS = ["2438x1219", "3048x1219", "3000x1500", "6000x1500", "6000x2000"]
CN_SHEETS = ["2000x1000", "2500x1250", "6000x1500", "6000x1800", "8000x2000", "12000x2200", "12000x2500"]

# ---------------------------------------------------------------- fittings, flanges, gaskets, bolting
DNS = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600]
DNS_SMALL = [8, 10, 15, 20, 25, 32, 40, 50, 65, 80, 100]
def dn(xs): return [size("DN%d" % d) for d in xs]
def reducing(xs):
    out = []
    for i, a in enumerate(xs):
        for b in xs[max(0, i - 4):i][::-1]: out.append(size("DN%d x DN%d" % (a, b)))
    return out
ASME_BOLTS = {150: {15: "4 x 1/2\"", 20: "4 x 1/2\"", 25: "4 x 1/2\"", 32: "4 x 1/2\"", 40: "4 x 1/2\"", 50: "4 x 5/8\"", 65: "4 x 5/8\"", 80: "4 x 5/8\"",
              100: "8 x 5/8\"", 125: "8 x 3/4\"", 150: "8 x 3/4\"", 200: "8 x 3/4\"", 250: "12 x 7/8\"", 300: "12 x 7/8\"", 350: "12 x 1\"", 400: "16 x 1\"",
              450: "16 x 1-1/8\"", 500: "20 x 1-1/8\"", 600: "20 x 1-1/4\""},
              300: {15: "4 x 1/2\"", 20: "4 x 5/8\"", 25: "4 x 5/8\"", 32: "4 x 5/8\"", 40: "4 x 3/4\"", 50: "8 x 5/8\"", 65: "8 x 3/4\"", 80: "8 x 3/4\"",
              100: "8 x 3/4\"", 125: "8 x 3/4\"", 150: "12 x 3/4\"", 200: "12 x 7/8\"", 250: "16 x 1\"", 300: "16 x 1-1/8\"", 350: "20 x 1-1/8\"",
              400: "20 x 1-1/4\"", 450: "24 x 1-1/4\"", 500: "24 x 1-1/4\"", 600: "24 x 1-1/2\""}}
def flange_sizes():
    return [size("DN%d" % d, bolts={"Class 150": ASME_BOLTS[150].get(d), "Class 300": ASME_BOLTS[300].get(d)}) for d in DNS]

M = [6, 8, 10, 12, 16, 20, 24, 30, 36]
BL = {6: [12, 16, 20, 25, 30, 40, 50], 8: [16, 20, 25, 30, 40, 50, 60, 80], 10: [20, 25, 30, 40, 50, 60, 70, 80, 100], 12: [25, 30, 35, 40, 50, 60, 70, 80, 100, 120, 150],
      16: [30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 200], 20: [40, 45, 50, 55, 60, 70, 80, 90, 100, 120, 150, 200, 250], 24: [50, 60, 70, 80, 90, 100, 120, 150, 200, 250, 300],
      30: [60, 70, 80, 90, 100, 120, 150, 200, 250, 300], 36: [80, 100, 120, 150, 200, 250, 300]}
bolts = [size("M%d x %d" % (m, l)) for m in M for l in BL[m]]
nuts = [size("M%d" % m) for m in M]
STUD = ["1/2\"", "5/8\"", "3/4\"", "7/8\"", "1\"", "1-1/8\"", "1-1/4\"", "1-1/2\""]
studs = [size("%s x %d" % (d, l)) for d in STUD for l in [65, 75, 90, 100, 110, 125, 140, 150, 165, 180, 200, 230, 250]] + [size("M%d x %d" % (m, l)) for m in [12, 16, 20, 24, 30] for l in [70, 90, 110, 130, 150, 180, 200]]
rods = [size("M%d" % m, r1(math.pi / 4 * (m * 0.88) ** 2 * ST)) for m in [6, 8, 10, 12, 16, 20, 24, 30, 36]]

# ---------------------------------------------------------------- the library
AU, CN, INT = "AU", "CN", "INT"
FIN = ["Black", "Hot dip galvanised", "Primed"]
LEN_U, PLATE_U, EA_U = ["m", "lengths", "kg"], ["sheets", "m2", "kg"], ["ea", "pairs", "sets", "boxes"]
def std(id, n, o, sizes, mats, rat=None, rl=None, lens=None, defl=None, note=None):
    d = {"id": id, "n": n, "o": o, "sizes": sizes, "mats": mats}
    if rat: d["rat"] = rat
    if rl: d["rl"] = rl
    if lens: d["lens"] = lens; d["defl"] = defl or lens[0]
    if note: d["note"] = note
    return d

T = []
def typ(id, n, g, kind, stds, units, rl="Rating"):
    T.append({"id": id, "n": n, "g": g, "k": kind, "stds": stds, "units": units, "rl": rl})

CS_MATS = ["ASTM A106 Gr B", "API 5L Gr B", "ASTM A53 Gr B", "ASTM A333 Gr 6 (low temp)"]
SS_MATS = ["316L (A312 TP316L)", "304L (A312 TP304L)", "316 (A312 TP316)", "304 (A312 TP304)", "2205 duplex (A790)"]
typ("pipe", "Pipe, carbon steel", "Pipe and tube", "len", [
    std("b3610", "ASME B36.10M", INT, cs_pipe, CS_MATS + ["Galvanised A53 Gr B"], rl="Schedule", lens=[6000, 6100, 6400, 12000], defl=6000),
    std("as1074", "AS 1074 (water, gas, air)", AU, as1074, ["AS 1074 black", "AS 1074 galvanised"], rl="Wall", lens=[6500, 6000], defl=6500),
    std("gb8163", "GB/T 8163 seamless (China)", CN, gb_pipe, ["20#", "Q355B", "Q235B (GB/T 3091 welded)"], rl="Schedule", lens=[6000, 9000, 12000], defl=6000)],
    LEN_U, "Schedule")
typ("sspipe", "Pipe, stainless", "Pipe and tube", "len", [
    std("b3619", "ASME B36.19M", INT, ss_pipe, SS_MATS, rl="Schedule", lens=[6000, 6100], defl=6000)], LEN_U, "Schedule")
typ("sstube", "Tube, stainless", "Pipe and tube", "len", [
    std("a269", "ASTM A269 / A270, AS 1528.1", INT, ss_tube, ["316L", "304", "316", "304L"], rl="Wall", lens=[6000], note="Dairy tube to AS 1528.1 and hygienic tube to A270 come polished.")], LEN_U, "Wall")
typ("pe", "Pipe, PE / HDPE", "Pipe and tube", "len", [
    std("as4130", "AS/NZS 4130", AU, pe, ["PE100 black", "PE100 blue stripe (water)", "PE100 cream stripe (recycled water)", "PE100 yellow stripe (gas)", "PE80B"],
        rl="SDR", lens=[6000, 12000, 20000, 50000, 100000, 150000, 200000], defl=12000, note="50, 100, 150 and 200 m are coils, for 110 OD and smaller.")], LEN_U, "SDR")

STRUCT_AU = ["300 (AS/NZS 3679.1)", "300L0", "350 (AS/NZS 3679.1)", "350L0"]
HOLLOW_AU = ["C350L0 (AS/NZS 1163)", "C450L0 (AS/NZS 1163)", "C250L0 (AS/NZS 1163)", "C350L0 DuraGal (galvanised)", "C450L0 DuraGal (galvanised)"]
CN_STRUCT = ["Q235B", "Q355B", "Q345B"]
STAINLESS = ["316 (ASTM A276)", "304 (ASTM A276)", "316L", "304L"]
UB_LEN = [9000, 10500, 12000, 13500, 15000, 18000]
typ("ub", "Universal beam (UB)", "Structural", "len", [std("au", "AS/NZS 3679.1", AU, open_sec("UB"), STRUCT_AU, FIN, "Finish", UB_LEN, 12000),
    std("cnhn", "GB/T 11263 HN (China)", CN, [size(n, k) for n, k in HN], CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 12000),
    std("cni", "GB/T 706 I beam (China)", CN, [size(n, k) for n, k in CN_I], CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 12000)], LEN_U, "Finish")
typ("uc", "Universal column (UC)", "Structural", "len", [std("au", "AS/NZS 3679.1", AU, open_sec("UC"), STRUCT_AU, FIN, "Finish", UB_LEN, 12000),
    std("cnhw", "GB/T 11263 HW (China)", CN, [size(n, k) for n, k in HW], CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 12000),
    std("cnhm", "GB/T 11263 HM (China)", CN, [size(n, k) for n, k in HM], CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 12000)], LEN_U, "Finish")
typ("wb", "Welded beam / column (WB, WC)", "Structural", "len", [std("au", "AS/NZS 3679.2", AU, open_sec("WB") + open_sec("WC"), ["300 (AS/NZS 3679.2)", "400 (AS/NZS 3679.2)"], FIN, "Finish", [12000, 15000, 18000, 20000], 12000)], LEN_U, "Finish")
typ("pfc", "Parallel flange channel (PFC)", "Structural", "len", [std("au", "AS/NZS 3679.1", AU, open_sec("PFC"), STRUCT_AU, FIN, "Finish", [9000, 12000, 15000], 12000),
    std("cn", "GB/T 706 channel (China)", CN, [size(n, k) for n, k in CN_C], CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 12000)], LEN_U, "Finish")
typ("tfb", "Taper flange beam (TFB)", "Structural", "len", [std("au", "AS/NZS 3679.1", AU, TFB, STRUCT_AU, FIN, "Finish", [9000, 12000], 9000)], LEN_U, "Finish")
typ("ea", "Equal angle (EA)", "Structural", "len", [std("au", "AS/NZS 3679.1", AU, ea, STRUCT_AU, FIN, "Finish", [6000, 9000, 12000], 9000),
    std("cn", "GB/T 706 angle (China)", CN, cn_l, CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 6000),
    std("ss", "Stainless, ASTM A276", INT, ss_ea, STAINLESS, ["Hot rolled, annealed, pickled"], "Finish", [6000], 6000)], LEN_U, "Finish")
typ("ua", "Unequal angle (UA)", "Structural", "len", [std("au", "AS/NZS 3679.1", AU, ua, STRUCT_AU, FIN, "Finish", [9000, 12000], 9000)], LEN_U, "Finish")
typ("shs", "Square hollow section (SHS)", "Structural", "len", [std("au", "AS/NZS 1163", AU, hollow("SHS"), HOLLOW_AU, FIN, "Finish", [6500, 8000, 12000], 8000),
    std("cn", "GB/T 6728 (China)", CN, cn_shs, CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 6000),
    std("ss", "Stainless, ASTM A554", INT, ss_shs, ["316 (A554)", "304 (A554)"], ["Mill finish", "320 grit polished"], "Finish", [6000], 6000)], LEN_U, "Finish")
typ("rhs", "Rectangular hollow section (RHS)", "Structural", "len", [std("au", "AS/NZS 1163", AU, hollow("RHS"), HOLLOW_AU, FIN, "Finish", [6500, 8000, 12000], 8000),
    std("cn", "GB/T 6728 (China)", CN, cn_rhs, CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 6000),
    std("ss", "Stainless, ASTM A554", INT, ss_rhs, ["316 (A554)", "304 (A554)"], ["Mill finish", "320 grit polished"], "Finish", [6000], 6000)], LEN_U, "Finish")
typ("chs", "Circular hollow section (CHS)", "Structural", "len", [std("au", "AS/NZS 1163", AU, hollow("CHS"), HOLLOW_AU, FIN, "Finish", [6500, 8000, 12000], 6500),
    std("cn", "GB/T 3091 / 8162 (China)", CN, cn_chs, CN_STRUCT, FIN, "Finish", [6000, 9000, 12000], 6000)], LEN_U, "Finish")
typ("flat", "Flat bar", "Bar", "len", [std("au", "AS/NZS 3679.1", AU, flats(), ["300 (AS/NZS 3679.1)", "350"], FIN, "Finish", [6000, 9000], 6000),
    std("cn", "GB/T 702 (China)", CN, flats(), CN_STRUCT, FIN, "Finish", [6000, 9000], 6000),
    std("ss", "Stainless, ASTM A276", INT, flats(SS, [20, 25, 32, 40, 50, 65, 75, 100, 150], [3, 5, 6, 8, 10, 12, 16, 20, 25]), STAINLESS, ["Hot rolled, annealed, pickled", "Bright"], "Finish", [6000], 6000)], LEN_U, "Finish")
typ("round", "Round bar", "Bar", "len", [std("au", "AS/NZS 3679.1 (hot rolled)", AU, rounds(), ["300 (AS/NZS 3679.1)", "1020 bright", "1045 bright", "4140 (high tensile)"], ["Black", "Bright", "Hot dip galvanised"], "Finish", [6000, 3660], 6000),
    std("cn", "GB/T 702 (China)", CN, rounds(), ["Q235B", "45#", "40Cr", "42CrMo"], ["Black", "Bright"], "Finish", [6000, 9000], 6000),
    std("ss", "Stainless, ASTM A276", INT, rounds(SS, [6, 8, 10, 12, 16, 20, 25, 30, 32, 40, 50, 60, 75, 100]), STAINLESS, ["Bright", "Peeled"], "Finish", [6000, 3000], 6000)], LEN_U, "Finish")
typ("square", "Square bar", "Bar", "len", [std("au", "AS/NZS 3679.1", AU, squares(), ["300 (AS/NZS 3679.1)", "1020 bright"], FIN, "Finish", [6000], 6000)], LEN_U, "Finish")
typ("rod", "Threaded rod", "Bar", "len", [std("iso", "AS 1111 / ISO 898", INT, rods, ["4.6", "8.8", "ASTM A193 B7", "304 (A2-70)", "316 (A4-70)"], ["Plain", "Zinc plated", "Hot dip galvanised"], "Finish", [1000, 3000], 1000)], LEN_U, "Finish")

typ("plate", "Plate", "Plate and sheet", "plate", [
    std("au", "AS/NZS 3678", AU, plate([3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50, 60, 80, 100]), ["250 (AS/NZS 3678)", "350 (AS/NZS 3678)", "250L15", "350L15"], FIN, "Finish", SHEETS, "2400x1200"),
    std("wear", "Wear plate (Bisalloy, Hardox)", INT, plate([5, 6, 8, 10, 12, 16, 20, 25, 32, 40, 50]), ["Bisplate 400", "Bisplate 450", "Bisplate 500", "Bisplate 80 (structural)", "Hardox 450", "Hardox 500"], ["As rolled"], "Finish", SHEETS, "2400x1200"),
    std("chq", "Chequer floor plate (AS/NZS 1594)", AU, plate([3, 5, 6, 8, 10, 12]), ["HA250"], FIN, "Finish", SHEETS, "2400x1200"),
    std("ss", "Stainless, ASTM A240", INT, plate([0.9, 1.2, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25], SS), ["316L", "304", "304L", "316", "2205 duplex"], ["2B", "No.1 (hot rolled)", "No.4 brushed", "BA"], "Finish", SS_SHEETS, "2438x1219"),
    std("gal", "Galvanised sheet (AS 1397)", AU, plate([0.55, 0.75, 0.95, 1.15, 1.55, 1.95, 2.4, 3]), ["G250 Z275", "G300 Z350", "G550 AZ150 (Zincalume)"], ["Galvanised"], "Finish", ["2400x1200", "3000x1200", "2438x1219"], "2400x1200"),
    std("cn", "GB/T 3274 (China)", CN, plate([3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 25, 30, 40, 50]), ["Q235B", "Q355B", "NM400 (wear)", "NM500 (wear)"], FIN, "Finish", CN_SHEETS, "6000x1500")],
    PLATE_U, "Finish")

FIT_STD_BW = lambda mats: std("b169", "ASME B16.9 butt weld", INT, dn(DNS), mats, ["SCH10", "SCH10S", "SCH40", "SCH40S", "STD", "SCH80", "SCH80S", "XS", "SCH160"], "Schedule")
FIT_MATS = ["ASTM A234 WPB (CS)", "ASTM A403 WP316L", "ASTM A403 WP304L", "ASTM A420 WPL6 (low temp)"]
FIT_THR = lambda mats: std("b1611", "ASME B16.11 forged (threaded / socket weld)", INT, dn(DNS_SMALL), mats + ["ASTM A105", "ASTM A182 F316L", "ASTM A182 F304L"], ["Class 3000 threaded", "Class 3000 socket weld", "Class 6000 threaded", "Class 6000 socket weld"], "Class")
FIT_MAL = std("malle", "Malleable iron threaded (AS 3673)", AU, dn(DNS_SMALL), ["Galvanised malleable iron", "Black malleable iron", "316 stainless, 150 lb"], ["Class 150 BSPT", "Class 150 NPT"], "Class")
FIT_GB = std("gb12459", "GB/T 12459 butt weld (China)", CN, dn(DNS), ["20#", "Q235B", "06Cr19Ni10 (304)", "022Cr17Ni12Mo2 (316L)"], ["SCH10", "SCH40", "SCH80"], "Schedule")
for id, n in [("el90", "Elbow 90° long radius"), ("el90s", "Elbow 90° short radius"), ("el45", "Elbow 45°"), ("tee", "Tee, equal"), ("cap", "Cap")]:
    typ(id, n, "Pipe fittings", "ea", [FIT_STD_BW(FIT_MATS), FIT_GB] + ([FIT_THR(FIT_MATS), FIT_MAL] if id in ("el90", "el45", "tee", "cap") else []), EA_U, "Schedule")
for id, n in [("rtee", "Tee, reducing"), ("rcon", "Reducer, concentric"), ("recc", "Reducer, eccentric")]:
    typ(id, n, "Pipe fittings", "ea", [dict(FIT_STD_BW(FIT_MATS), sizes=reducing(DNS)), dict(FIT_GB, sizes=reducing(DNS))], EA_U, "Schedule")
typ("stub", "Stub end (lap joint)", "Pipe fittings", "ea", [dict(FIT_STD_BW(FIT_MATS), n="MSS SP-43 / ASME B16.9")], EA_U, "Schedule")
for id, n in [("coup", "Coupling / socket"), ("union", "Union"), ("nip", "Nipple / barrel nipple"), ("plug", "Plug"), ("bush", "Bush / hex reducing bush")]:
    typ(id, n, "Pipe fittings", "ea", [FIT_THR(FIT_MATS), FIT_MAL], EA_U, "Class")
typ("olet", "Weldolet / sockolet", "Pipe fittings", "ea", [std("sp97", "MSS SP-97", INT, reducing(DNS), ["ASTM A105", "ASTM A182 F316L"], ["Weldolet STD", "Weldolet XS", "Sockolet 3000", "Threadolet 3000"], "Class")], EA_U, "Class")

FL_RAT = {"as2129": ["Table D", "Table E", "Table F", "Table H"], "as4087": ["PN16", "PN21", "PN35"], "b165": ["Class 150 RF", "Class 150 FF", "Class 300 RF", "Class 600 RF", "Class 900 RJ", "Class 1500 RJ"],
          "en1092": ["PN10", "PN16", "PN25", "PN40"], "gb9124": ["PN10", "PN16", "PN25", "PN40", "Class 150", "Class 300"]}
def fl_stds(plate_ok):
    return [std("b165", "ASME B16.5", INT, flange_sizes(), ["ASTM A105 (CS)", "ASTM A182 F316L", "ASTM A182 F304L", "ASTM A350 LF2 (low temp)", "Galvanised A105"], FL_RAT["b165"], "Class"),
            std("as2129", "AS 2129", AU, dn(DNS), (["250 plate (AS/NZS 3678)"] if plate_ok else []) + ["AS 1448 forged", "316 stainless", "Galvanised"], FL_RAT["as2129"], "Table"),
            std("as4087", "AS 4087 (water)", AU, dn(DNS), ["250 plate (AS/NZS 3678)", "Galvanised 250 plate", "316 stainless"], FL_RAT["as4087"], "Class"),
            std("en1092", "EN 1092-1", INT, dn(DNS), ["P250GH", "1.4404 (316L)", "1.4301 (304)"], FL_RAT["en1092"], "PN"),
            std("gb9124", "GB/T 9124 (China)", CN, dn(DNS), ["20#", "Q235B", "06Cr19Ni10 (304)", "022Cr17Ni12Mo2 (316L)"], FL_RAT["gb9124"], "PN")]
for id, n, pl in [("flwn", "Flange, weld neck", False), ("flso", "Flange, slip on", True), ("flbl", "Flange, blind", True), ("flpl", "Flange, plate (flat face)", True),
                  ("fllj", "Flange, lap joint (backing)", True), ("flsw", "Flange, socket weld", False), ("flth", "Flange, threaded", False)]:
    typ(id, n, "Flanges", "ea", fl_stds(pl), EA_U, "Class")

GK_RAT = FL_RAT["b165"][:1] + ["Class 300 RF", "Class 600 RF", "AS 2129 Table D", "AS 2129 Table E", "AS 4087 PN16", "AS 4087 PN21", "PN10", "PN16", "PN25", "PN40"]
typ("gksw", "Gasket, spiral wound", "Gaskets", "ea", [std("b1620", "ASME B16.20", INT, dn(DNS), ["316 / graphite, CS outer ring", "316 / graphite, 316 inner and CS outer ring", "316 / PTFE, CS outer ring"], GK_RAT, "Suits")], EA_U, "Suits")
typ("gkring", "Gasket, ring (inside bolts)", "Gaskets", "ea", [std("b1621", "ASME B16.21 / AS 2129", INT, dn(DNS), ["Compressed fibre (CNAF) 1.5 mm", "Compressed fibre (CNAF) 3 mm", "Graphite 1.5 mm", "PTFE 1.5 mm", "PTFE envelope", "EPDM 3 mm", "Neoprene 3 mm", "Nitrile 3 mm", "Natural rubber 3 mm"], GK_RAT, "Suits")], EA_U, "Suits")
typ("gkff", "Gasket, full face", "Gaskets", "ea", [std("b1621", "ASME B16.21 / AS 2129", INT, dn(DNS), ["Compressed fibre (CNAF) 1.5 mm", "Compressed fibre (CNAF) 3 mm", "EPDM 3 mm", "Neoprene 3 mm", "Nitrile 3 mm", "Natural rubber 3 mm", "Insert rubber 6 mm"], GK_RAT, "Suits")], EA_U, "Suits")
typ("gkrj", "Gasket, ring joint", "Gaskets", "ea", [std("b1620", "ASME B16.20", INT, [size(n) for n in ["R11", "R13", "R16", "R20", "R23", "R24", "R26", "R31", "R37", "R41", "R45", "R49", "R53", "R57", "R65", "R73", "R77"]], ["Soft iron", "316 stainless"], ["Oval", "Octagonal"], "Shape")], EA_U, "Shape")

BOLT_MATS = ["4.6 (AS 1111)", "8.8 (AS 1110 / ISO 4014)", "8.8/S structural (AS/NZS 1252)", "10.9", "304 (A2-70)", "316 (A4-70)", "316 (A4-80)"]
BOLT_FIN = ["Plain", "Zinc plated", "Hot dip galvanised"]
typ("bolt", "Bolt, hex (part thread)", "Bolting", "ea", [std("iso4014", "ISO 4014 / AS 1110", INT, bolts, BOLT_MATS, BOLT_FIN, "Finish")], EA_U, "Finish")
typ("screw", "Set screw (full thread)", "Bolting", "ea", [std("iso4017", "ISO 4017 / AS 1111", INT, bolts, BOLT_MATS, BOLT_FIN, "Finish")], EA_U, "Finish")
typ("stud", "Stud bolt, with 2 nuts", "Bolting", "ea", [std("a193", "ASTM A193 / A194", INT, studs, ["B7 / 2H", "B7M / 2HM", "B8M class 2 (316) / 8M", "L7 / 4 (low temp)"], ["Plain", "Zinc plated", "Hot dip galvanised", "PTFE coated (Xylan)"], "Finish")], EA_U, "Finish")
typ("nut", "Nut, hex", "Bolting", "ea", [std("iso4032", "ISO 4032 / AS 1112", INT, nuts, ["Class 5", "Class 8", "Class 10", "304 (A2-70)", "316 (A4-70)", "Nyloc, class 8", "Nyloc, 316"], BOLT_FIN, "Finish")], EA_U, "Finish")
typ("washer", "Washer", "Bolting", "ea", [std("as1237", "AS 1237 / ISO 7089", INT, nuts, ["Flat, steel", "Flat, structural (AS/NZS 1252)", "Flat, 316", "Spring, steel", "Spring, 316", "Mudguard"], BOLT_FIN, "Finish")], EA_U, "Finish")
typ("anchor", "Anchor", "Bolting", "ea", [std("anc", "Masonry anchors", INT, [size("M%d x %d" % (m, l)) for m in [8, 10, 12, 16, 20, 24] for l in [75, 100, 125, 150, 200, 250, 300]],
    ["Chemical (stud, nut, washer)", "Wedge / through bolt", "Sleeve (Dynabolt)", "Screw anchor"], ["Zinc plated", "Hot dip galvanised", "316 stainless"], "Finish")], EA_U, "Finish")

lib = {"v": 1, "types": T, "dens": {"steel": 7850, "stainless": 7930, "pe": 960}}
js = ("/* The parts library behind the smart MTO rows. Made by tools/mtolib/build.py; change that, not this. */\n"
      "\"use strict\";\nconst MTOLIB = " + json.dumps(lib, separators=(",", ":"), ensure_ascii=False) + ";\n")
open(OUT, "w").write(js)
n = sum(len(s["sizes"]) for t in T for s in t["stds"])
print("types", len(T), "standards", sum(len(t["stds"]) for t in T), "sizes", n, "bytes", len(js))
