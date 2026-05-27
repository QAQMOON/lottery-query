const api = require("../../utils/api");
const lottery = require("../../utils/lottery");

function normalizePrizeLevels(levels) {
  if (!Array.isArray(levels)) {
    return [];
  }
  return levels.map((item, index) => ({
    name: item.name || item.prize_name || item.level || `奖级 ${index + 1}`,
    count: item.count || item.prize_num || item.num || "暂无",
    amount: item.amount || item.prize_amount || item.money || "暂无"
  }));
}

function withDisplay(raw) {
  const result = lottery.mapResult(raw);
  if (!result) {
    return {};
  }
  return {
    ...result,
    salesText: lottery.formatAmount(result.salesAmount),
    poolText: lottery.formatAmount(result.poolAmount),
    prizeLevels: normalizePrizeLevels(result.prizeLevels)
  };
}

Page({
  data: {
    issue: "",
    date: "",
    result: {},
    loading: true,
    error: ""
  },

  onLoad(options) {
    this.setData({
      issue: options.issue || "",
      date: options.date || ""
    });
    this.loadDetail();
  },

  loadDetail() {
    this.setData({ loading: true, error: "" });
    api.getDetail({
      issue: this.data.issue,
      date: this.data.date
    }).then((data) => {
      this.setData({ result: withDisplay(data.result) });
    }).catch((error) => {
      this.setData({ error: error.message || "加载详情失败" });
    }).finally(() => {
      this.setData({ loading: false });
    });
  }
});
