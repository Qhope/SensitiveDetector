// transformer.js — Pure math: TransformerModel, Tokenizer, ForwardTrace
// No DOM access. Exports via window globals for file:// compatibility.

// ─── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Model Config ─────────────────────────────────────────────────────────────
const CONFIG = {
  d_model: 64,
  n_heads: 4,
  d_k: 16,
  d_v: 16,
  n_layers: 2,
  d_ff: 256,
  max_seq_len: 16,
  vocab_size: 88,
};

// ─── Fixed Vocabulary ─────────────────────────────────────────────────────────
const FIXED_VOCAB = [
  '<pad>', '<sos>', '<eos>', '<unk>',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has',
  'do', 'does', 'will', 'would', 'can', 'could', 'may', 'might', 'shall',
  'should', 'must', 'not', 'no', 'yes', 'i', 'you', 'he', 'she', 'it', 'we',
  'they', 'this', 'that', 'which', 'who', 'what', 'where', 'when', 'how',
  'why', 'all', 'some', 'any', 'each', 'every', 'my', 'your', 'his', 'her',
  'its', 'our', 'their', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
  'from', 'up', 'about', 'into', 'through', 'and', 'or', 'but', 'if',
  'because', 'as', 'until', 'while', 'cat', 'dog', 'sat', 'mat', 'ran',
  'fast', 'slow', 'big', 'small',
];

// ─── Math Primitives ──────────────────────────────────────────────────────────

function matMul(A, B) {
  // A: [m,k] as Array<Float32Array>, B: [k,n]  →  [m,n]
  const m = A.length, k = B.length, n = B[0].length;
  const C = [];
  for (let i = 0; i < m; i++) {
    C[i] = new Float32Array(n);
    for (let l = 0; l < k; l++) {
      const aVal = A[i][l];
      for (let j = 0; j < n; j++) C[i][j] += aVal * B[l][j];
    }
  }
  return C;
}

function addVec(a, b) {
  const c = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) c[i] = a[i] + b[i];
  return c;
}

function softmax(v) {
  let max = v[0];
  for (let i = 1; i < v.length; i++) if (v[i] > max) max = v[i];
  const out = new Float32Array(v.length);
  let sum = 0;
  for (let i = 0; i < v.length; i++) { out[i] = Math.exp(v[i] - max); sum += out[i]; }
  for (let i = 0; i < v.length; i++) out[i] /= sum;
  return out;
}

function layerNorm(x, gamma, beta, eps = 1e-6) {
  const n = x.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (x[i] - mean) ** 2;
  variance /= n;
  const std = Math.sqrt(variance + eps);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = gamma[i] * (x[i] - mean) / std + beta[i];
  return out;
}

function gelu(x) {
  return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
}

function scaledDotProductAttention(Q, K, V, mask) {
  // Q:[seqQ,dk], K:[seqK,dk], V:[seqK,dv], mask:[seqQ][seqK]|null
  const seqQ = Q.length, seqK = K.length, dk = Q[0].length, dv = V[0].length;
  const scale = 1 / Math.sqrt(dk);

  const scores = [];
  for (let i = 0; i < seqQ; i++) {
    scores[i] = new Float32Array(seqK);
    for (let j = 0; j < seqK; j++) {
      let dot = 0;
      for (let d = 0; d < dk; d++) dot += Q[i][d] * K[j][d];
      scores[i][j] = dot * scale;
      if (mask && mask[i][j]) scores[i][j] = -1e9;
    }
  }

  const weights = [];
  for (let i = 0; i < seqQ; i++) weights[i] = softmax(scores[i]);

  const output = [];
  for (let i = 0; i < seqQ; i++) {
    output[i] = new Float32Array(dv);
    for (let j = 0; j < seqK; j++) {
      const w = weights[i][j];
      for (let d = 0; d < dv; d++) output[i][d] += w * V[j][d];
    }
  }

  return { output, weights };
}

function buildCausalMask(seqLen) {
  const mask = [];
  for (let i = 0; i < seqLen; i++) {
    mask[i] = new Array(seqLen);
    for (let j = 0; j < seqLen; j++) mask[i][j] = j > i;
  }
  return mask;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

class Tokenizer {
  constructor() {
    this.id2word = [...FIXED_VOCAB];
    this.word2id = {};
    FIXED_VOCAB.forEach((w, i) => { this.word2id[w] = i; });
  }

  encode(sentence) {
    return sentence
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, CONFIG.max_seq_len - 2)
      .map(w => (this.word2id[w] !== undefined ? this.word2id[w] : this.word2id['<unk>']));
  }

  decode(ids) {
    return ids.map(id => this.id2word[id] || '<unk>').join(' ');
  }

  getUnknownWords(sentence) {
    return sentence
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(w => w && this.word2id[w] === undefined);
  }
}

// ─── Weight Helpers ───────────────────────────────────────────────────────────

function initMatrix(rows, cols, rng, scale) {
  const M = [];
  for (let i = 0; i < rows; i++) {
    M[i] = new Float32Array(cols);
    for (let j = 0; j < cols; j++) M[i][j] = (rng() * 2 - 1) * scale;
  }
  return M;
}

function initVec(len, val) {
  const v = new Float32Array(len);
  v.fill(val);
  return v;
}

// ─── TransformerModel ─────────────────────────────────────────────────────────

class TransformerModel {
  constructor() {
    const rng = mulberry32(42);
    const { d_model, n_heads, d_k, d_v, n_layers, d_ff, vocab_size, max_seq_len } = CONFIG;
    const eS = Math.sqrt(2 / d_model);
    const fS = Math.sqrt(2 / d_ff);

    // Shared embedding matrix [vocab, d_model]
    this.embedWeight = initMatrix(vocab_size, d_model, rng, eS);

    // Sinusoidal positional encoding (deterministic, not random)
    this.posEncoding = [];
    for (let pos = 0; pos < max_seq_len; pos++) {
      this.posEncoding[pos] = new Float32Array(d_model);
      for (let i = 0; i < d_model; i += 2) {
        const angle = pos / Math.pow(10000, i / d_model);
        this.posEncoding[pos][i]     = Math.sin(angle);
        if (i + 1 < d_model) this.posEncoding[pos][i + 1] = Math.cos(angle);
      }
    }

    const makeHeads = () => {
      const h = { Wq: [], Wk: [], Wv: [] };
      for (let i = 0; i < n_heads; i++) {
        h.Wq[i] = initMatrix(d_model, d_k, rng, eS);
        h.Wk[i] = initMatrix(d_model, d_k, rng, eS);
        h.Wv[i] = initMatrix(d_model, d_v, rng, eS);
      }
      h.Wo = initMatrix(n_heads * d_v, d_model, rng, eS);
      return h;
    };

    const makeFFN = () => ({
      W1: initMatrix(d_model, d_ff, rng, eS),
      b1: initVec(d_ff, 0),
      W2: initMatrix(d_ff, d_model, rng, fS),
      b2: initVec(d_model, 0),
    });

    const makeNorm = () => ({ gamma: initVec(d_model, 1), beta: initVec(d_model, 0) });

    // Encoder layers
    this.encoderLayers = [];
    for (let l = 0; l < n_layers; l++) {
      this.encoderLayers[l] = { mha: makeHeads(), norm1: makeNorm(), norm2: makeNorm(), ffn: makeFFN() };
    }

    // Decoder layers
    this.decoderLayers = [];
    for (let l = 0; l < n_layers; l++) {
      this.decoderLayers[l] = {
        maskedMha: makeHeads(),
        crossMha:  makeHeads(),
        norm1: makeNorm(), norm2: makeNorm(), norm3: makeNorm(),
        ffn: makeFFN(),
      };
    }

    // Output projection [d_model, vocab_size]
    this.outputProjection = initMatrix(d_model, vocab_size, rng, eS);
  }

  _embed(ids) {
    const scale = Math.sqrt(CONFIG.d_model);
    return ids.map(id => {
      const row = new Float32Array(CONFIG.d_model);
      for (let d = 0; d < CONFIG.d_model; d++) row[d] = this.embedWeight[id][d] * scale;
      return row;
    });
  }

  _addPosEnc(embeddings) {
    return embeddings.map((emb, pos) => addVec(emb, this.posEncoding[pos]));
  }

  _multiHeadAttention(Q_in, K_in, V_in, W, mask) {
    const { n_heads, d_v } = CONFIG;
    const seqQ = Q_in.length;
    const concat = Q_in.map(() => new Float32Array(n_heads * d_v));
    const heads = [];

    for (let h = 0; h < n_heads; h++) {
      const Q = matMul(Q_in, W.Wq[h]);
      const K = matMul(K_in, W.Wk[h]);
      const V = matMul(V_in, W.Wv[h]);
      const { output, weights } = scaledDotProductAttention(Q, K, V, mask);
      heads.push({ Q, K, V, weights, output });
      for (let i = 0; i < seqQ; i++)
        for (let d = 0; d < d_v; d++) concat[i][h * d_v + d] = output[i][d];
    }

    const projected = matMul(concat, W.Wo);
    return { heads, concat, projected };
  }

  _ffn(x, W) {
    const { d_ff, d_model } = CONFIG;
    const hidden = matMul(x, W.W1).map(row => {
      const h = new Float32Array(d_ff);
      for (let d = 0; d < d_ff; d++) h[d] = gelu(row[d] + W.b1[d]);
      return h;
    });
    const output = matMul(hidden, W.W2).map(row => {
      const o = new Float32Array(d_model);
      for (let d = 0; d < d_model; d++) o[d] = row[d] + W.b2[d];
      return o;
    });
    return { hidden, output };
  }

  forward(inputIds, targetIds) {
    const { n_layers } = CONFIG;
    const trace = { enc: { layers: [] }, dec: { layers: [] }, output: {} };

    // ── Encoder ──────────────────────────────────────────────────────────────
    trace.enc.inputIds   = inputIds;
    trace.enc.embeddings = this._embed(inputIds);
    trace.enc.withPosEnc = this._addPosEnc(trace.enc.embeddings);

    let encX = trace.enc.withPosEnc;
    for (let l = 0; l < n_layers; l++) {
      const L = this.encoderLayers[l], lt = {};

      lt.mha = this._multiHeadAttention(encX, encX, encX, L.mha, null);
      const postMha = encX.map((row, i) => addVec(row, lt.mha.projected[i]));
      lt.afterMhaNorm = postMha.map(r => layerNorm(r, L.norm1.gamma, L.norm1.beta));

      lt.ffn = this._ffn(lt.afterMhaNorm, L.ffn);
      const postFfn = lt.afterMhaNorm.map((row, i) => addVec(row, lt.ffn.output[i]));
      lt.afterFfnNorm = postFfn.map(r => layerNorm(r, L.norm2.gamma, L.norm2.beta));

      trace.enc.layers.push(lt);
      encX = lt.afterFfnNorm;
    }
    trace.enc.output = encX;

    // ── Decoder ──────────────────────────────────────────────────────────────
    trace.dec.inputIds   = targetIds;
    trace.dec.embeddings = this._embed(targetIds);
    trace.dec.withPosEnc = this._addPosEnc(trace.dec.embeddings);

    let decX = trace.dec.withPosEnc;
    for (let l = 0; l < n_layers; l++) {
      const L = this.decoderLayers[l], lt = {};
      const causalMask = buildCausalMask(targetIds.length);

      lt.maskedMha = this._multiHeadAttention(decX, decX, decX, L.maskedMha, causalMask);
      const postMM = decX.map((row, i) => addVec(row, lt.maskedMha.projected[i]));
      lt.afterMaskedNorm = postMM.map(r => layerNorm(r, L.norm1.gamma, L.norm1.beta));

      lt.crossMha = this._multiHeadAttention(lt.afterMaskedNorm, trace.enc.output, trace.enc.output, L.crossMha, null);
      const postCM = lt.afterMaskedNorm.map((row, i) => addVec(row, lt.crossMha.projected[i]));
      lt.afterCrossNorm = postCM.map(r => layerNorm(r, L.norm2.gamma, L.norm2.beta));

      lt.ffn = this._ffn(lt.afterCrossNorm, L.ffn);
      const postFfn = lt.afterCrossNorm.map((row, i) => addVec(row, lt.ffn.output[i]));
      lt.afterFfnNorm = postFfn.map(r => layerNorm(r, L.norm3.gamma, L.norm3.beta));

      trace.dec.layers.push(lt);
      decX = lt.afterFfnNorm;
    }

    // ── Output projection + softmax ───────────────────────────────────────────
    trace.output.logits = matMul(decX, this.outputProjection);
    trace.output.probs  = trace.output.logits.map(row => softmax(row));

    return trace;
  }
}

// ─── Globals ──────────────────────────────────────────────────────────────────
window.TransformerModel  = TransformerModel;
window.Tokenizer         = Tokenizer;
window.TRANSFORMER_CONFIG = CONFIG;
window.TRANSFORMER_VOCAB  = FIXED_VOCAB;
