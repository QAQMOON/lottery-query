const api = require("../../utils/api");
const dateUtil = require("../../utils/date");
const lottery = require("../../utils/lottery");

const LOTTERY_TYPES = [
  { key: "dlt", name: "大乐透", startDate: "2015-01-03", startYear: 2015 },
  { key: "ssq", name: "双色球", startDate: "2003-02-23", startYear: 2003 }
];

function createYears(startYear) {
  const current = new Date().getFullYear();
  const years = ["全部年份"];
  for (let year = current; year >= startYear; year -= 1) {
    years.push(String(year));
  }
  return years;
}

Page({
  data: {
    lotteryTypes: LOTTERY_TYPES,
    currentType: "dlt",
    today: dateUtil.todayText(),
    startDate: "2015-01-03",
    years: createYears(2015),
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
    if (options.date) this.setData({ date: options.date });
  },

  onShow() {
    const pendingType = wx.getStorageSync("history_lottery_type");
    if (pendingType && pendingType !== this.data.currentType) {
      wx.removeStorageSync("history_lottery_type");
      this.switchType({ currentTarget: { dataset: { type: pendingType } } });
      return;
    }

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

  switchType(event) {
    const type = event.currentTarget.dataset.type;
    if (type === this.data.currentType) return;
    const config = LOTTERY_TYPES.find(t => t.key === type);
    this.setData({
      currentType: type,
      startDate: config.startDate,
      years: createYears(config.startYear),
      yearIndex: 0,
      yearLabel: "全部年份",
      issue: "",
      date: ""
    });
    this.search();
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
    this.setData({ page: 1, results: [], hasMore: false, error: "" });
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
    if (this.data.loading || !this.data.hasMore) return;
    this.setData({ page: this.data.page + 1 });
    this.load(true);
  },

  load(append = false) {
    const year = this.data.yearIndex > 0 ? this.data.years[this.data.yearIndex] : "";
    this.setData({ loading: true });

    return api.queryHistory({
      lotteryType: this.data.currentType,
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
      url: `/pages/detail/detail?issue=${issue}&type=${this.data.currentType}`
    });
  }
});
