const STEPS = [
  {
    title: 'Observe',
    body: 'The hook sees every swap in beforeSwap / afterSwap on the live pool.',
  },
  {
    title: 'Measure',
    body: 'HELIX measures pool-vs-oracle divergence and an LVR-like toxic-flow signal.',
  },
  {
    title: 'Defend',
    body: 'If a swap looks toxic, HELIX applies a temporary reflex fee for that swap.',
  },
  {
    title: 'Evolve',
    body: 'After an evolution window of swaps, HELIX nudges the baseline fee up or down within bounds.',
  },
  {
    title: 'Remember',
    body: 'Pool Memory records what happened and updates the pool’s defense epoch.',
  },
]

export function LearningLoopExplainer() {
  return (
    <section className="panel learning-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Pool Learning</span>
          <h2>How HELIX learns</h2>
        </div>
      </div>

      <p className="panel-copy">
        HELIX does not classify traders. It lets the pool learn from what the market does
        to it. “Learning” here means updating bounded parameters from real on-chain trading
        history — not machine learning, and not self-modifying code.
      </p>

      <ol className="learning-loop">
        {STEPS.map((step, index) => (
          <li className="learning-step" key={step.title}>
            <span className="learning-index">{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="memory-source">
        Self-evolving means bounded fee-curve adaptation within hard-coded MIN_FEE / MAX_FEE,
        not arbitrary code mutation. Oracle failures cause a safe skip/hold, never an unsafe
        fee change.
      </p>
    </section>
  )
}
