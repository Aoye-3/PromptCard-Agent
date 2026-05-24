const API_BASE = process.env.VITE_API_PROXY_TARGET || 'https://ark.cn-beijing.volces.com/api/coding/v3'
const API_KEY = process.env.VITE_DEFAULT_AI_API_KEY
const MODEL_NAME = process.env.VITE_DEFAULT_AI_MODEL || 'deepseek-v3.2'

async function testAIConnection() {
  if (!API_KEY) {
    console.error('Missing VITE_DEFAULT_AI_API_KEY. Set it in your local environment before running this script.')
    process.exitCode = 1
    return
  }

  console.log('Testing AI API connection...')
  console.log(`API base: ${API_BASE}`)
  console.log(`Model: ${MODEL_NAME}`)

  try {
    console.log('\n1. Testing model list endpoint...')
    const modelsResponse = await fetch(`${API_BASE}/models`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`
      }
    })

    if (!modelsResponse.ok) {
      throw new Error(`Model endpoint failed: ${modelsResponse.status} ${modelsResponse.statusText}`)
    }

    const modelsData = await modelsResponse.json()
    console.log('Model endpoint succeeded')
    console.log(`Available models: ${modelsData.data?.length || 0}`)

    console.log('\n2. Testing chat completions endpoint...')
    const chatResponse = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        temperature: 0.3,
        max_tokens: 100,
        messages: [
          { role: 'user', content: 'Return one short sentence to confirm the connection.' }
        ]
      })
    })

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text()
      throw new Error(`Chat endpoint failed: ${chatResponse.status} ${chatResponse.statusText}\n${errorText}`)
    }

    const chatData = await chatResponse.json()
    console.log('Chat endpoint succeeded')
    console.log(`Response: ${chatData.choices[0].message.content.trim()}`)
  } catch (error) {
    console.error('\nAI connection test failed:', error.message)
    process.exitCode = 1
  }
}

testAIConnection()
