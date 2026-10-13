// Stand-in for LiteLLM: fixed embedding and metadata, and a call counter so
// tests can assert which operations reach the AI gateway.
import http from 'node:http';

let calls = 0;

http
  .createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && req.url === '/calls') {
      res.end(JSON.stringify({ calls }));
      return;
    }
    calls += 1;
    req.resume();
    req.on('end', () => {
      if (req.url.endsWith('/embeddings')) {
        res.end(JSON.stringify({ data: [{ embedding: Array(1536).fill(0.01) }] }));
        return;
      }
      const metadata = { type: 'observation', topics: ['test'], people: [], action_items: [] };
      res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(metadata) } }] }));
    });
  })
  .listen(4000);
