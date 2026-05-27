App({
  globalData: {
    envId: "你的云环境ID"
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env: this.globalData.envId || undefined,
        traceUser: true
      });
    }
  }
});
