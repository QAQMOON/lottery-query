const api = require("../../utils/api");
const dateUtil = require("../../utils/date");
const lottery = require("../../utils/lottery");

function withDisplay(result) {
  const mapped = lottery.mapResult(result);
  if (!mapped) {
    return {};
  }
  return {
    ...mapped,
    salesText: lottery.formatAmount(mapped.salesAmount),
    poolText: lottery.formatAmount(mapped.poolAmount)
  };
}

Page({
  data: {
    loading: true,
    refreshing: false,
    error: "",
    latest: {},
    today: dateUtil.todayText(),
    syncLabel: "等待同步",
    quickItems: [
      { type: "lastMonth", title: "上月同日", targetDate: "", result: {} },
      { type: "sixMonths", title: "上六个月", targetDate: "", result: {} },
      { type: "lastYear", title: "上一年同日", targetDate: "", result: {} }
    ]
  },

  onLoad() {
    this.loadAll();
  },

  onPullDownRefresh() {
    this.loadAll().finally(() => wx.stopPullDownRefresh());
  },

  loadAll() {
    this.setData({ loading: true, error: "" });
    return Promise.all([this.loadLatest(), this.loadQuickItems()])
      .catch((error) => {
        this.setData({ error: error.message || "加载失败" });
      })
      .finally(() => {
        this.setData({ loading: false, refreshing: false });
      });
  },

  loadLatest() {
    return api.getLatest().then((data) => {
      const latest = withDisplay(data.result);
      this.setData({
        latest,
        syncLabel: latest.issue ? "已同步" : "暂无数据"
      });
    });
  },

  loadQuickItems() {
    return api.getRelative({ baseDate: this.data.today }).then((data) => {
      const items = this.data.quickItems.map((item) => {
        const entry = data[item.type] || {};
        return {
          ...item,
          targetDate: entry.targetDate || "",
          corrected: !!entry.corrected,
          message: entry.message || "",
          previous: entry.previous ? withDisplay(entry.previous) : null,
          next: entry.next ? withDisplay(entry.next) : null,
          result: entry.result ? withDisplay(entry.result) : {}
        };
      });
      this.setData({ quickItems: items });
    });
  },

  handleRefresh() {
    this.setData({ refreshing: true });
    this.loadAll();
  },

  goLatestDetail() {
    if (!this.data.latest.issue) {
      return;
    }
    wx.navigateTo({
      url: `/pages/detail/detail?issue=${this.data.latest.issue}`
    });
  },

  openQuick(event) {
    const type = event.currentTarget.dataset.type;
    const item = this.data.quickItems.find((entry) => entry.type === type);
    if (!item) {
      return;
    }
    if (item.result && item.result.issue) {
      wx.navigateTo({ url: `/pages/detail/detail?issue=${item.result.issue}` });
      return;
    }
    this.goHistoryWithDate(item.targetDate);
  },

  openAdjacent(event) {
    const issue = event.currentTarget.dataset.issue;
    if (!issue) {
      return;
    }
    wx.navigateTo({ url: `/pages/detail/detail?issue=${issue}` });
  },

  goHistoryWithDate(date) {
    if (date) {
      wx.setStorageSync("history_query_date", date);
    }
    wx.switchTab({ url: "/pages/history/history" });
  },

  goHistory() {
    wx.switchTab({ url: "/pages/history/history" });
  },

  goAbout() {
    wx.switchTab({ url: "/pages/about/about" });
  }
});
