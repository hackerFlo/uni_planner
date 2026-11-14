import { getWeekDates, parseDateLocal, toIso } from '../utils/dates.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AGENT_PATH = '/agent';

export function isRealIsoDate(value) {
  return typeof value === 'string' && ISO_DATE.test(value) && toIso(parseDateLocal(value)) === value;
}

function mondayOf(isoDate) {
  return getWeekDates(0, parseDateLocal(isoDate))[0];
}

export function parseWeekParam(param, todayIso) {
  return mondayOf(isRealIsoDate(param) ? param : todayIso);
}

export function shiftWeek(monday, weeks) {
  return getWeekDates(weeks, parseDateLocal(monday))[0];
}

function weekUrl(monday) {
  return `${AGENT_PATH}?week=${monday}`;
}

export function weekLinks(monday, todayIso) {
  return {
    previous: weekUrl(shiftWeek(monday, -1)),
    current: weekUrl(mondayOf(todayIso)),
    next: weekUrl(shiftWeek(monday, 1)),
  };
}
