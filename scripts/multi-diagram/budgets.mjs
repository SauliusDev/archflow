export function evaluateBudgets(metrics, budgetDocument) {
  const errors = []
  if (budgetDocument?.immutable !== true) errors.push('budget document must declare immutable=true')
  for (const [metricId, budget] of Object.entries(budgetDocument?.budgets ?? {})) {
    const metric = metrics.find(entry => entry.id === metricId)
    if (!metric) errors.push(`${metricId}: missing metric`)
    else if (metric[budget.statistic] > budget.maximumMs) errors.push(`${metricId}: ${budget.statistic} ${metric[budget.statistic]}ms exceeds ${budget.maximumMs}ms`)
  }
  return errors
}
