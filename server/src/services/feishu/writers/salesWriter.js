const pruneUndefined = (obj) => {
  Object.keys(obj).forEach((k) => {
    if (obj[k] === undefined) delete obj[k];
  });
  return obj;
};

const buildAttachmentField = (fileToken) => {
  return fileToken ? [{ file_token: fileToken }] : [];
};

const write = async ({ item, fileToken, target, repo }) => {
  const { item_no, color, size, quantity } = item;
  const attachmentField = buildAttachmentField(fileToken);

  const createFields = pruneUndefined({
    '货号': item_no,
    '颜色': color,
    '尺码': Number(size),
    '数量': Number(quantity),
    '金额（元）': item.amount != null && item.amount !== '' ? Number(item.amount) : undefined,
    '支付方式': item.pay_method || undefined,
    '备注': item.remark || '',
    '对应图片': attachmentField,
  });

  return repo.createRecord(target, createFields);
};

module.exports = {
  write,
};

