export interface GradeEvaluationResult {
  gradeStr: string;
  isFail: boolean;
  isPass: boolean;
  result: 'PASS' | 'FAIL' | 'ABSENT';
}

export interface InternalMarkEvaluationResult {
  mark: number;
  gradeStr: string;
  isFail: boolean;
  isPass: boolean;
  result: 'PASS' | 'FAIL';
  isValidRange: boolean;
}

/**
 * Evaluates Internal Mark strictly according to College Internal Mark Result rules:
 * - Internal Mark >= 60 = PASS
 * - Internal Mark < 60 = FAIL
 * 
 * Examples:
 *   60 = PASS
 *   59 = FAIL
 *   50 = FAIL
 *   75 = PASS
 *   100 = PASS
 * 
 * - Applied ONLY to the Internal Mark module.
 * - Automatically calculates PASS/FAIL from entered Internal Mark.
 * - Validates marks between 0 and 100.
 */
export function evaluateInternalMark(rawMark: any): InternalMarkEvaluationResult {
  if (rawMark === undefined || rawMark === null || String(rawMark).trim() === '') {
    return {
      mark: 0,
      gradeStr: '0',
      isFail: true,
      isPass: false,
      result: 'FAIL',
      isValidRange: true,
    };
  }

  const str = String(rawMark).trim();
  const num = Number(str);

  if (isNaN(num)) {
    const upper = str.toUpperCase();
    const isFail = /FAIL|RA|ARREAR|U|ABS|AB|ZERO|F/i.test(upper);
    return {
      mark: 0,
      gradeStr: str,
      isFail: isFail || true,
      isPass: !isFail && false,
      result: 'FAIL',
      isValidRange: false,
    };
  }

  // Validate range between 0 and 100
  const isValidRange = num >= 0 && num <= 100;
  const clampedMark = Math.min(100, Math.max(0, num));
  const isPass = clampedMark >= 60;
  const isFail = !isPass;

  return {
    mark: clampedMark,
    gradeStr: String(clampedMark),
    isFail,
    isPass,
    result: isPass ? 'PASS' : 'FAIL',
    isValidRange,
  };
}

/**
 * Normalizes grade strings and evaluates PASS/FAIL status based on common academic grading indicators.
 * Used for Semester Grade Results (O, A+, A, B+, B, C, P / F, U, RA, Arrear, etc.).
 */
export function evaluateSubjectGrade(rawGrade: any): GradeEvaluationResult {
  if (rawGrade === undefined || rawGrade === null) {
    return { gradeStr: '-', isFail: false, isPass: true, result: 'PASS' };
  }

  const str = String(rawGrade).trim();
  if (str === '') {
    return { gradeStr: '-', isFail: false, isPass: true, result: 'PASS' };
  }

  const upperStr = str.toUpperCase().trim();
  // Strip non-alphanumeric chars for clean matching (e.g., "F.", "F*", "FAIL!", "RA-1")
  const cleanAlphaNum = upperStr.replace(/[^A-Z0-9]/g, '');

  // Exact or normalized failure grade tokens
  const failTokens = [
    'F', 'FAIL', 'FAILS', 'FAILED',
    'U', 'RA',
    'ARREAR', 'ARREARS',
    'ABSENT', 'ABS', 'AB', 'AAA', 'UA',
    'WH', 'WITHHELD', 'NC', 'INCOMPLETE',
    'ZERO', '0'
  ];

  let isFail = false;
  let isAbsent = false;

  if (failTokens.includes(upperStr) || failTokens.includes(cleanAlphaNum)) {
    isFail = true;
    if (['ABSENT', 'ABS', 'AB', 'AAA', 'UA'].includes(upperStr) || ['ABSENT', 'ABS', 'AB', 'AAA', 'UA'].includes(cleanAlphaNum)) {
      isAbsent = true;
    }
  } else if (/^(F|FAIL|FAILED|U|RA|ARREAR|ARREARS|ABSENT|ABS|AB|AAA|UA|WH|WITHHELD|INCOMPLETE|NC)$/i.test(cleanAlphaNum)) {
    isFail = true;
  } else if (/FAIL|ARREAR|ABSENT|REAPPEAR|RE-APPEAR|WITHHELD/i.test(upperStr)) {
    isFail = true;
  } else if (!isNaN(Number(str)) && str.length > 0) {
    // Semester grade numeric fallback
    const numVal = Number(str);
    if (numVal < 50) {
      isFail = true;
    }
  }

  const resultStatus: 'PASS' | 'FAIL' | 'ABSENT' = isAbsent ? 'ABSENT' : (isFail ? 'FAIL' : 'PASS');

  return {
    gradeStr: str,
    isFail,
    isPass: !isFail,
    result: resultStatus,
  };
}

/**
 * Calculates overall exam result statistics for a list of subject marks/grades.
 */
export function calculateOverallExamResult(subjects: { grade?: string; marks?: number; result?: string; subjectName?: string }[]): {
  passedCount: number;
  failedCount: number;
  overallStatus: 'PASS' | 'FAIL';
  formattedSubjectList: string;
} {
  let passedCount = 0;
  let failedCount = 0;

  const subjectFormattedParts: string[] = [];

  subjects.forEach((subj) => {
    const rawVal = subj.grade !== undefined && subj.grade !== null && subj.grade !== '' ? subj.grade : (subj.marks !== undefined ? String(subj.marks) : (subj.result || 'PASS'));
    const evalResult = evaluateSubjectGrade(rawVal);

    if (evalResult.isFail) {
      failedCount++;
    } else {
      passedCount++;
    }

    const sName = subj.subjectName || 'Subject';
    subjectFormattedParts.push(`${sName}: ${evalResult.gradeStr}`);
  });

  const overallStatus: 'PASS' | 'FAIL' = failedCount > 0 ? 'FAIL' : 'PASS';

  return {
    passedCount,
    failedCount,
    overallStatus,
    formattedSubjectList: subjectFormattedParts.join(', '),
  };
}
