const { requestJson } = require('../../utils/containerClient');

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
    requestJson({
      path: '/api/query/inventory',
      method: 'GET',
      data: { item_no: itemNo },
    })
      .then((data) => {
        if (data && data.success) {
          this.setData({
            rows: data.rows || [],
            hasResult: true
          });
          if (!data.rows || data.rows.length === 0) {
            wx.showToast({ title: '未找到该货号库存', icon: 'none' });
          }
        } else {
          wx.showToast({ title: (data && data.error) || '查询失败', icon: 'none' });
        }
      })
      .catch((e) => {
        wx.showToast({ title: e.message || '网络请求失败', icon: 'none' });
      })
      .finally(() => {
        this.setData({ loading: false });
      });
  }
});
