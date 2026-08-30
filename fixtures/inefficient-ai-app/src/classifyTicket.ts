import OpenAI from 'openai';
const client = new OpenAI();
export async function classifyTicket(text: string) {
  return client.chat.completions.create({ model: 'gpt-4.1', messages: [{ role: 'user', content: 'Choose one: billing, technical, account, other\n' + text }] });
}
