// src/recommendation/types.ts

export type AgentInput = {
  sala: any
  user: {
    especialidadeId?: number
  }
  stats?: any
}

export type AgentOutput = {
  score: number
  reason?: string
}

export interface ScoreAgent {
  name: string
  score(input: AgentInput): AgentOutput
}

export type FunnelInput = {
  salas: any[]
  user: {
    especialidadeId?: number
  }
  statsMap: Map<string, any>
  preScores: Record<string, number>
}

export class SpecialtyAgent implements ScoreAgent {
  name = "Especialidade"

  score({ sala, user }: AgentInput) {
    if (sala.especialidadeId === user.especialidadeId) {
      return { score: 25, reason: "Compatível com sua especialidade" }
    }
    return { score: 0 }
  }
}

export class UsageAgent implements ScoreAgent {
  name = "Uso"

  score({ stats }: AgentInput) {
    if (!stats?.avgUsageRate || isNaN(stats.avgUsageRate)) {
      return { score: 0 }
    }

    return {
      score: Math.min(20, stats.avgUsageRate * 20),
      reason: "Boa taxa de uso real"
    }
  }
}

export class ReliabilityAgent implements ScoreAgent {
  name = "Confiabilidade"

  score({ stats }: AgentInput) {
    if (!stats) return { score: 0 }

    if (stats.totalCanceled === 0) {
      return { score: 10, reason: "Sem histórico de cancelamentos" }
    }

    return {
      score: Math.max(0, 10 - stats.totalCanceled)
    }
  }
}

export class ScoreFunnel {
  constructor(private agents: ScoreAgent[]) {}

  run({ salas, user, statsMap, preScores }: FunnelInput) {
    return salas
      .map(sala => {
        let totalScore = 0
        const reasons: string[] = []

        const baseScore = preScores[sala.ID_Ambiente] ?? 0
        if (baseScore > 0) {
          totalScore += baseScore
          reasons.push(`Usada recentemente pelo medico (+${baseScore})`)
        }

        for (const agent of this.agents) {
          const result = agent.score({
            sala,
            user,
            stats: statsMap.get(sala.ID_Ambiente),
          })

          if (result.score > 0) {
            totalScore += result.score
            if (result.reason) reasons.push(result.reason)
          }
        }

        return {
          sala,
          score: totalScore,
          reasons,
        }
      })
      .sort((a, b) => b.score - a.score)
  }
}