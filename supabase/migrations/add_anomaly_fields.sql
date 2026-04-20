-- 为 recognition_results 表增加尺码校验相关字段
ALTER TABLE recognition_results ADD COLUMN IF NOT EXISTS is_anomaly BOOLEAN DEFAULT FALSE;
ALTER TABLE recognition_results ADD COLUMN IF NOT EXISTS validation_message VARCHAR(255);
