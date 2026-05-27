const cloud = require("wx-server-sdk");
const https = require("https");
const querystring = require("querystring");

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();
const _ = db.command;

// 彩种配置
const LOTTERY_CONFIG = {
  dlt: {
    collection: "dlt_results",
    logCollection: "sync_logs",
    type: "dlt",
    startDate: "2015-01-03",
    frontCount: 5,
    backCount: 2
  },
  ssq: {
    collection: "ssq_results",
    logCollection: "sync_logs",
    type: "ssq",
    startDate: "2003-02-23",
    frontCount: 6,
    backCount: 1
  }
};

const DEFAULT_HUINIAO_HISTORY_URL = "https://api.huiniao.top/interface/home/lotteryHistory";
const DEFAULT_APIHZ_DLT_URL = "https://cn.apihz.cn/api/caipiao/daletou.php";

function success(data) {
  return { success: true, data };
}

function failure(error) {
  return { success: false, message: error?.message || String(error) };
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
  if (!value) return null;
  const parts = String(value).split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
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
  return { date: target, corrected: day !== date.getDate() };
}

function normalizePrizeLevels(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item, index) => ({
      name: item.name || item.prize_name || item.level || `奖级${index + 1}`,
      count: item.count || item.prize_num || item.num || "",
      amount: item.amount || item.prize_amount || item.money || ""
    }));
  }
  if (typeof value === "string") {
    try { return normalizePrizeLevels(JSON.parse(value)); } catch { return []; }
  }
  return [];
}

function mapHuiniaoResult(raw, config) {
  if (!raw) return null;
  const frontNumbers = [raw.one, raw.two, raw.three, raw.four, raw.five, raw.six]
    .filter(Boolean)
    .map(String)
    .slice(0, config.frontCount);
  const backField = config.frontCount === 5 ? [raw.six, raw.seven] : [raw.seven];
  const backNumbers = backField.filter(Boolean).map(String).slice(0, config.backCount);

  return {
    lotteryType: config.type,
    issue: String(raw.code || raw.issue || "").trim(),
    drawDate: String(raw.day || raw.drawDate || raw.date || "").slice(0, 10),
    frontNumbers,
    backNumbers,
    numbers: frontNumbers.concat(backNumbers),
    salesAmount: raw.salesAmount || "",
    poolAmount: raw.poolAmount || "",
    prizeLevels: normalizePrizeLevels(raw.prizeLevels),
    sourceUrl: "https://api.huiniao.top/",
    updatedAt: new Date().toISOString()
  };
}

function requestJsonUrl(url, params) {
  const joiner = url.includes("?") ? "&" : "?";
  const target = `${url}${joiner}${querystring.stringify(params)}`;

  return new Promise((resolve, reject) => {
    https.get(target, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
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
    }).on("error", reject);
  });
}

function extractHistoryList(result) {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  const candidates = [
    result.data?.data?.list, result.data?.list,
    result.result?.data?.list, result.result?.list,
    result.lotteryResList, result.list, result.data, result.result
  ];
  for (const c of candidates) { if (Array.isArray(c)) return c; }
  return [];
}

function extractLatestResult(result) {
  if (!result) return null;
  return result.last || result.data?.last || result.result?.last || extractHistoryList(result)[0] || null;
}

async function ensureCollections(config) {
  await db.createCollection(config.collection).catch(() => null);
  await db.createCollection(config.logCollection).catch(() => null);
}

async function logSync(config, action, status, detail = {}) {
  await db.collection(config.logCollection).add({
    data: { lotteryType: config.type, action, status, detail, createdAt: new Date() }
  }).catch(() => null);
}

async function upsertResult(config, result) {
  if (!result || !result.issue || !result.drawDate) return null;
  const collection = db.collection(config.collection);
  const existing = await collection.where({ issue: result.issue }).limit(1).get();
  const data = { ...result, updatedAt: new Date() };

  if (existing.data.length) {
    await collection.doc(existing.data[0]._id).update({ data });
    return { ...existing.data[0], ...data };
  }
  const addResult = await collection.add({ data: { ...data, createdAt: new Date() } });
  return { _id: addResult._id, ...data };
}

async function fetchLatestFromSource(config) {
  const huiniao = await requestJsonUrl(
    process.env.HUINIAO_HISTORY_URL || DEFAULT_HUINIAO_HISTORY_URL,
    { type: config.type, page: 1, limit: 1 }
  );
  return mapHuiniaoResult(extractLatestResult(huiniao), config);
}

function isDrawWindow(config) {
  const parts = chinaTimeParts();
  const drawDays = config.type === "dlt" ? [1, 3, 6] : [0, 2, 4]; // dlt: 一三六, ssq: 日二四
  return drawDays.includes(parts.day) && parts.hour === 21 && parts.minute >= 25 && parts.minute <= 50;
}

async function syncLatest(config, options = {}) {
  await ensureCollections(config);
  if (options.fromTrigger && !isDrawWindow(config)) {
    await logSync(config, "syncLatest", "skipped", { reason: "outside_draw_window" });
    return { skipped: true, reason: "outside_draw_window" };
  }
  const latest = await fetchLatestFromSource(config);
  if (!latest || !latest.issue) throw new Error("未获取到最新开奖数据");
  const saved = await upsertResult(config, latest);
  await logSync(config, "syncLatest", "success", { issue: latest.issue, drawDate: latest.drawDate });
  return { result: saved };
}

async function syncHistory(config, event) {
  await ensureCollections(config);
  const pageSize = Math.min(Number(event.pageSize || 50), 50);
  const startPage = Math.max(Number(event.page || 1), 1);
  const maxPages = Math.max(Number(event.maxPages || 1), 1);
  let synced = 0;
  let stopped = false;
  let lastPage = startPage;

  for (let offset = 0; offset < maxPages && !stopped; offset += 1) {
    const page = startPage + offset;
    lastPage = page;
    const result = await requestJsonUrl(
      process.env.HUINIAO_HISTORY_URL || DEFAULT_HUINIAO_HISTORY_URL,
      { type: config.type, page, limit: pageSize }
    );
    const list = extractHistoryList(result);
    if (!list.length) { stopped = true; break; }

    for (const item of list) {
      const mapped = mapHuiniaoResult(item, config);
      if (!mapped || !mapped.drawDate) continue;
      if (mapped.drawDate < config.startDate) { stopped = true; break; }
      await upsertResult(config, mapped);
      synced += 1;
    }
  }

  await logSync(config, "syncHistory", "success", { synced, startPage, lastPage, stopped });
  return { synced, startPage, lastPage, stopped, nextPage: stopped ? null : lastPage + 1 };
}

async function getLatest(config) {
  await ensureCollections(config);
  const res = await db.collection(config.collection)
    .orderBy("drawDate", "desc").orderBy("issue", "desc").limit(1).get();
  if (res.data[0]) return { result: res.data[0] };

  const latest = await fetchLatestFromSource(config).catch(async (error) => {
    await logSync(config, "getLatest", "seed_failed", { message: error.message }).catch(() => null);
    return null;
  });
  if (!latest || !latest.issue || latest.drawDate < config.startDate) return { result: null };

  const saved = await upsertResult(config, latest);
  await logSync(config, "getLatest", "seeded", { issue: latest.issue, drawDate: latest.drawDate });
  return { result: saved };
}

async function queryHistory(config, event) {
  await ensureCollections(config);
  const page = Math.max(Number(event.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(event.pageSize || 20), 1), 50);
  const where = {};

  if (event.issue) where.issue = String(event.issue).trim();
  if (event.date) {
    where.drawDate = String(event.date).slice(0, 10);
  } else if (event.year) {
    const year = String(event.year);
    where.drawDate = _.gte(`${year}-01-01`).and(_.lte(`${year}-12-31`));
  }

  const collection = db.collection(config.collection).where(where);
  const countResult = await collection.count();
  const listResult = await collection
    .orderBy("drawDate", "desc").orderBy("issue", "desc")
    .skip((page - 1) * pageSize).limit(pageSize).get();

  return { list: listResult.data, total: countResult.total, page, pageSize };
}

async function getDetail(config, event) {
  await ensureCollections(config);
  const where = {};
  if (event.issue) where.issue = String(event.issue).trim();
  else if (event.date) where.drawDate = String(event.date).slice(0, 10);
  else throw new Error("缺少期号或日期");

  const res = await db.collection(config.collection).where(where).limit(1).get();
  if (res.data[0]) return { result: res.data[0] };

  // 回退从 API 抓取
  if (event.issue) {
    const pageSize = 50;
    for (let page = 1; page <= 80; page += 1) {
      const result = await requestJsonUrl(
        process.env.HUINIAO_HISTORY_URL || DEFAULT_HUINIAO_HISTORY_URL,
        { type: config.type, page, limit: pageSize }
      );
      const list = extractHistoryList(result);
      const found = list.find((item) => String(item.code || item.issue) === String(event.issue));
      if (found) {
        const mapped = mapHuiniaoResult(found, config);
        if (mapped && mapped.drawDate >= config.startDate) {
          const saved = await upsertResult(config, mapped);
          return { result: saved };
        }
      }
      if (list.length < pageSize) break;
    }
  }
  return { result: null };
}

async function getByDate(config, dateText) {
  const res = await db.collection(config.collection).where({ drawDate: dateText }).limit(1).get();
  return res.data[0] || null;
}

async function getPrevious(config, dateText) {
  const res = await db.collection(config.collection)
    .where({ drawDate: _.lt(dateText) }).orderBy("drawDate", "desc").limit(1).get();
  return res.data[0] || null;
}

async function getNext(config, dateText) {
  const res = await db.collection(config.collection)
    .where({ drawDate: _.gt(dateText) }).orderBy("drawDate", "asc").limit(1).get();
  return res.data[0] || null;
}

async function buildRelativeItem(config, baseDate, months) {
  const shifted = shiftMonths(parseDate(baseDate), months);
  const targetDate = formatDate(shifted.date);
  const today = chinaDate();

  if (targetDate < config.startDate) {
    return { targetDate, corrected: shifted.corrected, message: "超出收录范围" };
  }
  if (targetDate > today) {
    return { targetDate, corrected: shifted.corrected, message: "日期未到" };
  }

  const result = await getByDate(config, targetDate);
  if (result) return { targetDate, corrected: shifted.corrected, result };

  const previous = await getPrevious(config, targetDate);
  const next = await getNext(config, targetDate);
  const lotteryName = config.type === "dlt" ? "大乐透" : "双色球";
  return { targetDate, corrected: shifted.corrected, message: `当日无${lotteryName}开奖`, previous, next };
}

async function getRelative(config, event) {
  await ensureCollections(config);
  const baseDate = event.baseDate || chinaDate();
  if (!parseDate(baseDate)) throw new Error("日期格式应为 YYYY-MM-DD");

  const [lastMonth, sixMonths, lastYear] = await Promise.all([
    buildRelativeItem(config, baseDate, -1),
    buildRelativeItem(config, baseDate, -6),
    buildRelativeItem(config, baseDate, -12)
  ]);

  return { lastMonth, sixMonths, lastYear };
}

exports.main = async (event = {}) => {
  try {
    const lotteryType = event.lotteryType || "dlt";
    const config = LOTTERY_CONFIG[lotteryType];
    if (!config) throw new Error(`不支持的彩种: ${lotteryType}`);

    const action = event.action || (event.Type === "Timer" ? "syncLatest" : "");
    let data;

    switch (action) {
      case "getLatest":    data = await getLatest(config); break;
      case "queryHistory": data = await queryHistory(config, event); break;
      case "getDetail":    data = await getDetail(config, event); break;
      case "getRelative":  data = await getRelative(config, event); break;
      case "syncLatest":   data = await syncLatest(config, { fromTrigger: event.Type === "Timer" }); break;
      case "syncHistory":  data = await syncHistory(config, event); break;
      default: throw new Error("未知操作");
    }

    return success(data);
  } catch (error) {
    const lotteryType = event.lotteryType || "dlt";
    const config = LOTTERY_CONFIG[lotteryType] || LOTTERY_CONFIG.dlt;
    await logSync(config, event.action || "unknown", "failed", { message: error.message }).catch(() => null);
    return failure(error);
  }
};
