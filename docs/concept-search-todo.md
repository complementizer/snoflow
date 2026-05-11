# Concept-search support for new entity spans

When a user creates a new entity by selecting untagged text, the resulting
`LinkedEntity` has `candidates: []`. The MentionPanel offers a "Fetch SNOMED
candidates" button when the active resolver advertises
`capabilities.supportsConceptSearch === true`. The button calls
`resolver.searchConcepts(mention, topK)` via the `onFetchCandidates` prop in
`App.tsx` and replaces the entity's `candidates` array with the result.

## Status by resolver

### Snowstorm — DONE
`SnowstormResolver.searchConcepts` already calls
`SnowstormClient.searchDescriptions(term, { limit })`, which is the same path
used by `extractAndLink`. The capability flag is `true`. No further work.

### Custom backend — TODO
`CustomBackendResolver.searchConcepts` returns `[]` and
`supportsConceptSearch` is `false`. To enable:

1. **Backend** — add an endpoint, e.g. `POST /api/v1/search` accepting
   `{ term: string, top_k: number }` and returning `{ candidates: ApiCandidate[] }`
   in the same shape that `/api/v1/extract` already produces per entity. The
   backend should run the same embedding/similarity pipeline as `extract` but
   skip span detection.
2. **Resolver** — flip `supportsConceptSearch: true` and implement
   `searchConcepts` to POST to that endpoint and `mapCandidate(...)` the
   results. See `extractAndLink` in
   `src/resolvers/customBackendResolver.ts` for the existing payload mapping.
3. **Threshold/topK** — match how `extractAndLink` applies the threshold
   client-side so behavior is consistent.

### LLM-only — TODO (with caveats)
`LLMOnlyResolver.searchConcepts` returns `[]` and
`supportsConceptSearch` is `false`. The LLM can be prompted to suggest
SNOMED concept IDs for an arbitrary mention (similar to
`extractEntitiesWithCodes`), but:

- LLMs hallucinate concept IDs frequently. Without a Snowstorm/embedding
  ground truth there is no way to verify correctness in-app.
- Scores would be synthetic (current code uses a fixed `0.75`), so the
  ambiguity/confidence color modes lose meaning for these candidates.

If we accept those caveats, the implementation is roughly:

1. Add an `LLMProvider.suggestConcepts(mention, k)` method that returns
   `Array<{ conceptId, term, fsn, semanticTag }>`.
2. In `LLMOnlyResolver.searchConcepts`, call it and wrap each suggestion in
   a `ConceptCandidate` with a fixed score (mirror `extractAndLink`).
3. Flip `supportsConceptSearch: true`.

Recommend showing a banner in the panel ("Suggestions from LLM, verify
manually") when this path is used.
