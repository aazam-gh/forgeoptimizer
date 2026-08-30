export async function normalizeOrder(order: unknown) {
  return client.responses.create({ model: 'gpt-4.1', input: 'Convert this order to JSON: ' + JSON.stringify(order) });
}
