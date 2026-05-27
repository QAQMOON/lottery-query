function callLottery(action, data = {}) {
  if (!wx.cloud) {
    return Promise.reject(new Error("当前基础库不支持云开发"));
  }

  return wx.cloud.callFunction({
    name: "lottery",
    data: { action, ...data }
  }).then((res) => {
    const result = res.result || {};
    if (!result.success) throw new Error(result.message || "请求失败");
    return result.data;
  });
}

module.exports = {
  getLatest(lotteryType = "dlt") {
    return callLottery("getLatest", { lotteryType });
  },

  queryHistory(params) {
    return callLottery("queryHistory", params);
  },

  getDetail(params) {
    return callLottery("getDetail", params);
  },

  getRelative(params) {
    return callLottery("getRelative", params);
  },

  syncLatest(lotteryType = "dlt") {
    return callLottery("syncLatest", { lotteryType });
  }
};
