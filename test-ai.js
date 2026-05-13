
const API_BASE = 'https://ark.cn-beijing.volces.com/api/coding/v3'
const API_KEY = '0e3fbda8-afa0-4b6f-9864-ea94e3de353d'
const MODEL_NAME = 'deepseek-v3.2'

// 测试API连接
async function testAIConnection() {
  console.log('正在测试AI接口连接...')
  console.log(`接口地址: ${API_BASE}`)
  console.log(`模型: ${MODEL_NAME}`)
  
  try {
    // 先测试模型列表接口
    console.log('\n1. 测试模型列表接口...')
    const modelsResponse = await fetch(`${API_BASE}/models`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    })
    
    if (!modelsResponse.ok) {
      throw new Error(`模型接口请求失败: ${modelsResponse.status} ${modelsResponse.statusText}`)
    }
    
    const modelsData = await modelsResponse.json()
    console.log('✅ 模型接口调用成功')
    console.log(`可用模型数量: ${modelsData.data?.length || 0}`)
    
    // 测试简单的聊天接口
    console.log('\n2. 测试聊天补全接口...')
    const chatResponse = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.3,
        max_tokens: 100,
        messages: [
          { role: 'user', content: '你好，返回一句话测试连接' }
        ]
      })
    })
    
    if (!chatResponse.ok) {
      const errorText = await chatResponse.text()
      throw new Error(`聊天接口请求失败: ${chatResponse.status} ${chatResponse.statusText}\n错误信息: ${errorText}`)
    }
    
    const chatData = await chatResponse.json()
    console.log('✅ 聊天接口调用成功')
    console.log(`返回内容: ${chatData.choices[0].message.content.trim()}`)
    
    console.log('\n🎉 AI接口连接测试全部通过！可以正常使用AI评估功能')
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    console.log('请检查API地址、密钥和模型名称是否正确')
  }
}

testAIConnection()
