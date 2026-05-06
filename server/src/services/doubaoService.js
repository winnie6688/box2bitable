const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

/**
 * Doubao (Volcengine Ark) Vision Service
 * Uses OpenAI SDK to interact with the Doubao LLM.
 */
class DoubaoService {
  constructor() {
    this.apiKey = process.env.ARK_API_KEY;
    this.endpointId = process.env.ARK_MODEL_ENDPOINT; // The model custom endpoint ID
    this.baseURL = process.env.ARK_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    this.client = null;
  }

  getClient() {
    if (this.client) return this.client;
    const apiKey = process.env.ARK_API_KEY;
    const baseURL = process.env.ARK_API_BASE_URL || this.baseURL;
    this.client = new OpenAI({ apiKey, baseURL });
    return this.client;
  }

  /**
   * Recognize shoe box labels from a local image file.
   * @param {string} filePath - Path to the image file.
   * @param {string} moduleKey - purchase / sales / inventory
   * @returns {Promise<Array>} - List of recognized shoe box objects.
   */
  async recognizeLabels(filePath, moduleKey = 'purchase') {
    try {
      this.apiKey = process.env.ARK_API_KEY;
      this.endpointId = process.env.ARK_MODEL_ENDPOINT;
      this.baseURL = process.env.ARK_API_BASE_URL || this.baseURL;
      if (!this.apiKey || !this.endpointId) {
        throw new Error('ARK_API_KEY or ARK_MODEL_ENDPOINT is not configured in .env');
      }

      // 1. Convert image to base64
      const imageBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
      const ext = path.extname(filePath || '').toLowerCase();
      const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
      const imageData = `data:${mime};base64,${imageBase64}`;

      const module = String(moduleKey || '').trim().toLowerCase() || 'purchase';
      const needSupplier = module === 'purchase';
      const supplierRule = needSupplier
        ? '4. supplier: 供应商（即标签上的品牌或厂家名称，如 豪路, Nike, 耐克旗舰店 等）'
        : '4. supplier: 供应商（可选字段，若未识别到返回空字符串 ""）';

      // 2. Prepare the prompt for shoe box recognition
      const prompt = `
你是一个专业的仓库盘点助手。请识别图片中所有的鞋盒标签。
一张图片中可能包含多个鞋盒标签，请务必提取出每一个标签的信息。

对于每一个识别出的标签，请提取以下字段：
1. item_no: 货号（通常是字母和数字的组合，如 CW2288-111, DD1391-100）
2. color: 颜色（如 纯白, 黑白, 灰/白 等）
3. size: 尺码（请输出标准欧码）。
   【判断与转换规则】：
   - 若识别到的尺码数值在 225–285 之间（如 240、250），视为毫米制，需转换：欧码 = (数值 - 50) / 5。示例：240 → 38，250 → 40。
   - 若识别到的尺码数值在 34–48 之间（如 38、40），视为欧码，无需转换。
   - 只返回最终欧码数值（如 40），不要输出任何解释。若未识别到，返回空字符串 ""。
${supplierRule}

请严格以 JSON 数组格式返回结果，不要包含任何解释性文字或 Markdown 代码块标记。
示例输出：
[
  {"item_no": "CW2288-111", "color": "白色", "size": "42.5", "supplier": "Nike"},
  {"item_no": "EG4958", "color": "黑色", "size": "38", "supplier": "豪路"}
]
      `.trim();

      // 3. Call Doubao API using OpenAI SDK
      const response = await this.getClient().chat.completions.create({
        model: this.endpointId,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: imageData }
              }
            ]
          }
        ],
        temperature: 0.1, // Lower temperature for more stable JSON output
      });

      const content = response.choices[0].message.content;

      // Clean the response (sometimes AI wraps it in ```json ... ```)
      const cleanedContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        const results = JSON.parse(cleanedContent);
        if (!Array.isArray(results)) {
          throw new Error('AI 返回结果不是数组格式');
        }
        return results;
      } catch (parseError) {
        console.error('AI 响应解析失败:', cleanedContent);
        throw new Error('AI 响应格式错误，无法解析 JSON: ' + parseError.message);
      }
    } catch (error) {
      console.error('Error in DoubaoService (OpenAI SDK):', error.message);
      if (error.status) {
        console.error('API Error Status:', error.status);
      }
      throw new Error('AI识别失败: ' + error.message);
    }
  }
}

module.exports = new DoubaoService();
