type DateValue = string | number | Date;

export function formatNumber(
  value: number,
  locale?: Intl.LocalesArgument,
): string {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat(locale).format(value);
}

function toDate(value: DateValue): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(
  value: DateValue,
  locale?: Intl.LocalesArgument,
): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(
  value: DateValue,
  locale?: Intl.LocalesArgument,
  timeZone?: string,
): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(date);
}

export function formatTime(
  value: DateValue,
  locale?: Intl.LocalesArgument,
  timeZone?: string,
): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatRelativeTime(
  value: DateValue,
  now = new Date(),
  locale?: Intl.LocalesArgument,
): string {
  const date = toDate(value);
  if (!date) return '';

  const differenceSeconds = (date.getTime() - now.getTime()) / 1000;
  const absoluteSeconds = Math.abs(differenceSeconds);
  let unit: Intl.RelativeTimeFormatUnit = 'second';
  let divisor = 1;

  if (absoluteSeconds >= 60 * 60 * 24) {
    unit = 'day';
    divisor = 60 * 60 * 24;
  } else if (absoluteSeconds >= 60 * 60) {
    unit = 'hour';
    divisor = 60 * 60;
  } else if (absoluteSeconds >= 60) {
    unit = 'minute';
    divisor = 60;
  }

  const amount = Math.round(differenceSeconds / divisor);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(amount, unit);
}
