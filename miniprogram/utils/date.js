const START_DATE = "2015-01-03";

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}

function parseDate(value) {
  if (!value) {
    return null;
  }
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    return null;
  }
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function shiftMonths(date, amount) {
  const year = date.getFullYear();
  const month = date.getMonth() + amount;
  const target = new Date(year, month, 1);
  const maxDay = daysInMonth(target.getFullYear(), target.getMonth());
  const fixedDay = Math.min(date.getDate(), maxDay);
  target.setDate(fixedDay);
  return {
    date: target,
    corrected: fixedDay !== date.getDate()
  };
}

function shiftYears(date, amount) {
  return shiftMonths(date, amount * 12);
}

function isBeforeStart(dateText) {
  return dateText < START_DATE;
}

function todayText() {
  return formatDate(new Date());
}

module.exports = {
  START_DATE,
  formatDate,
  parseDate,
  shiftMonths,
  shiftYears,
  isBeforeStart,
  todayText
};
