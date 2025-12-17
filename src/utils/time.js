
import moment from 'moment-timezone';

const TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';

export function toIst(isoUtc) {
  return moment.utc(isoUtc).tz(TZ);
}

export function nowUtcISO() {
  return new Date().toISOString();
}

export function cutoffTimeUtc(start_time_utc, cutoff_minutes_before) {
  return moment.utc(start_time_utc).subtract(cutoff_minutes_before, 'minutes').toISOString();
}

export function hasDeadlinePassed(start_time_utc, cutoff_minutes_before) {
  const cutoff = moment.utc(start_time_utc).subtract(cutoff_minutes_before, 'minutes');
  return moment.utc().isAfter(cutoff);
}

export function hasMatchStarted(start_time_utc) {
  return moment.utc().isAfter(moment.utc(start_time_utc));
}
