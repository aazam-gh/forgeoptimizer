export async function summarize(document: string) {
  return client.chat.completions.create({ model: 'gpt-4.1', messages: [{ role: 'user', content: 'Summarize this document for a busy operator: ' + document }] });
}
