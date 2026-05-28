const DEEPSEEK_API = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_KEY = 'sk-8e08753b28ca4b6aa45b34403a41a692';

async function test() {
  try {
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + DEEPSEEK_KEY
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Responde solo: Hola, ¿cómo estás?' }],
        max_tokens: 30
      })
    });
    const data = await res.json();
    console.log('✅ Respuesta:', data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

test();