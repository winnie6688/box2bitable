Page({
  data: {
    itemNo: '',
    loading: false,
    rows: [],
    hasResult: false
  },

  onInput(e) {
    this.setData({ itemNo: e.detail.value });
  },

  submit() {
    const itemNo = String(this.data.itemNo || '').trim();
    if (!itemNo) {
      wx.showToast({ title: '请输入货号', icon: 'none' });
      return;
    }

    this.setData({ loading: true, rows: [], hasResult: false });
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/api/query/inventory`,
      method: 'GET',
      data: { item_no: itemNo },
      success: (res) => {
        if (res.data && res.data.success) {
          this.setData({
            rows: res.data.rows || [],
            hasResult: true
          });
          if (!res.data.rows || res.data.rows.length === 0) {
            wx.showToast({ title: '未找到该货号库存', icon: 'none' });
          }
        } else {
          wx.showToast({ title: (res.data && res.data.error) || '查询失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络请求失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  }
});

