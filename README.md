# box2bitable

基于豆包大模型和飞书多维表格的智能鞋盒标签识别与盘点工具（微信小程序版）。

## 1. 项目简介
`box2bitable` 旨在通过 AI 技术简化仓库盘点流程。用户通过微信小程序拍照上传鞋盒标签，系统自动识别 SKU 信息（货号、颜色、尺码等），经人工复核后自动聚合数量并同步至飞书多维表格。

## 2. 核心功能
- **智能识别**：集成豆包大模型，支持一图多盒标签识别。
- **人工复核**：移动端友好界面，支持实时修正识别结果。
- **自动聚合**：按货号+颜色+尺码唯一键进行数量统计。
- **飞书同步**：支持飞书多维表格 Upsert 逻辑（存在更新，不存在新增）。

## 3. 技术栈
- **前端**：微信小程序原生开发 (WXML, WXSS, JS)
- **后端**：Node.js + Express
- **数据库/存储**：Supabase (PostgreSQL + Storage)
- **AI 模型**：豆包 (Doubao) 大模型 API
- **表格服务**：飞书多维表格 (Feishu Bitable) API

## 4. 目录结构
```text
.
├── docs/               # 项目文档 (PRD, 技术架构)
├── server/             # 后端 Express 代码
│   ├── src/
│   │   ├── controllers/ # 控制器
│   │   ├── routes/      # 路由
│   │   ├── services/    # 业务逻辑 (AI, 飞书, Supabase)
│   │   └── utils/       # 工具类
│   └── package.json
├── miniprogram/        # 微信小程序前端代码
│   ├── pages/          # 页面
│   ├── utils/          # 工具函数
│   └── app.json
├── .env.example        # 环境变量模板
└── README.md
```

## 5. 快速开始
*(开发中)*

1. 克隆仓库
2. 配置 `.env` 文件
3. 启动后端：`cd server && npm install && npm start`
4. 微信开发者工具打开 `miniprogram` 目录

## 6. 开源协议
MIT License
