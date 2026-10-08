import type { CurriculumGrade, CurriculumSubject, GameEducationTarget } from '@/types'

// Curriculum names are the official Mineduc ones, so these helpers produce
// Spanish regardless of the UI locale.

// "3° a 5° básico", "Kínder", "1° básico a 2° medio", "3° básico y 5° básico".
// Consecutive grades collapse into a range; gaps split it into several.
export function formatGradeRange(grades: CurriculumGrade[]): string {
  const sorted = [...grades].sort((a, b) => a.sort_order - b.sort_order)
  const runs: CurriculumGrade[][] = []
  for (const grade of sorted) {
    const run = runs[runs.length - 1]
    if (run && run[run.length - 1].sort_order === grade.sort_order - 1) run.push(grade)
    else runs.push([grade])
  }

  const label = (run: CurriculumGrade[]) => {
    const first = run[0]
    const last = run[run.length - 1]
    if (run.length === 1) return first.name
    const prefix = first.stage === last.stage ? shortGradeName(first) : first.name
    return `${prefix} ${run.length === 2 ? 'y' : 'a'} ${last.name}`
  }

  const labels = runs.map(label)
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`
}

// A game's subject × grade targets as the store shows them: its subjects in
// curriculum order, and every grade it covers as one range label.
export function describeTargets(
  targets: GameEducationTarget[],
  gradeById: Map<number, CurriculumGrade>,
  subjectById: Map<number, CurriculumSubject>
): { subjects: CurriculumSubject[]; grades: string } {
  const subjects = [...new Set(targets.map((target) => target.subject_id))]
    .map((id) => subjectById.get(id))
    .filter((subject): subject is CurriculumSubject => !!subject)
    .sort((a, b) => a.sort_order - b.sort_order)
  const grades = [...new Set(targets.map((target) => target.grade_id))]
    .map((id) => gradeById.get(id))
    .filter((grade): grade is CurriculumGrade => !!grade)
  return { subjects, grades: formatGradeRange(grades) }
}

// "3° básico" -> "3°"; Kínder stays as is.
function shortGradeName(grade: CurriculumGrade): string {
  return grade.name.replace(/ (básico|medio)$/, '')
}

// Accent- and case-insensitive matching for search boxes.
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// Mineduc OA texts mark their sub-items with ">>": "Escribir... : >>Aplicando
// ... >>Verificando ...". Split into the lead sentence and the bullets.
export function splitOaText(text: string): { lead: string; bullets: string[] } {
  const [lead, ...bullets] = text.split('>>').map((part) => part.trim())
  return { lead, bullets: bullets.filter((bullet) => bullet.length > 0) }
}
