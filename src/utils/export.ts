import { LinkedEntity, ExportedAnnotation, AnnotationStatus, NOT_LINKED, UNSURE, isUncertain } from '../types';

export function exportAnnotations(
  text: string,
  entities: LinkedEntity[],
  annotations: Record<string, string>,
  confirmed: Set<string>,
  getEntityKey: (entity: LinkedEntity) => string,
  noteId: string = 'note-' + Date.now()
): ExportedAnnotation {
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  const exportedAnnotations = sorted.map(entity => {
    const key = getEntityKey(entity);
    const annotation = annotations[key];
    const isNotLinked = annotation === NOT_LINKED;
    const isUnsure = annotation === UNSURE;
    const topScore = entity.candidates[0]?.score ?? 0;
    const wasUncertain = isUncertain(entity.verdict);

    let status: AnnotationStatus;
    if (isNotLinked) {
      status = 'skipped';
    } else if (isUnsure) {
      status = 'unsure';
    } else if (confirmed.has(key)) {
      status = 'confirmed';
    } else if (annotation && topScore >= 0.85 && !wasUncertain) {
      status = 'auto-accepted';
    } else {
      status = 'pending';
    }

    const selectedConceptId = (isNotLinked || isUnsure) ? null : (annotation || entity.candidates[0]?.conceptId || null);
    const selectedCandidate = selectedConceptId
      ? entity.candidates.find(c => c.conceptId === selectedConceptId)
      : null;

    return {
      mention: entity.mention,
      start: entity.start,
      end: entity.end,
      entityType: entity.entityType,
      conceptId: selectedConceptId,
      conceptTerm: selectedCandidate?.term || null,
      semanticTag: selectedCandidate?.semanticTag,
      matchScore: selectedCandidate?.score || topScore,
      status,
      wasUncertain,
      notLinked: isNotLinked,
    };
  });

  const summary = {
    totalEntities: entities.length,
    confirmed: exportedAnnotations.filter(a => a.status === 'confirmed').length,
    autoAccepted: exportedAnnotations.filter(a => a.status === 'auto-accepted').length,
    notLinked: exportedAnnotations.filter(a => a.notLinked).length,
    unsure: exportedAnnotations.filter(a => a.status === 'unsure').length,
    pending: exportedAnnotations.filter(a => a.status === 'pending').length,
  };

  return { noteId, exportedAt: new Date().toISOString(), originalText: text, annotations: exportedAnnotations, summary };
}

export function downloadJson(data: ExportedAnnotation, filename?: string) {
  if (!filename) {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '');
    filename = `annotations_${ts}.json`;
  }
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
