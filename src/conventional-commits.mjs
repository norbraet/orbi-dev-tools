export function conventionalCommitHeaderIsValid(header, allowedTypes) {
  const escapedTypes = allowedTypes.map((type) => type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`^(${escapedTypes})(\\([A-Za-z0-9._/-]+\\))?(!)?: .+$`).test(header);
}

export function branchContainsIssue(branch, allowedTypes) {
  const escapedTypes = allowedTypes.map((type) => type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`^(${escapedTypes})/[0-9]+-`).test(branch);
}
