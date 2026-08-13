export interface GradeEvaluationResult {
  gradeStr: string;
  isFail: boolean;
  isPass: boolean;
  result: 'PASS' | 'FAIL' | 'ABSENT';
}

/**
 * Normalizes grade strings and evaluates PASS/FAIL status based on common academic grading indicators.
 * Failure indicators supported: F, FAIL, FAILS, FAILED, U, RA, ARREAR, ARREARS, ABSENT, ABS, AB, AAA, UA, WH, WITHHELD, NC, INCOMPLETE, 0, or numeric marks < 50.
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
    // Numeric value e.g. marks out of 100
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
