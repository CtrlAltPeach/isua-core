// Корректный расчёт границ суток в произвольной таймзоне (через Intl).
// Заменяет прежний хардкод МСК=UTC+3 / прочие=UTC в stats/daily.

// Смещение таймзоны (в минутах) для конкретного момента времени.
// Положительное = зона впереди UTC (например, Europe/Moscow → +180).
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  // Формат локального времени зоны через Intl, затем сравнение с UTC-полями.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  // hour может прийти как 24 для полуночи в некоторых рантаймах — нормализуем.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    hour,
    map.minute,
    map.second,
  );
  // Разница между «локальным временем зоны, прочитанным как UTC» и реальным UTC.
  return Math.round((asUTC - date.getTime()) / 60000);
}

/**
 * Границы суток [start, end) в UTC для календарной даты dateStr (YYYY-MM-DD)
 * в заданной таймзоне. Корректно для любой зоны и для дат со сменой DST.
 */
export function dayBoundsUTC(dateStr: string, timeZone: string): [Date, Date] {
  const [y, m, d] = dateStr.split("-").map(Number);

  // Локальная полночь начала дня = UTC-инстант с поправкой на смещение зоны.
  // Смещение зависит от момента, поэтому считаем его итеративно (2 прохода
  // достаточно для корректного учёта DST на границе суток).
  const resolve = (utcGuessMs: number): Date => {
    let ms = utcGuessMs;
    for (let i = 0; i < 2; i++) {
      const off = tzOffsetMinutes(new Date(ms), timeZone);
      ms = utcGuessMs - off * 60000;
    }
    return new Date(ms);
  };

  const startGuess = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const endGuess = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0);
  return [resolve(startGuess), resolve(endGuess)];
}
