Page({
  data: {
    modules: [
      { key: 'purchase', label: '采购', desc: '数量累加写入采购表' },
      { key: 'sales', label: '销售', desc: '明细流水（每次新增）' },
      { key: 'inventory', label: '库存', desc: '数量累加写入库存表' }
    ]
  },

  chooseModule(e) {
    const moduleKey = e.currentTarget.dataset.module;
    const url = `/pages/index/index?module=${encodeURIComponent(moduleKey)}`;
    wx.navigateTo({ url });
  }
});

