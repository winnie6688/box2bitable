const buildAttachmentField = (fileToken) => {
  return fileToken ? [{ file_token: fileToken }] : [];
};

const write = async ({ item, fileToken, target, repo, skuCode }) => {
  const { record_id, item_no, color, size, quantity, supplier } = item;
  const existingRecord = await repo.findExistingRecord(target, { record_id, skuCode });
  const attachmentField = buildAttachmentField(fileToken);

  if (existingRecord) {
    const recordId = existingRecord.record_id;
    const fields = existingRecord.fields || {};
    const oldQuantity = fields['数量'] || 0;
    const newQuantity = Number(oldQuantity) + Number(quantity);

    const updateData = {
      '数量': newQuantity,
    };

    if (fileToken) {
      updateData['对应图片'] = attachmentField;
    }

    await repo.updateRecord(target, recordId, updateData);
    return recordId;
  }

  const createFields = {
    ...(target.fields?.includeSkuCode ? { 'SKU_Code': skuCode } : {}),
    '货号': item_no,
    '颜色': color,
    '尺码': Number(size),
    ...(target.fields?.hasSupplier ? { '供应商': supplier || '' } : {}),
    '数量': Number(quantity),
    '对应图片': attachmentField,
  };

  return repo.createRecord(target, createFields);
};

module.exports = {
  write,
};

