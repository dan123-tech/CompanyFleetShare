/**
 * Time-windowed statistics for the admin dashboard (completed trips + booking counts).
 */

import { FUEL_TYPE_ORDER } from "@/lib/fuelTheme";

export function getStartOfMonth(ms) {
  const x = new Date(ms);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function getStartOfDay(ms) {
  const x = new Date(ms);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** @param {'7d'|'30d'|'6m'|'1y'} period */
export function periodWindow(period) {
  const end = Date.now();
  const now = new Date();
  if (period === "7d") return { start: end - 7 * 86400000, end, bucket: "day" };
  if (period === "30d") return { start: end - 30 * 86400000, end, bucket: "day" };
  if (period === "6m") {
    const s = new Date(now);
    s.setMonth(s.getMonth() - 6);
    s.setHours(0, 0, 0, 0);
    return { start: s.getTime(), end, bucket: "month" };
  }
  if (period === "1y") {
    const s = new Date(now);
    s.setFullYear(s.getFullYear() - 1);
    s.setHours(0, 0, 0, 0);
    return { start: s.getTime(), end, bucket: "month" };
  }
  return { start: end - 30 * 86400000, end, bucket: "day" };
}

function buildTrendBuckets(startMs, endMs, bucket, locStr) {
  if (bucket === "day") {
    const out = [];
    let t = getStartOfDay(startMs);
    const endDay = getStartOfDay(endMs);
    while (t <= endDay) {
      out.push({
        key: t,
        date: new Date(t).toISOString().slice(0, 10),
        fuelCost: 0,
        km: 0,
        co2Kg: 0,
      });
      t += 86400000;
    }
    return out;
  }
  const seen = new Set();
  const keys = [];
  let d = new Date(startMs);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  const endDate = new Date(endMs);
  while (d.getTime() <= endDate.getTime()) {
    const k = getStartOfMonth(d.getTime());
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
    d.setMonth(d.getMonth() + 1);
  }
  keys.sort((a, b) => a - b);
  return keys.map((k) => ({
    key: k,
    date: new Date(k).toLocaleDateString(locStr, { month: "short", year: "numeric" }),
    fuelCost: 0,
    km: 0,
    co2Kg: 0,
  }));
}

function completedInWindow(r, start, end) {
  if ((r.status || "").toLowerCase() !== "completed" || !r.updatedAt) return false;
  const t = new Date(r.updatedAt).getTime();
  return t >= start && t <= end;
}

function startedInWindow(r, start, end) {
  if (!r.startDate) return false;
  const t = new Date(r.startDate).getTime();
  return t >= start && t <= end;
}

/**
 * @param {'7d'|'30d'|'6m'|'1y'} period
 * @param {object} ctx
 */
export function computeStatsForPeriod(period, ctx) {
  const {
    reservations,
    users,
    cars,
    fuelCostForReservation,
    co2KgForReservation,
    getFuelTypeForCar,
    carBrandModel,
    formatCarConsumption,
    defaultL100,
    defaultKwh100,
    t,
    locale,
  } = ctx;

  const locStr = locale === "ro" ? "ro-RO" : "en-GB";
  const { start, end, bucket } = periodWindow(period);

  const active = reservations.filter((r) => (r.status || "").toLowerCase() === "active");
  const completed = reservations.filter((r) => (r.status || "").toLowerCase() === "completed");
  const completedInRange = completed.filter((r) => completedInWindow(r, start, end));
  const reservationsForTopUsers = reservations.filter((r) => startedInWindow(r, start, end));

  const totalKmPeriod = completedInRange.reduce((s, r) => s + (r.releasedKmUsed ?? 0), 0);
  const estimatedFuelCostPeriod = completedInRange.reduce((s, r) => s + fuelCostForReservation(r), 0);
  const totalCo2Period = completedInRange.reduce((s, r) => s + co2KgForReservation(r), 0);

  const byUser = {};
  reservationsForTopUsers.forEach((r) => {
    const uid = r.userId || r.user?.id;
    if (uid) byUser[uid] = (byUser[uid] || 0) + 1;
  });
  const topUsers = Object.entries(byUser)
    .map(([userId, count]) => {
      const u = users.find((m) => m.userId === userId || m.id === userId);
      return { userId, count, name: u?.name || t("stats.unknownUser"), email: u?.email || "" };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const byCar = {};
  completedInRange.forEach((r) => {
    const cid = r.carId || r.car?.id;
    if (cid) byCar[cid] = (byCar[cid] || 0) + (r.releasedKmUsed ?? 0);
  });
  const carUsage = cars
    .map((c) => ({
      id: c.id,
      name: `${carBrandModel(c)}\n${c.registrationNumber ?? ""}`,
      brandModel: carBrandModel(c),
      plate: c.registrationNumber ?? "—",
      vehicleCategory: c.vehicleCategory ?? "OTHER",
      km: byCar[c.id] ?? 0,
      reservations: reservationsForTopUsers.filter((r) => (r.carId || r.car?.id) === c.id).length,
    }))
    .sort((a, b) => b.km - a.km);

  const byCarFuelCost = {};
  completedInRange.forEach((r) => {
    const cid = r.carId || r.car?.id;
    if (cid) byCarFuelCost[cid] = (byCarFuelCost[cid] || 0) + fuelCostForReservation(r);
  });
  const efficiencyLeaderboard = cars
    .map((c) => ({
      id: c.id,
      brandModel: carBrandModel(c),
      registrationNumber: c.registrationNumber ?? "—",
      vehicleCategory: c.vehicleCategory ?? "OTHER",
      fuelType: c.fuelType ?? "Benzine",
      consumptionDisplay: formatCarConsumption(c, defaultL100, defaultKwh100),
      km: byCar[c.id] ?? 0,
      fuelCost: byCarFuelCost[c.id] ?? 0,
      l100: c.averageConsumptionL100km ?? defaultL100,
    }))
    .sort((a, b) => b.fuelCost - a.fuelCost);

  const trendBuckets = buildTrendBuckets(start, end, bucket, locStr);
  const byKey = Object.fromEntries(trendBuckets.map((b) => [b.key, { ...b }]));
  completedInRange.forEach((r) => {
    if (!r.updatedAt) return;
    const tt = new Date(r.updatedAt).getTime();
    const key = bucket === "day" ? getStartOfDay(tt) : getStartOfMonth(tt);
    if (!byKey[key]) return;
    const km = r.releasedKmUsed ?? 0;
    byKey[key].km += km;
    byKey[key].fuelCost += fuelCostForReservation(r);
    byKey[key].co2Kg += co2KgForReservation(r);
  });
  const fuelTrend = trendBuckets.map((b) => {
    const row = byKey[b.key];
    return {
      ...row,
      co2Kg: Math.round((row.co2Kg || 0) * 100) / 100,
    };
  });

  const efficiencyByConsumption = [...cars]
    .map((c) => {
      const ft = c.fuelType ?? "Benzine";
      const consumption =
        ft === "Electric" || ft === "Hybrid"
          ? (c.averageConsumptionKwh100km ?? defaultKwh100)
          : (c.averageConsumptionL100km ?? defaultL100);
      return {
        id: c.id,
        brandModel: carBrandModel(c),
        registrationNumber: c.registrationNumber ?? "—",
        vehicleCategory: c.vehicleCategory ?? "OTHER",
        fuelType: ft,
        consumption,
        consumptionLabel: formatCarConsumption(c, defaultL100, defaultKwh100),
      };
    })
    .sort((a, b) => a.consumption - b.consumption);

  const fuelTypeCount = { Benzine: 0, Diesel: 0, Electric: 0, Hybrid: 0 };
  cars.forEach((c) => {
    const ft = c.fuelType ?? "Benzine";
    fuelTypeCount[ft] = (fuelTypeCount[ft] ?? 0) + 1;
  });
  const fuelCategoryPie = FUEL_TYPE_ORDER.filter((k) => (fuelTypeCount[k] ?? 0) > 0).map((name) => ({
    name,
    value: fuelTypeCount[name],
  }));

  const costByFuelType = { Benzine: 0, Diesel: 0, Electric: 0, Hybrid: 0 };
  completedInRange.forEach((r) => {
    const carId = r.carId || r.car?.id;
    const ft = getFuelTypeForCar(carId);
    costByFuelType[ft] = (costByFuelType[ft] ?? 0) + fuelCostForReservation(r);
  });
  const costByFuelCategoryBar = FUEL_TYPE_ORDER.map((fuelType) => ({
    fuelType,
    cost: Math.round((costByFuelType[fuelType] ?? 0) * 100) / 100,
  })).filter((d) => d.cost > 0);

  const rangeRemaining = cars
    .filter(
      (c) =>
        (c.fuelType === "Electric" || c.fuelType === "Hybrid") &&
        c.batteryLevel != null &&
        c.batteryCapacityKwh > 0 &&
        (c.averageConsumptionKwh100km ?? 0) > 0,
    )
    .map((c) => {
      const pct = (c.batteryLevel ?? 0) / 100;
      const cap = c.batteryCapacityKwh ?? 0;
      const kwh100 = c.averageConsumptionKwh100km ?? defaultKwh100;
      const range = pct * (100 / kwh100) * cap;
      return {
        id: c.id,
        brandModel: carBrandModel(c),
        plate: c.registrationNumber ?? "—",
        fuelType: c.fuelType,
        batteryLevel: c.batteryLevel,
        rangeKm: Math.round(range),
      };
    });

  const maintenanceDue = cars
    .filter((c) => {
      const km = c.km ?? 0;
      const last = c.lastServiceMileage ?? 0;
      const ft = (c.fuelType ?? "Benzine").toLowerCase();
      if (ft === "electric") return km > 0;
      return (ft === "hybrid" || ft === "benzine" || ft === "diesel") && km - last > 10000;
    })
    .map((c) => ({
      id: c.id,
      brandModel: carBrandModel(c),
      plate: c.registrationNumber ?? "—",
      fuelType: c.fuelType,
      km: c.km,
      lastServiceMileage: c.lastServiceMileage,
    }));

  return {
    activeCount: active.length,
    totalKmPeriod,
    estimatedFuelCostPeriod,
    totalCo2Period,
    topUsers,
    carUsage,
    fuelTrend,
    co2ByDay: fuelTrend,
    efficiencyLeaderboard,
    efficiencyByConsumption,
    fuelCategoryPie,
    costByFuelCategoryBar,
    rangeRemaining,
    maintenanceDue,
    periodKey: period,
    windowStart: start,
    windowEnd: end,
    trendBucket: bucket,
  };
}
