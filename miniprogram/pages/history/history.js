const api = require("../../utils/api");
const dateUtil = require("../../utils/date");
const lottery = require("../../utils/lottery");

function createYears() {
  const current = new Date().getFullYear();
  const years = ["全部年份"];
  for (let year = current; year >= 2015; year -= 1) {
    years.push(String(year));
  }
  return years;
}

Page({
  data: {
    today: dateUtil.todayText(),
    years: createYears(),
    yearIndex: 0,
    yearLabel: "全部年份",
    issue: "",
    date: "",
    page: 1,
    pageSize: 20,
    results: [],
    total: 0,
    totalText: "0 条",
    hasMore: false,
    loading: false,
    error: "",
    initialized: false
  },

  onLoad(options) {
    if (options.date) {
      this.setData({ date: options.date });
    }
  },

  onShow() {
    const pendingDate = wx.getStorageSync("history_query_date");
    if (pendingDate) {
      wx.removeStorageSync("history_query_date");
      this.setData({
        date: pendingDate,
        issue: "",
        yearIndex: 0,
        yearLabel: "全部年份",
        initialized: true
      });
      this.search();
      return;
    }

    if (!this.data.initialized) {
      this.setData({ initialized: true });
      this.search();
    }
  },

  onPullDownRefresh() {
    this.search().finally(() => wx.stopPullDownRefresh());
  },

  onIssueInput(event) {
    this.setData({ issue: event.detail.value.trim() });
  },

  onYearChange(event) {
    const yearIndex = Number(event.detail.value);
    this.setData({
      yearIndex,
      yearLabel: this.data.years[yearIndex],
      date: yearIndex > 0 ? "" : this.data.date
    });
  },

  onDateChange(event) {
    this.setData({
      date: event.detail.value,
      yearIndex: 0,
      yearLabel: "全部年份"
    });
  },

  search() {
    this.setData({
      page: 1,
      results: [],
      hasMore: false,
      error: ""
    });
    return this.load();
  },

  reset() {
    this.setData({
      issue: "",
      date: "",
      yearIndex: 0,
      yearLabel: "全部年份"
    });
    this.search();
  },

  loadMore() {
    if (this.data.loading || !this.data.hasMore) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.load(true);
  },

  load(append = false) {
    const year = this.data.yearIndex > 0 ? this.data.years[this.data.yearIndex] : "";
    this.setData({ loading: true });

    return api.queryHistory({
      issue: this.data.issue,
      date: this.data.date,
      year,
      page: this.data.page,
      pageSize: this.data.pageSize
    }).then((data) => {
      const mapped = (data.list || []).map(lottery.mapResult);
      const results = append ? this.data.results.concat(mapped) : mapped;
      const total = data.total || results.length;
      this.setData({
        results,
        total,
        totalText: `${total} 条`,
        hasMore: results.length < total
      });
    }).catch((error) => {
      this.setData({ error: error.message || "查询失败" });
    }).finally(() => {
      this.setData({ loading: false });
    });
  },

  goDetail(event) {
    const issue = event.currentTarget.dataset.issue;
    wx.navigateTo({
      url: `/pages/detail/detail?issue=${issue}`
    });
  }
});
