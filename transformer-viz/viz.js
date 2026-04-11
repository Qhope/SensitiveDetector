// viz.js — VizController: STEPS, D3 heatmaps, token animation, highlight logic
// Reads window.TransformerModel, window.Tokenizer (set by transformer.js)

// ─── Step Definitions ────────────────────────────────────────────────────────
const STEPS = [
  {
    id: 'input',
    title: '1 · Tokenization',
    description: 'The input sentence is split into words. Each word is mapped to an integer ID from the 88-word vocabulary. Unknown words become &lt;unk&gt; (ID 3).',
    formula: 'tokens = sentence.lower().split()\nids    = [vocab[t] for t in tokens]',
    highlight: ['enc-embed-box'],
    showHeatmap: false,
  },
  {
    id: 'enc-embed',
    title: '2 · Input Embedding + Positional Encoding',
    description: 'Each token ID is looked up in the embedding matrix (d_model=64). A sinusoidal positional encoding is added elementwise so the model knows the order of tokens.',
    formula: 'x  = EmbedMatrix[id] · √d_model\nx += PE(pos)\nPE(pos,2i)   = sin(pos / 10000^(2i/d))\nPE(pos,2i+1) = cos(pos / 10000^(2i/d))',
    highlight: ['enc-embed-box'],
    showHeatmap: true,
    heatmapTarget: 'enc-embed',
    traceKey: 'enc.withPosEnc',
  },
  {
    id: 'enc-mha-0',
    title: '3 · Encoder Self-Attention (Layer 1)',
    description: 'Each token attends to every other encoder token. For each head, Q/K/V are projected (d_k=16). Attention weights = softmax(QKᵀ / √d_k). Four heads run in parallel then concatenated.',
    formula: 'Q = X·Wq,  K = X·Wk,  V = X·Wv\nAttn = softmax(Q·Kᵀ / √d_k) · V\nout  = Concat(head₁…h₄) · Wₒ',
    highlight: ['enc-mha-0', 'enc-addnorm-mha-0'],
    showHeatmap: true,
    heatmapTarget: 'mha',
    layerIndex: 0,
    traceKey: 'enc.layers.0.mha',
    isEncoder: true,
  },
  {
    id: 'enc-ffn-0',
    title: '4 · Encoder Feed-Forward Network (Layer 1)',
    description: 'Each position is processed independently by a 2-layer MLP with GELU activation. The hidden dimension expands 4× to 256 then projects back to d_model=64. Residual + LayerNorm applied after.',
    formula: 'FFN(x) = GELU(x·W₁ + b₁) · W₂ + b₂\nd_ff = 256  →  project back to 64',
    highlight: ['enc-ffn-0', 'enc-addnorm-ffn-0'],
    showHeatmap: false,
  },
  {
    id: 'enc-layer-1',
    title: '5 · Encoder Layer 2 (Self-Attention + FFN)',
    description: 'The second encoder layer repeats the same operations, building deeper contextual representations. Each sub-layer wraps its output: out = LayerNorm(x + Sublayer(x)).',
    formula: 'y = LayerNorm(x + SelfAttn(x))\nz = LayerNorm(y + FFN(y))\n(×2 layers total)',
    highlight: ['enc-mha-1', 'enc-addnorm-mha-1', 'enc-ffn-1', 'enc-addnorm-ffn-1'],
    showHeatmap: true,
    heatmapTarget: 'mha',
    layerIndex: 1,
    traceKey: 'enc.layers.1.mha',
    isEncoder: true,
  },
  {
    id: 'dec-embed',
    title: '6 · Decoder Input Embedding + Positional Encoding',
    description: 'The decoder receives the target sequence shifted right (starting with &lt;sos&gt;). The same embedding table and sinusoidal positional encoding are used.',
    formula: 'y  = EmbedMatrix[tgt_id] · √d_model\ny += PE(pos)',
    highlight: ['dec-embed-box'],
    showHeatmap: false,
  },
  {
    id: 'dec-masked-mha-0',
    title: '7 · Decoder Masked Self-Attention (Layer 1)',
    description: 'The decoder attends only to previous output tokens. A causal (lower-triangular) mask sets future positions to −∞ before softmax, so each position only sees what came before it.',
    formula: 'mask[i,j] = −∞  if j > i,  else 0\nAttn = softmax((Q·Kᵀ + mask) / √d_k) · V',
    highlight: ['dec-masked-mha-0', 'dec-addnorm-mmha-0'],
    showHeatmap: true,
    heatmapTarget: 'masked-mha',
    layerIndex: 0,
    traceKey: 'dec.layers.0.maskedMha',
    isEncoder: false,
  },
  {
    id: 'dec-cross-mha-0',
    title: '8 · Decoder Cross-Attention (Layer 1)',
    description: 'Q comes from the decoder, K and V come from the encoder output. This is how the decoder "reads" the encoded source — each decoder position can attend to all encoder positions.',
    formula: 'Q = DecX·Wq\nK = EncOut·Wk,  V = EncOut·Wv\nAttn = softmax(Q·Kᵀ / √d_k) · V',
    highlight: ['dec-cross-mha-0', 'dec-addnorm-cmha-0', 'cross-arrow-0', 'cross-arrow-1'],
    showHeatmap: true,
    heatmapTarget: 'cross-mha',
    layerIndex: 0,
    traceKey: 'dec.layers.0.crossMha',
    isEncoder: false,
  },
  {
    id: 'dec-layer-1',
    title: '9 · Decoder Layer 2 (Masked Attn + Cross-Attn + FFN)',
    description: 'Layer 2 repeats the same three sub-layers: masked self-attention, cross-attention (again reading from encoder), and FFN. Richer representations are built.',
    formula: 'a = LayerNorm(x + MaskedAttn(x))\nb = LayerNorm(a + CrossAttn(a, enc))\nz = LayerNorm(b + FFN(b))',
    highlight: ['dec-masked-mha-1', 'dec-addnorm-mmha-1', 'dec-cross-mha-1', 'dec-addnorm-cmha-1', 'dec-ffn-1', 'dec-addnorm-ffn-1'],
    showHeatmap: true,
    heatmapTarget: 'cross-mha',
    layerIndex: 1,
    traceKey: 'dec.layers.1.crossMha',
    isEncoder: false,
  },
  {
    id: 'output-proj',
    title: '10 · Linear Projection + Softmax',
    description: 'The final decoder representation is projected from d_model=64 to vocab_size=88 via a linear layer. Softmax converts logits to a probability distribution over the vocabulary for each output position.',
    formula: 'logits = DecOut · W_out   [seq × 88]\nprobs  = softmax(logits,  dim=−1)',
    highlight: ['linear-softmax-box'],
    showHeatmap: true,
    heatmapTarget: 'output-probs',
    traceKey: 'output.probs',
  },
  {
    id: 'summary',
    title: '11 · Summary: Full Forward Pass Complete',
    description: 'All layers have run. Each decoder position has a probability distribution over the vocabulary. In autoregressive decoding the model picks the next token (argmax or beam search) and feeds it back in.',
    formula: 'next_token = argmax(probs[−1])\n\nEncoder:  embed → 2×(SelfAttn+FFN)\nDecoder:  embed → 2×(MskAttn+CrossAttn+FFN)\n          → Linear+Softmax',
    highlight: [],
    showHeatmap: false,
    highlightAll: true,
  },
];

// ─── Utility: resolve 'enc.layers.0.mha' → trace.enc.layers[0].mha ────────────
function resolvePath(obj, path) {
  return path.split('.').reduce((o, key) => {
    if (o == null) return undefined;
    const n = Number(key);
    return Number.isInteger(n) ? o[n] : o[key];
  }, obj);
}

// ─── VizController ────────────────────────────────────────────────────────────
class VizController {
  constructor() {
    this.tokenizer = new window.Tokenizer();
    this.model     = new window.TransformerModel();
    this.trace     = null;
    this.currentStep = 0;
    this.currentHead = 0;
    this.isAnimating = false;
    this.srcTokens   = [];
    this.tgtTokens   = [];
    this.tokenDots   = [];
    this.boxCenters  = {};

    this._bindDOM();
    // Compute box centers after a brief paint so getBBox() has layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this._computeBoxCenters());
    });
  }

  // ── DOM Binding ──────────────────────────────────────────────────────────────
  _bindDOM() {
    this.runBtn       = document.getElementById('run-btn');
    this.prevBtn      = document.getElementById('prev-btn');
    this.nextBtn      = document.getElementById('next-btn');
    this.stepCounter  = document.getElementById('step-counter');
    this.inputEl      = document.getElementById('sentence-input');
    this.stepTitle    = document.getElementById('step-title');
    this.stepDesc     = document.getElementById('step-description');
    this.stepFormula  = document.getElementById('step-formula');
    this.heatmapArea  = document.getElementById('heatmap-area');
    this.attnContainer = document.getElementById('attn-container');
    this.qkvArea      = document.getElementById('qkv-area');
    this.qContainer   = document.getElementById('q-container');
    this.kContainer   = document.getElementById('k-container');
    this.vContainer   = document.getElementById('v-container');
    this.tokenDisplay = document.getElementById('token-display');
    this.archSvg      = document.getElementById('arch-svg');
    this.overlay      = document.getElementById('token-overlay');
    this.headBtns     = Array.from(document.querySelectorAll('.head-btn'));

    this.runBtn.addEventListener('click', () => this._onRun());
    this.prevBtn.addEventListener('click', () => this._onPrev());
    this.nextBtn.addEventListener('click', () => this._onNext());
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this._onRun();
    });
    this.headBtns.forEach((btn, h) => btn.addEventListener('click', () => this._onHeadSelect(h)));

    // ── Touch swipe on explanation panel to navigate steps (mobile) ────────────
    // Use the sidebar (not the arch-container, which has its own horizontal scroll)
    const swipeZone = document.getElementById('explanation-panel');
    let _touchX = 0;
    swipeZone.addEventListener('touchstart', e => {
      _touchX = e.touches[0].clientX;
    }, { passive: true });
    swipeZone.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - _touchX;
      if (Math.abs(dx) > 40) {
        dx < 0 ? this._onNext() : this._onPrev();
      }
    }, { passive: true });
  }

  _computeBoxCenters() {
    this.archSvg.querySelectorAll('.arch-box, .cross-arrow').forEach(el => {
      if (!el.id) return;
      try {
        const b = el.getBBox();
        this.boxCenters[el.id] = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      } catch (_) {}
    });
  }

  // ── Event Handlers ────────────────────────────────────────────────────────────
  _onRun() {
    const sentence = this.inputEl.value.trim();
    if (!sentence) return;

    const unknowns  = this.tokenizer.getUnknownWords(sentence);
    const inputIds  = this.tokenizer.encode(sentence);

    if (inputIds.length === 0) {
      this.stepDesc.textContent = 'No recognizable words. Try: "the cat sat on the mat"';
      return;
    }

    const SOS_ID   = 1;
    const targetIds = [SOS_ID, ...inputIds.slice(0, 14)];

    this.srcTokens = inputIds.map(id => window.TRANSFORMER_VOCAB[id]);
    this.tgtTokens = targetIds.map(id => window.TRANSFORMER_VOCAB[id]);

    const warn = document.getElementById('unk-warning');
    if (unknowns.length > 0) {
      warn.textContent = `Mapped to <unk>: ${unknowns.join(', ')}`;
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }

    this.trace = this.model.forward(inputIds, targetIds);
    this.currentStep = 0;
    this._renderStep(0);
    this._createTokenDots();
  }

  _onPrev() {
    if (this.isAnimating || this.currentStep === 0) return;
    this.currentStep--;
    this._renderStep(this.currentStep);
  }

  _onNext() {
    if (this.isAnimating || this.currentStep >= STEPS.length - 1) return;
    this.currentStep++;
    this._renderStep(this.currentStep);
  }

  _onHeadSelect(h) {
    this.currentHead = h;
    this.headBtns.forEach((btn, i) => btn.classList.toggle('active', i === h));
    if (this.trace) this._updateHeatmaps(this.currentStep);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────────
  _renderStep(idx) {
    this.isAnimating = true;
    this._setButtonsDisabled(true);

    const step = STEPS[idx];
    this.stepTitle.textContent  = step.title;
    this.stepDesc.innerHTML     = step.description;
    this.stepFormula.textContent = step.formula;
    this.stepCounter.textContent = `Step ${idx + 1} / ${STEPS.length}`;

    if (idx === 0 && this.trace) this._renderTokenDisplay();

    this._updateArchHighlight(idx);
    this._updateHeatmaps(idx);
    this._moveDotsToStep(idx);

    setTimeout(() => {
      this.isAnimating = false;
      this._setButtonsDisabled(false);
    }, 450);
  }

  _setButtonsDisabled(d) {
    this.prevBtn.disabled = d || this.currentStep === 0;
    this.nextBtn.disabled = d || this.currentStep >= STEPS.length - 1;
  }

  _renderTokenDisplay() {
    const src = this.srcTokens.map((t, i) =>
      `<span class="token src-token">${t}<sub>${this.trace.enc.inputIds[i]}</sub></span>`
    ).join('');
    const tgt = this.tgtTokens.map((t, i) =>
      `<span class="token tgt-token">${t}<sub>${this.trace.dec.inputIds[i]}</sub></span>`
    ).join('');
    this.tokenDisplay.innerHTML =
      `<div class="token-row"><span class="token-label">Encoder input:</span>${src}</div>` +
      `<div class="token-row"><span class="token-label">Decoder input:</span>${tgt}</div>`;
    this.tokenDisplay.style.display = 'block';
  }

  // ── SVG Highlight ─────────────────────────────────────────────────────────────
  _updateArchHighlight(idx) {
    const step = STEPS[idx];
    this.archSvg.querySelectorAll('.arch-box, .cross-arrow').forEach(el => {
      el.classList.remove('active', 'dimmed');
    });

    if (step.highlightAll) {
      this.archSvg.querySelectorAll('.arch-box').forEach(el => el.classList.add('active'));
      return;
    }

    const active = new Set(step.highlight);
    this.archSvg.querySelectorAll('.arch-box, .cross-arrow').forEach(el => {
      if (active.has(el.id)) {
        el.classList.add('active');
      } else if (active.size > 0) {
        el.classList.add('dimmed');
      }
    });
  }

  // ── Heatmaps ──────────────────────────────────────────────────────────────────
  _updateHeatmaps(idx) {
    if (!this.trace) return;
    const step = STEPS[idx];

    if (!step.showHeatmap) {
      this.heatmapArea.classList.remove('visible');
      return;
    }
    this.heatmapArea.classList.add('visible');
    this.qkvArea.style.display = 'none';

    const t = step.heatmapTarget;

    if (t === 'enc-embed') {
      const mat = this.trace.enc.withPosEnc.map(r => Array.from(r));
      this._renderD3Heatmap(this.attnContainer, mat, {
        title: 'Embeddings + Positional Encoding  [tokens × d_model]',
        yLabels: this.srcTokens,
        colorScheme: 'diverging',
      });

    } else if (t === 'mha' || t === 'masked-mha' || t === 'cross-mha') {
      const mhaTrace = resolvePath(this.trace, step.traceKey);
      if (!mhaTrace || !mhaTrace.heads) return;

      const h        = this.currentHead;
      const head     = mhaTrace.heads[h];
      const wMat     = head.weights.map(r => Array.from(r));
      const isCross  = t === 'cross-mha';
      const yLabs    = step.isEncoder ? this.srcTokens : this.tgtTokens;
      const xLabs    = isCross ? this.srcTokens : yLabs;

      this._renderD3Heatmap(this.attnContainer, wMat, {
        title: `Attention Weights  [${t === 'masked-mha' ? 'causal ' : ''}head ${h}]`,
        yLabels: yLabs,
        xLabels: xLabs,
        colorScheme: 'sequential',
      });

      this.qkvArea.style.display = 'flex';
      this._renderD3Heatmap(this.qContainer, head.Q.map(r => Array.from(r)), { title: 'Q  [tokens × d_k]', yLabels: yLabs, colorScheme: 'diverging', cellSize: 5 });
      this._renderD3Heatmap(this.kContainer, head.K.map(r => Array.from(r)), { title: 'K  [tokens × d_k]', yLabels: xLabs, colorScheme: 'diverging', cellSize: 5 });
      this._renderD3Heatmap(this.vContainer, head.V.map(r => Array.from(r)), { title: 'V  [tokens × d_v]', yLabels: xLabs, colorScheme: 'diverging', cellSize: 5 });

    } else if (t === 'output-probs') {
      // Show top-12 vocab tokens for the last decoder position
      const probs = this.trace.output.probs;
      const lastRow = Array.from(probs[probs.length - 1]);
      const top = lastRow.map((p, i) => ({ p, i }))
                         .sort((a, b) => b.p - a.p)
                         .slice(0, 12);
      const mat    = [top.map(x => x.p)];
      const xLabs  = top.map(x => window.TRANSFORMER_VOCAB[x.i]);
      this._renderD3Heatmap(this.attnContainer, mat, {
        title: 'Output Probabilities  [top-12 tokens, last decoder pos]',
        xLabels: xLabs,
        colorScheme: 'sequential',
      });
    }
  }

  // ── D3 Heatmap Renderer ───────────────────────────────────────────────────────
  _renderD3Heatmap(container, matrix, opts = {}) {
    if (!window.d3 || !matrix || !matrix.length) return;
    const { title = '', xLabels = [], yLabels = [], colorScheme = 'sequential', cellSize: cs } = opts;

    container.innerHTML = '';

    const rows = matrix.length;
    const cols = matrix[0].length;
    const cellSize = cs || Math.min(34, Math.max(7, Math.floor(240 / Math.max(rows, cols))));
    const margin = {
      top:    title   ? 22 : 6,
      right:  8,
      bottom: xLabels.length ? 56 : 12,
      left:   yLabels.length ? 54 : 10,
    };
    const W = cols * cellSize + margin.left + margin.right;
    const H = rows * cellSize + margin.top  + margin.bottom;

    const svg = d3.select(container).append('svg').attr('width', W).attr('height', H);

    if (title) {
      svg.append('text')
        .attr('x', W / 2).attr('y', 14)
        .attr('text-anchor', 'middle')
        .attr('font-size', 10).attr('fill', '#94a3b8').attr('font-family', 'monospace')
        .text(title);
    }

    const flat = matrix.flat();
    const [minV, maxV] = d3.extent(flat);
    let colorFn;
    if (colorScheme === 'diverging') {
      const abs = Math.max(Math.abs(minV), Math.abs(maxV)) || 1;
      colorFn = d3.scaleDiverging([-abs, 0, abs]).interpolator(d3.interpolateRdBu);
    } else {
      colorFn = d3.scaleSequential([minV === maxV ? minV - 1 : minV, maxV])
                   .interpolator(d3.interpolateYlOrRd);
    }

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    matrix.forEach((row, i) => {
      row.forEach((val, j) => {
        const cell = g.append('rect')
          .attr('x', j * cellSize).attr('y', i * cellSize)
          .attr('width', cellSize - 1).attr('height', cellSize - 1)
          .attr('fill', colorFn(val))
          .attr('rx', 1);
        cell.append('title').text(`[${yLabels[i] !== undefined ? yLabels[i] : i}, ${xLabels[j] !== undefined ? xLabels[j] : j}]: ${val.toFixed(4)}`);
      });
    });

    // X-axis labels
    if (xLabels.length) {
      g.selectAll('.xlbl').data(xLabels).enter()
        .append('text').attr('class', 'xlbl')
        .attr('x', (d, i) => i * cellSize + cellSize / 2)
        .attr('y', rows * cellSize + 10)
        .attr('transform', (d, i) => `rotate(45,${i * cellSize + cellSize / 2},${rows * cellSize + 10})`)
        .attr('text-anchor', 'start')
        .attr('font-size', Math.min(9, cellSize))
        .attr('fill', '#94a3b8')
        .text(d => (d + '').length > 7 ? (d + '').slice(0, 7) + '…' : d);
    }

    // Y-axis labels
    if (yLabels.length) {
      g.selectAll('.ylbl').data(yLabels).enter()
        .append('text').attr('class', 'ylbl')
        .attr('x', -4).attr('y', (d, i) => i * cellSize + cellSize / 2 + 3)
        .attr('text-anchor', 'end')
        .attr('font-size', Math.min(9, cellSize))
        .attr('fill', '#94a3b8')
        .text(d => (d + '').length > 7 ? (d + '').slice(0, 7) + '…' : d);
    }
  }

  // ── Token Dots ────────────────────────────────────────────────────────────────
  _createTokenDots() {
    this.overlay.innerHTML = '';
    this.tokenDots = [];

    const colors = ['#f97316','#fb923c','#fdba74','#fcd34d','#a3e635','#34d399','#38bdf8','#818cf8'];
    const n = Math.min(this.srcTokens.length, 8);

    for (let i = 0; i < n; i++) {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('token-dot');

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '7');
      circle.setAttribute('fill', colors[i]);
      circle.setAttribute('opacity', '0.92');

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('font-size', '6');
      label.setAttribute('fill', '#0f172a');
      label.setAttribute('font-weight', '700');
      label.setAttribute('pointer-events', 'none');
      const word = this.srcTokens[i] || '';
      label.textContent = word.length > 4 ? word.slice(0, 3) + '.' : word;

      g.appendChild(circle);
      g.appendChild(label);
      this.overlay.appendChild(g);
      this.tokenDots.push(g);
    }

    this._moveDotsToStep(this.currentStep);
  }

  _moveDotsToStep(idx) {
    if (!this.tokenDots.length) return;
    const step = STEPS[idx];

    if (step.highlightAll || !step.highlight.length) {
      this.tokenDots.forEach(d => d.setAttribute('opacity', '0'));
      return;
    }

    const primaryId = step.highlight[0];
    const center = this.boxCenters[primaryId];
    if (!center) {
      // Retry once after layout settles
      requestAnimationFrame(() => {
        this._computeBoxCenters();
        this._moveDotsToStep(idx);
      });
      return;
    }

    const n = this.tokenDots.length;
    this.tokenDots.forEach((dot, i) => {
      dot.setAttribute('opacity', '1');
      const spread = Math.min(n * 13, 90);
      const ox = (i - (n - 1) / 2) * (n > 1 ? spread / (n - 1) : 0);
      const oy = (i % 2) * 7 - 3;
      dot.setAttribute('transform', `translate(${center.x + ox}, ${center.y + oy})`);
    });
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window._viz = new VizController();
});
