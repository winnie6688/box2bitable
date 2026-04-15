-- 用户表 (users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feishu_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100),
  email VARCHAR(255),
  role VARCHAR(20) DEFAULT 'warehouse_manager' CHECK (role IN ('warehouse_manager', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 识别任务表 (recognition_tasks)
CREATE TABLE IF NOT EXISTS recognition_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_images INTEGER DEFAULT 0,
  processed_images INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 图片表 (task_images)
CREATE TABLE IF NOT EXISTS task_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES recognition_tasks(id),
  storage_path VARCHAR(500) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_size INTEGER,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 识别结果表 (recognition_results)
CREATE TABLE IF NOT EXISTS recognition_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES task_images(id),
  task_id UUID REFERENCES recognition_tasks(id),
  brand VARCHAR(100),
  model VARCHAR(200),
  size VARCHAR(50),
  color VARCHAR(100),
  sku_code VARCHAR(100),
  confidence FLOAT,
  raw_data JSONB,
  is_reviewed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SKU 聚合与同步记录表 (sync_records)
CREATE TABLE IF NOT EXISTS sync_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES recognition_tasks(id),
  sku_code VARCHAR(100),
  brand VARCHAR(100),
  model VARCHAR(200),
  size VARCHAR(50),
  color VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  bitable_record_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  sync_data JSONB,
  error_message TEXT,
  sync_time TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引设置
CREATE INDEX IF NOT EXISTS idx_users_feishu_id ON users(feishu_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON recognition_tasks(status);
CREATE INDEX IF NOT EXISTS idx_results_task_id ON recognition_results(task_id);
CREATE INDEX IF NOT EXISTS idx_sync_task_id ON sync_records(task_id);
