-- 为 task_images 表增加飞书文件 token 字段
ALTER TABLE task_images ADD COLUMN IF NOT EXISTS feishu_file_token VARCHAR(255);
