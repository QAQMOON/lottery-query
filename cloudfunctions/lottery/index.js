const cloud = require("wx-server-sdk");
const https = require("https");
const querystring = require("querystring");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

const COLLECTION_RESULTS = "dlt_results";
const COLLECTION_LOGS = "sync_logs";
const START_DATE = "2015-01-03";
const LOTTERY_ID = "dlt";
const DEFAULT_HUINIAO_HISTORY_URL = "https://api.huiniao.top/interface/home/lotteryHistory";
const DEFAULT_APIHZ_DLT_URL = "https://cn.apihz.cn/api/caipiao/daletou.php";

function success(data) {
  return {
    success: true,
    data
  };
}

function failure(error) {
  return {
    success: false,
    message: error && error.message ? error.message : String(error)
  };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function chinaDate(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return [
    shifted.getUTCFullYear(),
    pad(shifted.getUTCMonth() + 1),
    pad(shifted.getUTCDate())
  ].join("-");
}

function chinaTimeParts(date = new Date()) {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    day: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
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

function formatDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("-");
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function shiftMonths(date, amount) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const day = Math.min(date.getDate(), daysInMonth(target.getFullYear(), target.getMonth()));
  target.setDate(day);
  return {
    date: target,
    corrected: day !== date.getDate()
  };
}

function normalizeNumbers(value) {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (!value) {
    return [];
  }
  return String(value)
    .split(/[,\s+|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePrizeLevels(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      name: item.name || item.prize_name || item.level || `奖级${index + 1}`,
      count: item.count || item.prize_num || item.num || "",
      amount: item.amount || item.prize_amount || item.money || ""
    }));
  }
  if (typeof value === "string") {
    try {
      return normalizePrizeLevels(JSON.parse(value));
    } catch (error) {
      return [];
    }
  }
  return [];
}

function mapHuiniaoResult(raw) {
  if (!raw) {
    return null;
  }
  const frontNumbers = [raw.one, raw.two, raw.three, raw.four, raw.five].filter(Boolean).map(String);
  const backNumbers = [raw.six, raw.seven].filter(Boolean).map(String);

  return {
    issue: String(raw.code || raw.issue || "").trim(),
    drawDate: String(raw.day || raw.drawDate || raw.date || "").slice(0, 10),
    frontNumbers,
    backNumbers,
    numbers: frontNumbers.concat(backNumbers),
    salesAmount: raw.salesAmount || "",
    poolAmount: raw.poolAmount || "",
    prizeLevels: normalizePrizeLevels(raw.prizeLevels),
    sourceUrl: "https://api.huiniao.top/",
    updatedAt: new Date().toISOString(),
    raw
  };
}

function mapApihzResult(raw) {
  if (!raw) {
    return null;
  }
  const allNumbers = normalizeNumbers(raw.number || raw.lottery_res || raw.numbers || raw.result);
  const frontNumbers = normalizeNumbers(raw.frontNumbers || raw.front_number).concat(
    allNumbers.length ? [] : normalizeNumbers(raw.front)
  );
  const backNumbers = normalizeNumbers(raw.backNumbers || raw.back_number).concat(
    allNumbers.length ? [] : normalizeNumbers(raw.back)
  );
  const prizeLevels = [];

  for (let index = 1; index <= 9; index += 1) {
    const count = raw[`no${index}num`];
    const amount = raw[`no${index}money`];
    if (count || amount) {
      prizeLevels.push({
        name: `${index}等奖`,
        count: count || "",
        amount: amount || ""
      });
    }
    const extraCount = raw[`no${index}numjia`];
    const extraAmount = raw[`no${index}moneyjia`];
    if (extraCount || extraAmount) {
      prizeLevels.push({
        name: `${index}等奖追加`,
        count: extraCount || "",
        amount: extraAmount || ""
      });
    }
  }

  return {
    issue: String(raw.qihao || raw.lottery_no || raw.issue || raw.expect || "").trim(),
    drawDate: String(raw.time || raw.lottery_date || raw.drawDate || raw.date || "").slice(0, 10),
    frontNumbers: frontNumbers.length ? frontNumbers : allNumbers.slice(0, 5),
    backNumbers: backNumbers.length ? backNumbers : allNumbers.slice(5, 7),
    numbers: allNumbers,
    salesAmount: raw.xiaoshou || raw.lottery_sale_amount || raw.salesAmount || raw.sales || "",
    poolAmount: raw.jiangchi || raw.lottery_pool_amount || raw.poolAmount || raw.pool || "",
    prizeLevels: prizeLevels.length ? prizeLevels : normalizePrizeLevels(raw.lottery_prize || raw.prizeLevels || raw.prize),
    sourceUrl: "https://www.apihz.cn/api/caipiaodaletou.html",
    updatedAt: new Date().toISOString(),
    raw
  };
}

function mergeResult(primary, extra) {
  if (!primary) {
    return extra;
  }
  if (!extra || extra.issue !== primary.issue) {
    return primary;
  }

  return {
    ...primary,
    salesAmount: primary.salesAmount || extra.salesAmount,
    poolAmount: primary.poolAmount || extra.poolAmount,
    prizeLevels: primary.prizeLevels && primary.prizeLevels.length ? primary.prizeLevels : extra.prizeLevels,
    raw: {
      huiniao: primary.raw,
      apihz: extra.raw
    }
  };
}

function requestJsonUrl(url, params) {
  const joiner = url.includes("?") ? "&" : "?";
  const target = `${url}${joiner}${querystring.stringify(params)}`;

  return new Promise((resolve, reject) => {
    https
      .get(target, (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (json.error_code && json.error_code !== 0) {
              reject(new Error(json.reason || `API error ${json.error_code}`));
              return;
            }
            if (json.code && ![1, 200].includes(Number(json.code))) {
              reject(new Error(json.info || json.message || `API error ${json.code}`));
              return;
            }
            resolve(json.result || json);
          } catch (error) {
            reject(new Error("开奖接口返回格式异常"));
          }
        });
      })
      .on("error", reject);
  });
}

function extractHistoryList(result) {
  if (!result) {
    return [];
  }
  if (Array.isArray(result)) {
    return result;
  }

  const candidates = [
    result.data && result.data.data && result.data.data.list,
    result.data && result.data.list,
    result.result && result.result.data && result.result.data.list,
    result.result && result.result.list,
    result.lotteryResList,
    result.list,
    result.data,
    result.result
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function extractLatestResult(result) {
  if (!result) {
    return null;
  }
  return (
    result.last ||
    (result.data && result.data.last) ||
    (result.result && result.result.last) ||
    extractHistoryList(result)[0] ||
    null
  );
}

async function ensureCollections() {
  await db.createCollection(COLLECTION_RESULTS).catch(() => null);
  await db.createCollection(COLLECTION_LOGS).catch(() => null);
}

async function logSync(action, status, detail = {}) {
  await db.collection(COLLECTION_LOGS).add({
    data: {
      action,
      status,
      detail,
      createdAt: new Date()
    }
  }).catch(() => null);
}

async function upsertResult(result) {
  if (!result || !result.issue || !result.drawDate) {
    return null;
  }

  const collection = db.collection(COLLECTION_RESULTS);
  const existing = await collection.where({ issue: result.issue }).limit(1).get();
  const data = {
    ...result,
    updatedAt: new Date()
  };

  if (existing.data.length) {
    await collection.doc(existing.data[0]._id).update({ data });
    return {
      ...existing.data[0],
      ...data
    };
  }

  const addResult = await collection.add({
    data: {
      ...data,
      createdAt: new Date()
    }
  });
  return {
    _id: addResult._id,
    ...data
  };
}

async function fetchLatestFromFreeSource() {
  const huiniao = await requestJsonUrl(process.env.HUINIAO_HISTORY_URL || DEFAULT_HUINIAO_HISTORY_URL, {
    type: LOTTERY_ID,
    page: 1,
    limit: 1
  });
  const latest = mapHuiniaoResult(extractLatestResult(huiniao));
  const apihz = await fetchApihzIssue(latest && latest.issue).catch(() => null);
  return mergeResult(latest, apihz);
}

function apihzCredentials() {
  const id = process.env.APIHZ_ID || "";
  const key = process.env.APIHZ_KEY || "";
  if (!id || !key) {
    return null;
  }
  return { id, key };
}

async function fetchApihzIssue(issue) {
  const credentials = apihzCredentials();
  if (!credentials) {
    return null;
  }

  const params = {
    id: credentials.id,
    key: credentials.key
  };
  if (issue) {
    params.qh = issue;
  }

  const result = await requestJsonUrl(process.env.APIHZ_DLT_URL || DEFAULT_APIHZ_DLT_URL, params);
  return mapApihzResult(result);
}

async function fetchIssueFromFreeSource(issue) {
  const enriched = await fetchApihzIssue(issue).catch(() => null);
  if (enriched && enriched.issue) {
    return enriched;
  }

  const pageSize = 50;
  for (let page = 1; page <= 80; page += 1) {
    const result = await requestJsonUrl(process.env.HUINIAO_HISTORY_URL || DEFAULT_HUINIAO_HISTORY_URL, {
      type: LOTTERY_ID,
      page,
      limit: pageSize
    });
    const list = extractHistoryList(result);
    const found = list.find((item) => String(item.code || item.issue) === String(issue));
    if (found) {
      return mapHuiniaoResult(found);
    }
    if (list.length < pageSize) {
      break;
    }
  }

  return null;
}

async function syncLatest(options = {}) {
  await ensureCollections();

  if (options.fromTrigger && !isDrawWindow()) {
    await logSync("syncLatest", "skipped", { reason: "outside_draw_window" });
    return { skipped: true, reason: "outside_draw_window" };
  }

  const latest = await fetchLatestFromFreeSource();
  if (!latest || !latest.issue) {
    throw new Error("未获取到最新开奖数据");
  }
  const saved = await upsertResult(latest);
  await logSync("syncLatest", "success", { issue: latest.issue, drawDate: latest.drawDate });
  return { result: saved };
}

async function syncHistory(event) {
  await ensureCollections();

  const pageSize = Math.min(Number(event.pageSize || 50), 50);
  const startPage = Math.max(Number(event.page || 1), 1);
  const maxPages = Math.max(Number(event.maxPages || 1), 1);
  let synced = 0;
  let stopped = false;
  let lastPage = startPage;

  for (let offset = 0; offset < maxPages && !stopped; offset += 1) {
    const page = startPage + offset;
    lastPage = page;
    const result = await requestJsonUrl(process.env.HUINIAO_HISTORY_URL || DEFAULT_HUINIAO_HISTORY_URL, {
      type: LOTTERY_ID,
      page,
      limit: pageSize
    });
    const list = extractHistoryList(result);
    if (!list.length) {
      stopped = true;
      break;
    }

    for (const item of list) {
      const mapped = mapHuiniaoResult(item);
      if (!mapped || !mapped.drawDate) {
        continue;
      }
      if (mapped.drawDate < START_DATE) {
        stopped = true;
        break;
      }
      await upsertResult(mapped);
      synced += 1;
    }
  }

  await logSync("syncHistory", "success", { synced, startPage, lastPage, stopped });
  return { synced, startPage, lastPage, stopped, nextPage: stopped ? null : lastPage + 1 };
}

function isDrawWindow() {
  const parts = chinaTimeParts();
  const isDrawDay = [1, 3, 6].includes(parts.day);
  return isDrawDay && parts.hour === 21 && parts.minute >= 25 && parts.minute <= 50;
}

async function getLatest() {
  await ensureCollections();
  const res = await db
    .collection(COLLECTION_RESULTS)
    .orderBy("drawDate", "desc")
    .orderBy("issue", "desc")
    .limit(1)
    .get();
  if (res.data[0]) {
    return { result: res.data[0] };
  }

  const latest = await fetchLatestFromFreeSource().catch(async (error) => {
    await logSync("getLatest", "seed_failed", { message: error.message }).catch(() => null);
    return null;
  });
  if (!latest || !latest.issue || latest.drawDate < START_DATE) {
    return { result: null };
  }

  const saved = await upsertResult(latest);
  await logSync("getLatest", "seeded", { issue: latest.issue, drawDate: latest.drawDate });
  return { result: saved };
}

async function queryHistory(event) {
  await ensureCollections();
  const page = Math.max(Number(event.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize || 20), 1), 50);
  const where = {};

  if (event.issue) {
    where.issue = String(event.issue).trim();
  }

  if (event.date) {
    where.drawDate = String(event.date).slice(0, 10);
  } else if (event.year) {
    const year = String(event.year);
    where.drawDate = _.gte(`${year}-01-01`).and(_.lte(`${year}-12-31`));
  }

  const collection = db.collection(COLLECTION_RESULTS).where(where);
  const countResult = await collection.count();
  const listResult = await collection
    .orderBy("drawDate", "desc")
    .orderBy("issue", "desc")
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return {
    list: listResult.data,
    total: countResult.total,
    page,
    pageSize
  };
}

async function getDetail(event) {
  await ensureCollections();
  const where = {};
  if (event.issue) {
    where.issue = String(event.issue).trim();
  } else if (event.date) {
    where.drawDate = String(event.date).slice(0, 10);
  } else {
    throw new Error("缺少期号或日期");
  }

  const collection = db.collection(COLLECTION_RESULTS);
  const res = await collection.where(where).limit(1).get();
  if (res.data[0]) {
    return { result: res.data[0] };
  }

  if (event.issue) {
    const fetched = await fetchIssueFromFreeSource(event.issue);
    if (fetched && fetched.issue && fetched.drawDate >= START_DATE) {
      const saved = await upsertResult(fetched);
      return { result: saved };
    }
  }

  return { result: null };
}

async function getByDate(dateText) {
  const res = await db.collection(COLLECTION_RESULTS).where({ drawDate: dateText }).limit(1).get();
  return res.data[0] || null;
}

async function getPrevious(dateText) {
  const res = await db
    .collection(COLLECTION_RESULTS)
    .where({ drawDate: _.lt(dateText) })
    .orderBy("drawDate", "desc")
    .limit(1)
    .get();
  return res.data[0] || null;
}

async function getNext(dateText) {
  const res = await db
    .collection(COLLECTION_RESULTS)
    .where({ drawDate: _.gt(dateText) })
    .orderBy("drawDate", "asc")
    .limit(1)
    .get();
  return res.data[0] || null;
}

async function buildRelativeItem(baseDate, months) {
  const shifted = shiftMonths(parseDate(baseDate), months);
  const targetDate = formatDate(shifted.date);
  const today = chinaDate();

  if (targetDate < START_DATE) {
    return {
      targetDate,
      corrected: shifted.corrected,
      message: "超出收录范围"
    };
  }

  if (targetDate > today) {
    return {
      targetDate,
      corrected: shifted.corrected,
      message: "日期未到"
    };
  }

  const result = await getByDate(targetDate);
  if (result) {
    return {
      targetDate,
      corrected: shifted.corrected,
      result
    };
  }

  const previous = await getPrevious(targetDate);
  const next = await getNext(targetDate);
  return {
    targetDate,
    corrected: shifted.corrected,
    message: "当日无大乐透开奖",
    previous,
    next
  };
}

async function getRelative(event) {
  await ensureCollections();
  const baseDate = event.baseDate || chinaDate();
  if (!parseDate(baseDate)) {
    throw new Error("日期格式应为 YYYY-MM-DD");
  }

  const [lastMonth, sixMonths, lastYear] = await Promise.all([
    buildRelativeItem(baseDate, -1),
    buildRelativeItem(baseDate, -6),
    buildRelativeItem(baseDate, -12)
  ]);

  return {
    lastMonth,
    sixMonths,
    lastYear
  };
}

exports.main = async (event = {}) => {
  try {
    const action = event.action || (event.Type === "Timer" ? "syncLatest" : "");
    let data;

    switch (action) {
      case "getLatest":
        data = await getLatest();
        break;
      case "queryHistory":
        data = await queryHistory(event);
        break;
      case "getDetail":
        data = await getDetail(event);
        break;
      case "getRelative":
        data = await getRelative(event);
        break;
      case "syncLatest":
        data = await syncLatest({ fromTrigger: event.Type === "Timer" });
        break;
      case "syncHistory":
        data = await syncHistory(event);
        break;
      default:
        throw new Error("未知操作");
    }

    return success(data);
  } catch (error) {
    await logSync(event.action || "unknown", "failed", { message: error.message }).catch(() => null);
    return failure(error);
  }
};
