function normalizeNumbers(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[,\s+|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitDltNumbers(result) {
  const front = result.frontNumbers || result.front || normalizeNumbers(result.front_number);
  const back = result.backNumbers || result.back || normalizeNumbers(result.back_number);
  const all = normalizeNumbers(result.numbers || result.lottery_res);

  if (front.length || back.length) {
    return {
      frontNumbers: front,
      backNumbers: back
    };
  }

  return {
    frontNumbers: all.slice(0, 5),
    backNumbers: all.slice(5, 7)
  };
}

function formatAmount(value) {
  if (value === undefined || value === null || value === "") {
    return "暂无";
  }
  const number = Number(String(value).replace(/,/g, ""));
  if (Number.isNaN(number)) {
    return String(value);
  }
  if (number >= 100000000) {
    return `${(number / 100000000).toFixed(2)} 亿`;
  }
  if (number >= 10000) {
    return `${(number / 10000).toFixed(2)} 万`;
  }
  return `${number}`;
}

function mapResult(raw) {
  if (!raw) {
    return null;
  }
  const numbers = splitDltNumbers(raw);
  return {
    _id: raw._id,
    issue: raw.issue || raw.lottery_no || raw.expect || "",
    drawDate: raw.drawDate || raw.lottery_date || raw.date || "",
    frontNumbers: numbers.frontNumbers,
    backNumbers: numbers.backNumbers,
    salesAmount: raw.salesAmount || raw.sales || raw.lottery_sale_amount || "",
    poolAmount: raw.poolAmount || raw.pool || raw.lottery_pool_amount || "",
    prizeLevels: raw.prizeLevels || raw.prize || [],
    sourceUrl: raw.sourceUrl || "",
    updatedAt: raw.updatedAt || ""
  };
}

module.exports = {
  formatAmount,
  mapResult,
  normalizeNumbers,
  splitDltNumbers
};
