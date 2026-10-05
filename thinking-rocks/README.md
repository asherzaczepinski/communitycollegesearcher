# Thinking Rocks

An interactive, local Next.js adventure through the math behind AI. Eight chapters cover representation, binary, logic, neurons, gradient descent, embeddings, attention, and next-token prediction. Each has an experiment, expandable math, and a comprehension check. Progress is saved in browser localStorage.

## Run

Requires Node.js 20.9 or later.

```sh
cd thinking-rocks
npm install
npm run dev
```

Open http://localhost:3000. If that port is occupied, run `npm run dev -- --port 3001`.

For a production build: `npm run build`, then `npm start`.

No API keys, accounts, database, or AI service required. After installation, the app runs locally without external assets.

## Teaching approach

The caveman story is a conceptual progression, not a historical chronology. The neuron, training, and probability experiments perform actual calculations. Embedding coordinates are hand-picked. Attention scores are manually controlled to isolate softmax behavior. The language experiment samples one word from its probability distribution, then uses a scripted continuation; it is not a trained language model.

Silicon chips process electrical states using transistors. Rocks are the metaphor for their physical substrate, not literal programmable pebbles. This project does not assert that LLMs are conscious.
