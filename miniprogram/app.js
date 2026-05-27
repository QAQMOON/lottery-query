App({
  globalData: {
    envId: "cloud1-d5gvlaubhbbbfcdd2"
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
