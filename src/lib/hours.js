// Horário de funcionamento no fuso da loja (padrão America/Sao_Paulo).
// opening_hours: { weekday: 0-6 (0 = domingo), opens_at: 'HH:MM[:SS]', closes_at }
// Se closes_at <= opens_at, o turno termina no dia seguinte (ex.: 18:00–01:00).

export const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
export const hhmm = (t) => String(t).slice(0, 5);

export function nowInZone(timezone = 'America/Sao_Paulo', date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function openStatus(hours, timezone, date = new Date()) {
  if (!hours?.length) return { known: false, open: false };
  const { weekday, minutes } = nowInZone(timezone, date);
  const yesterday = (weekday + 6) % 7;

  for (const h of hours) {
    const o = toMin(h.opens_at), c = toMin(h.closes_at);
    const overnight = c <= o;
    if (h.weekday === weekday && minutes >= o && (overnight || minutes < c)) {
      return { known: true, open: true, closesAt: hhmm(h.closes_at) };
    }
    if (overnight && h.weekday === yesterday && minutes < c) {
      return { known: true, open: true, closesAt: hhmm(h.closes_at) };
    }
  }

  // Próxima abertura nos próximos 7 dias
  for (let add = 0; add < 8; add++) {
    const day = (weekday + add) % 7;
    const candidates = hours
      .filter((h) => h.weekday === day && (add > 0 || toMin(h.opens_at) > minutes))
      .sort((a, b) => toMin(a.opens_at) - toMin(b.opens_at));
    if (candidates.length) {
      return {
        known: true, open: false,
        nextOpen: { weekday: day, at: hhmm(candidates[0].opens_at), today: add === 0, tomorrow: add === 1 },
      };
    }
  }
  return { known: true, open: false };
}

export function describeStatus(st) {
  if (!st.known) return 'Horário não informado';
  if (st.open) return `Aberto agora · fecha às ${st.closesAt}`;
  if (!st.nextOpen) return 'Fechado';
  const { today, tomorrow, weekday, at } = st.nextOpen;
  const when = today ? 'hoje' : tomorrow ? 'amanhã' : WEEKDAYS[weekday].toLowerCase();
  return `Fechado · abre ${when} às ${at}`;
}

// Agrupa por dia para exibir a tabela de horários
export function hoursByDay(hours) {
  return WEEKDAYS.map((name, weekday) => ({
    weekday, name,
    slots: hours.filter((h) => h.weekday === weekday)
      .sort((a, b) => toMin(a.opens_at) - toMin(b.opens_at))
      .map((h) => `${hhmm(h.opens_at)} às ${hhmm(h.closes_at)}`),
  }));
}
