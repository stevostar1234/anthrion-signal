import type { Dataset, Signal } from '../../src/types'

export function assessmentFixture(dataset: Dataset): Dataset {
  let count = 0
  return {
    ...dataset,
    signals: dataset.signals.map((signal): Signal => {
      if (
        !signal.countries.includes('GB') ||
        signal.lifecycle_state !== 'OPEN' ||
        signal.exclusion_reasons?.length ||
        count >= 3
      )
        return signal
      count++
      const evidence = { quote: signal.title, source_url: signal.primary_source_url }
      return {
        ...signal,
        ai_status: 'completed',
        ai_model: 'browser-test-fixture',
        fit_score: 94,
        confidence_score: 87.8,
        known_weight: 100,
        recommendation: 'PURSUE',
        score_explanation: 'Requirement coverage (60) + solution route (25) + delivery fit (15).',
        score_components: [
          {
            id: 'capability',
            label: 'Requirement coverage',
            points: 54,
            max_points: 60,
            known_weight: 60,
            explanation: 'Importance-weighted coverage of buyer requirements.',
            evidence: [evidence],
            company_evidence_ids: ['salesforce'],
          },
          {
            id: 'solution_route',
            label: 'Solution route',
            points: 25,
            max_points: 25,
            known_weight: 25,
            explanation: 'An explicit platform implementation route.',
            evidence: [evidence],
            company_evidence_ids: [],
          },
          {
            id: 'delivery',
            label: 'Delivery fit',
            points: 15,
            max_points: 15,
            known_weight: 15,
            explanation: 'Implementation and integration delivery.',
            evidence: [evidence],
            company_evidence_ids: [],
          },
        ],
        analysis: {
          version: '2.0',
          summary: signal.description,
          scope_basis: 'WHOLE_REQUIREMENT',
          assessed_scope: signal.title,
          solution_suggestion:
            'A Salesforce platform with an API integration layer could address the buyer requirements, subject to validating the full specification.',
          solution_evidence: [evidence],
          requirements_completeness: 'SUMMARY',
          requirements: [
            {
              text: signal.title,
              importance: 5,
              category: 'platform',
              capability_id: 'salesforce',
              match_level: 'DIRECT',
              possible_products: ['Salesforce Platform'],
              explanation: 'A configurable platform route to the stated functional requirement.',
              evidence,
            },
          ],
          eligibility_checks: [
            {
              text: 'Confirm supplier eligibility before responding.',
              status: 'CHECK_REQUIRED',
              company_evidence_id: null,
              evidence,
            },
          ],
          risks: [],
          information_gaps: ['Confirm the complete specification and supplier eligibility.'],
        },
      }
    }),
  }
}
